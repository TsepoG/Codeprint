import { cloneRepo, getClonedRevision } from './clone.js';
import { getDirectorySize } from './diskUsage.js';
import { scanForTerraform } from './detectTerraform.js';
import { runEslint } from './tools/eslint.js';
import { runMadge } from './tools/madge.js';
import { runJscpd } from './tools/jscpd.js';
import { runNpmAudit } from './tools/npmAudit.js';
import { runCheckov } from './tools/checkov.js';
import { runTfsec } from './tools/tfsec.js';
import { runInframap } from './tools/inframap.js';
import { normalizeScanResults } from './normalize.js';
import { attachSnippets } from './findings.js';
import { RepoTooLargeError } from './errors.js';

const CLONE_TIMEOUT_MS = Number(process.env.SCAN_CLONE_TIMEOUT_MS) || 30_000;
const TOOL_TIMEOUT_MS = Number(process.env.SCAN_TOOL_TIMEOUT_MS) || 60_000;
const MAX_REPO_SIZE_BYTES = (Number(process.env.SCAN_MAX_REPO_SIZE_MB) || 500) * 1024 * 1024;

// This whole module is the actual scan logic - it clones an arbitrary,
// untrusted repo and runs tools against it, so it must only ever run
// inside the sandboxed scan-runner container (see container/clonePhase.js
// and container/analyzePhase.js, and ../../../Dockerfile.scan-runner),
// never directly in the backend's own process. The backend process itself
// calls `runScan` from `./dockerRunner.js` instead, which orchestrates two
// short-lived containers and never touches a cloned repo's files or
// dependencies on the host. See README security notes.
//
// The pipeline is split across two containers with different network
// access, so it's split across two functions here too:
//   - clonePhase runs in a *network-enabled* container: it's the only
//     step that needs to reach the repo host, and npm audit is the only
//     *tool* that needs network access (to query the advisory database).
//   - analyzePhase runs in a *network-disabled* (`--network none`)
//     container: eslint/madge/jscpd are pure static analysis over files
//     already on disk and never need network access, so denying it
//     entirely means a malicious repo can't exfiltrate anything or reach
//     other hosts during this phase even if one of these tools has an
//     RCE-class bug.

/**
 * @typedef {object} ClonePhaseResult
 * @property {import('./tools/npmAudit.js').NpmAuditOk|{ok: false, reason: string}} auditResult
 * @property {string|null} branch The checked-out (default) branch, for scan history - see `dockerRunner.js`.
 * @property {string|null} commitSha The checked-out commit SHA, for scan history.
 * @property {import('./detectTerraform.js').TerraformLayout} terraform Where the
 *   repo's Terraform lives. An empty `terraformDirs` means no `.tf` files were
 *   found, and `analyzePhase` skips the Terraform tooling entirely.
 */

/**
 * Clones `repoUrl` into `workspaceDir`, enforces the repo size cap, and
 * runs npm audit (the one tool that needs network access). Intended to
 * run inside a network-enabled, otherwise-locked-down container.
 *
 * @param {string} repoUrl A URL that has already passed `isValidRepoUrl`.
 * @param {string} workspaceDir Empty directory to clone into (a shared
 *   volume mount, so `analyzePhase` - in a *different* container - can
 *   read the same files back out).
 * @returns {Promise<ClonePhaseResult>}
 * @throws {import('./errors.js').CloneError} If the clone fails.
 * @throws {RepoTooLargeError} If the cloned repo exceeds `SCAN_MAX_REPO_SIZE_MB`.
 */
export async function clonePhase(repoUrl, workspaceDir) {
  await cloneRepo(repoUrl, workspaceDir, { timeoutMs: CLONE_TIMEOUT_MS });

  const sizeBytes = await getDirectorySize(workspaceDir);
  if (sizeBytes > MAX_REPO_SIZE_BYTES) {
    const sizeMb = Math.round(sizeBytes / (1024 * 1024));
    const maxMb = Math.round(MAX_REPO_SIZE_BYTES / (1024 * 1024));
    throw new RepoTooLargeError(`Repository is ~${sizeMb}MB, which exceeds the ${maxMb}MB scan limit`);
  }

  const [auditResult, { branch, commitSha }, terraform] = await Promise.all([
    runNpmAudit(workspaceDir, { timeoutMs: TOOL_TIMEOUT_MS }),
    getClonedRevision(workspaceDir),
    scanForTerraform(workspaceDir),
  ]);
  return { auditResult, branch, commitSha, terraform };
}

/**
 * Runs eslint/madge/jscpd against the already-cloned `workspaceDir` - plus
 * checkov/tfsec/inframap if `clonePhase` found Terraform - and produces the
 * final unified response, folding in `auditResult` from `clonePhase` (which
 * ran while the container still had network). This is also the last point at
 * which the cloned source exists, so it's where each finding's code snippet
 * is read off disk. Intended to run inside a
 * network-severed container: like the JS tools, all three Terraform tools
 * are pure static analysis over files already on disk. Nothing here ever
 * runs `terraform init`, so a repo's module `source` addresses are only
 * ever read as text.
 *
 * checkov and tfsec recurse on their own and so are pointed at the repo
 * root once. inframap does not - it reads a single root module - so it's
 * given the specific directories `clonePhase` found (see
 * `tools/inframap.js`).
 *
 * @param {string} workspaceDir Absolute path to the cloned repo (as populated by `clonePhase`).
 * @param {import('./tools/npmAudit.js').NpmAuditOk|{ok: false, reason: string}} auditResult
 * @param {import('./detectTerraform.js').TerraformLayout} [terraform] From
 *   `clonePhase`. With no Terraform directories, none of the infra tools run
 *   and the response's `infrastructure.detected` is false.
 * @returns {Promise<ReturnType<typeof normalizeScanResults>>}
 */
export async function analyzePhase(workspaceDir, auditResult, terraform = { terraformDirs: [], stateFiles: [] }) {
  const toolOpts = { timeoutMs: TOOL_TIMEOUT_MS };
  const hasTerraform = terraform.terraformDirs.length > 0;

  // Every tool runner already catches its own failures internally and
  // resolves with { ok: false, reason }. The .catch below is just a
  // last-resort net so one tool crashing unexpectedly can never take
  // down the whole scan.
  const [eslintResult, madgeResult, jscpdResult, checkovResult, tfsecResult, inframapResult] = await Promise.all([
    runEslint(workspaceDir, toolOpts).catch((err) => asSkipped('eslint', err)),
    runMadge(workspaceDir, toolOpts).catch((err) => asSkipped('madge', err)),
    runJscpd(workspaceDir, toolOpts).catch((err) => asSkipped('jscpd', err)),
    hasTerraform ? runCheckov(workspaceDir, toolOpts).catch((err) => asSkipped('checkov', err)) : undefined,
    hasTerraform ? runTfsec(workspaceDir, toolOpts).catch((err) => asSkipped('tfsec', err)) : undefined,
    hasTerraform ? runInframap(workspaceDir, terraform, toolOpts).catch((err) => asSkipped('inframap', err)) : undefined,
  ]);

  const result = normalizeScanResults({
    eslintResult,
    madgeResult,
    jscpdResult,
    auditResult,
    hasTerraform,
    checkovResult,
    tfsecResult,
    inframapResult,
    targetDir: workspaceDir,
  });

  // Has to happen here, before this function returns: the container (and
  // with it the clone) is torn down as soon as the analyze phase's JSON
  // reaches the host, and a finding that leaves without its snippet can
  // never be given one afterwards. Best-effort per file - see findings.js.
  await attachSnippets(result.findings, workspaceDir);

  return result;
}

/**
 * @param {string} toolName
 * @param {Error} err
 * @returns {{ok: false, reason: string}}
 */
function asSkipped(toolName, err) {
  return { ok: false, reason: `${toolName} crashed unexpectedly: ${err.message}` };
}
