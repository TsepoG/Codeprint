import { randomUUID } from 'node:crypto';
import { isValidRepoUrl } from './clone.js';
import { runCommand } from './runTool.js';
import { checkRepoSizeWithinLimit } from './repoSizeCheck.js';
import { ScanTimeoutError, CloneError, RepoTooLargeError } from './errors.js';

export { isValidRepoUrl };

const SCAN_IMAGE = process.env.SCAN_IMAGE || 'codeprint-scan-runner:latest';
// Hard wall-clock ceiling across the whole scan - the host force-stops the
// container if this fires, regardless of what its own internal per-tool
// timeouts are doing.
const CONTAINER_TIMEOUT_MS = Number(process.env.SCAN_CONTAINER_TIMEOUT_MS) || 300_000; // 5 minutes
const CONTAINER_MEMORY = process.env.SCAN_CONTAINER_MEMORY || '512m';
const CONTAINER_CPUS = process.env.SCAN_CONTAINER_CPUS || '1';
const CONTAINER_PIDS_LIMIT = process.env.SCAN_CONTAINER_PIDS_LIMIT || '128';
const MAX_REPO_SIZE_MB = Number(process.env.SCAN_MAX_REPO_SIZE_MB) || 500;

const CLONE_SCRIPT = 'src/services/scan/container/clonePhase.js';
const ANALYZE_SCRIPT = 'src/services/scan/container/analyzePhase.js';

// Error names either phase script is known to report, mapped back onto the
// matching host-side error class - so a real clone failure still surfaces
// as 422, an oversized repo still surfaces as 413, and a real internal
// timeout still surfaces as 504, exactly as routes/scan.js already handles.
const ERROR_CLASSES = { CloneError, ScanTimeoutError, RepoTooLargeError };

/**
 * Runs a full repo scan inside one short-lived, locked-down Docker
 * container - see `Dockerfile.scan-runner` - but with its network access
 * split across the scan's two phases:
 *
 *   1. The container starts attached to the network (`docker network
 *      disconnect` hasn't run yet) and `docker exec`'s `clonePhase.js`,
 *      which clones the repo, enforces the size cap, detects whether the
 *      repo has any Terraform, and runs npm audit - the only tool that
 *      needs network access.
 *   2. The host runs `docker network disconnect` on the running
 *      container, fully severing its network access, then `docker
 *      exec`'s `analyzePhase.js` - eslint/madge/jscpd (plus checkov/tfsec
 *      when phase 1 found `.tf` files) are pure static analysis over files
 *      already on disk and never need network, so denying it entirely
 *      means a malicious repo can't exfiltrate anything or reach other
 *      hosts during this phase even if one of these tools has an
 *      RCE-class bug.
 *
 * Both phases run in the same container (and so share its filesystem
 * directly - see container/workspace.js) rather than two separate
 * containers, so there's no volume/bind-mount to manage between them.
 *
 * The backend itself never clones the repo, never runs any tool against
 * its files, and never touches its dependencies - all of that happens
 * inside this container, destroyed (`--rm`) as soon as it's stopped.
 * Nothing is bind-mounted in from the host: the only inputs are `repoUrl`
 * and env-forwarded timeouts/limits, and the only output is the JSON line
 * each phase prints to stdout. See README security notes.
 *
 * The returned result also carries `branch`/`commitSha` (whatever
 * `clonePhase` checked out) alongside the normalized scan shape, for
 * `routes/scan.js` to persist as scan history.
 *
 * @param {string} repoUrl A URL that has already passed {@link isValidRepoUrl}.
 * @returns {Promise<ReturnType<typeof import('./normalize.js').normalizeScanResults> & {branch: string|null, commitSha: string|null}>}
 * @throws {CloneError} If the clone fails.
 * @throws {RepoTooLargeError} If the repo exceeds the configured size cap.
 * @throws {ScanTimeoutError} If the scan (or the host-side wait on it) times out.
 * @throws {Error} For any other container/docker-level failure (e.g. docker
 *   isn't installed, or the scan-runner image hasn't been built).
 */
export async function runScan(repoUrl) {
  // Best-effort pre-flight check via the provider's API - skips obviously
  // oversized repos before spending any container/clone time on them. Not
  // authoritative; the post-clone check inside the container (which
  // always runs) is the real backstop.
  const maxBytes = MAX_REPO_SIZE_MB * 1024 * 1024;
  const sizeCheck = await checkRepoSizeWithinLimit(repoUrl, maxBytes);
  if (sizeCheck.known && !sizeCheck.withinLimit) {
    const sizeMb = Math.round(sizeCheck.sizeBytes / (1024 * 1024));
    throw new RepoTooLargeError(`Repository is ~${sizeMb}MB, which exceeds the ${MAX_REPO_SIZE_MB}MB scan limit`);
  }

  const containerName = `codeprint-scan-${randomUUID()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTAINER_TIMEOUT_MS);

  try {
    await startContainer(containerName, controller.signal);

    const clonePayload = await execInContainer({
      containerName,
      command: ['node', CLONE_SCRIPT, repoUrl],
      env: {},
      signal: controller.signal,
    });
    throwIfFailed(clonePayload);

    await disconnectNetwork(containerName);

    const analyzePayload = await execInContainer({
      containerName,
      command: ['node', ANALYZE_SCRIPT],
      env: {
        CODEPRINT_AUDIT_RESULT: JSON.stringify(clonePayload.result.auditResult),
        CODEPRINT_HAS_TERRAFORM: String(clonePayload.result.hasTerraform === true),
      },
      signal: controller.signal,
    });
    throwIfFailed(analyzePayload);

    return {
      ...analyzePayload.result,
      branch: clonePayload.result.branch,
      commitSha: clonePayload.result.commitSha,
    };
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ScanTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
    await stopContainer(containerName);
  }
}

/**
 * @param {{ok: true, result: unknown} | {ok: false, error: string, message: string}} payload
 */
function throwIfFailed(payload) {
  if (payload.ok) return;
  const ErrorClass = ERROR_CLASSES[payload.error] ?? Error;
  throw new ErrorClass(payload.message);
}

/**
 * Starts the container detached, idling (`sleep infinity`) so both phases
 * can be `docker exec`'d into it in turn. Network-enabled and otherwise
 * locked down exactly as before: no capabilities, no privilege
 * escalation, read-only root filesystem (only /tmp is writable, and only
 * in memory), and hard resource ceilings so one hostile repo can't
 * exhaust the host.
 *
 * @param {string} name
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
async function startContainer(name, signal) {
  const args = [
    'run',
    '--detach',
    '--rm',
    '--name', name,
    '--network', 'bridge',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    '--tmpfs', '/tmp:rw,size=256m',
    '--pids-limit', CONTAINER_PIDS_LIMIT,
    '--memory', CONTAINER_MEMORY,
    '--memory-swap', CONTAINER_MEMORY, // equal to --memory: disables swap
    '--cpus', CONTAINER_CPUS,
    // Forward the same timeout/size knobs the container's own scan logic
    // reads, if the host has them set - otherwise it uses its own
    // defaults (see services/scan/index.js).
    '-e', 'SCAN_CLONE_TIMEOUT_MS',
    '-e', 'SCAN_TOOL_TIMEOUT_MS',
    '-e', 'SCAN_MAX_REPO_SIZE_MB',
    '--entrypoint', 'sleep',
    SCAN_IMAGE,
    'infinity',
  ];

  const { error, stderr } = await runCommand('docker', args, { signal });
  if (error) {
    throw new Error(`failed to start scan container: ${stderr?.trim() || error.message}`);
  }
}

/**
 * @param {object} opts
 * @param {string} opts.containerName
 * @param {string[]} opts.command
 * @param {Record<string, string>} opts.env Extra env vars to set for this exec.
 * @param {AbortSignal} opts.signal
 * @returns {Promise<{ok: true, result: unknown} | {ok: false, error: string, message: string}>}
 */
async function execInContainer({ containerName, command, env, signal }) {
  const args = ['exec'];
  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`);
  }
  args.push(containerName, ...command);

  const { error, stdout, stderr } = await runCommand('docker', args, { signal });

  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(
      `scan container produced no parseable output: ${stderr?.trim() || error?.message || 'unknown error'}`,
    );
  }
}

/**
 * Fully severs the running container's network access ahead of the
 * analyze phase - verified (not just configured) to actually cut off
 * connectivity, not merely omit new connections.
 *
 * @param {string} name
 * @returns {Promise<void>}
 */
async function disconnectNetwork(name) {
  const { error, stderr } = await runCommand('docker', ['network', 'disconnect', 'bridge', name]);
  if (error) {
    throw new Error(`failed to disconnect scan container network: ${stderr?.trim() || error.message}`);
  }
}

/**
 * Stops the container (which - since it was started with `--rm` - also
 * removes it). Used both for normal-completion cleanup and as the
 * timeout backstop, in which case `-t 0` force-kills it immediately
 * instead of waiting for a graceful stop.
 *
 * @param {string} name
 * @returns {Promise<void>}
 */
async function stopContainer(name) {
  await runCommand('docker', ['stop', '-t', '0', name]);
}
