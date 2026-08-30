import { randomUUID } from 'node:crypto';
import { isValidGithubUrl } from './clone.js';
import { runCommand } from './runTool.js';
import { ScanTimeoutError, CloneError } from './errors.js';

export { isValidGithubUrl };

const SCAN_IMAGE = process.env.SCAN_IMAGE || 'codeprint-scan-runner:latest';
const CONTAINER_TIMEOUT_MS = Number(process.env.SCAN_CONTAINER_TIMEOUT_MS) || 150_000;
const CONTAINER_MEMORY = process.env.SCAN_CONTAINER_MEMORY || '512m';
const CONTAINER_CPUS = process.env.SCAN_CONTAINER_CPUS || '1';
const CONTAINER_PIDS_LIMIT = process.env.SCAN_CONTAINER_PIDS_LIMIT || '128';

// Error names the container's entrypoint is known to report, mapped back
// onto the same host-side error classes routes/scan.js already handles -
// so a real clone failure still surfaces as 422 and a real internal
// timeout still surfaces as 504, exactly as before containerization.
const ERROR_CLASSES = { CloneError, ScanTimeoutError };

/**
 * Runs a full repo scan inside a short-lived, locked-down Docker
 * container (see `Dockerfile.scan-runner`) instead of in this process.
 * The backend itself never clones the repo, never runs eslint/madge/jscpd
 * /npm against its files, and never touches its dependencies - all of
 * that happens inside the container, which is destroyed (`--rm`) as soon
 * as it exits. Nothing is bind-mounted in from the host: the only inputs
 * are `repoUrl` and env-forwarded timeouts, and the only output is the
 * JSON line the container prints to stdout. See README security notes.
 *
 * @param {string} repoUrl A URL that has already passed {@link isValidGithubUrl}.
 * @returns {Promise<ReturnType<typeof import('./normalize.js').normalizeScanResults>>}
 * @throws {CloneError} If the container reports the clone failed.
 * @throws {ScanTimeoutError} If the container (or the host-side wait on it) times out.
 * @throws {Error} For any other container/docker-level failure (e.g. docker
 *   isn't installed, or the scan-runner image hasn't been built).
 */
export async function runScan(repoUrl) {
  const containerName = `codeprint-scan-${randomUUID()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTAINER_TIMEOUT_MS);

  const args = [
    'run',
    '--rm',
    '--name', containerName,
    // Forward the same timeout knobs the container's own scan logic reads,
    // if the host has them set - otherwise the container uses its own
    // defaults (see services/scan/index.js).
    '-e', 'SCAN_CLONE_TIMEOUT_MS',
    '-e', 'SCAN_TOOL_TIMEOUT_MS',
    '-e', 'SCAN_TOTAL_TIMEOUT_MS',
    // Lock the container down: no capabilities, no privilege escalation,
    // read-only root filesystem (only /tmp is writable, and only in
    // memory), and hard resource ceilings so one hostile repo can't
    // exhaust the host.
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    '--tmpfs', '/tmp:rw,size=256m',
    '--pids-limit', CONTAINER_PIDS_LIMIT,
    '--memory', CONTAINER_MEMORY,
    '--memory-swap', CONTAINER_MEMORY, // equal to --memory: disables swap
    '--cpus', CONTAINER_CPUS,
    SCAN_IMAGE,
    repoUrl,
  ];

  const { error, stdout, stderr } = await runCommand('docker', args, {
    timeoutMs: CONTAINER_TIMEOUT_MS,
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (controller.signal.aborted) {
    await killContainer(containerName);
    throw new ScanTimeoutError();
  }

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error(
      `scan container produced no parseable output: ${stderr?.trim() || error?.message || 'unknown error'}`,
    );
  }

  if (!payload.ok) {
    const ErrorClass = ERROR_CLASSES[payload.error] ?? Error;
    throw new ErrorClass(payload.message);
  }

  return payload.result;
}

/**
 * Best-effort cleanup for a container that had to be aborted - `--rm`
 * handles the normal-exit case, this handles the timeout case where the
 * container itself is still running after we've given up waiting on it.
 *
 * @param {string} name
 * @returns {Promise<void>}
 */
async function killContainer(name) {
  await runCommand('docker', ['kill', name]);
}
