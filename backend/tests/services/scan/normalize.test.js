import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeScanResults } from '../../../src/services/scan/normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '__fixtures__');
// Doesn't need to exist on disk - path.relative() is purely string-based -
// just needs to be a well-formed absolute path in the current platform's
// format, since the fixtures below store repo-relative names and this test
// builds the "absolute" filePath eslint would have reported.
const TARGET_DIR = path.join(__dirname, 'fixture-repo');

/** @param {string} name @returns {any} */
function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

/** Turns the fixture's `file` (repo-relative) into an absolute `filePath` under TARGET_DIR, as real ESLint output would have. */
function eslintOk() {
  const results = loadFixture('eslint-result.json').map(({ file, ...rest }) => ({
    ...rest,
    filePath: path.join(TARGET_DIR, ...file.split('/')),
  }));
  return { ok: true, results };
}

function madgeOk() {
  return { ok: true, graph: loadFixture('madge-graph.json') };
}

function jscpdOk() {
  return { ok: true, report: loadFixture('jscpd-report.json') };
}

function auditOk(fixture = 'npm-audit.json') {
  return { ok: true, audit: loadFixture(fixture) };
}

test('combines all four tools into the unified shape', () => {
  const result = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  assert.deepEqual(result.metrics, { bugs: 1, vulnerabilities: 3, codeSmells: 3, duplicationPct: 8.5 });
  assert.deepEqual(result.warnings, []);
});

test('eslint: only files with at least one message are included, with posix-relative names', () => {
  const { files } = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  // src/clean.js has no messages and is dropped entirely.
  assert.deepEqual(
    files.map((f) => f.name),
    ['src/index.js', 'src/legacy.js'],
  );
});

test('eslint: complexity is parsed from the sonarjs message text when present', () => {
  const { files } = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  const index = files.find((f) => f.name === 'src/index.js');
  assert.equal(index.complexity, 12); // "...Cognitive Complexity from 12 to..."
});

test('eslint: falls back to a sonarjs-violation count when the message has no parseable complexity number', () => {
  const { files } = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  const legacy = files.find((f) => f.name === 'src/legacy.js');
  assert.equal(legacy.complexity, 2); // two sonarjs/no-duplicate-string violations, no complexity number to parse
});

test('eslint: severity is high with an error, medium with only warnings', () => {
  const { files } = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  assert.equal(files.find((f) => f.name === 'src/index.js').severity, 'high');
  assert.equal(files.find((f) => f.name === 'src/legacy.js').severity, 'medium');
});

test('eslint: severity-2 sonarjs messages count as code smells, not bugs; severity-2 non-sonarjs messages count as bugs', () => {
  const { metrics } = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  // 1 bug (no-unused-vars, severity 2, not sonarjs) + 3 code smells
  // (1 sonarjs warning on index.js + 2 sonarjs warnings on legacy.js).
  assert.equal(metrics.bugs, 1);
  assert.equal(metrics.codeSmells, 3);
});

test('eslint: a skipped tool yields an empty files list, zero bugs/smells, and a warning', () => {
  const result = normalizeScanResults({
    eslintResult: { ok: false, reason: 'eslint failed to run: not found' },
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  assert.deepEqual(result.files, []);
  assert.equal(result.metrics.bugs, 0);
  assert.equal(result.metrics.codeSmells, 0);
  assert.deepEqual(result.warnings, ['eslint failed to run: not found']);
});

test('eslint: an undefined result (never ran) is treated the same as a skip', () => {
  const result = normalizeScanResults({
    eslintResult: undefined,
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  assert.deepEqual(result.files, []);
  assert.equal(result.metrics.bugs, 0);
});

test('madge: builds nodes from every graph key and one edge per dependency', () => {
  const { dependencyGraph } = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  assert.deepEqual(
    new Set(dependencyGraph.nodes.map((n) => n.id)),
    new Set(['src/index.js', 'src/legacy.js', 'src/clean.js']),
  );
  assert.deepEqual(dependencyGraph.edges, [
    { from: 'src/index.js', to: 'src/legacy.js' },
    { from: 'src/index.js', to: 'src/clean.js' },
  ]);
});

test('madge: a skipped tool yields an empty graph and a warning', () => {
  const result = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: { ok: false, reason: 'madge produced no parseable output' },
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  assert.deepEqual(result.dependencyGraph, { nodes: [], edges: [] });
  assert.deepEqual(result.warnings, ['madge produced no parseable output']);
});

test('jscpd: reads the duplication percentage from statistics.total.percentage', () => {
  const { metrics } = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  assert.equal(metrics.duplicationPct, 8.5);
});

test('jscpd: a skipped tool (or a missing percentage) defaults duplicationPct to 0', () => {
  const skipped = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: { ok: false, reason: 'jscpd produced no report' },
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });
  assert.equal(skipped.metrics.duplicationPct, 0);
  assert.deepEqual(skipped.warnings, ['jscpd produced no report']);

  const malformed = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: { ok: true, report: { statistics: {} } },
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });
  assert.equal(malformed.metrics.duplicationPct, 0);
});

test('npm audit: prefers metadata.vulnerabilities.total when present', () => {
  const { metrics } = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk('npm-audit.json'),
    targetDir: TARGET_DIR,
  });

  assert.equal(metrics.vulnerabilities, 3);
});

test('npm audit: sums the per-severity counts when metadata.vulnerabilities.total is absent', () => {
  const { metrics } = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk('npm-audit-no-total.json'),
    targetDir: TARGET_DIR,
  });

  assert.equal(metrics.vulnerabilities, 4); // 0 + 2 + 1 + 1 + 0
});

test('npm audit: a skipped tool (no lockfile) yields zero vulnerabilities and a warning', () => {
  const result = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: { ok: false, reason: 'no package-lock.json found; skipping npm audit' },
    targetDir: TARGET_DIR,
  });

  assert.equal(result.metrics.vulnerabilities, 0);
  assert.deepEqual(result.warnings, ['no package-lock.json found; skipping npm audit']);
});

test('collects one warning per skipped tool, in eslint/madge/jscpd/audit order', () => {
  const result = normalizeScanResults({
    eslintResult: { ok: false, reason: 'eslint reason' },
    madgeResult: { ok: false, reason: 'madge reason' },
    jscpdResult: { ok: false, reason: 'jscpd reason' },
    auditResult: { ok: false, reason: 'audit reason' },
    targetDir: TARGET_DIR,
  });

  assert.deepEqual(result.warnings, ['eslint reason', 'madge reason', 'jscpd reason', 'audit reason']);
  assert.deepEqual(result.metrics, { bugs: 0, vulnerabilities: 0, codeSmells: 0, duplicationPct: 0 });
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.dependencyGraph, { nodes: [], edges: [] });
});
