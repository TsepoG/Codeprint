import { readdir } from 'node:fs/promises';
import path from 'node:path';

// Terraform's own local cache/state directories: never source we'd want to
// scan, and `.terraform` in particular can hold hundreds of MB of vendored
// provider plugins (including vendored `.tf` files from modules), which
// would make a repo look Terraform-y even when it isn't.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.terraform']);

/**
 * @typedef {object} TerraformLayout
 * @property {string[]} terraformDirs Repo-relative, posix-style directories
 *   that *directly* contain at least one `.tf` file (`''` for the repo root).
 *   Terraform's unit of work is a directory, and inframap won't recurse - it
 *   has to be pointed at one of these - so the list matters, not just a flag.
 * @property {string[]} stateFiles Repo-relative, posix-style `.tfstate` files.
 *   Rare (committing state is a smell), but inframap graphs real infrastructure
 *   from state, so it's preferred over parsing HCL when one is present.
 */

/**
 * Walks `rootDir` once and reports where its Terraform lives.
 *
 * Never follows symlinks, for the same reason `diskUsage.js` doesn't: a
 * malicious repo could otherwise ship a directory symlink pointing outside
 * the clone (at `/`, say) and turn this into an unbounded walk of the
 * container's filesystem.
 *
 * @param {string} rootDir Absolute path to the cloned repo.
 * @returns {Promise<TerraformLayout>}
 */
export async function scanForTerraform(rootDir) {
  /** @type {string[]} */
  const terraformDirs = [];
  /** @type {string[]} */
  const stateFiles = [];

  /** @param {string} absDir @param {string} relDir */
  async function walk(absDir, relDir) {
    const entries = await readdir(absDir, { withFileTypes: true });
    let hasTfHere = false;

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(absDir, entry.name), relDir ? `${relDir}/${entry.name}` : entry.name);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.tf')) {
          hasTfHere = true;
        } else if (entry.name.endsWith('.tfstate')) {
          stateFiles.push(relDir ? `${relDir}/${entry.name}` : entry.name);
        }
      }
    }

    if (hasTfHere) terraformDirs.push(relDir);
  }

  await walk(rootDir, '');

  // Sorted so a repo always produces the same graph node ordering.
  return { terraformDirs: terraformDirs.sort(), stateFiles: stateFiles.sort() };
}
