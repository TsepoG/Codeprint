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
 * Persists a finished (complete or failed) scan.
 *
 * @param {Omit<ScanRecord, 'result'> & {result: unknown}} record
 * @returns {void}
 */
export function insertScan({ id, repoUrl, branch, commitSha, startedAt, completedAt, status, result }) {
  db.prepare(
    `INSERT INTO scans (id, repoUrl, branch, commitSha, startedAt, completedAt, status, resultJson)
     VALUES (@id, @repoUrl, @branch, @commitSha, @startedAt, @completedAt, @status, @resultJson)`,
  ).run({
    id,
    repoUrl,
    branch: branch ?? null,
    commitSha: commitSha ?? null,
    startedAt,
    completedAt,
    status,
    resultJson: result ? JSON.stringify(result) : null,
  });
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

  return {
    id: row.id,
    repoUrl: row.repoUrl,
    branch: row.branch,
    commitSha: row.commitSha,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status,
    result: row.resultJson ? JSON.parse(row.resultJson) : null,
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
