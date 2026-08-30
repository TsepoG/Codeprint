import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { runScan, isValidRepoUrl } from '../services/scan/dockerRunner.js';
import { ScanTimeoutError, CloneError, RepoTooLargeError } from '../services/scan/errors.js';

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
 * `SCAN_RATE_LIMIT_WINDOW_MS`). Runs the scan (clone + eslint/madge/jscpd/
 * npm audit) across two short-lived Docker containers - see
 * `services/scan/dockerRunner.js` for the container orchestration,
 * `services/scan/index.js` for the pipeline that actually runs inside
 * them, and `services/scan/normalize.js` for the
 * `{ metrics, files, dependencyGraph, warnings }` response shape.
 *
 * Responses: 200 on success, 400 for an invalid `repoUrl`, 413 if the repo
 * exceeds the size cap, 422 if the clone fails, 429 if rate-limited, 504
 * if the scan times out, 502 for anything else.
 */
router.post('/scan', scanLimiter, async (req, res) => {
  const { repoUrl } = req.body ?? {};

  if (!isValidRepoUrl(repoUrl)) {
    return res.status(400).json({
      error:
        'repoUrl must be a valid https://github.com/<owner>/<repo> or https://gitlab.com/<owner>/<repo> URL',
    });
  }

  try {
    const result = await runScan(repoUrl);
    return res.json(result);
  } catch (err) {
    if (err instanceof ScanTimeoutError) {
      return res.status(504).json({ error: 'Scan timed out' });
    }
    if (err instanceof RepoTooLargeError) {
      return res.status(413).json({ error: 'Repository too large to scan', detail: err.message });
    }
    if (err instanceof CloneError) {
      return res.status(422).json({ error: 'Could not clone repository', detail: err.message });
    }
    console.error('Unexpected scan failure:', err);
    return res.status(502).json({ error: 'Failed to scan repository' });
  }
});

export default router;
