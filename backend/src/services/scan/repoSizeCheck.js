// Best-effort, host-side pre-flight check: asks the provider's own API how
// big a repo is *before* spending any container/clone time on it. This is
// not authoritative - the API can be unreachable, rate-limited (GitHub's
// unauthenticated API is capped at 60 req/hour/IP), or the provider may not
// expose stats for a given repo (GitLab's `statistics` field needs at least
// Reporter access, which anonymous requests to some public projects won't
// have). The real backstop is the post-clone size check inside the
// container - see `clonePhase` in `index.js`. This just saves the common
// case the cost of cloning something obviously oversized.
const FETCH_TIMEOUT_MS = 5000;

/**
 * @typedef {object} RepoSizeCheckResult
 * @property {boolean} known Whether a size could be determined at all.
 * @property {number} [sizeBytes] Present only when `known` is true.
 * @property {boolean} [withinLimit] Present only when `known` is true.
 */

/**
 * @param {string} repoUrl A URL that has already passed `isValidRepoUrl`
 *   (i.e. `https://github.com/<owner>/<repo>` or `https://gitlab.com/<owner>/<repo>`).
 * @param {number} maxBytes
 * @returns {Promise<RepoSizeCheckResult>} Never throws.
 */
export async function checkRepoSizeWithinLimit(repoUrl, maxBytes) {
  let url;
  try {
    url = new URL(repoUrl);
  } catch {
    return { known: false };
  }

  const [, owner, repoRaw] = url.pathname.split('/');
  const repo = repoRaw?.replace(/\.git$/, '');
  if (!owner || !repo) return { known: false };

  try {
    const sizeBytes =
      url.hostname === 'github.com'
        ? await fetchGithubSizeBytes(owner, repo)
        : url.hostname === 'gitlab.com'
          ? await fetchGitlabSizeBytes(owner, repo)
          : null;

    if (typeof sizeBytes !== 'number') return { known: false };
    return { known: true, sizeBytes, withinLimit: sizeBytes <= maxBytes };
  } catch {
    return { known: false };
  }
}

/**
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<number|null>}
 */
async function fetchGithubSizeBytes(owner, repo) {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = await res.json();
  // GitHub reports `size` in KB.
  return typeof data.size === 'number' ? data.size * 1024 : null;
}

/**
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<number|null>}
 */
async function fetchGitlabSizeBytes(owner, repo) {
  const projectPath = encodeURIComponent(`${owner}/${repo}`);
  const res = await fetch(`https://gitlab.com/api/v4/projects/${projectPath}?statistics=true`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const sizeBytes = data.statistics?.repository_size;
  return typeof sizeBytes === 'number' ? sizeBytes : null;
}
