import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNodeBin } from '../runTool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'scan.eslint.config.js');

/**
 * @typedef {object} EslintOk
 * @property {true} ok
 * @property {object[]} results Raw ESLint formatter-json results, one per linted file.
 */
/** @typedef {{ok: false, reason: string}} ToolSkipped */

/**
 * Lints `targetDir` with ESLint (+ eslint-plugin-sonarjs for cognitive
 * complexity), using our own config rather than any config the target
 * repo ships - see README security notes.
 *
 * @param {string} targetDir Absolute path to the cloned repo.
 * @param {import('../runTool.js').RunOptions} [opts]
 * @returns {Promise<EslintOk|ToolSkipped>} Never throws.
 */
export async function runEslint(targetDir, { timeoutMs, signal } = {}) {
  // ESLint's flat config resolves relative patterns (and decides which
  // files are "in scope") against its cwd whenever --config is explicit,
  // so cwd must be the cloned repo itself - not this backend package.
  // (See eslint's ConfigLoader.locateConfigFileToUse: basePath = cwd when
  // an override config file is passed.) Module resolution for the config
  // file's own imports (eslint-plugin-sonarjs etc.) is unaffected by this,
  // since it's anchored to CONFIG_PATH's location inside this package.
  const { error, stdout } = await runNodeBin(
    'eslint',
    ['--config', CONFIG_PATH, '--format', 'json', '--no-error-on-unmatched-pattern', '.'],
    { cwd: targetDir, timeoutMs, signal },
  );

  // eslint exits non-zero when it finds lint errors, so a non-null `error`
  // does not necessarily mean the run failed - only that stdout wasn't
  // valid JSON should be treated as a real failure.
  try {
    const results = JSON.parse(stdout);
    return { ok: true, results };
  } catch {
    return {
      ok: false,
      reason: error ? `eslint failed to run: ${error.message}` : 'eslint produced no parseable output',
    };
  }
}
