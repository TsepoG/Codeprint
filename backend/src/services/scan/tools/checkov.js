import { runCommand, summarizeExecError } from '../runTool.js';

/**
 * @typedef {object} CheckovOk
 * @property {true} ok
 * @property {object|object[]} report Raw `checkov -o json` output (an object
 *   per scanned framework, or an array of them).
 */

/**
 * Scans `targetDir`'s Terraform with Checkov.
 *
 * Unlike the JS tools, checkov is a Python CLI installed into the
 * scan-runner image (see Dockerfile.scan-runner) rather than a Node package,
 * so it's spawned by name off PATH instead of via `runNodeBin`. Only ever
 * called when `detectTerraform.js` found `.tf` files.
 *
 * `--framework terraform` keeps this scoped to the Terraform the caller
 * asked about - checkov also ships Dockerfile/Kubernetes/secrets scanners
 * that would otherwise fire on an unrelated part of the repo and show up as
 * "infrastructure" findings.
 *
 * @param {string} targetDir Absolute path to the cloned repo.
 * @param {import('../runTool.js').RunOptions} [opts]
 * @returns {Promise<CheckovOk|{ok: false, reason: string}>} Never throws.
 */
export async function runCheckov(targetDir, { timeoutMs, signal } = {}) {
  const { error, stdout } = await runCommand(
    'checkov',
    ['-d', targetDir, '-o', 'json', '--framework', 'terraform', '--compact', '--quiet'],
    { timeoutMs, signal },
  );

  // checkov exits non-zero when it finds failed checks, exactly like eslint
  // does for lint errors - so a non-null `error` isn't itself a failure.
  // Only output we can't parse means the run didn't produce a report
  // (checkov missing from the image, malformed HCL it bailed on, etc.).
  try {
    const report = JSON.parse(stdout);
    return { ok: true, report };
  } catch {
    return {
      ok: false,
      reason: error ? `checkov failed to run: ${summarizeExecError(error)}` : 'checkov produced no parseable output',
    };
  }
}
