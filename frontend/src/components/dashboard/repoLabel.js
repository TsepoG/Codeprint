/**
 * Turns a GitHub/GitLab repo URL into its compact "owner/repo" form for
 * display - the mission-control shell's "Mission" field (sidebar title
 * block and top bar), matching the mockup's own compact naming convention
 * (e.g. "acme/storefront-web" rather than the full URL).
 *
 * @param {string} repoUrl
 * @returns {string|null} null if `repoUrl` isn't a recognizable GitHub/GitLab repo URL.
 */
export function repoLabel(repoUrl) {
  if (typeof repoUrl !== 'string') return null
  const match = repoUrl.trim().match(/^https?:\/\/(?:www\.)?(?:github|gitlab)\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i)
  return match ? match[1] : null
}
