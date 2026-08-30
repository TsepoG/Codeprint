import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertScan, listScans, getScanById } from '../../src/db/index.js';

const SCAN_RESULT = {
  metrics: { bugs: 2, vulnerabilities: 0, codeSmells: 3, duplicationPct: 5 },
  files: [
    { name: 'a.js', complexity: 4, coverage: null, severity: 'medium' },
    { name: 'b.js', complexity: 8, coverage: null, severity: 'high' },
  ],
  dependencyGraph: { nodes: [], edges: [] },
  warnings: [],
};

test('insertScan + getScanById round-trips a complete scan', () => {
  insertScan({
    id: 'scan-1',
    repoUrl: 'https://github.com/owner/repo',
    branch: 'main',
    commitSha: 'abc123',
    startedAt: 1000,
    completedAt: 2000,
    status: 'complete',
    result: SCAN_RESULT,
  });

  const scan = getScanById('scan-1');
  assert.equal(scan.id, 'scan-1');
  assert.equal(scan.repoUrl, 'https://github.com/owner/repo');
  assert.equal(scan.branch, 'main');
  assert.equal(scan.commitSha, 'abc123');
  assert.equal(scan.status, 'complete');
  assert.deepEqual(scan.result, SCAN_RESULT);
});

test('insertScan stores a failed scan with a null result', () => {
  insertScan({
    id: 'scan-2',
    repoUrl: 'https://github.com/owner/broken',
    branch: null,
    commitSha: null,
    startedAt: 1000,
    completedAt: 1500,
    status: 'failed',
    result: null,
  });

  const scan = getScanById('scan-2');
  assert.equal(scan.status, 'failed');
  assert.equal(scan.result, null);
});

test('getScanById returns null for an unknown id', () => {
  assert.equal(getScanById('does-not-exist'), null);
});

test('a narrative on the result is stored in its own columns and merged back onto result.narrative', () => {
  const narrative = {
    summary: 'The codebase is in reasonable shape overall.',
    gapAnalysis: ['Reduce complexity in b.js', 'Add a lockfile so npm audit can run'],
  };
  insertScan({
    id: 'scan-narrative',
    repoUrl: 'https://github.com/owner/repo',
    branch: 'main',
    commitSha: 'abc123',
    startedAt: 1000,
    completedAt: 2000,
    status: 'complete',
    result: { ...SCAN_RESULT, narrative },
  });

  const scan = getScanById('scan-narrative');
  assert.deepEqual(scan.result.narrative, narrative);
});

test('a scan with no narrative round-trips with result.narrative left unset', () => {
  insertScan({
    id: 'scan-no-narrative',
    repoUrl: 'https://github.com/owner/repo',
    branch: 'main',
    commitSha: 'abc123',
    startedAt: 1000,
    completedAt: 2000,
    status: 'complete',
    result: SCAN_RESULT,
  });

  const scan = getScanById('scan-no-narrative');
  assert.equal(scan.result.narrative, undefined);
});

test('listScans orders most-recent-first and paginates', () => {
  insertScan({
    id: 'list-old',
    repoUrl: 'https://github.com/owner/list-test',
    branch: 'main',
    commitSha: 'a',
    startedAt: 100,
    completedAt: 100,
    status: 'complete',
    result: SCAN_RESULT,
  });
  insertScan({
    id: 'list-new',
    repoUrl: 'https://github.com/owner/list-test',
    branch: 'main',
    commitSha: 'b',
    startedAt: 200,
    completedAt: 200,
    status: 'complete',
    result: SCAN_RESULT,
  });

  const page1 = listScans({ repoUrl: 'https://github.com/owner/list-test', page: 1, pageSize: 1 });
  assert.equal(page1.total, 2);
  assert.equal(page1.scans.length, 1);
  assert.equal(page1.scans[0].id, 'list-new');

  const page2 = listScans({ repoUrl: 'https://github.com/owner/list-test', page: 2, pageSize: 1 });
  assert.equal(page2.scans[0].id, 'list-old');
});

test('listScans summaries include metrics and avgComplexity, without the full files array', () => {
  insertScan({
    id: 'summary-test',
    repoUrl: 'https://github.com/owner/summary-test',
    branch: 'main',
    commitSha: 'c',
    startedAt: 100,
    completedAt: 100,
    status: 'complete',
    result: SCAN_RESULT,
  });

  const { scans } = listScans({ repoUrl: 'https://github.com/owner/summary-test' });
  assert.deepEqual(scans[0].metrics, SCAN_RESULT.metrics);
  assert.equal(scans[0].avgComplexity, 6); // mean of 4 and 8
  assert.equal(scans[0].files, undefined);
});

test('listScans reports a null avgComplexity for a failed scan', () => {
  insertScan({
    id: 'failed-summary',
    repoUrl: 'https://github.com/owner/failed-summary',
    branch: null,
    commitSha: null,
    startedAt: 100,
    completedAt: 100,
    status: 'failed',
    result: null,
  });

  const { scans } = listScans({ repoUrl: 'https://github.com/owner/failed-summary' });
  assert.equal(scans[0].avgComplexity, null);
  assert.equal(scans[0].metrics, null);
});
