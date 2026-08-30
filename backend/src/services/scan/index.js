import { createScanDir, cleanupScanDir } from './tempDir.js';
import { cloneRepo, isValidGithubUrl } from './clone.js';
import { runEslint } from './tools/eslint.js';
import { runMadge } from './tools/madge.js';
import { runJscpd } from './tools/jscpd.js';
import { runNpmAudit } from './tools/npmAudit.js';
import { normalizeScanResults } from './normalize.js';
import { ScanTimeoutError } from './errors.js';

const CLONE_TIMEOUT_MS = Number(process.env.SCAN_CLONE_TIMEOUT_MS) || 30_000;
const TOOL_TIMEOUT_MS = Number(process.env.SCAN_TOOL_TIMEOUT_MS) || 60_000;
const TOTAL_TIMEOUT_MS = Number(process.env.SCAN_TOTAL_TIMEOUT_MS) || 120_000;

export { isValidGithubUrl };

/**
 * Runs a full repo scan: clone, then eslint/madge/jscpd/npm-audit
 * concurrently, then normalize into the unified response shape. Always
 * cleans up the temp clone, and always enforces
 * `SCAN_TOTAL_TIMEOUT_MS` across the whole operation regardless of how far
 * it got.
 *
 * This is the actual scan logic - it clones an arbitrary, untrusted repo
 * and runs tools against it, so it must only ever run inside the sandboxed
 * scan-runner container (see `container/entrypoint.js` and
 * `../../../Dockerfile.scan-runner`), never directly in the backend's own
 * process. The backend process itself calls `runScan` from
 * `./dockerRunner.js` instead, which shells out to `docker run` and never
 * touches a cloned repo's files or dependencies on the host. See README
 * security notes.
 *
 * @param {string} repoUrl A URL that has already passed {@link isValidGithubUrl}.
 * @returns {Promise<ReturnType<typeof import('./normalize.js').normalizeScanResults>>}
 * @throws {import('./errors.js').CloneError} If the clone fails.
 * @throws {import('./errors.js').ScanTimeoutError} If the scan exceeds its overall timeout.
 */
export async function scanRepoInProcess(repoUrl) {
  const targetDir = await createScanDir();
  const controller = new AbortController();
  const overallTimer = setTimeout(
    () => controller.abort(new ScanTimeoutError()),
    TOTAL_TIMEOUT_MS,
  );

  try {
    await cloneRepo(repoUrl, targetDir, {
      timeoutMs: CLONE_TIMEOUT_MS,
      signal: controller.signal,
    });

    const toolOpts = { timeoutMs: TOOL_TIMEOUT_MS, signal: controller.signal };

    // Every tool runner already catches its own failures internally and
    // resolves with { ok: false, reason }. The .catch below is just a
    // last-resort net so one tool crashing unexpectedly can never take
    // down the whole scan.
    const [eslintResult, madgeResult, jscpdResult, auditResult] = await Promise.all([
      runEslint(targetDir, toolOpts).catch((err) => asSkipped('eslint', err)),
      runMadge(targetDir, toolOpts).catch((err) => asSkipped('madge', err)),
      runJscpd(targetDir, toolOpts).catch((err) => asSkipped('jscpd', err)),
      runNpmAudit(targetDir, toolOpts).catch((err) => asSkipped('npm audit', err)),
    ]);

    return normalizeScanResults({ eslintResult, madgeResult, jscpdResult, auditResult, targetDir });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ScanTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(overallTimer);
    await cleanupScanDir(targetDir);
  }
}

/**
 * @param {string} toolName
 * @param {Error} err
 * @returns {{ok: false, reason: string}}
 */
function asSkipped(toolName, err) {
  return { ok: false, reason: `${toolName} crashed unexpectedly: ${err.message}` };
}
