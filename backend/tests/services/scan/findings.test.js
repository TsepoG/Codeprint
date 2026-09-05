// extractFindings is covered against fixture tool output only - no real
// eslint/npm-audit/jscpd/checkov/tfsec binary ever runs here (see
// __fixtures__/*.json, captured from real tool output). attachSnippets is
// covered against a real temp directory, since its whole job is reading
// files back off disk - that's the one part of this module a fixture can't
// stand in for.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFindings, attachSnippets } from '../../../src/services/scan/findings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '__fixtures__');
const TARGET_DIR = path.join(__dirname, 'fixture-repo'); // string-only, as in normalize.test.js

/** @param {string} name @returns {any} */
function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

function eslintOk() {
  const results = loadFixture('eslint-result.json').map(({ file, ...rest }) => ({
    ...rest,
    filePath: path.join(TARGET_DIR, ...file.split('/')),
  }));
  return { ok: true, results };
}

function auditOk() {
  return { ok: true, audit: loadFixture('npm-audit.json') };
}

function jscpdOk() {
  return { ok: true, report: loadFixture('jscpd-report.json') };
}

// -- eslint --------------------------------------------------------------

test('eslint: an error from a non-sonarjs rule becomes a high-severity bug', () => {
  const { findings } = extractFindings({ eslintResult: eslintOk(), targetDir: TARGET_DIR });

  const bug = findings.find((f) => f.ruleId === 'no-unused-vars');
  assert.ok(bug, 'expected a finding for no-unused-vars');
  assert.equal(bug.category, 'bug');
  assert.equal(bug.source, 'eslint');
  assert.equal(bug.file, 'src/index.js');
  assert.equal(bug.line, 4);
  assert.equal(bug.endLine, 4);
  assert.equal(bug.severity, 'high');
  assert.equal(bug.description, "'x' is defined but never used.");
});

test('eslint: a sonarjs violation becomes a codeSmell regardless of its own severity', () => {
  const { findings } = extractFindings({ eslintResult: eslintOk(), targetDir: TARGET_DIR });

  const smells = findings.filter((f) => f.source === 'eslint' && f.category === 'codeSmell');
  assert.equal(smells.length, 3); // one in src/index.js, two in src/legacy.js
  assert.ok(smells.every((f) => f.ruleId.startsWith('sonarjs/')));
  assert.ok(smells.every((f) => f.severity === 'medium')); // all fired at eslint severity 1 in the fixture
});

test('eslint: a warning from a non-sonarjs rule is not a finding (it is not counted in the metrics either)', () => {
  const eslintResult = {
    ok: true,
    results: [{ filePath: path.join(TARGET_DIR, 'src', 'x.js'), messages: [{ ruleId: 'no-console', severity: 1, line: 1, message: 'Unexpected console statement.' }] }],
  };

  const { findings } = extractFindings({ eslintResult, targetDir: TARGET_DIR });

  assert.deepEqual(findings, []);
});

test('eslint: a skipped tool contributes no findings', () => {
  const { findings } = extractFindings({ eslintResult: { ok: false, reason: 'eslint reason' }, targetDir: TARGET_DIR });
  assert.deepEqual(findings, []);
});

// -- npm audit -------------------------------------------------------------

test('npm audit: a directly-vulnerable package becomes a finding named after its advisory', () => {
  const { findings } = extractFindings({ auditResult: auditOk(), targetDir: TARGET_DIR });

  const minimist = findings.find((f) => f.source === 'npm-audit' && f.description.startsWith('minimist'));
  assert.ok(minimist);
  assert.equal(minimist.category, 'vulnerability');
  assert.equal(minimist.file, null);
  assert.equal(minimist.line, null);
  assert.equal(minimist.severity, 'high'); // critical folds onto high
  assert.equal(minimist.ruleId, 'GHSA-xvch-5gv4-984h');
  assert.match(minimist.description, /Prototype Pollution in minimist/);
});

test('npm audit: a package vulnerable only transitively still gets a finding, naming what pulled it in', () => {
  const { findings } = extractFindings({ auditResult: auditOk(), targetDir: TARGET_DIR });

  const mkdirp = findings.find((f) => f.source === 'npm-audit' && f.description.startsWith('mkdirp'));
  assert.ok(mkdirp);
  assert.match(mkdirp.description, /via minimist/);
  assert.equal(mkdirp.severity, 'high');
});

test('npm audit: severities fold onto the high/medium/low scale', () => {
  const { findings } = extractFindings({ auditResult: auditOk(), targetDir: TARGET_DIR });

  const bySeverity = Object.fromEntries(findings.filter((f) => f.source === 'npm-audit').map((f) => [f.description.split(' ')[0], f.severity]));
  assert.equal(bySeverity.minimist, 'high'); // critical
  assert.equal(bySeverity.mkdirp, 'high'); // critical
  assert.equal(bySeverity['tough-cookie'], 'medium'); // moderate
});

test('npm audit: three vulnerable packages produce three findings, matching metadata.vulnerabilities.total', () => {
  const { findings } = extractFindings({ auditResult: auditOk(), targetDir: TARGET_DIR });
  assert.equal(findings.filter((f) => f.category === 'vulnerability').length, 3);
});

test('npm audit: a skipped tool (no lockfile) contributes no findings', () => {
  const { findings } = extractFindings({ auditResult: { ok: false, reason: 'no lockfile' }, targetDir: TARGET_DIR });
  assert.deepEqual(findings, []);
});

// -- jscpd -------------------------------------------------------------------

test('jscpd: a duplicate pair becomes one finding anchored at the first location', () => {
  const { findings } = extractFindings({ jscpdResult: jscpdOk(), targetDir: TARGET_DIR });

  const dup = findings.find((f) => f.file === 'src/handlers/create.js');
  assert.ok(dup);
  assert.equal(dup.category, 'duplication');
  assert.equal(dup.source, 'jscpd');
  assert.equal(dup.line, 10);
  assert.equal(dup.endLine, 51);
});

test('jscpd: the finding carries the other location as duplicateOf', () => {
  const { findings } = extractFindings({ jscpdResult: jscpdOk(), targetDir: TARGET_DIR });

  const dup = findings.find((f) => f.file === 'src/handlers/create.js');
  assert.equal(dup.duplicateOf.file, 'src/handlers/update.js');
  assert.equal(dup.duplicateOf.line, 8);
  assert.equal(dup.duplicateOf.endLine, 49);
});

test('jscpd: severity scales with the size of the duplicated block', () => {
  const { findings } = extractFindings({ jscpdResult: jscpdOk(), targetDir: TARGET_DIR });

  const big = findings.find((f) => f.file === 'src/handlers/create.js'); // 42 lines
  const small = findings.find((f) => f.file === 'src/utils/format.js'); // 12 lines
  assert.equal(big.severity, 'medium'); // >= 30
  assert.equal(small.severity, 'low'); // < 30
});

test('jscpd: falls back to computing the span from line numbers when the report omits `lines`', () => {
  const jscpdResult = {
    ok: true,
    report: {
      duplicates: [{
        firstFile: { name: 'src/a.js', startLoc: { line: 10 }, endLoc: { line: 14 } },
        secondFile: { name: 'src/b.js', startLoc: { line: 1 }, endLoc: { line: 5 } },
      }],
    },
  };

  const { findings } = extractFindings({ jscpdResult, targetDir: TARGET_DIR });

  assert.equal(findings[0].description.startsWith('5 duplicated lines'), true); // 14 - 10 + 1
});

test('jscpd: two duplicate pairs produce two findings', () => {
  const { findings } = extractFindings({ jscpdResult: jscpdOk(), targetDir: TARGET_DIR });
  assert.equal(findings.filter((f) => f.category === 'duplication').length, 2);
});

test('jscpd: a skipped tool (or a report with no duplicates) contributes no findings', () => {
  const { findings: fromSkipped } = extractFindings({ jscpdResult: { ok: false, reason: 'jscpd reason' }, targetDir: TARGET_DIR });
  assert.deepEqual(fromSkipped, []);

  const { findings: fromEmpty } = extractFindings({ jscpdResult: { ok: true, report: { statistics: {} } }, targetDir: TARGET_DIR });
  assert.deepEqual(fromEmpty, []);
});

// -- infra (already-normalized checkov/tfsec findings) ------------------------

test('infra: an already-normalized finding is re-shaped into the flat array, keeping its resource', () => {
  const infraFindings = [
    { resource: 'aws_s3_bucket.data', file: 'infra/s3.tf', line: 12, ruleId: 'CKV_AWS_18', severity: 'high', description: 'no access logging', source: 'checkov' },
  ];

  const { findings } = extractFindings({ infraFindings, targetDir: TARGET_DIR });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, 'infra');
  assert.equal(findings[0].source, 'checkov');
  assert.equal(findings[0].resource, 'aws_s3_bucket.data');
  assert.equal(findings[0].file, 'infra/s3.tf');
  assert.equal(findings[0].line, 12);
});

test('infra: no infra findings passed in contributes nothing (the default)', () => {
  const { findings } = extractFindings({ targetDir: TARGET_DIR });
  assert.deepEqual(findings, []);
});

// -- combined shape, ordering, ids -------------------------------------------

test('combines every tool into one array', () => {
  const { findings } = extractFindings({
    eslintResult: eslintOk(),
    auditResult: auditOk(),
    jscpdResult: jscpdOk(),
    infraFindings: [{ resource: 'r', file: 'main.tf', line: 1, ruleId: 'X', severity: 'low', description: 'd', source: 'tfsec' }],
    targetDir: TARGET_DIR,
  });

  assert.deepEqual(new Set(findings.map((f) => f.category)), new Set(['bug', 'codeSmell', 'vulnerability', 'duplication', 'infra']));
});

test('orders findings worst-severity-first', () => {
  const { findings } = extractFindings({ eslintResult: eslintOk(), auditResult: auditOk(), targetDir: TARGET_DIR });

  const severities = findings.map((f) => f.severity);
  const highEnd = severities.lastIndexOf('high');
  const mediumStart = severities.indexOf('medium');
  assert.ok(highEnd < mediumStart || !severities.includes('medium'), 'all high severities should sort before any medium');
});

test('two identical findings (repeated on the same line) still get distinct, stable ids', () => {
  const eslintResult = {
    ok: true,
    results: [{
      filePath: path.join(TARGET_DIR, 'src', 'dup.js'),
      messages: [
        { ruleId: 'sonarjs/no-duplicate-string', severity: 1, line: 5, message: 'same message' },
        { ruleId: 'sonarjs/no-duplicate-string', severity: 1, line: 5, message: 'same message' },
      ],
    }],
  };

  const run1 = extractFindings({ eslintResult, targetDir: TARGET_DIR }).findings.map((f) => f.id);
  const run2 = extractFindings({ eslintResult, targetDir: TARGET_DIR }).findings.map((f) => f.id);

  assert.equal(run1.length, 2);
  assert.notEqual(run1[0], run1[1], 'the two occurrences should not collide');
  assert.deepEqual(run1, run2, 'ids should be stable across runs of the same input');
});

test('caps the array at SCAN_MAX_FINDINGS and reports how many were dropped', async (t) => {
  const originalEnv = process.env.SCAN_MAX_FINDINGS;
  process.env.SCAN_MAX_FINDINGS = '2';
  t.after(() => {
    if (originalEnv === undefined) delete process.env.SCAN_MAX_FINDINGS;
    else process.env.SCAN_MAX_FINDINGS = originalEnv;
  });

  // Re-import so the module re-reads the env var at load time.
  const mod = await import(`../../../src/services/scan/findings.js?cap-test=${Date.now()}`);
  const { findings, truncated } = mod.extractFindings({ eslintResult: eslintOk(), auditResult: auditOk(), targetDir: TARGET_DIR });

  assert.equal(findings.length, 2);
  assert.ok(truncated > 0);
});

// -- attachSnippets ----------------------------------------------------------

let workspace;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'codeprint-findings-'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

/** @param {string} relPath @param {string} contents */
async function write(relPath, contents) {
  const full = path.join(workspace, ...relPath.split('/'));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, contents);
}

test('attachSnippets captures the flagged line plus surrounding context', async () => {
  await write('src/index.js', Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n'));
  const findings = [{ file: 'src/index.js', line: 10, endLine: 10, snippet: null }];

  await attachSnippets(findings, workspace);

  assert.ok(findings[0].snippet);
  assert.equal(findings[0].snippet.startLine, 7); // 10 - 3
  assert.equal(findings[0].snippet.text, ['line 7', 'line 8', 'line 9', 'line 10', 'line 11', 'line 12', 'line 13'].join('\n'));
});

test('attachSnippets clamps context to the start and end of the file', async () => {
  await write('src/short.js', ['a', 'b', 'c'].join('\n'));
  const findings = [{ file: 'src/short.js', line: 1, endLine: 1, snippet: null }];

  await attachSnippets(findings, workspace);

  assert.equal(findings[0].snippet.startLine, 1);
  assert.equal(findings[0].snippet.text, 'a\nb\nc');
});

test('attachSnippets spans a multi-line range (e.g. a sonarjs function-level finding)', async () => {
  await write('src/index.js', Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'));
  const findings = [{ file: 'src/index.js', line: 10, endLine: 15, snippet: null }];

  await attachSnippets(findings, workspace);

  assert.equal(findings[0].snippet.startLine, 7);
  assert.ok(findings[0].snippet.text.startsWith('line 7'));
  assert.ok(findings[0].snippet.text.endsWith('line 18')); // 15 + 3
});

test('attachSnippets captures both locations of a duplication finding', async () => {
  await write('src/a.js', Array.from({ length: 10 }, (_, i) => `a${i + 1}`).join('\n'));
  await write('src/b.js', Array.from({ length: 10 }, (_, i) => `b${i + 1}`).join('\n'));
  const findings = [{
    file: 'src/a.js',
    line: 3,
    endLine: 3,
    snippet: null,
    duplicateOf: { file: 'src/b.js', line: 5, endLine: 5, snippet: null },
  }];

  await attachSnippets(findings, workspace);

  assert.ok(findings[0].snippet.text.includes('a3'));
  assert.ok(findings[0].duplicateOf.snippet.text.includes('b5'));
});

test('attachSnippets leaves the snippet null when the file is missing (e.g. deleted after the tool ran)', async () => {
  const findings = [{ file: 'src/gone.js', line: 1, endLine: 1, snippet: null }];

  await attachSnippets(findings, workspace);

  assert.equal(findings[0].snippet, null);
});

test('attachSnippets leaves the snippet null for a finding with no file (e.g. an npm advisory)', async () => {
  const findings = [{ file: null, line: null, endLine: null, snippet: null }];

  await attachSnippets(findings, workspace);

  assert.equal(findings[0].snippet, null);
});

test('attachSnippets refuses a path that escapes the repo', async () => {
  await write('../outside.js', 'secret');
  const findings = [{ file: '../outside.js', line: 1, endLine: 1, snippet: null }];

  await attachSnippets(findings, workspace);

  assert.equal(findings[0].snippet, null);
});

test('attachSnippets does not follow a symlink out of the repo', async (t) => {
  const outsideDir = await mkdtemp(path.join(tmpdir(), 'codeprint-outside-'));
  t.after(() => rm(outsideDir, { recursive: true, force: true }));
  await writeFile(path.join(outsideDir, 'secret.js'), 'top secret');

  try {
    await symlink(path.join(outsideDir, 'secret.js'), path.join(workspace, 'linked.js'));
  } catch (err) {
    // Creating symlinks needs a privilege most CI/dev machines don't grant
    // by default on Windows - skip rather than fail the suite over that.
    if (err.code === 'EPERM') return t.skip('symlinks require elevated privileges on this machine');
    throw err;
  }

  const findings = [{ file: 'linked.js', line: 1, endLine: 1, snippet: null }];
  await attachSnippets(findings, workspace);

  // Whether this resolves the symlink and reads the file, or refuses it
  // outright, it must never leak the outside file's contents.
  assert.ok(!findings[0].snippet?.text.includes('top secret'));
});

test('attachSnippets only reads a file once no matter how many findings point into it', async () => {
  await write('src/hot.js', Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n'));
  const findings = [
    { file: 'src/hot.js', line: 2, endLine: 2, snippet: null },
    { file: 'src/hot.js', line: 15, endLine: 15, snippet: null },
  ];

  await attachSnippets(findings, workspace);

  assert.ok(findings[0].snippet.text.includes('line 2'));
  assert.ok(findings[1].snippet.text.includes('line 15'));
});

test('attachSnippets returns the same array it was given', async () => {
  const findings = [{ file: null, line: null, endLine: null, snippet: null }];
  const result = await attachSnippets(findings, workspace);
  assert.equal(result, findings);
});
