import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { runNodeBin } from '../runTool.js';

/**
 * @typedef {object} JscpdOk
 * @property {true} ok
 * @property {object} report Raw jscpd JSON report (see `statistics.total.percentage`).
 */

/**
 * Detects copy-pasted code in `targetDir` with jscpd.
 *
 * @param {string} targetDir Absolute path to the cloned repo.
 * @param {import('../runTool.js').RunOptions} [opts]
 * @returns {Promise<JscpdOk|{ok: false, reason: string}>} Never throws.
 */
export async function runJscpd(targetDir, { timeoutMs, signal } = {}) {
  const outDir = path.join(targetDir, '.codeprint-jscpd');

  await runNodeBin(
    'jscpd',
    [
      targetDir,
      '--reporters', 'json',
      '--output', outDir,
      '--silent',
      '--ignore', '**/node_modules/**,**/.codeprint-jscpd/**',
    ],
    { timeoutMs, signal },
  );

  // jscpd exits non-zero when duplication exceeds its threshold, which is
  // not a failure for our purposes - only a missing report file is.
  try {
    const raw = await readFile(path.join(outDir, 'jscpd-report.json'), 'utf8');
    const report = JSON.parse(raw);
    return { ok: true, report };
  } catch {
    return { ok: false, reason: 'jscpd produced no report (no supported source files found?)' };
  }
}
