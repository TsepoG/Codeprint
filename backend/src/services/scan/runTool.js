import { execFile } from 'node:child_process';
import { resolveBin } from './resolveBin.js';

const MAX_BUFFER = 20 * 1024 * 1024;

/**
 * @typedef {object} RunOptions
 * @property {string} [cwd] Working directory for the child process.
 * @property {number} [timeoutMs] Kill the process if it runs longer than this.
 * @property {AbortSignal} [signal] External signal (e.g. an overall scan
 *   timeout) that aborts the process early.
 */

/**
 * @typedef {object} RunResult
 * @property {(Error & {code?: string|number})|null} error Set if the
 *   process could not be spawned, timed out, was aborted, or exited via a
 *   signal. A non-zero *exit code* alone does not always populate this for
 *   CLIs that use it to mean "found issues" - check `stdout`/`stderr` too.
 * @property {string} stdout
 * @property {string} stderr
 */

/**
 * @param {string} command
 * @param {string[]} args
 * @param {RunOptions & {shell?: boolean}} opts
 * @returns {Promise<RunResult>} Never rejects.
 */
function execute(command, args, { cwd, timeoutMs, signal, shell = false } = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd, timeout: timeoutMs, signal, maxBuffer: MAX_BUFFER, windowsHide: true, shell },
      (error, stdout, stderr) => {
        resolve({ error, stdout: stdout?.toString() ?? '', stderr: stderr?.toString() ?? '' });
      },
    );
  });
}

/**
 * Runs a plain executable directly, with no shell involved (e.g. `git`).
 *
 * @param {string} command
 * @param {string[]} args
 * @param {RunOptions} [opts]
 * @returns {Promise<RunResult>}
 */
export function runCommand(command, args, opts = {}) {
  return execute(command, args, opts);
}

/**
 * Runs a locally-installed package's CLI directly (`node <entry.js> ...`),
 * bypassing npm/npx and any shell. This never rejects - it resolves with
 * whatever came back so callers decide what "the tool failed" means.
 *
 * @param {string} pkgName Name of the installed package providing the CLI.
 * @param {string[]} args Arguments to pass to the CLI.
 * @param {RunOptions} [opts]
 * @returns {Promise<RunResult>}
 */
export function runNodeBin(pkgName, args, opts = {}) {
  const binPath = resolveBin(pkgName);
  return execute(process.execPath, [binPath, ...args], opts);
}

/**
 * Runs a command that isn't a plain Node script (e.g. `npm`, which is a
 * .cmd shim on Windows and can only be spawned through a shell). Only use
 * this with static, hardcoded args - never with values derived from user
 * input - since the shell will interpret them.
 *
 * @param {string} command
 * @param {string[]} args Must be hardcoded/static, never user-derived.
 * @param {RunOptions} [opts]
 * @returns {Promise<RunResult>}
 */
export function runShellCommand(command, args, opts = {}) {
  return execute(command, args, { ...opts, shell: process.platform === 'win32' });
}
