import { runNodeBin } from '../runTool.js';

/**
 * @typedef {object} MadgeOk
 * @property {true} ok
 * @property {Record<string, string[]>} graph Map of file path -> its
 *   dependencies' file paths, as produced by `madge --json`.
 */

/**
 * Builds the module dependency graph for `targetDir` with madge.
 *
 * @param {string} targetDir Absolute path to the cloned repo.
 * @param {import('../runTool.js').RunOptions} [opts]
 * @returns {Promise<MadgeOk|{ok: false, reason: string}>} Never throws.
 */
export async function runMadge(targetDir, { timeoutMs, signal } = {}) {
  const { error, stdout } = await runNodeBin(
    'madge',
    ['--json', targetDir],
    { timeoutMs, signal },
  );

  try {
    const graph = JSON.parse(stdout);
    return { ok: true, graph };
  } catch {
    return {
      ok: false,
      reason: error ? `madge failed to run: ${error.message}` : 'madge produced no parseable output',
    };
  }
}
