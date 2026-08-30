import { readdir, lstat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Recursively sums the size of every regular file under `dir`, in bytes.
 * Used to enforce `SCAN_MAX_REPO_SIZE_MB` against a freshly-cloned repo.
 *
 * Deliberately uses `lstat` and never follows symlinks (a directory
 * symlink is skipped outright, via `dirent.isDirectory()` being false for
 * a symlink) - a malicious repo could otherwise ship a symlink pointing
 * outside the clone (e.g. at `/`) and turn a size check into an
 * unbounded, and unsafe, filesystem walk.
 *
 * @param {string} dir
 * @returns {Promise<number>} Total size in bytes.
 */
export async function getDirectorySize(dir) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(entryPath);
    } else if (entry.isFile()) {
      const stats = await lstat(entryPath);
      total += stats.size;
    }
  }

  return total;
}
