import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { runScan, isValidRepoUrl } from '../services/scan/dockerRunner.js';
import { synthesizeNarrative } from '../services/scan/synthesis.js';
import { ScanTimeoutError, CloneError, RepoTooLargeError } from '../services/scan/errors.js';
import { createJob, getJob, markJobRunning, completeJob, failJob } from '../services/scan/jobStore.js';
import { insertScan } from '../db/index.js';

const router = Router();

const RATE_LIMIT_WINDOW_MS = Number(process.env.SCAN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.SCAN_RATE_LIMIT_MAX) || 10;

// Per-IP, in-memory (default store - fine for a single backend instance;
// swap for a shared store like Redis before running more than one).
const scanLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many scan requests - please try again later.' },
});

/**
 * POST /api/scan
 *
 * Body: `{ repoUrl: string }` - must be `https://github.com/<owner>/<repo>`
 * or `https://gitlab.com/<owner>/<repo>`.
 *
 * Rate-limited per IP (`SCAN_RATE_LIMIT_MAX` requests per
 * `SCAN_RATE_LIMIT_WINDOW_MS`). Validates the URL, creates a job, and
 * returns immediately - the actual scan (clone + eslint/madge/jscpd/npm
 * audit across two short-lived Docker containers; see
 * `services/scan/dockerRunner.js`) runs in the background. Once the tools'
 * output is normalized, it's sent to the Claude API (`services/scan/synthesis.js`)
 * to generate a `result.narrative` (`{summary, gapAnalysis}`) - best-effort,
 * so a missing `ANTHROPIC_API_KEY` or an API failure never fails the scan,
 * it just omits `narrative`. Poll `GET /api/scan/:jobId` for the result.
 * Once the job reaches a terminal state (complete or failed), it's also
 * persisted to the `scans` table (see `db/index.js`) - browse past scans
 * via `GET /api/scans` and `GET /api/scans/:id` (`routes/scans.js`).
 *
 * Responses: 202 with `{ jobId, status: 'queued' }` on acceptance, 400
 * for an invalid `repoUrl`, 429 if rate-limited.
 */
router.post('/scan', scanLimiter, (req, res) => {
  const { repoUrl } = req.body ?? {};

  if (!isValidRepoUrl(repoUrl)) {
    return res.status(400).json({
      error:
        'repoUrl must be a valid https://github.com/<owner>/<repo> or https://gitlab.com/<owner>/<repo> URL',
    });
  }

  const job = createJob();
  res.status(202).json({ jobId: job.id, status: job.status });

  markJobRunning(job.id);
  runScan(repoUrl)
    .then(async (result) => {
      // Best-effort - synthesizeNarrative never throws, so a missing API
      // key or a Claude API failure never fails an otherwise-successful
      // scan; it just means `result.narrative` stays undefined.
      const narrative = await synthesizeNarrative(result);
      if (narrative) result.narrative = narrative;

      completeJob(job.id, result);
      insertScan({
        id: job.id,
        repoUrl,
        branch: result.branch,
        commitSha: result.commitSha,
        startedAt: job.createdAt,
        completedAt: Date.now(),
        status: 'complete',
        result,
      });
    })
    .catch((err) => {
      const message = describeFailure(err);
      failJob(job.id, message);
      insertScan({
        id: job.id,
        repoUrl,
        branch: null,
        commitSha: null,
        startedAt: job.createdAt,
        completedAt: Date.now(),
        status: 'failed',
        result: null,
      });
    });
});

/**
 * GET /api/scan/:jobId
 *
 * Polls the status of a job created by `POST /api/scan`. Jobs are kept
 * in memory for `SCAN_JOB_TTL_MS` (default 30 minutes) after creation
 * and then swept - polling an expired (or never-existent) job id returns
 * 404.
 *
 * Responses: `{ status: 'queued'|'running' }` while in progress,
 * `{ status: 'complete', result }` once done (`result` is the
 * `{ metrics, files, findings, dependencyGraph, infrastructure, warnings }`
 * shape from `services/scan/normalize.js`), `{ status: 'failed', error }` if
 * the scan failed, all with HTTP 200; 404 if the job id is unknown/expired.
 */
router.get('/scan/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'No scan job found with that ID (it may have expired)' });
  }

  const body = { status: job.status };
  if (job.status === 'complete') body.result = job.result;
  if (job.status === 'failed') body.error = job.error;
  return res.json(body);
});

/**
 * Turns a `runScan` rejection into the message stored on a failed job.
 *
 * @param {Error} err
 * @returns {string}
 */
function describeFailure(err) {
  if (err instanceof ScanTimeoutError) return 'Scan timed out';
  if (err instanceof RepoTooLargeError) return `Repository too large to scan: ${err.message}`;
  if (err instanceof CloneError) return `Could not clone repository: ${err.message}`;
  console.error('Unexpected scan failure:', err);
  return 'Failed to scan repository';
}

export default router;
