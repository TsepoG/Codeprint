import { SeverityBadge } from './shared.jsx'

/**
 * A finding's location, as `file:line` - or null when it has no place in the
 * repo to point at (an npm advisory is about a dependency, not a line).
 *
 * @param {object} finding
 * @returns {string|null}
 */
function locationOf(finding) {
  if (!finding.file) return null
  return finding.line == null ? finding.file : `${finding.file}:${finding.line}`
}

/**
 * @param {object} props
 * @param {{startLine: number, text: string}} props.snippet
 * @param {string} [props.caption]
 */
function SnippetBlock({ snippet, caption }) {
  const lines = snippet.text.split('\n')

  return (
    <div className="snippet-block">
      {caption && <p className="snippet-caption">{caption}</p>}
      <pre className="snippet-code">
        <code>
          {lines.map((line, index) => (
            // Each line is its own block (see .snippet-line) rather than a
            // newline character, so the layout doesn't depend on the app
            // shell's global `code` styling leaving whitespace alone.
            <span className="snippet-line" key={index}>
              <span className="snippet-line-number" aria-hidden="true">
                {snippet.startLine + index}
              </span>
              {line}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

/**
 * One finding, as listed in any detail panel: description, location, rule,
 * severity chip, and the captured snippet behind a toggle.
 *
 * @param {object} props
 * @param {object} props.finding
 * @param {(finding: object) => void} [props.onViewInContext] Omitted when
 *   there's nowhere to send the user.
 * @param {boolean} [props.showLocation] Off for a list already scoped to one
 *   file, where repeating the path on every row is just noise.
 */
function FindingRow({ finding, onViewInContext, showLocation = true }) {
  const location = locationOf(finding)
  const hasSnippet = Boolean(finding.snippet) || Boolean(finding.duplicateOf?.snippet)

  return (
    <li className="finding-row">
      <div className="finding-row-head">
        <p className="finding-description">{finding.description}</p>
        <SeverityBadge severity={finding.severity} />
      </div>

      <div className="finding-meta">
        {showLocation
          ? (location
              ? <span className="finding-location">{location}</span>
              : <span className="finding-location dim">no file location</span>)
          : finding.line != null && <span className="finding-location">line {finding.line}</span>}
        {finding.ruleId && <span className="finding-rule">{finding.ruleId}</span>}
        <span className="finding-source">{finding.source}</span>
      </div>

      {hasSnippet && (
        <details className="finding-snippet">
          <summary>Snippet</summary>
          {finding.snippet && (
            <SnippetBlock
              snippet={finding.snippet}
              // A duplication finding shows two blocks, so each needs saying
              // which half of the pair it is; every other finding has one.
              caption={finding.duplicateOf ? location : undefined}
            />
          )}
          {finding.duplicateOf?.snippet && (
            <SnippetBlock
              snippet={finding.duplicateOf.snippet}
              caption={locationOf(finding.duplicateOf) ?? 'matching block'}
            />
          )}
        </details>
      )}

      {onViewInContext && (
        <button type="button" className="link-button" onClick={() => onViewInContext(finding)}>
          View in context
        </button>
      )}
    </li>
  )
}

export default FindingRow
