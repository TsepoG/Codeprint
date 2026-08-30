import path from 'node:path';

const COGNITIVE_COMPLEXITY_RE = /Cognitive Complexity from (\d+)/i;

/**
 * @param {string} targetDir
 * @param {string} absolutePath
 * @returns {string} `absolutePath` relative to `targetDir`, with `/` separators.
 */
function toPosixRelative(targetDir, absolutePath) {
  return path.relative(targetDir, absolutePath).split(path.sep).join('/');
}

/** @param {string} ruleId @returns {boolean} */
function isSonarRule(ruleId) {
  return typeof ruleId === 'string' && ruleId.startsWith('sonarjs/');
}

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
 * @param {string} params.targetDir Absolute path to the cloned repo.
 * @returns {{
 *   metrics: {bugs: number, vulnerabilities: number, codeSmells: number, duplicationPct: number},
 *   files: object[],
 *   dependencyGraph: {nodes: object[], edges: object[]},
 *   warnings: string[],
 * }}
 */
export function normalizeScanResults({ eslintResult, madgeResult, jscpdResult, auditResult, targetDir }) {
  const { files, bugs, codeSmells } = normalizeEslint(eslintResult, targetDir);

  const warnings = [eslintResult, madgeResult, jscpdResult, auditResult]
    .filter((result) => result && !result.ok)
    .map((result) => result.reason);

  return {
    metrics: {
      bugs,
      vulnerabilities: normalizeVulnerabilities(auditResult),
      codeSmells,
      duplicationPct: normalizeDuplicationPct(jscpdResult),
    },
    files,
    dependencyGraph: normalizeDependencyGraph(madgeResult),
    warnings,
  };
}
