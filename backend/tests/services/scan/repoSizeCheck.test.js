import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkRepoSizeWithinLimit } from '../../../src/services/scan/repoSizeCheck.js';

const MAX_BYTES = 500 * 1024 * 1024; // 500MB

let originalFetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('reports withinLimit true for a small GitHub repo', async () => {
  global.fetch = (url) => {
    assert.match(String(url), /api\.github\.com\/repos\/owner\/repo/);
    return Promise.resolve({ ok: true, json: async () => ({ size: 1024 }) }); // 1024 KB = 1MB
  };

  const result = await checkRepoSizeWithinLimit('https://github.com/owner/repo', MAX_BYTES);
  assert.deepEqual(result, { known: true, sizeBytes: 1024 * 1024, withinLimit: true });
});

test('reports withinLimit false for an oversized GitHub repo', async () => {
  global.fetch = () => Promise.resolve({ ok: true, json: async () => ({ size: 600_000 }) }); // ~586MB

  const result = await checkRepoSizeWithinLimit('https://github.com/owner/repo', MAX_BYTES);
  assert.equal(result.known, true);
  assert.equal(result.withinLimit, false);
});

test('reports withinLimit true for a small GitLab repo, via its statistics field', async () => {
  global.fetch = (url) => {
    assert.match(String(url), /gitlab\.com\/api\/v4\/projects\/owner%2Frepo\?statistics=true/);
    return Promise.resolve({ ok: true, json: async () => ({ statistics: { repository_size: 2048 } }) });
  };

  const result = await checkRepoSizeWithinLimit('https://gitlab.com/owner/repo', MAX_BYTES);
  assert.deepEqual(result, { known: true, sizeBytes: 2048, withinLimit: true });
});

test('reports known: false when the provider API responds with a non-2xx status', async () => {
  global.fetch = () => Promise.resolve({ ok: false, status: 404 });

  const result = await checkRepoSizeWithinLimit('https://github.com/owner/repo', MAX_BYTES);
  assert.deepEqual(result, { known: false });
});

test('reports known: false when fetch itself throws (network error, rate limit timeout, etc.)', async () => {
  global.fetch = () => Promise.reject(new Error('network error'));

  const result = await checkRepoSizeWithinLimit('https://github.com/owner/repo', MAX_BYTES);
  assert.deepEqual(result, { known: false });
});

test('reports known: false when the response has no usable size field', async () => {
  global.fetch = () => Promise.resolve({ ok: true, json: async () => ({}) });

  const result = await checkRepoSizeWithinLimit('https://github.com/owner/repo', MAX_BYTES);
  assert.deepEqual(result, { known: false });
});

test('reports known: false for a malformed repo URL', async () => {
  global.fetch = () => Promise.reject(new Error('should not be called'));

  const result = await checkRepoSizeWithinLimit('not a url', MAX_BYTES);
  assert.deepEqual(result, { known: false });
});
