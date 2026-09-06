const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

/**
 * Ranks files worst-first: severity (high, then medium, then low), then
 * complexity descending within the same severity. Shared by the Hotspots
 * tab's full table and the Overview tab's "top hotspots" summary, so the
 * two always agree on what counts as worse.
 *
 * @param {object[]} files
 * @returns {object[]} A new array - never mutates `files`.
 */
export function rankFiles(files) {
  return [...files].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    return bySeverity !== 0 ? bySeverity : b.complexity - a.complexity
  })
}
