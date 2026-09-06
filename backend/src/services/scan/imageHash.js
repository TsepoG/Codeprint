import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Deterministically fingerprints every file under `dir` (recursively), so
 * two independent copies of the same directory - the host's checkout and
 * the scan-runner image's baked-in copy (see `Dockerfile.scan-runner` and
 * `dockerRunner.js`) - can agree on whether they're identical without
 * either side seeing the other's filesystem.
 *
 * Walks in a fixed, posix-style sorted order and folds each file's relative
 * path into the hash alongside its content, so a rename or a moved file
 * changes the result exactly as a content edit would.
 *
 * @param {string} dir Absolute path to hash.
 * @returns {string} A hex sha256 digest.
 */
export function computeSourceHash(dir) {
  const digest = createHash('sha256');
  for (const relPath of listFilesSorted(dir)) {
    const contentHash = createHash('sha256').update(readFileSync(path.join(dir, relPath))).digest('hex');
    digest.update(`${relPath}:${contentHash}\n`);
  }
  return digest.digest('hex');
}

/**
 * @param {string} dir
 * @returns {string[]} Every file's path relative to `dir`, posix-style, sorted.
 */
function listFilesSorted(dir) {
  const results = [];
  walk(dir, '');
  return results.sort();

  /** @param {string} absDir @param {string} relDir */
  function walk(absDir, relDir) {
    for (const entry of readdirSync(absDir).sort()) {
      const absPath = path.join(absDir, entry);
      const relPath = relDir ? `${relDir}/${entry}` : entry;
      if (statSync(absPath).isDirectory()) {
        walk(absPath, relPath);
      } else {
        results.push(relPath);
      }
    }
  }
}
