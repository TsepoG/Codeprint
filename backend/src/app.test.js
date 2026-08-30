import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './app.js';

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

test('POST /api/scan rejects a non-GitHub repoUrl', async () => {
  const res = await request(app)
    .post('/api/scan')
    .send({ repoUrl: 'file:///etc/passwd' });
  assert.equal(res.status, 400);
});
