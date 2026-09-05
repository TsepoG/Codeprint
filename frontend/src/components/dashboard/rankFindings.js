const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

/**
 * Worst first, then by location, so a list of findings reads the same way
 * wherever it appears - the metric drawer and a module's panel shouldn't
 * order the same findings differently.
 *
 * Lives apart from the component that uses it so that file keeps exporting
 * only components (react-refresh).
 *
 * @param {object[]} findings
 * @returns {object[]} A sorted copy.
 */
export function rankFindings(findings) {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
    return (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0)
  })
}
