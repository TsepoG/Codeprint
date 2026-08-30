import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './app.js';
import { createJob, markJobRunning, completeJob, failJob } from './services/scan/jobStore.js';

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
