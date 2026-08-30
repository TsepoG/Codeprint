import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeNarrative } from '../../../src/services/scan/synthesis.js';

const RESULT = {
  metrics: { bugs: 2, vulnerabilities: 1, codeSmells: 5, duplicationPct: 12.5 },
  files: [{ name: 'src/index.js', complexity: 8, coverage: null, severity: 'high' }],
  dependencyGraph: { nodes: [{ id: 'src/index.js' }], edges: [] },
  warnings: [],
};

let originalFetch;
let originalApiKey;

beforeEach(() => {
  originalFetch = global.fetch;
  originalApiKey = process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalApiKey;
});

test('returns null without calling the API when ANTHROPIC_API_KEY is unset', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  let called = false;
  global.fetch = () => {
    called = true;
    return Promise.reject(new Error('should not be called'));
  };

  assert.equal(await synthesizeNarrative(RESULT), null);
  assert.equal(called, false);
});

test('parses a well-formed narrative out of the API response', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const narrative = { summary: 'The codebase is in decent shape overall.', gapAnalysis: ['Refactor src/index.js'] };
  global.fetch = () =>
    Promise.resolve({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: JSON.stringify(narrative) }] }),
    });

  assert.deepEqual(await synthesizeNarrative(RESULT), narrative);
});

test('tolerates the response being wrapped in markdown fences or stray prose', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const narrative = { summary: 'Solid.', gapAnalysis: ['Add tests for src/index.js'] };
  global.fetch = () =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: '```json\n' + JSON.stringify(narrative) + '\n```' }],
      }),
    });

  assert.deepEqual(await synthesizeNarrative(RESULT), narrative);
});

test('caps gapAnalysis at 5 items and drops non-string entries', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const narrative = { summary: 'Fine.', gapAnalysis: ['a', 'b', 'c', 'd', 'e', 'f', 42] };
  global.fetch = () =>
    Promise.resolve({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: JSON.stringify(narrative) }] }),
    });

  const result = await synthesizeNarrative(RESULT);
  assert.deepEqual(result.gapAnalysis, ['a', 'b', 'c', 'd', 'e']);
});

test('returns null when the API responds with a non-2xx status', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = () => Promise.resolve({ ok: false, status: 401 });

  assert.equal(await synthesizeNarrative(RESULT), null);
});

test('returns null when the response text is not parseable as the expected shape', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = () =>
    Promise.resolve({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'not json at all' }] }),
    });

  assert.equal(await synthesizeNarrative(RESULT), null);
});

test('returns null when the request itself throws (network error, abort, etc.)', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = () => Promise.reject(new TypeError('fetch failed'));

  assert.equal(await synthesizeNarrative(RESULT), null);
});
