import path from 'node:path';
import { access } from 'node:fs/promises';
import { runShellCommand } from '../runTool.js';

/**
 * @typedef {object} NpmAuditOk
 * @property {true} ok
 * @property {object} audit Raw `npm audit --json` output (see `metadata.vulnerabilities`).
 */

/**
 * Runs `npm audit` against `targetDir`. Requires a committed
 * `package-lock.json` - we deliberately never run `npm install` against
 * cloned, untrusted repos (see README security notes), so audits are only
 * possible when the lockfile is already present.
 *
 * @param {string} targetDir Absolute path to the cloned repo.
 * @param {import('../runTool.js').RunOptions} [opts]
 * @returns {Promise<NpmAuditOk|{ok: false, reason: string}>} Never throws.
 */
export async function runNpmAudit(targetDir, { timeoutMs, signal } = {}) {
  const hasPackageJson = await fileExists(path.join(targetDir, 'package.json'));
  if (!hasPackageJson) {
    return { ok: false, reason: 'no package.json found; npm audit is not applicable' };
  }

  const hasLockfile = await fileExists(path.join(targetDir, 'package-lock.json'));
  if (!hasLockfile) {
    // We deliberately never run `npm install` against cloned repos - that
    // would execute arbitrary install/postinstall scripts from untrusted
    // code. Without a committed lockfile, npm audit has nothing to check.
    return { ok: false, reason: 'no package-lock.json found; skipping npm audit (npm install is intentionally not run on untrusted code)' };
  }

  const { stdout } = await runShellCommand(
    'npm',
    ['audit', '--json'],
    { cwd: targetDir, timeoutMs, signal },
  );

  try {
    const audit = JSON.parse(stdout);
    return { ok: true, audit };
  } catch {
    return { ok: false, reason: 'npm audit produced no parseable output' };
  }
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
