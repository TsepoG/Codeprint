import { Router } from 'express';
import { listScans, getScanById } from '../db/index.js';

const router = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/scans
 *
 * Query params: `repoUrl` (optional filter), `page` (1-indexed, default 1),
 * `pageSize` (default 20, capped at 100).
 *
 * Lists persisted scans (see `db/index.js`), most recent first. Each entry
 * is a summary - `metrics` and `avgComplexity` (the mean of `files[].complexity`,
 * or `null` for a failed scan) - not the full `files`/`dependencyGraph`;
 * fetch `GET /api/scans/:id` for the complete result.
 *
 * Response: `{ scans: ScanSummary[], total, page, pageSize }`.
 */
router.get('/scans', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  const repoUrl = typeof req.query.repoUrl === 'string' ? req.query.repoUrl : undefined;

  return res.json(listScans({ repoUrl, page, pageSize }));
});

/**
 * GET /api/scans/:id
 *
 * Returns one persisted scan's full record, including its complete result
 * (`{ metrics, files, dependencyGraph, warnings }`) if it completed.
 *
 * Responses: 200 with the `ScanRecord`, or 404 if no scan has that id.
 */
router.get('/scans/:id', (req, res) => {
  const scan = getScanById(req.params.id);

  if (!scan) {
    return res.status(404).json({ error: 'No scan found with that ID' });
  }

  return res.json(scan);
});

export default router;
