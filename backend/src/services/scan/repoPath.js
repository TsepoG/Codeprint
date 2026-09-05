import path from 'node:path';

/**
 * @param {string} targetDir
 * @param {string} absolutePath
 * @returns {string} `absolutePath` relative to `targetDir`, with `/` separators.
 */
export function toPosixRelative(targetDir, absolutePath) {
  return path.relative(targetDir, absolutePath).split(path.sep).join('/');
}

/**
 * Resolves a repo-relative path *reported by a tool* back to an absolute
 * path, refusing anything that escapes the repo.
 *
 * The paths this is given come out of tool output run against an untrusted
 * clone, so they're input, not trusted values: a `../../etc/passwd` (or a
 * path a symlink resolved through) must never turn into a read outside the
 * workspace just because something downstream wants to quote the line.
 *
 * @param {string} targetDir Absolute path to the cloned repo.
 * @param {string|null|undefined} relPath Repo-relative, posix-style.
 * @returns {string|null} Absolute path, or null if it's absent or escapes `targetDir`.
 */
export function resolveInRepo(targetDir, relPath) {
  if (typeof relPath !== 'string' || relPath === '') return null;

  const root = path.resolve(targetDir);
  const full = path.resolve(root, relPath.split('/').join(path.sep));
  if (full !== root && !full.startsWith(root + path.sep)) return null;

  return full;
}
