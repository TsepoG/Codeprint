import InfraGraph from './InfraGraph.jsx'
import { SeverityBadge } from './shared.jsx'
import { useScrollIntoView } from './useScrollIntoView.js'

const MAX_ROWS = 100
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

// The API reports a tool that failed as a plain string in `warnings`, so
// which of them were infrastructure tools is recovered by their prefix -
// every reason these three produce starts with the tool's own name (see
// the backend's tools/*.js).
const INFRA_TOOLS = ['checkov', 'tfsec', 'inframap']

function infraWarnings(warnings = []) {
  return warnings.filter((warning) => INFRA_TOOLS.some((tool) => warning.startsWith(tool)))
}

/**
 * @param {object} props
 * @param {object} props.infrastructure
 * @param {string[]} [props.warnings]
 * @param {string|null} [props.highlightFile] Set when the user got here via
 *   "view in context" from an infra finding.
 */
function InfrastructureTab({ infrastructure, warnings = [], highlightFile }) {
  const highlightRef = useScrollIntoView(highlightFile)

  if (!infrastructure?.detected) {
    return (
      <div className="dashboard-section">
        <p className="empty-note">No Terraform found in this repo, so no infrastructure was scanned.</p>
      </div>
    )
  }

  const { findings = [], graph = { nodes: [], edges: [] } } = infrastructure
  const failures = infraWarnings(warnings)

  const ranked = [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
    return (a.resource ?? '').localeCompare(b.resource ?? '')
  })
  const shown = ranked.slice(0, MAX_ROWS)
  const firstHighlightedIndex = highlightFile ? shown.findIndex((finding) => finding.file === highlightFile) : -1

  return (
    <div className="dashboard-section">
      {failures.length > 0 && (
        <div className="status-panel warning-panel" role="status">
          <strong>Partial results - some infrastructure checks did not complete:</strong>
          <ul>
            {failures.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
          <span className="partial-note">Everything below reflects only the checks that ran.</span>
        </div>
      )}

      <p className="section-caption">
        Resource graph - {graph.nodes.length} resources, {graph.edges.length} relationships
      </p>
      <InfraGraph nodes={graph.nodes} edges={graph.edges} />

      <h3 className="infra-findings-heading">
        Findings
        {ranked.length > MAX_ROWS && (
          <span className="infra-findings-count">
            {' '}
            showing {MAX_ROWS} of {ranked.length}
          </span>
        )}
      </h3>

      {ranked.length === 0 ? (
        <p className="empty-note">No misconfigurations found in this repo&apos;s Terraform.</p>
      ) : (
        <div className="table-scroll">
          <table className="files-table infra-findings-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Rule</th>
                <th>Severity</th>
                <th>Source</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((finding, index) => {
                const highlighted = finding.file === highlightFile
                // Several findings can share a file; the ref goes on the
                // first so scrolling lands at the top of the group.
                const isScrollTarget = highlighted && firstHighlightedIndex === index

                return (
                  <tr
                    key={`${finding.source}-${finding.ruleId}-${finding.file}-${finding.line}-${index}`}
                    ref={isScrollTarget ? highlightRef : undefined}
                    className={highlighted ? 'row-highlighted' : undefined}
                  >
                    <td className="file-name">{finding.resource ?? '—'}</td>
                    <td>
                      <span className="infra-rule-id">{finding.ruleId ?? '—'}</span>
                      <span className="infra-rule-description">{finding.description}</span>
                    </td>
                    <td>
                      <SeverityBadge severity={finding.severity} />
                    </td>
                    <td>
                      <span className={`infra-source infra-source-${finding.source}`}>{finding.source}</span>
                    </td>
                    <td className="file-name">
                      {finding.file ?? '—'}
                      {finding.line != null && <span className="infra-line">:{finding.line}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default InfrastructureTab
