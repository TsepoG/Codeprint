import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveBin } from '../../../src/services/scan/resolveBin.js';

test('resolves a real installed package to an absolute CLI entry path', () => {
  const binPath = resolveBin('eslint');
  assert.ok(path.isAbsolute(binPath), `expected an absolute path, got ${binPath}`);
  assert.match(binPath, /eslint/);
});

test('throws a clear error for a package with no bin entry', () => {
  // `globals` is a real installed dependency (see package.json) that ships
  // no CLI - a pure data package - so it has no `bin` field to resolve.
  assert.throws(() => resolveBin('globals'), /Could not resolve a CLI entry point for "globals"/);
});
