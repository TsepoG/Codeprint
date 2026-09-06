import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeScanResults } from '../../../src/services/scan/normalize.js';
import { FINDINGS_VERSION } from '../../../src/services/scan/findings.js';
import { computeHealthScore } from '../../../src/services/scan/healthScore.js';

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

function checkovOk() {
  return { ok: true, report: loadFixture('checkov-report.json') };
}

/** tfsec echoes back absolute paths under the directory it was pointed at; the fixture stores them repo-relative. */
function tfsecOk() {
  const report = loadFixture('tfsec-report.json');
  return {
    ok: true,
    report: {
      results: report.results.map((result) => ({
        ...result,
        location: { ...result.location, filename: path.join(TARGET_DIR, ...result.location.filename.split('/')) },
      })),
    },
  };
}

/** The JS half of the pipeline, held constant while the infra half varies. */
function jsTools() {
  return {
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  };
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

test('infrastructure: reports detected false with no findings when no .tf files were found', () => {
  const result = normalizeScanResults({ ...jsTools(), hasTerraform: false });

  assert.deepEqual(result.infrastructure, { detected: false, findings: [], graph: { nodes: [], edges: [] } });
});

test('infrastructure: a JS-only repo gains no extra warnings from the infra section', () => {
  const withInfraArg = normalizeScanResults({ ...jsTools(), hasTerraform: false });
  const withoutInfraArg = normalizeScanResults(jsTools()); // hasTerraform omitted entirely

  assert.deepEqual(withInfraArg.warnings, []);
  assert.deepEqual(withoutInfraArg.warnings, []);
  assert.deepEqual(withoutInfraArg.infrastructure, { detected: false, findings: [], graph: { nodes: [], edges: [] } });
});

test('infrastructure: never runs the infra tools implicitly - a result passed with hasTerraform false is ignored', () => {
  const result = normalizeScanResults({
    ...jsTools(),
    hasTerraform: false,
    checkovResult: checkovOk(),
    tfsecResult: tfsecOk(),
  });

  assert.deepEqual(result.infrastructure, { detected: false, findings: [], graph: { nodes: [], edges: [] } });
});

test('infrastructure: maps checkov failed checks onto the unified finding shape', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    checkovResult: checkovOk(),
  });

  assert.equal(infrastructure.detected, true);
  const checkovFindings = infrastructure.findings.filter((f) => f.source === 'checkov');
  assert.equal(checkovFindings.length, 3); // failed_checks only - passed_checks are not findings
  assert.deepEqual(checkovFindings[0], {
    resource: 'aws_s3_bucket.data',
    file: 'infra/s3.tf', // checkov reports "/infra/s3.tf" - scan-root-relative despite the leading slash
    line: 12, // start of file_line_range
    ruleId: 'CKV_AWS_18',
    severity: 'high',
    description: 'Ensure the S3 bucket has access logging enabled',
    // checkov words no fix of its own - it links its policy docs instead.
    remediation: null,
    impact: null,
    link: 'https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/s3-policies/s3-13-enable-logging',
    source: 'checkov',
  });
});

test('infrastructure: a checkov check with no guideline link degrades to null rather than undefined', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    checkovResult: checkovOk(),
  });

  // CKV_AWS_21 in the fixture carries no `guideline`.
  const withoutLink = infrastructure.findings.find((f) => f.ruleId === 'CKV_AWS_21');
  assert.equal(withoutLink.link, null);
});

test('infrastructure: maps tfsec results onto the unified finding shape', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    tfsecResult: tfsecOk(),
  });

  const tfsecFindings = infrastructure.findings.filter((f) => f.source === 'tfsec');
  assert.equal(tfsecFindings.length, 3);
  assert.deepEqual(tfsecFindings[0], {
    resource: 'aws_s3_bucket.data',
    file: 'infra/s3.tf', // absolute path under targetDir, relativized
    line: 12,
    ruleId: 'aws-s3-enable-bucket-encryption', // long_id preferred over rule_id
    severity: 'high', // CRITICAL folds onto high
    description: 'Bucket does not have encryption enabled',
    remediation: 'Configure bucket encryption',
    impact: 'The bucket objects could be read if compromised',
    link: null, // this fixture result carries no `links`
    source: 'tfsec',
  });
});

test('infrastructure: tfsec links are carried through, first one only', () => {
  const report = loadFixture('tfsec-report.json');
  const withLinks = {
    ok: true,
    report: {
      results: [{
        ...report.results[0],
        location: { ...report.results[0].location, filename: path.join(TARGET_DIR, 'infra', 's3.tf') },
        links: ['https://aquasecurity.github.io/tfsec/latest/checks/aws/s3/enable-bucket-encryption/', 'https://example.test/second'],
      }],
    },
  };

  const { infrastructure } = normalizeScanResults({ ...jsTools(), hasTerraform: true, tfsecResult: withLinks });

  assert.equal(
    infrastructure.findings[0].link,
    'https://aquasecurity.github.io/tfsec/latest/checks/aws/s3/enable-bucket-encryption/',
  );
});

test('infrastructure: folds both tools\' severity scales onto high/medium/low', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    checkovResult: checkovOk(),
    tfsecResult: tfsecOk(),
  });

  const severityOf = (ruleId) => infrastructure.findings.find((f) => f.ruleId === ruleId).severity;

  assert.equal(severityOf('aws-s3-enable-bucket-encryption'), 'high'); // tfsec CRITICAL
  assert.equal(severityOf('CKV_AWS_18'), 'high'); // checkov HIGH
  assert.equal(severityOf('CKV_AWS_23'), 'medium'); // checkov MEDIUM
  assert.equal(severityOf('aws-ec2-no-public-ingress-sgr'), 'medium'); // tfsec MEDIUM
  assert.equal(severityOf('aws-s3-encryption-customer-key'), 'low'); // tfsec LOW
  assert.equal(severityOf('CKV_AWS_21'), 'low'); // checkov severity: null
});

test('infrastructure: keeps overlapping findings from both tools, tagged by source (dedup is a known gap)', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    checkovResult: checkovOk(),
    tfsecResult: tfsecOk(),
  });

  assert.equal(infrastructure.findings.length, 6); // 3 checkov + 3 tfsec, nothing merged
  assert.deepEqual(new Set(infrastructure.findings.map((f) => f.source)), new Set(['checkov', 'tfsec']));

  // Both tools flag the same resource in the same file - deliberately kept
  // as two separate findings for now.
  const s3Findings = infrastructure.findings.filter((f) => f.resource === 'aws_s3_bucket.data');
  assert.ok(s3Findings.some((f) => f.source === 'checkov'));
  assert.ok(s3Findings.some((f) => f.source === 'tfsec'));
});

test('infrastructure: a failed infra tool degrades to a warning while the other still reports', () => {
  const result = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    checkovResult: { ok: false, reason: 'checkov failed to run: spawn checkov ENOENT' },
    tfsecResult: tfsecOk(),
  });

  assert.equal(result.infrastructure.detected, true);
  assert.equal(result.infrastructure.findings.length, 3); // tfsec's, unaffected
  assert.ok(result.infrastructure.findings.every((f) => f.source === 'tfsec'));
  assert.deepEqual(result.warnings, ['checkov failed to run: spawn checkov ENOENT']);
});

test('infrastructure: both tools failing still reports detected true, with no findings and two warnings', () => {
  const result = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    checkovResult: { ok: false, reason: 'checkov reason' },
    tfsecResult: { ok: false, reason: 'tfsec reason' },
  });

  assert.deepEqual(result.infrastructure, { detected: true, findings: [], graph: { nodes: [], edges: [] } });
  assert.deepEqual(result.warnings, ['checkov reason', 'tfsec reason']);
});

test('infrastructure: handles checkov emitting an array of per-framework reports', () => {
  const single = checkovOk();
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    checkovResult: { ok: true, report: [single.report] },
  });

  assert.equal(infrastructure.findings.length, 3);
});

test('infrastructure: handles tfsec reporting a clean scan as results: null', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    tfsecResult: { ok: true, report: { results: null } },
  });

  assert.deepEqual(infrastructure, { detected: true, findings: [], graph: { nodes: [], edges: [] } });
});

test('infrastructure: infra warnings come after the JS tools\' warnings', () => {
  const result = normalizeScanResults({
    eslintResult: { ok: false, reason: 'eslint reason' },
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: { ok: false, reason: 'audit reason' },
    targetDir: TARGET_DIR,
    hasTerraform: true,
    checkovResult: { ok: false, reason: 'checkov reason' },
    tfsecResult: tfsecOk(),
  });

  assert.deepEqual(result.warnings, ['eslint reason', 'audit reason', 'checkov reason']);
});

// Verbatim inframap 0.8.0 output (--show-icons=false --clean=false).
const DOT_SIMPLE = `strict digraph G {
\t"aws_instance.prod_app"->"aws_security_group.sg";
\t"aws_instance.prod_app" [ shape=ellipse ];
\t"aws_s3_bucket.prod_assets" [ shape=ellipse ];
\t"aws_security_group.sg" [ shape=rectangle ];

}
`;

// inframap's external "im_out" nodes carry `->` *inside* the node name.
const DOT_WITH_ARROW_IN_NAME = `strict digraph G {
\t"aws_db_instance.db"->"aws_instance.app";
\t"im_out.tcp/443->443"->"aws_instance.app";
\t"im_out.tcp/443->443"->"aws_db_instance.db";
\t"aws_db_instance.db" [ shape=ellipse ];
\t"aws_instance.app" [ shape=ellipse ];
\t"im_out.tcp/443->443" [ shape=ellipse ];

}
`;

function inframapOk(graphs, skipped = []) {
  return { ok: true, graphs, skipped };
}

test('infrastructure graph: parses inframap DOT into the dependencyGraph node/edge shape', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    inframapResult: inframapOk([{ dir: '', dot: DOT_SIMPLE }]),
  });

  assert.deepEqual(infrastructure.graph.nodes, [
    { id: 'aws_instance.prod_app' },
    { id: 'aws_security_group.sg' },
    { id: 'aws_s3_bucket.prod_assets' },
  ]);
  assert.deepEqual(infrastructure.graph.edges, [
    { from: 'aws_instance.prod_app', to: 'aws_security_group.sg' },
  ]);
});

test('infrastructure graph: keeps resources that have no edges', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    inframapResult: inframapOk([{ dir: '', dot: DOT_SIMPLE }]),
  });

  assert.ok(infrastructure.graph.nodes.some((n) => n.id === 'aws_s3_bucket.prod_assets'));
});

test('infrastructure graph: does not split node names that themselves contain "->"', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    inframapResult: inframapOk([{ dir: '', dot: DOT_WITH_ARROW_IN_NAME }]),
  });

  assert.ok(
    infrastructure.graph.nodes.some((n) => n.id === 'im_out.tcp/443->443'),
    'the external node name should survive intact',
  );
  assert.equal(infrastructure.graph.nodes.length, 3);
  assert.deepEqual(infrastructure.graph.edges, [
    { from: 'aws_db_instance.db', to: 'aws_instance.app' },
    { from: 'im_out.tcp/443->443', to: 'aws_instance.app' },
    { from: 'im_out.tcp/443->443', to: 'aws_db_instance.db' },
  ]);
});

test('infrastructure graph: namespaces nodes by module directory so separate root modules never merge', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    inframapResult: inframapOk([
      { dir: 'envs/prod', dot: 'strict digraph G {\n\t"aws_s3_bucket.assets" [ shape=ellipse ];\n}\n' },
      { dir: 'envs/dev', dot: 'strict digraph G {\n\t"aws_s3_bucket.assets" [ shape=ellipse ];\n}\n' },
    ]),
  });

  assert.deepEqual(infrastructure.graph.nodes, [
    { id: 'envs/prod/aws_s3_bucket.assets' },
    { id: 'envs/dev/aws_s3_bucket.assets' },
  ]);
});

test('infrastructure graph: merges several directories and dedupes repeated edges', () => {
  const { infrastructure } = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    inframapResult: inframapOk([
      { dir: '', dot: DOT_SIMPLE },
      { dir: '', dot: DOT_SIMPLE }, // same graph twice
    ]),
  });

  assert.equal(infrastructure.graph.nodes.length, 3);
  assert.equal(infrastructure.graph.edges.length, 1);
});

test('infrastructure graph: is empty when inframap failed, and the failure becomes a warning', () => {
  const result = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    inframapResult: { ok: false, reason: 'inframap failed to run: spawn inframap ENOENT' },
  });

  assert.deepEqual(result.infrastructure.graph, { nodes: [], edges: [] });
  assert.deepEqual(result.warnings, ['inframap failed to run: spawn inframap ENOENT']);
});

test('infrastructure graph: partly-skipped directories produce one aggregated warning', () => {
  const result = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    inframapResult: inframapOk(
      [{ dir: 'good', dot: DOT_SIMPLE }],
      [{ dir: 'broken', reason: 'boom' }, { dir: 'also-broken', reason: 'boom' }],
    ),
  });

  assert.equal(result.infrastructure.graph.nodes.length, 3);
  assert.deepEqual(result.warnings, ['inframap could not graph 2 Terraform directories']);
});

test('infrastructure graph: a single skipped directory is described in the singular', () => {
  const result = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    inframapResult: inframapOk([{ dir: 'good', dot: DOT_SIMPLE }], [{ dir: 'broken', reason: 'boom' }]),
  });

  assert.deepEqual(result.warnings, ['inframap could not graph 1 Terraform directory']);
});

test('infrastructure graph: a JS-only repo reports an empty graph without running inframap', () => {
  const { infrastructure } = normalizeScanResults({ ...jsTools(), hasTerraform: false });

  assert.deepEqual(infrastructure, { detected: false, findings: [], graph: { nodes: [], edges: [] } });
});

test('findings: the unified result carries one flattened findings array alongside the existing metrics', () => {
  const result = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  // The counts already asserted against `result.metrics` above (bugs: 1,
  // codeSmells: 3) should be derivable from findings, so the two views of
  // the same scan never disagree.
  assert.equal(result.findings.filter((f) => f.category === 'bug').length, result.metrics.bugs);
  assert.equal(result.findings.filter((f) => f.category === 'codeSmell').length, result.metrics.codeSmells);
});

test('findings: infrastructure findings are included in the flat array too, tagged category "infra"', () => {
  const result = normalizeScanResults({
    ...jsTools(),
    hasTerraform: true,
    checkovResult: checkovOk(),
  });

  const infra = result.findings.filter((f) => f.category === 'infra');
  assert.equal(infra.length, result.infrastructure.findings.length);
  assert.ok(infra.every((f) => f.source === 'checkov'));
});

test('findings: a scan with every tool skipped has an empty findings array, not an error', () => {
  const result = normalizeScanResults({
    eslintResult: { ok: false, reason: 'x' },
    madgeResult: { ok: false, reason: 'x' },
    jscpdResult: { ok: false, reason: 'x' },
    auditResult: { ok: false, reason: 'x' },
    targetDir: TARGET_DIR,
  });

  assert.deepEqual(result.findings, []);
});

test('findings: every result is stamped with the current findings schema version', () => {
  const result = normalizeScanResults({
    eslintResult: { ok: false, reason: 'x' },
    madgeResult: { ok: false, reason: 'x' },
    jscpdResult: { ok: false, reason: 'x' },
    auditResult: { ok: false, reason: 'x' },
    targetDir: TARGET_DIR,
  });

  // Distinguishes "this scan ran extraction and found nothing" from "this
  // scan predates extraction" once persisted (see db/index.js) - stamped
  // even when every tool was skipped, since extraction itself still ran.
  assert.equal(result.findingsVersion, FINDINGS_VERSION);
});

test('healthScore agrees with computeHealthScore given the same findings/duplication/files', () => {
  const result = normalizeScanResults({
    eslintResult: eslintOk(),
    madgeResult: madgeOk(),
    jscpdResult: jscpdOk(),
    auditResult: auditOk(),
    targetDir: TARGET_DIR,
  });

  const expected = computeHealthScore({
    findings: result.findings,
    duplicationPct: result.metrics.duplicationPct,
    files: result.files,
  });
  assert.equal(result.healthScore, expected);
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
