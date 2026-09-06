import { useState } from 'react'
import HudFrame from '../mission-control/HudFrame.jsx'
import SevBadge from '../mission-control/SevBadge.jsx'
import InfraGraph from './InfraGraph.jsx'
import InfraDetailPanel from './InfraDetailPanel.jsx'
import { useScrollIntoView } from './useScrollIntoView.js'
import { keyFromNode, keyFromFinding, sameResource } from './infraResource.js'

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
 * @param {boolean} [props.findingsAvailable] Whether this scan ran per-finding extraction at all.
 */
function InfrastructureTab({ infrastructure, warnings = [], highlightFile, findingsAvailable = true }) {
  const highlightRef = useScrollIntoView(highlightFile)
  // A graph node and a findings row name the same resource two different
  // ways, so the selection is held as the reduced key both reduce to.
  const [selectedResource, setSelectedResource] = useState(null)

  if (!infrastructure?.detected) {
    return (
      <div className="dashboard-section mc">
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

  // Which graph node the current selection corresponds to, so selecting from
  // the table marks the matching box in the diagram too.
  const selectedNodeId = selectedResource
    ? (graph.nodes.find((node) => sameResource(keyFromNode(node.id), selectedResource))?.id ?? null)
    : null

  return (
    <div className="dashboard-section mc">
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

      <HudFrame style={{ marginBottom: 18 }}>
        <div className="mc-panel-head">
          <span>Resource graph</span>
          <span className="mc-mono" style={{ fontSize: 10.5 }}>
            {graph.nodes.length} resources, {graph.edges.length} relationships
          </span>
        </div>
        <div style={{ padding: 20 }}>
          <InfraGraph
            nodes={graph.nodes}
            edges={graph.edges}
            onSelectNode={(id) => setSelectedResource(keyFromNode(id))}
            selectedNode={selectedNodeId}
          />
        </div>
      </HudFrame>

      <HudFrame>
        <div className="mc-panel-head">
          <span>Findings</span>
          {ranked.length > MAX_ROWS && (
            <span className="mc-mono" style={{ fontSize: 10.5 }}>
              showing {MAX_ROWS} of {ranked.length}
            </span>
          )}
        </div>
        {ranked.length === 0 ? (
          <p className="empty-note" style={{ padding: '0 18px 16px' }}>
            No misconfigurations found in this repo&apos;s Terraform.
          </p>
        ) : (
          <table className="mc-table">
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
                    <td className="mc-mono">
                      {finding.resource ? (
                        <button type="button" className="mc-link" onClick={() => setSelectedResource(keyFromFinding(finding))}>
                          {finding.resource}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className="mc-rule-id mc-mono">{finding.ruleId ?? '—'}</span>
                      <span className="mc-rule-desc">{finding.description}</span>
                    </td>
                    <td>
                      <SevBadge severity={finding.severity} />
                    </td>
                    <td>
                      <span className="mc-tag mc-mono">{finding.source}</span>
                    </td>
                    <td className="mc-mono">
                      {finding.file ?? '—'}
                      {finding.line != null && <span style={{ color: 'var(--ink-dim)' }}>:{finding.line}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </HudFrame>

      <InfraDetailPanel
        resourceKey={selectedResource}
        findings={findings}
        findingsAvailable={findingsAvailable}
        onClose={() => setSelectedResource(null)}
      />
    </div>
  )
}

export default InfrastructureTab
