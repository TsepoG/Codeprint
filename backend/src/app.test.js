import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './app.js';

test('GET /health returns ok status', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});
