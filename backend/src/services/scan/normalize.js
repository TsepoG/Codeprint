import path from 'node:path';
import { toPosixRelative } from './repoPath.js';
// `isSonarRule` lives with the finding extraction because that's what
// decides bug-vs-code-smell per message; the aggregate counters here have to
// classify identically or the metrics and the findings array would disagree.
import { extractFindings, isSonarRule, FINDINGS_VERSION } from './findings.js';
import { computeHealthScore } from './healthScore.js';

const COGNITIVE_COMPLEXITY_RE = /Cognitive Complexity from (\d+)/i;

/**
 * Estimates a file's cognitive complexity from its sonarjs violations: the
 * highest complexity value reported, or (if the message text couldn't be
 * parsed) the count of sonarjs violations as a rough proxy.
 *
 * @param {object[]} messages ESLint messages for one file.
 * @returns {number}
 */
function fileComplexity(messages) {
  let max = 0;
  let sonarCount = 0;
  for (const message of messages) {
    if (!isSonarRule(message.ruleId)) continue;
    sonarCount += 1;
    const match = COGNITIVE_COMPLEXITY_RE.exec(message.message || '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max > 0 ? max : sonarCount;
}

/**
 * ESLint only includes `source` on a result that has at least one message -
 * exactly the files this module keeps (see `normalizeEslint`) - so this only
 * ever sees the text it needs.
 *
 * @param {string|undefined} source
 * @returns {number}
 */
function countLines(source) {
  return typeof source === 'string' && source !== '' ? source.split(/\r\n|\r|\n/).length : 0;
}

/**
 * @param {object} fileResult One ESLint formatter-json file result.
 * @returns {'high'|'medium'|'low'}
 */
function fileSeverity(fileResult) {
  if (fileResult.errorCount > 0) return 'high';
  if (fileResult.warningCount > 0) return 'medium';
  return 'low';
}

/**
 * Turns a (possibly skipped) ESLint run into the response's `files` list
 * plus aggregate `bugs`/`codeSmells` counts. Only files with at least one
 * message are included.
 *
 * @param {import('./tools/eslint.js').EslintOk|{ok: false}|undefined} eslintResult
 * @param {string} targetDir Absolute path to the cloned repo (for relative file names).
 * @returns {{files: object[], bugs: number, codeSmells: number}}
 */
function normalizeEslint(eslintResult, targetDir) {
  const files = [];
  let bugs = 0;
  let codeSmells = 0;

  if (eslintResult?.ok) {
    for (const fileResult of eslintResult.results) {
      const messages = fileResult.messages ?? [];
      if (messages.length === 0) continue;

      for (const message of messages) {
        if (message.severity !== 2) continue;
        if (isSonarRule(message.ruleId)) codeSmells += 1;
        else bugs += 1;
      }
      // sonarjs rules can also fire at warning severity; count those as
      // code smells too since they're style/maintainability, not bugs.
      for (const message of messages) {
        if (message.severity === 2) continue;
        if (isSonarRule(message.ruleId)) codeSmells += 1;
      }

      files.push({
        name: toPosixRelative(targetDir, fileResult.filePath),
        complexity: fileComplexity(messages),
        coverage: null,
        loc: countLines(fileResult.source),
        severity: fileSeverity(fileResult),
      });
    }
  }

  return { files, bugs, codeSmells };
}

/**
 * @param {import('./tools/npmAudit.js').NpmAuditOk|{ok: false}|undefined} auditResult
 * @returns {number} Total vulnerability count, or 0 if audit was skipped/unavailable.
 */
function normalizeVulnerabilities(auditResult) {
  if (!auditResult?.ok) return 0;
  const vulnerabilities = auditResult.audit?.metadata?.vulnerabilities;
  if (!vulnerabilities) return 0;
  if (typeof vulnerabilities.total === 'number') return vulnerabilities.total;
  return Object.values(vulnerabilities).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

/**
 * @param {import('./tools/jscpd.js').JscpdOk|{ok: false}|undefined} jscpdResult
 * @returns {number} Percentage of duplicated lines, or 0 if unavailable.
 */
function normalizeDuplicationPct(jscpdResult) {
  if (!jscpdResult?.ok) return 0;
  const pct = jscpdResult.report?.statistics?.total?.percentage;
  return typeof pct === 'number' ? pct : 0;
}

// Both infra tools rate findings on their own CRITICAL/HIGH/MEDIUM/LOW
// scales; fold those onto the same high/medium/low the eslint-derived
// `files` list already uses, so the UI has one severity vocabulary. Anything
// unrecognized (including checkov's `null`, which it uses for checks with no
// published severity) lands on 'low' rather than inventing urgency.
const INFRA_SEVERITY = { CRITICAL: 'high', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

/** @param {unknown} raw @returns {'high'|'medium'|'low'} */
function mapInfraSeverity(raw) {
  return INFRA_SEVERITY[String(raw).toUpperCase()] ?? 'low';
}

/**
 * Normalizes a path reported by an infra tool to a repo-relative, posix-style
 * name.
 *
 * The two tools disagree about what they report: tfsec echoes back the
 * absolute path it was handed, while checkov reports scan-root-relative paths
 * with a leading slash (`/main.tf`) - which *looks* absolute to
 * `path.isAbsolute` but isn't, so testing against `targetDir` is what
 * actually separates the two cases.
 *
 * @param {string|undefined} rawPath
 * @param {string} targetDir
 * @returns {string|null}
 */
function relativizeInfraPath(rawPath, targetDir) {
  if (typeof rawPath !== 'string' || rawPath === '') return null;
  if (rawPath.startsWith(`${targetDir}${path.sep}`) || rawPath.startsWith(`${targetDir}/`)) {
    return toPosixRelative(targetDir, rawPath);
  }
  return rawPath.replace(/^[./\\]+/, '');
}

/**
 * @param {import('./tools/checkov.js').CheckovOk|{ok: false}|undefined} checkovResult
 * @param {string} targetDir
 * @returns {object[]}
 */
function normalizeCheckovFindings(checkovResult, targetDir) {
  if (!checkovResult?.ok) return [];

  // checkov emits one report object per scanned framework, and an array of
  // them when it scanned more than one.
  const reports = Array.isArray(checkovResult.report) ? checkovResult.report : [checkovResult.report];

  return reports.flatMap((report) =>
    (report?.results?.failed_checks ?? []).map((check) => ({
      resource: check.resource ?? null,
      file: relativizeInfraPath(check.file_path, targetDir),
      line: Array.isArray(check.file_line_range) ? check.file_line_range[0] : null,
      ruleId: check.check_id ?? null,
      severity: mapInfraSeverity(check.severity),
      description: check.check_name ?? 'Checkov policy violation',
      // checkov doesn't word a fix - it links its policy documentation,
      // which is where the remediation actually lives.
      remediation: null,
      impact: null,
      link: check.guideline ?? null,
      source: 'checkov',
    })),
  );
}

/**
 * @param {import('./tools/tfsec.js').TfsecOk|{ok: false}|undefined} tfsecResult
 * @param {string} targetDir
 * @returns {object[]}
 */
function normalizeTfsecFindings(tfsecResult, targetDir) {
  if (!tfsecResult?.ok) return [];

  // tfsec reports `"results": null` (not []) for a clean scan.
  return (tfsecResult.report?.results ?? []).map((result) => ({
    resource: result.resource ?? null,
    file: relativizeInfraPath(result.location?.filename, targetDir),
    line: result.location?.start_line ?? null,
    ruleId: result.long_id ?? result.rule_id ?? null,
    severity: mapInfraSeverity(result.severity),
    description: result.description ?? result.rule_description ?? 'tfsec policy violation',
    // tfsec words both the consequence and the fix; keep them apart so the
    // UI can lead with what to do rather than what goes wrong.
    remediation: result.resolution ?? null,
    impact: result.impact ?? null,
    link: Array.isArray(result.links) ? (result.links[0] ?? null) : null,
    source: 'tfsec',
  }));
}

// Matches one DOT-quoted identifier, honouring backslash escapes. Node names
// can't just be split on `->`, because inframap emits names that *contain*
// it - `"im_out.tcp/443->443"->"aws_instance.app"` is a single edge between
// two nodes, not three.
const DOT_QUOTED = /"((?:[^"\\]|\\.)*)"/g;

/** @param {string} token @returns {string} */
function unescapeDot(token) {
  return token.replace(/\\(.)/g, '$1');
}

/**
 * Parses one Graphviz DOT document into the `{nodes, edges}` shape the
 * dependency graph already uses.
 *
 * Only the two statement forms inframap emits are handled - `"a" -> "b";`
 * edges and `"a" [ attrs ];` node declarations - and attributes are dropped,
 * since all that's wanted here is the topology.
 *
 * @param {string} dot
 * @param {(name: string) => string} toId Maps a DOT node name to the id used in the merged graph.
 * @returns {{nodes: {id: string}[], edges: {from: string, to: string}[]}}
 */
function parseDotGraph(dot, toId) {
  /** @type {Set<string>} */
  const nodes = new Set();
  /** @type {{from: string, to: string}[]} */
  const edges = [];

  for (const line of dot.split('\n')) {
    const tokens = [...line.matchAll(DOT_QUOTED)];
    if (tokens.length === 0) continue; // `strict digraph G {`, `}`, blank lines

    if (tokens.length === 1) {
      nodes.add(toId(unescapeDot(tokens[0][1])));
      continue;
    }

    // Two or more quoted names on a line: an edge chain, as long as the text
    // separating each adjacent pair is an arrow.
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const gapStart = tokens[i].index + tokens[i][0].length;
      const gap = line.slice(gapStart, tokens[i + 1].index);
      if (!gap.includes('->')) continue;

      const from = toId(unescapeDot(tokens[i][1]));
      const to = toId(unescapeDot(tokens[i + 1][1]));
      nodes.add(from);
      nodes.add(to);
      edges.push({ from, to });
    }
  }

  return { nodes: [...nodes].map((id) => ({ id })), edges };
}

/**
 * Merges every directory's inframap graph into one.
 *
 * Node names are namespaced by the directory they came from, since separate
 * root modules routinely reuse resource names (an `envs/prod` and an
 * `envs/dev` that both declare `aws_s3_bucket.assets` are two different
 * buckets, and collapsing them would draw edges between unrelated
 * infrastructure). Terraform at the repo root keeps its bare name, so the
 * common single-module repo reads exactly as inframap named it.
 *
 * @param {import('./tools/inframap.js').InframapOk|{ok: false}|undefined} inframapResult
 * @returns {{nodes: {id: string}[], edges: {from: string, to: string}[]}}
 */
function normalizeInfraGraph(inframapResult) {
  if (!inframapResult?.ok) return { nodes: [], edges: [] };

  /** @type {Map<string, {id: string}>} */
  const nodes = new Map();
  /** @type {Map<string, {from: string, to: string}>} */
  const edges = new Map();

  for (const { dir, dot } of inframapResult.graphs) {
    const toId = (name) => (dir === '' ? name : `${dir}/${name}`);
    const graph = parseDotGraph(dot, toId);

    for (const node of graph.nodes) nodes.set(node.id, node);
    for (const edge of graph.edges) edges.set(`${edge.from} ${edge.to}`, edge);
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/**
 * Builds the `infrastructure` section from the two Terraform scanners, plus
 * a warning for whichever of them failed.
 *
 * When no `.tf` files were found (see `detectTerraform.js`), neither tool is
 * run at all and this reports `detected: false` with no findings and no
 * warnings - a JS-only repo's response is unchanged apart from the extra
 * empty section.
 *
 * @param {object} params
 * @param {boolean} params.hasTerraform
 * @param {import('./tools/checkov.js').CheckovOk|{ok: false, reason: string}|undefined} params.checkovResult
 * @param {import('./tools/tfsec.js').TfsecOk|{ok: false, reason: string}|undefined} params.tfsecResult
 * @param {import('./tools/inframap.js').InframapOk|{ok: false, reason: string}|undefined} params.inframapResult
 * @param {string} params.targetDir
 * @returns {{infrastructure: {detected: boolean, findings: object[], graph: {nodes: object[], edges: object[]}}, warnings: string[]}}
 */
function normalizeInfrastructure({ hasTerraform, checkovResult, tfsecResult, inframapResult, targetDir }) {
  if (!hasTerraform) {
    return {
      infrastructure: { detected: false, findings: [], graph: { nodes: [], edges: [] } },
      warnings: [],
    };
  }

  // TODO: checkov and tfsec frequently flag the same underlying problem (an
  // unencrypted bucket, say) under different rule ids, so a repo scanned by
  // both currently shows each issue twice - once per source. Deduping needs
  // a mapping between the two rule sets (or matching on
  // resource+file+line+intent), which isn't built yet; until then every
  // finding is just tagged with the `source` that produced it.
  const findings = [
    ...normalizeCheckovFindings(checkovResult, targetDir),
    ...normalizeTfsecFindings(tfsecResult, targetDir),
  ];

  const warnings = [checkovResult, tfsecResult, inframapResult]
    .filter((result) => result && !result.ok)
    .map((result) => result.reason);

  // A directory inframap couldn't parse is common enough in a multi-module
  // repo (not every module is a standalone root module) that it gets one
  // aggregated warning rather than one per directory.
  const skipped = inframapResult?.ok ? inframapResult.skipped : [];
  if (skipped?.length > 0) {
    warnings.push(`inframap could not graph ${skipped.length} Terraform ${skipped.length === 1 ? 'directory' : 'directories'}`);
  }

  return {
    infrastructure: { detected: true, findings, graph: normalizeInfraGraph(inframapResult) },
    warnings,
  };
}

/**
 * @param {import('./tools/madge.js').MadgeOk|{ok: false}|undefined} madgeResult
 * @returns {{nodes: {id: string}[], edges: {from: string, to: string}[]}}
 */
function normalizeDependencyGraph(madgeResult) {
  if (!madgeResult?.ok) return { nodes: [], edges: [] };

  const graph = madgeResult.graph ?? {};
  const nodes = Object.keys(graph).map((id) => ({ id }));
  const edges = [];
  for (const [from, deps] of Object.entries(graph)) {
    for (const to of deps ?? []) {
      edges.push({ from, to });
    }
  }
  return { nodes, edges };
}

/**
 * Combines the four tool runners' raw (or skipped) results into the
 * unified scan response shape.
 *
 * @param {object} params
 * @param {import('./tools/eslint.js').EslintOk|{ok: false, reason: string}} params.eslintResult
 * @param {import('./tools/madge.js').MadgeOk|{ok: false, reason: string}} params.madgeResult
 * @param {import('./tools/jscpd.js').JscpdOk|{ok: false, reason: string}} params.jscpdResult
 * @param {import('./tools/npmAudit.js').NpmAuditOk|{ok: false, reason: string}} params.auditResult
 * @param {boolean} [params.hasTerraform] Whether `clonePhase` found any `.tf`
 *   files. When false (or absent), the infra tools never ran.
 * @param {import('./tools/checkov.js').CheckovOk|{ok: false, reason: string}} [params.checkovResult]
 * @param {import('./tools/tfsec.js').TfsecOk|{ok: false, reason: string}} [params.tfsecResult]
 * @param {import('./tools/inframap.js').InframapOk|{ok: false, reason: string}} [params.inframapResult]
 * @param {string} params.targetDir Absolute path to the cloned repo.
 * @returns {{
 *   metrics: {bugs: number, vulnerabilities: number, codeSmells: number, duplicationPct: number},
 *   files: object[],
 *   findings: import('./findings.js').Finding[],
 *   findingsVersion: number,
 *   healthScore: number,
 *   dependencyGraph: {nodes: object[], edges: object[]},
 *   infrastructure: {detected: boolean, findings: object[], graph: {nodes: object[], edges: object[]}},
 *   warnings: string[],
 * }}
 */
export function normalizeScanResults({
  eslintResult,
  madgeResult,
  jscpdResult,
  auditResult,
  hasTerraform = false,
  checkovResult,
  tfsecResult,
  inframapResult,
  targetDir,
}) {
  const { files, bugs, codeSmells } = normalizeEslint(eslintResult, targetDir);
  const { infrastructure, warnings: infraWarnings } = normalizeInfrastructure({
    hasTerraform,
    checkovResult,
    tfsecResult,
    inframapResult,
    targetDir,
  });

  // The individual problems behind the counters above. Snippets are attached
  // separately (see `findings.js`), by the analyze phase, while the clone
  // still exists.
  const { findings, truncated } = extractFindings({
    eslintResult,
    auditResult,
    jscpdResult,
    infraFindings: infrastructure.findings,
    targetDir,
  });

  const warnings = [eslintResult, madgeResult, jscpdResult, auditResult]
    .filter((result) => result && !result.ok)
    .map((result) => result.reason)
    .concat(infraWarnings);

  if (truncated > 0) {
    warnings.push(`${truncated} lower-severity findings omitted (kept the first ${findings.length})`);
  }

  const duplicationPct = normalizeDuplicationPct(jscpdResult);

  return {
    metrics: {
      bugs,
      vulnerabilities: normalizeVulnerabilities(auditResult),
      codeSmells,
      duplicationPct,
    },
    files,
    findings,
    // Stamped every time this function runs, so a scan that predates
    // per-finding extraction (no column value at all, once persisted - see
    // db/index.js) is distinguishable from one that ran this code and found
    // nothing, rather than both looking like an empty `findings` array.
    findingsVersion: FINDINGS_VERSION,
    // Computed from the findings/duplication/coverage above, not a separate
    // signal - see healthScore.js. Absent (null, once persisted) under the
    // exact same condition findingsVersion is: a scan whose findings were
    // never extracted has no severity counts to score from.
    healthScore: computeHealthScore({ findings, duplicationPct, files }),
    dependencyGraph: normalizeDependencyGraph(madgeResult),
    infrastructure,
    warnings,
  };
}
