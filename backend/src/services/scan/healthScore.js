// A single 0-100 "code health" score summarizing a scan, computed from the
// same findings/metrics the rest of the response already carries - not a
// new signal, just one number that folds the others together for the
// dashboard's hero. See normalize.js, which calls this alongside building
// `findings`, and db/index.js, which persists the result.

const CRITICAL_PENALTY = 6;
const CAUTION_PENALTY = 2;
const DUPLICATION_FREE_PCT = 5;
const COVERAGE_HEALTHY_PCT = 70;
const MAX_COVERAGE_PENALTY = 15;

/**
 * Mean coverage across files that actually report one.
 *
 * No tool in this pipeline measures coverage today - every `files[].coverage`
 * is `null` (see normalize.js's `normalizeEslint`) - so this returns `null`
 * for every real scan right now. It's written to average over whatever
 * files DO report a number rather than assuming all-or-nothing, so it keeps
 * working unchanged the day a coverage tool is added.
 *
 * @param {{coverage: number|null}[]} files
 * @returns {number|null}
 */
function averageCoverage(files) {
  const withCoverage = files.filter((file) => typeof file.coverage === 'number');
  if (withCoverage.length === 0) return null;
  return withCoverage.reduce((sum, file) => sum + file.coverage, 0) / withCoverage.length;
}

/**
 * Computes the 0-100 "code health" score: start at 100, subtract 6 points
 * per critical (high-severity) finding and 2 per caution (medium-severity)
 * finding, subtract 1 point per percentage of duplication above 5%, and
 * subtract up to 15 points for coverage under 70% (scaled linearly - 0%
 * coverage is the full 15-point deduction, 70%+ is none). Low-severity
 * findings carry no penalty, matching the mission-control mockup's
 * "nominal" label for them. Clamped to [0, 100].
 *
 * Coverage is never measured by any tool in this pipeline today (see
 * {@link averageCoverage}), so that term is inert (0 deduction) until a
 * coverage tool exists - treating "unmeasured" as "assume the worst" would
 * flatly cap every score at 85 for no real signal, which is worse than
 * just not counting it yet.
 *
 * @param {object} params
 * @param {import('./findings.js').Finding[]} params.findings
 * @param {number} params.duplicationPct
 * @param {{coverage: number|null}[]} params.files
 * @returns {number}
 */
export function computeHealthScore({ findings, duplicationPct, files }) {
  const criticalCount = findings.filter((finding) => finding.severity === 'high').length;
  const cautionCount = findings.filter((finding) => finding.severity === 'medium').length;

  let score = 100;
  score -= criticalCount * CRITICAL_PENALTY;
  score -= cautionCount * CAUTION_PENALTY;

  if (duplicationPct > DUPLICATION_FREE_PCT) {
    score -= duplicationPct - DUPLICATION_FREE_PCT;
  }

  const avgCoverage = averageCoverage(files);
  if (avgCoverage !== null && avgCoverage < COVERAGE_HEALTHY_PCT) {
    const shortfall = COVERAGE_HEALTHY_PCT - avgCoverage;
    score -= (shortfall / COVERAGE_HEALTHY_PCT) * MAX_COVERAGE_PENALTY;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}
