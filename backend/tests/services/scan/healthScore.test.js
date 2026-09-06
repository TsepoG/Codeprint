import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHealthScore } from '../../../src/services/scan/healthScore.js';

/** @param {'high'|'medium'|'low'} severity @param {number} [n] */
function findingsOf(severity, n = 1) {
  return Array.from({ length: n }, (_, i) => ({ severity, id: `${severity}-${i}` }));
}

const NO_FILES = [];

test('a spotless scan scores a perfect 100', () => {
  const score = computeHealthScore({ findings: [], duplicationPct: 0, files: NO_FILES });
  assert.equal(score, 100);
});

test('subtracts 6 points per critical (high-severity) finding', () => {
  const score = computeHealthScore({ findings: findingsOf('high', 3), duplicationPct: 0, files: NO_FILES });
  assert.equal(score, 100 - 3 * 6);
});

test('subtracts 2 points per caution (medium-severity) finding', () => {
  const score = computeHealthScore({ findings: findingsOf('medium', 4), duplicationPct: 0, files: NO_FILES });
  assert.equal(score, 100 - 4 * 2);
});

test('low-severity findings carry no penalty', () => {
  const score = computeHealthScore({ findings: findingsOf('low', 10), duplicationPct: 0, files: NO_FILES });
  assert.equal(score, 100);
});

test('critical and caution findings combine', () => {
  const findings = [...findingsOf('high', 2), ...findingsOf('medium', 3)];
  const score = computeHealthScore({ findings, duplicationPct: 0, files: NO_FILES });
  assert.equal(score, 100 - 2 * 6 - 3 * 2);
});

test('duplication at or below 5% carries no penalty', () => {
  assert.equal(computeHealthScore({ findings: [], duplicationPct: 5, files: NO_FILES }), 100);
  assert.equal(computeHealthScore({ findings: [], duplicationPct: 2, files: NO_FILES }), 100);
});

test('duplication above 5% subtracts one point per point over the threshold', () => {
  const score = computeHealthScore({ findings: [], duplicationPct: 12, files: NO_FILES });
  assert.equal(score, 100 - (12 - 5));
});

test('coverage is not counted against the score when no file reports one', () => {
  // Every file.coverage is null in every real scan today (no coverage tool
  // runs) - this must not flatly cap every score.
  const files = [{ coverage: null }, { coverage: null }];
  const score = computeHealthScore({ findings: [], duplicationPct: 0, files });
  assert.equal(score, 100);
});

test('coverage at or above 70% (averaged across files that report one) carries no penalty', () => {
  const files = [{ coverage: 70 }, { coverage: 90 }];
  const score = computeHealthScore({ findings: [], duplicationPct: 0, files });
  assert.equal(score, 100);
});

test('0% average coverage subtracts the full 15 points', () => {
  const files = [{ coverage: 0 }, { coverage: 0 }];
  const score = computeHealthScore({ findings: [], duplicationPct: 0, files });
  assert.equal(score, 85);
});

test('coverage penalty scales linearly between 0% and 70%', () => {
  const files = [{ coverage: 35 }]; // halfway to healthy - half the 15-point penalty
  const score = computeHealthScore({ findings: [], duplicationPct: 0, files });
  assert.equal(score, Math.round(100 - 7.5));
});

test('averages coverage only across files that report one, ignoring the rest', () => {
  const files = [{ coverage: 0 }, { coverage: null }, { coverage: null }];
  // Mean of the one reporting file (0), not diluted by the unmeasured ones.
  const score = computeHealthScore({ findings: [], duplicationPct: 0, files });
  assert.equal(score, 85);
});

test('every deduction combines in the same score', () => {
  const findings = [...findingsOf('high', 1), ...findingsOf('medium', 1)];
  const files = [{ coverage: 0 }];
  const score = computeHealthScore({ findings, duplicationPct: 15, files });
  // 100 - 6 (critical) - 2 (caution) - 10 (duplication: 15-5) - 15 (0% coverage) = 67
  assert.equal(score, 67);
});

test('clamps at 0 rather than going negative', () => {
  const score = computeHealthScore({ findings: findingsOf('high', 30), duplicationPct: 0, files: NO_FILES });
  assert.equal(score, 0);
});

test('clamps at 100 (the base score never exceeds it, but the clamp is explicit)', () => {
  const score = computeHealthScore({ findings: [], duplicationPct: 0, files: [] });
  assert.ok(score <= 100);
});

test('returns a whole number', () => {
  const files = [{ coverage: 35 }];
  const score = computeHealthScore({ findings: [], duplicationPct: 0, files });
  assert.equal(Number.isInteger(score), true);
});
