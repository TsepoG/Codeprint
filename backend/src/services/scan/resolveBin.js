import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Resolves the absolute path to a locally installed package's CLI entry
 * script, without going through npm/npx. Packages like eslint restrict
 * their public `exports` map to library entry points, so we resolve via
 * `<pkg>/package.json` (always resolvable) and read the `bin` field
 * ourselves instead of requiring the bin subpath directly.
 *
 * @param {string} pkgName Name of the installed package, e.g. `"eslint"`.
 * @returns {string} Absolute filesystem path to the package's CLI script.
 * @throws {Error} If the package has no resolvable `bin` entry.
 */
export function resolveBin(pkgName) {
  const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
  const { bin } = require(pkgJsonPath);

  const relBin = typeof bin === 'string' ? bin : (bin?.[pkgName] ?? Object.values(bin ?? {})[0]);
  if (!relBin) {
    throw new Error(`Could not resolve a CLI entry point for "${pkgName}"`);
  }

  return path.join(path.dirname(pkgJsonPath), relBin);
}
