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
 * Persists a finished (complete or failed) scan. If `result.narrative`
 * (see `services/scan/synthesis.js`) is present, it's also broken out into
 * its own columns - `narrativeSummary`/`narrativeGapAnalysis` - rather than
 * only living inside `resultJson`; `getScanById`/`toSummary` merge it back
 * onto `result.narrative` when reading, so callers never see the
 * difference between a live job's result and a persisted one.
 *
 * @param {Omit<ScanRecord, 'result'> & {result: unknown}} record
 * @returns {void}
 */
export function insertScan({ id, repoUrl, branch, commitSha, startedAt, completedAt, status, result }) {
  const narrative = result?.narrative ?? null;
  db.prepare(
    `INSERT INTO scans (id, repoUrl, branch, commitSha, startedAt, completedAt, status, resultJson, narrativeSummary, narrativeGapAnalysis)
     VALUES (@id, @repoUrl, @branch, @commitSha, @startedAt, @completedAt, @status, @resultJson, @narrativeSummary, @narrativeGapAnalysis)`,
  ).run({
    id,
    repoUrl,
    branch: branch ?? null,
    commitSha: commitSha ?? null,
    startedAt,
    completedAt,
    status,
    resultJson: result ? JSON.stringify(result) : null,
    narrativeSummary: narrative?.summary ?? null,
    narrativeGapAnalysis: narrative ? JSON.stringify(narrative.gapAnalysis) : null,
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

  const result = row.resultJson ? JSON.parse(row.resultJson) : null;
  return {
    id: row.id,
    repoUrl: row.repoUrl,
    branch: row.branch,
    commitSha: row.commitSha,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status,
    result: withNarrative(row, result),
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
