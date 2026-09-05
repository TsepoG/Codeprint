import path from 'node:path';
import { runCommand, summarizeExecError } from '../runTool.js';

/**
 * @typedef {object} InframapGraphSource
 * @property {string} dir Repo-relative directory the graph came from (`''` = repo root).
 * @property {string} dot Raw Graphviz DOT output.
 */

/**
 * @typedef {object} InframapOk
 * @property {true} ok
 * @property {InframapGraphSource[]} graphs One per Terraform directory (or state file) that graphed successfully.
 * @property {{dir: string, reason: string}[]} skipped Directories inframap couldn't graph.
 */

// dot is inframap's only printer - there's no JSON output - so the caller
// parses DOT (see normalize.js).
//
// --show-icons=false: icon mode writes PNG assets into a cache under $HOME
// and embeds their paths in the output. Neither is wanted here: the scan
// container's root filesystem is read-only, and the icon paths are noise in
// a graph we only read node/edge structure out of.
//
// --clean=false: the default drops every resource with no connections, so a
// repo whose Terraform is a handful of standalone resources would otherwise
// graph as nothing at all.
const COMMON_FLAGS = ['--show-icons=false', '--clean=false'];

/**
 * Builds infrastructure graphs for a repo's Terraform with inframap.
 *
 * inframap works on one Terraform root module at a time and does *not*
 * recurse (pointing it at a directory whose `.tf` files live in
 * subdirectories is an error), so this runs it once per directory reported
 * by `detectTerraform.js` and hands back each directory's DOT separately.
 *
 * Prefers state files when the repo committed any: state describes
 * infrastructure that actually exists, where HCL only describes what it
 * would create. Falls back to `--hcl` per directory otherwise, which is the
 * normal case.
 *
 * Partial failure is expected rather than exceptional - a repo can hold
 * modules that don't parse standalone - so a directory that fails is
 * recorded in `skipped` and the rest still graph. Only every target failing
 * makes this `ok: false`.
 *
 * @param {string} repoDir Absolute path to the cloned repo.
 * @param {import('../detectTerraform.js').TerraformLayout} layout
 * @param {import('../runTool.js').RunOptions} [opts]
 * @returns {Promise<InframapOk|{ok: false, reason: string}>} Never throws.
 */
export async function runInframap(repoDir, { terraformDirs, stateFiles }, { timeoutMs, signal } = {}) {
  const targets = stateFiles.length > 0
    ? stateFiles.map((file) => ({ dir: parentDir(file), args: ['--tfstate', absolutize(repoDir, file)] }))
    : terraformDirs.map((dir) => ({ dir, args: ['--hcl', absolutize(repoDir, dir)] }));

  if (targets.length === 0) {
    return { ok: false, reason: 'inframap had no Terraform directory to graph' };
  }

  /** @type {InframapGraphSource[]} */
  const graphs = [];
  /** @type {{dir: string, reason: string}[]} */
  const skipped = [];

  for (const target of targets) {
    const { error, stdout } = await runCommand(
      'inframap',
      ['generate', ...COMMON_FLAGS, ...target.args],
      { timeoutMs, signal },
    );

    // inframap writes its error (and a usage dump) to stderr and leaves
    // stdout empty when it can't parse a module, so the presence of a graph
    // in stdout is the real success signal.
    if (stdout.includes('digraph')) {
      graphs.push({ dir: target.dir, dot: stdout });
    } else {
      skipped.push({
        dir: target.dir,
        reason: error ? summarizeExecError(error) : 'inframap produced no graph',
      });
    }
  }

  if (graphs.length === 0) {
    return { ok: false, reason: `inframap failed to run: ${skipped[0].reason}` };
  }

  return { ok: true, graphs, skipped };
}

/**
 * Joins posix-style, because the result is an argument to a process inside
 * the Linux scan container - never a path on whatever host happens to be
 * running this code.
 *
 * @param {string} repoDir
 * @param {string} relPath Repo-relative posix path (`''` = the repo root itself).
 * @returns {string}
 */
function absolutize(repoDir, relPath) {
  return relPath === '' || relPath === '.' ? repoDir : path.posix.join(repoDir, relPath);
}

/**
 * @param {string} relFile Repo-relative posix path to a file.
 * @returns {string} Its directory, with the repo root as `''` rather than `'.'`,
 *   so graph node ids aren't namespaced under a stray `./`.
 */
function parentDir(relFile) {
  const dir = path.posix.dirname(relFile);
  return dir === '.' ? '' : dir;
}
