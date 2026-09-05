import { readdir } from 'node:fs/promises';
import path from 'node:path';

// Terraform's own local cache/state directories: never source we'd want to
// scan, and `.terraform` in particular can hold hundreds of MB of vendored
// provider plugins (including vendored `.tf` files from modules), which
// would make a repo look Terraform-y even when it isn't.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.terraform']);

/**
 * Recursively checks whether `dir` contains at least one `.tf` file.
 *
 * Short-circuits on the first hit rather than collecting every match - all
 * callers need is "is there any Terraform here", and both checkov and tfsec
 * do their own recursive walk from the repo root anyway.
 *
 * Never follows symlinks, for the same reason `diskUsage.js` doesn't: a
 * malicious repo could otherwise ship a directory symlink pointing outside
 * the clone (at `/`, say) and turn this into an unbounded walk of the
 * container's filesystem.
 *
 * @param {string} dir Absolute path to search.
 * @returns {Promise<boolean>}
 */
export async function hasTerraformFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (await hasTerraformFiles(path.join(dir, entry.name))) return true;
    } else if (entry.isFile() && entry.name.endsWith('.tf')) {
      return true;
    }
  }

  return false;
}
