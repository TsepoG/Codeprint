import { runCommand } from './runTool.js';
import { CloneError } from './errors.js';

// Only allow plain https://github.com/<owner>/<repo> URLs. This blocks
// git's non-http transports (file://, ext::, ssh with arbitrary hosts)
// which could otherwise be abused to read local paths or reach internal
// network hosts (SSRF-style) via the clone step.
const GITHUB_HTTPS_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(?:\.git)?\/?$/;

/**
 * @param {unknown} url
 * @returns {boolean} Whether `url` is a plain `https://github.com/<owner>/<repo>` URL.
 */
export function isValidGithubUrl(url) {
  return typeof url === 'string' && GITHUB_HTTPS_URL.test(url.trim());
}

/**
 * Shallow-clones a GitHub repo into `destDir`.
 *
 * @param {string} repoUrl A URL that has already passed {@link isValidGithubUrl}.
 * @param {string} destDir Empty directory to clone into.
 * @param {import('./runTool.js').RunOptions} [opts]
 * @returns {Promise<void>}
 * @throws {CloneError} If the clone fails, times out, or is aborted.
 */
export async function cloneRepo(repoUrl, destDir, { timeoutMs, signal } = {}) {
  const { error, stderr } = await runCommand(
    'git',
    [
      'clone',
      '--depth', '1',
      '--single-branch',
      '--no-tags',
      '--',
      repoUrl,
      destDir,
    ],
    { timeoutMs, signal },
  );

  if (error) {
    throw new CloneError(`git clone failed: ${stderr?.trim() || error.message}`);
  }
}
