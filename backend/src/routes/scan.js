import { Router } from 'express';
import { runScan, isValidGithubUrl } from '../services/scan/index.js';
import { ScanTimeoutError, CloneError } from '../services/scan/errors.js';

const router = Router();

/**
 * POST /api/scan
 *
 * Body: `{ repoUrl: string }` - must be `https://github.com/<owner>/<repo>`.
 *
 * Clones the repo and runs eslint, madge, jscpd, and npm audit against it,
 * returning a unified `{ metrics, files, dependencyGraph, warnings }`
 * response. See `services/scan/index.js` for the scan pipeline and
 * `services/scan/normalize.js` for the response shape.
 *
 * Responses: 200 on success, 400 for an invalid `repoUrl`, 422 if the
 * clone fails, 504 if the scan times out, 502 for anything else.
 */
router.post('/scan', async (req, res) => {
  const { repoUrl } = req.body ?? {};

  if (!isValidGithubUrl(repoUrl)) {
    return res.status(400).json({
      error: 'repoUrl must be a valid https://github.com/<owner>/<repo> URL',
    });
  }

  try {
    const result = await runScan(repoUrl);
    return res.json(result);
  } catch (err) {
    if (err instanceof ScanTimeoutError) {
      return res.status(504).json({ error: 'Scan timed out' });
    }
    if (err instanceof CloneError) {
      return res.status(422).json({ error: 'Could not clone repository', detail: err.message });
    }
    console.error('Unexpected scan failure:', err);
    return res.status(502).json({ error: 'Failed to scan repository' });
  }
});

export default router;
