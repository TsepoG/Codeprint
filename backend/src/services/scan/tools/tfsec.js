import { runCommand, summarizeExecError } from '../runTool.js';

/**
 * @typedef {object} TfsecOk
 * @property {true} ok
 * @property {{results: object[]|null}} report Raw `tfsec --format json` output.
 */

/**
 * Scans `targetDir`'s Terraform with tfsec.
 *
 * Like checkov, tfsec is a standalone binary baked into the scan-runner
 * image (see Dockerfile.scan-runner), not a Node package, and is only ever
 * called when `detectTerraform.js` found `.tf` files.
 *
 * @param {string} targetDir Absolute path to the cloned repo.
 * @param {import('../runTool.js').RunOptions} [opts]
 * @returns {Promise<TfsecOk|{ok: false, reason: string}>} Never throws.
 */
export async function runTfsec(targetDir, { timeoutMs, signal } = {}) {
  const { error, stdout } = await runCommand(
    'tfsec',
    [targetDir, '--format', 'json', '--no-colour', '--soft-fail'],
    { timeoutMs, signal },
  );

  // --soft-fail keeps tfsec's exit code at 0 when it finds issues, but a
  // parse failure is still the real signal here (same contract as the other
  // tools): no parseable stdout means no report, whatever the exit code.
  try {
    const report = JSON.parse(stdout);
    return { ok: true, report };
  } catch {
    return {
      ok: false,
      reason: error ? `tfsec failed to run: ${summarizeExecError(error)}` : 'tfsec produced no parseable output',
    };
  }
}
