import { runCommand } from './runTool.js';
import { CloneError } from './errors.js';

// Only allow https://github.com/<owner>/<repo> or https://gitlab.com/<owner>/<repo>.
// This is an SSRF allowlist, not a format check - it's implemented with the
// WHATWG URL parser (not a hand-rolled regex over the raw string) so that:
//  - a raw IP, "localhost", or an internal/other hostname can never match,
//    since we compare the parsed, canonical `hostname` against exactly two
//    literal strings;
//  - IP-obfuscation tricks (decimal/octal/hex forms like `2130706433` for
//    127.0.0.1) don't help an attacker, because the URL parser itself
//    normalizes those into dotted-decimal form as part of parsing, *before*
//    our allowlist check ever runs - the normalized value still isn't
//    "github.com"/"gitlab.com";
//  - userinfo (`user@host`), a non-default port, and a query/fragment are
//    all rejected outright, since a legitimate clone URL never needs them
//    and they're common tricks for confusing simpler validators/parsers.
// This also blocks git's non-http transports (file://, ext::, ssh) outright,
// since we require `protocol === 'https:'`.
const ALLOWED_HOSTS = new Set(['github.com', 'gitlab.com']);
const REPO_PATH = /^\/[\w.-]+\/[\w.-]+?(?:\.git)?\/?$/;

/**
 * @param {unknown} value
 * @returns {boolean} Whether `value` is a plain
 *   `https://github.com/<owner>/<repo>` or `https://gitlab.com/<owner>/<repo>` URL.
 */
export function isValidRepoUrl(value) {
  if (typeof value !== 'string') return false;

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }

  return (
    url.protocol === 'https:' &&
    ALLOWED_HOSTS.has(url.hostname.toLowerCase()) &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.search &&
    !url.hash &&
    REPO_PATH.test(url.pathname)
  );
}

/**
 * Shallow-clones a GitHub repo into `destDir`.
 *
 * @param {string} repoUrl A URL that has already passed {@link isValidRepoUrl}.
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
