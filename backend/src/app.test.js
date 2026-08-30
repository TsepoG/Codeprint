import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './app.js';
import { createJob, markJobRunning, completeJob, failJob } from './services/scan/jobStore.js';
import { insertScan } from './db/index.js';

test('GET /health returns ok status', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('POST /api/scan rejects a missing repoUrl', async () => {
  const res = await request(app).post('/api/scan').send({});
  assert.equal(res.status, 400);
  assert.match(res.body.error, /repoUrl/);
});

test('POST /api/scan rejects a disallowed URL scheme', async () => {
  const res = await request(app)
    .post('/api/scan')
    .send({ repoUrl: 'file:///etc/passwd' });
  assert.equal(res.status, 400);
});

test('POST /api/scan rejects an SSRF-style internal host', async () => {
  const res = await request(app)
    .post('/api/scan')
    .send({ repoUrl: 'https://169.254.169.254/owner/repo' });
  assert.equal(res.status, 400);
});

test('GET /api/scan/:jobId returns 404 for an unknown job', async () => {
  const res = await request(app).get('/api/scan/does-not-exist');
  assert.equal(res.status, 404);
  assert.match(res.body.error, /No scan job found/);
});

test('GET /api/scan/:jobId reports queued/running status with no result or error', async () => {
  const job = createJob();
  const res = await request(app).get(`/api/scan/${job.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'queued' });
});

test('GET /api/scan/:jobId returns the result once a job completes', async () => {
  const job = createJob();
  markJobRunning(job.id);
  completeJob(job.id, { metrics: { bugs: 0, vulnerabilities: 0, codeSmells: 0, duplicationPct: 0 } });

  const res = await request(app).get(`/api/scan/${job.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'complete');
  assert.deepEqual(res.body.result, {
    metrics: { bugs: 0, vulnerabilities: 0, codeSmells: 0, duplicationPct: 0 },
  });
  assert.equal(res.body.error, undefined);
});

test('GET /api/scan/:jobId returns the error once a job fails', async () => {
  const job = createJob();
  markJobRunning(job.id);
  failJob(job.id, 'Scan timed out');

  const res = await request(app).get(`/api/scan/${job.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'failed', error: 'Scan timed out' });
});

test('GET /api/scans lists persisted scans for a repo, most recent first', async () => {
  const repoUrl = 'https://github.com/owner/history-test';
  insertScan({
    id: 'history-1',
    repoUrl,
    branch: 'main',
    commitSha: 'aaa',
    startedAt: 100,
    completedAt: 100,
    status: 'complete',
    result: { metrics: { bugs: 1, vulnerabilities: 0, codeSmells: 0, duplicationPct: 0 }, files: [], dependencyGraph: { nodes: [], edges: [] }, warnings: [] },
  });
  insertScan({
    id: 'history-2',
    repoUrl,
    branch: 'main',
    commitSha: 'bbb',
    startedAt: 200,
    completedAt: 200,
    status: 'complete',
    result: { metrics: { bugs: 0, vulnerabilities: 0, codeSmells: 0, duplicationPct: 0 }, files: [], dependencyGraph: { nodes: [], edges: [] }, warnings: [] },
  });

  const res = await request(app).get('/api/scans').query({ repoUrl });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.scans[0].id, 'history-2');
  assert.equal(res.body.scans[1].id, 'history-1');
});

test('GET /api/scans/:id returns the full stored result', async () => {
  const result = { metrics: { bugs: 3, vulnerabilities: 1, codeSmells: 2, duplicationPct: 10 }, files: [], dependencyGraph: { nodes: [], edges: [] }, warnings: [] };
  insertScan({
    id: 'detail-test',
    repoUrl: 'https://github.com/owner/detail-test',
    branch: 'main',
    commitSha: 'ccc',
    startedAt: 100,
    completedAt: 200,
    status: 'complete',
    result,
  });

  const res = await request(app).get('/api/scans/detail-test');
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'detail-test');
  assert.equal(res.body.commitSha, 'ccc');
  assert.deepEqual(res.body.result, result);
});

test('GET /api/scans/:id returns 404 for an unknown scan', async () => {
  const res = await request(app).get('/api/scans/does-not-exist');
  assert.equal(res.status, 404);
});
