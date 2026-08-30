import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
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
  // The report goes to a scratch dir *outside* targetDir, not a
  // `.codeprint-jscpd` subfolder inside it - targetDir may be a read-only
  // mount (see the analyze-phase container in dockerRunner.js).
  const outDir = path.join(tmpdir(), `codeprint-jscpd-${randomUUID()}`);

  await runNodeBin(
    'jscpd',
    [
      targetDir,
      '--reporters', 'json',
      '--output', outDir,
      '--silent',
      '--ignore', '**/node_modules/**',
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
