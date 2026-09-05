import path from 'node:path';
import { realpath } from 'node:fs/promises';

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
 * path, refusing anything that lexically escapes the repo (`../../etc/passwd`,
 * an absolute path, etc).
 *
 * This is a **string-only** check - it never touches the filesystem, so it
 * says nothing about a symlink along the way. It exists to reject the
 * obviously-bad case cheaply before any I/O; anything that will actually be
 * *read* also needs {@link realPathInRepo} against the result of this
 * function, since a clone can commit a symlink whose target lexically looks
 * fine but resolves outside the repo at read time.
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

/**
 * The filesystem-aware companion to {@link resolveInRepo}: resolves every
 * symlink in `candidatePath` and confirms the *real* path still lands inside
 * `targetDir`, refusing it otherwise.
 *
 * A clone is untrusted input, and a committed symlink is a completely
 * ordinary way for one to point outside its own directory - `resolveInRepo`
 * alone would wave that straight through, since string-wise the path never
 * leaves the repo. Anything that ends up read from disk (not just quoted in
 * an error message) must go through this first.
 *
 * @param {string} targetDir Absolute path to the cloned repo.
 * @param {string} candidatePath Absolute path already passed through {@link resolveInRepo}.
 * @returns {Promise<string|null>} The resolved real path, or null if it
 *   escapes the repo or doesn't exist.
 */
export async function realPathInRepo(targetDir, candidatePath) {
  try {
    const [realFull, realRoot] = await Promise.all([realpath(candidatePath), realpath(targetDir)]);
    if (realFull !== realRoot && !realFull.startsWith(realRoot + path.sep)) return null;
    return realFull;
  } catch {
    return null;
  }
}
