/**
 * A file's duplication percentage, derived from the scan's `findings`.
 *
 * jscpd reports duplication per matched clone pair, not per file, and a
 * `files` entry carries no duplication figure of its own (see
 * FileDetailPanel.jsx's `duplicationOf`, which counts the same way for the
 * detail drawer) - so a file's total duplicated lines is the sum of every
 * clone finding that touches it, counting both sides of each pair, divided
 * by that file's own line count.
 *
 * @param {object[]} findings
 * @param {object[]} files Needs each file's `loc` as the percentage's denominator.
 * @returns {Map<string, number>} File name -> duplication percentage, rounded to 1 decimal. Omits files with no known `loc`.
 */
export function duplicationPctByFile(findings, files) {
  const locByFile = new Map(files.map((file) => [file.name, file.loc]))

  /** @type {Map<string, number>} */
  const linesByFile = new Map()
  const addSpan = (file, line, endLine) => {
    if (!file || line == null || endLine == null) return
    linesByFile.set(file, (linesByFile.get(file) ?? 0) + (endLine - line + 1))
  }

  for (const finding of findings) {
    if (finding.category !== 'duplication') continue
    addSpan(finding.file, finding.line, finding.endLine)
    if (finding.duplicateOf) addSpan(finding.duplicateOf.file, finding.duplicateOf.line, finding.duplicateOf.endLine)
  }

  const pctByFile = new Map()
  for (const [file, lines] of linesByFile) {
    const loc = locByFile.get(file)
    if (!loc) continue
    pctByFile.set(file, Math.round(Math.min(100, (lines / loc) * 100) * 10) / 10)
  }
  return pctByFile
}
