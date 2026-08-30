import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import { childProcess } from '../../src/services/scan/runTool.js';

// End-to-end coverage of the actual background job lifecycle a real
// POST /api/scan drives (job created -> runScan -> completeJob/failJob ->
// insertScan), which app.test.js's validation-focused tests don't exercise
// since they only ever poke the job store directly. No real repo is cloned
// and no real Docker daemon is touched - `childProcess.execFile` (the one
// seam everything scan-related ultimately calls through - see
// runTool.js) is mocked to answer the exact `docker` subcommand sequence
// dockerRunner.js runs, and `fetch` is mocked so the pre-flight repo-size
// check (which otherwise calls the real GitHub API) resolves instantly.

const REPO_URL = 'https://github.com/owner/repo';

const CLONE_OK = {
  ok: true,
  result: { auditResult: { ok: false, reason: 'no package-lock.json found; skipping npm audit' }, branch: 'main', commitSha: 'deadbeef' },
};
const ANALYZE_OK = {
  ok: true,
  result: {
    metrics: { bugs: 1, vulnerabilities: 0, codeSmells: 0, duplicationPct: 0 },
    files: [{ name: 'src/index.js', complexity: 3, coverage: null, severity: 'low' }],
    dependencyGraph: { nodes: [], edges: [] },
    warnings: ['no package-lock.json found; skipping npm audit'],
  },
};

let originalExecFile;
let originalFetch;

beforeEach(() => {
  originalExecFile = childProcess.execFile;
  originalFetch = global.fetch;
  global.fetch = () => Promise.reject(new Error('network disabled in tests'));
});

afterEach(() => {
  childProcess.execFile = originalExecFile;
  global.fetch = originalFetch;
});

/** @param {{cloneResult?: object, analyzeResult?: object}} [opts] */
function mockDocker({ cloneResult = CLONE_OK, analyzeResult = ANALYZE_OK } = {}) {
  childProcess.execFile = (command, args, options, callback) => {
    const [sub] = args;
    if (sub === 'run') return callback(null, 'fake-container-id\n', '');
    if (sub === 'exec') {
      const isClonePhase = args.some((a) => typeof a === 'string' && a.includes('clonePhase.js'));
      return callback(null, JSON.stringify(isClonePhase ? cloneResult : analyzeResult), '');
    }
    if (sub === 'network' || sub === 'stop') return callback(null, '', '');
    return callback(new Error(`mockDocker: unexpected subcommand "${sub}"`), '', '');
  };
}

/**
 * Polls `GET /api/scan/:jobId` (the same way the real frontend does) until
 * it leaves the queued/running states, since the scan the route kicks off
 * runs in the background rather than being awaited by the POST itself.
 *
 * @param {string} jobId
 * @param {number} [timeoutMs]
 */
async function waitForTerminalStatus(jobId, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app).get(`/api/scan/${jobId}`);
    if (res.body.status === 'complete' || res.body.status === 'failed') return res;
    if (Date.now() > deadline) throw new Error(`job ${jobId} did not reach a terminal state within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('a successful scan: POST returns 202 immediately, the job completes, and the result is persisted', async () => {
  mockDocker();

  const postRes = await request(app).post('/api/scan').send({ repoUrl: REPO_URL });
  assert.equal(postRes.status, 202);
  assert.equal(postRes.body.status, 'queued');
  const { jobId } = postRes.body;
  assert.equal(typeof jobId, 'string');

  const finalRes = await waitForTerminalStatus(jobId);
  assert.equal(finalRes.body.status, 'complete');
  assert.deepEqual(finalRes.body.result, { ...ANALYZE_OK.result, branch: 'main', commitSha: 'deadbeef' });

  const detailRes = await request(app).get(`/api/scans/${jobId}`);
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.status, 'complete');
  assert.equal(detailRes.body.branch, 'main');
  assert.equal(detailRes.body.commitSha, 'deadbeef');
  assert.deepEqual(detailRes.body.result, { ...ANALYZE_OK.result, branch: 'main', commitSha: 'deadbeef' });

  const listRes = await request(app).get('/api/scans').query({ repoUrl: REPO_URL });
  assert.ok(listRes.body.scans.some((scan) => scan.id === jobId));
});

test('a failing scan: the job fails with a user-facing message and is persisted as failed', async () => {
  mockDocker({ cloneResult: { ok: false, error: 'CloneError', message: 'git clone failed: repository not found' } });

  const postRes = await request(app).post('/api/scan').send({ repoUrl: REPO_URL });
  const { jobId } = postRes.body;

  const finalRes = await waitForTerminalStatus(jobId);
  assert.equal(finalRes.body.status, 'failed');
  assert.match(finalRes.body.error, /Could not clone repository: git clone failed: repository not found/);

  const detailRes = await request(app).get(`/api/scans/${jobId}`);
  assert.equal(detailRes.body.status, 'failed');
  assert.equal(detailRes.body.result, null);
});

test('a scan that hits an unexpected error is still persisted as failed with a generic message', async () => {
  mockDocker({ analyzeResult: { ok: false, error: 'SomethingWeNeverNamed', message: 'kaboom' } });

  const postRes = await request(app).post('/api/scan').send({ repoUrl: REPO_URL });
  const { jobId } = postRes.body;

  const finalRes = await waitForTerminalStatus(jobId);
  assert.equal(finalRes.body.status, 'failed');
  assert.equal(finalRes.body.error, 'Failed to scan repository');
});
