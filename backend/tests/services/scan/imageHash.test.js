import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { computeSourceHash } from '../../../src/services/scan/imageHash.js';

/** Builds a throwaway directory tree from a flat `{relPath: content}` map. */
function makeDir(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'imagehash-'));
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.join(dir, ...relPath.split('/'));
    mkdirSync(path.dirname(absPath), { recursive: true });
    writeFileSync(absPath, content);
  }
  return dir;
}

test('computeSourceHash is deterministic for the same content', () => {
  const dirA = makeDir({ 'a.js': 'const x = 1;' });
  const dirB = makeDir({ 'a.js': 'const x = 1;' });

  assert.equal(computeSourceHash(dirA), computeSourceHash(dirB));

  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
});

test('computeSourceHash changes when a file\'s content changes', () => {
  const before = makeDir({ 'a.js': 'const x = 1;' });
  const after = makeDir({ 'a.js': 'const x = 2;' });

  assert.notEqual(computeSourceHash(before), computeSourceHash(after));

  rmSync(before, { recursive: true, force: true });
  rmSync(after, { recursive: true, force: true });
});

test('computeSourceHash changes when a file is renamed but content stays the same', () => {
  const dirA = makeDir({ 'a.js': 'const x = 1;' });
  const dirB = makeDir({ 'b.js': 'const x = 1;' });

  assert.notEqual(computeSourceHash(dirA), computeSourceHash(dirB));

  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
});

test('computeSourceHash is independent of the filesystem\'s directory listing order', () => {
  // Both directories end up with the same three files; only the order they
  // were created in differs, which some filesystems reflect in readdir().
  const dirA = makeDir({ 'z.js': '1', 'a.js': '2', 'm/n.js': '3' });
  const dirB = makeDir({ 'a.js': '2', 'm/n.js': '3', 'z.js': '1' });

  assert.equal(computeSourceHash(dirA), computeSourceHash(dirB));

  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
});

test('computeSourceHash walks nested directories', () => {
  const flat = makeDir({ 'a.js': 'x' });
  const nested = makeDir({ 'sub/a.js': 'x' });

  assert.notEqual(computeSourceHash(flat), computeSourceHash(nested));

  rmSync(flat, { recursive: true, force: true });
  rmSync(nested, { recursive: true, force: true });
});

test('computeSourceHash on the real scan pipeline directory is stable across repeated calls', () => {
  const scanDir = path.join(import.meta.dirname, '..', '..', '..', 'src', 'services', 'scan');
  assert.equal(computeSourceHash(scanDir), computeSourceHash(scanDir));
});
