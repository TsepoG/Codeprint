import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'codeprint.db');

mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    repoUrl TEXT NOT NULL,
    branch TEXT,
    commitSha TEXT,
    startedAt INTEGER NOT NULL,
    completedAt INTEGER NOT NULL,
    status TEXT NOT NULL,
    resultJson TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_scans_repoUrl_completedAt ON scans (repoUrl, completedAt DESC);

  -- One row per individual finding (see services/scan/findings.js), rather
  -- than only inside the scan's resultJson blob: these are the rows a future
  -- "every high-severity finding across all scans of this repo" query needs,
  -- and keeping them addressable is the whole point of extracting them.
  -- The scalar columns are the queryable ones; detailJson carries the parts
  -- that aren't (the code snippet, a duplication's other location, an infra
  -- finding's resource address).
  CREATE TABLE IF NOT EXISTS scan_findings (
    scanId TEXT NOT NULL REFERENCES scans(id),
    seq INTEGER NOT NULL,
    findingId TEXT NOT NULL,
    category TEXT NOT NULL,
    source TEXT NOT NULL,
    file TEXT,
    line INTEGER,
    endLine INTEGER,
    severity TEXT NOT NULL,
    ruleId TEXT,
    description TEXT,
    detailJson TEXT,
    PRIMARY KEY (scanId, seq)
  );
`);

// Added after the `scans` table already shipped, so existing databases need
// an explicit migration rather than relying on CREATE TABLE IF NOT EXISTS.
const existingColumns = new Set(db.prepare('PRAGMA table_info(scans)').all().map((col) => col.name));
if (!existingColumns.has('narrativeSummary')) {
  db.exec('ALTER TABLE scans ADD COLUMN narrativeSummary TEXT');
}
if (!existingColumns.has('narrativeGapAnalysis')) {
  db.exec('ALTER TABLE scans ADD COLUMN narrativeGapAnalysis TEXT');
}

/**
 * @typedef {object} ScanRecord
 * @property {string} id
 * @property {string} repoUrl
 * @property {string|null} branch
 * @property {string|null} commitSha
 * @property {number} startedAt `Date.now()` when the scan's job was created.
 * @property {number} completedAt `Date.now()` when the scan reached a terminal state.
 * @property {'complete'|'failed'} status
 * @property {unknown} result The normalized scan result (see `services/scan/normalize.js`), or `null` if `status` is `'failed'`.
 */

/**
 * `result` minus its `findings` array, which is stored in `scan_findings`
 * instead - keeping it out of `resultJson` too means there's exactly one
 * copy of each finding, not one in the blob and one in its own row.
 *
 * @param {unknown} result
 * @returns {unknown}
 */
function withoutFindings(result) {
  if (!result || !Array.isArray(result.findings)) return result ?? null;
  const rest = { ...result };
  delete rest.findings;
  return rest;
}

const insertScanRow = db.prepare(
  `INSERT INTO scans (id, repoUrl, branch, commitSha, startedAt, completedAt, status, resultJson, narrativeSummary, narrativeGapAnalysis)
   VALUES (@id, @repoUrl, @branch, @commitSha, @startedAt, @completedAt, @status, @resultJson, @narrativeSummary, @narrativeGapAnalysis)`,
);

const insertFindingRow = db.prepare(
  `INSERT INTO scan_findings (scanId, seq, findingId, category, source, file, line, endLine, severity, ruleId, description, detailJson)
   VALUES (@scanId, @seq, @findingId, @category, @source, @file, @line, @endLine, @severity, @ruleId, @description, @detailJson)`,
);

/**
 * Persists a finished (complete or failed) scan and its findings as one
 * atomic write - a scan row is never left behind without the findings that
 * belong to it.
 *
 * Two parts of the result are stored outside `resultJson` rather than only
 * inside it: `result.narrative` (see `services/scan/synthesis.js`) in its own
 * columns, and `result.findings` (see `services/scan/findings.js`) as rows in
 * `scan_findings`. Both are stripped from the JSON blob so there's exactly
 * one copy of each, and `getScanById` merges them back on, so callers never
 * see the difference between a live job's result and a persisted one.
 *
 * @param {Omit<ScanRecord, 'result'> & {result: unknown}} record
 * @returns {void}
 */
export const insertScan = db.transaction(
  ({ id, repoUrl, branch, commitSha, startedAt, completedAt, status, result }) => {
    const narrative = result?.narrative ?? null;
    const findings = Array.isArray(result?.findings) ? result.findings : [];
    const resultWithoutFindings = withoutFindings(result);

    insertScanRow.run({
      id,
      repoUrl,
      branch: branch ?? null,
      commitSha: commitSha ?? null,
      startedAt,
      completedAt,
      status,
      resultJson: resultWithoutFindings ? JSON.stringify(resultWithoutFindings) : null,
      narrativeSummary: narrative?.summary ?? null,
      narrativeGapAnalysis: narrative ? JSON.stringify(narrative.gapAnalysis) : null,
    });

    findings.forEach((finding, seq) => {
      insertFindingRow.run({
        scanId: id,
        seq,
        findingId: finding.id ?? null,
        category: finding.category,
        source: finding.source,
        file: finding.file ?? null,
        line: finding.line ?? null,
        endLine: finding.endLine ?? null,
        severity: finding.severity,
        ruleId: finding.ruleId ?? null,
        description: finding.description ?? null,
        detailJson: JSON.stringify({
          snippet: finding.snippet ?? null,
          ...(finding.duplicateOf ? { duplicateOf: finding.duplicateOf } : {}),
          ...(finding.resource !== undefined ? { resource: finding.resource } : {}),
        }),
      });
    });
  },
);

/**
 * @param {string} scanId
 * @returns {import('../services/scan/findings.js').Finding[]}
 */
function findingsFor(scanId) {
  const rows = db.prepare('SELECT * FROM scan_findings WHERE scanId = ? ORDER BY seq').all(scanId);

  return rows.map((row) => {
    const detail = row.detailJson ? JSON.parse(row.detailJson) : {};
    return {
      id: row.findingId,
      category: row.category,
      source: row.source,
      file: row.file,
      line: row.line,
      endLine: row.endLine,
      severity: row.severity,
      ruleId: row.ruleId,
      description: row.description,
      snippet: detail.snippet ?? null,
      ...(detail.duplicateOf ? { duplicateOf: detail.duplicateOf } : {}),
      ...(detail.resource !== undefined ? { resource: detail.resource } : {}),
    };
  });
}

/**
 * Re-attaches a row's `narrativeSummary`/`narrativeGapAnalysis` columns
 * onto `result.narrative`, so a persisted scan's `result` has the same
 * shape as a freshly-completed job's.
 *
 * @param {object} row Raw `scans` table row.
 * @param {unknown} result Already `JSON.parse`d `resultJson` (or `null`).
 * @returns {unknown}
 */
function withNarrative(row, result) {
  if (!result || !row.narrativeSummary) return result;
  return { ...result, narrative: { summary: row.narrativeSummary, gapAnalysis: JSON.parse(row.narrativeGapAnalysis || '[]') } };
}

/**
 * @typedef {object} ScanSummary
 * @property {string} id
 * @property {string} repoUrl
 * @property {string|null} branch
 * @property {string|null} commitSha
 * @property {number} startedAt
 * @property {number} completedAt
 * @property {'complete'|'failed'} status
 * @property {object|null} metrics The stored scan's `metrics` (null for a failed scan).
 * @property {number|null} avgComplexity Mean of `files[].complexity` (null for a failed scan, or one with no flagged files).
 */

/**
 * Lists scans, most recent first, paginated.
 *
 * @param {object} [options]
 * @param {string} [options.repoUrl] Filter to scans of this repo only.
 * @param {number} [options.page] 1-indexed.
 * @param {number} [options.pageSize]
 * @returns {{scans: ScanSummary[], total: number, page: number, pageSize: number}}
 */
export function listScans({ repoUrl, page = 1, pageSize = 20 } = {}) {
  const where = repoUrl ? 'WHERE repoUrl = ?' : '';
  const whereParams = repoUrl ? [repoUrl] : [];
  const offset = (page - 1) * pageSize;

  const rows = db
    .prepare(`SELECT * FROM scans ${where} ORDER BY completedAt DESC LIMIT ? OFFSET ?`)
    .all(...whereParams, pageSize, offset);
  const { count: total } = db.prepare(`SELECT COUNT(*) as count FROM scans ${where}`).get(...whereParams);

  return { scans: rows.map(toSummary), total, page, pageSize };
}

/**
 * @param {string} id
 * @returns {ScanRecord|null}
 */
export function getScanById(id) {
  const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
  if (!row) return null;

  const stored = row.resultJson ? JSON.parse(row.resultJson) : null;
  const result = stored ? { ...withNarrative(row, stored), findings: findingsFor(row.id) } : null;

  return {
    id: row.id,
    repoUrl: row.repoUrl,
    branch: row.branch,
    commitSha: row.commitSha,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status,
    result,
  };
}

/**
 * @param {object} row Raw `scans` table row.
 * @returns {ScanSummary}
 */
function toSummary(row) {
  const result = row.resultJson ? JSON.parse(row.resultJson) : null;
  const files = result?.files ?? [];

  return {
    id: row.id,
    repoUrl: row.repoUrl,
    branch: row.branch,
    commitSha: row.commitSha,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status,
    metrics: result?.metrics ?? null,
    avgComplexity: files.length
      ? files.reduce((sum, file) => sum + (file.complexity || 0), 0) / files.length
      : null,
  };
}
