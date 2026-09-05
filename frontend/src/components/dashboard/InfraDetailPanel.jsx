import DetailPanel from './DetailPanel.jsx'
import { SeverityBadge } from './shared.jsx'
import { rankFindings } from './rankFindings.js'
import { findingsForResource } from './infraResource.js'

/**
 * One checkov/tfsec finding in full: what it says, where, how bad, and what
 * the tool suggests doing about it.
 *
 * This deliberately doesn't reuse `FindingRow` - an infra finding has no code
 * snippet and does have a rule description, an impact and a remediation, so
 * the two rows carry genuinely different content rather than the same content
 * styled twice.
 *
 * @param {object} props
 * @param {object} props.finding
 */
function InfraFindingCard({ finding }) {
  const hasGuidance = Boolean(finding.remediation || finding.impact || finding.link)

  return (
    <li className="infra-finding-card">
      <div className="finding-row-head">
        <p className="finding-description">{finding.description}</p>
        <SeverityBadge severity={finding.severity} />
      </div>

      <div className="finding-meta">
        <span className="finding-location">
          {finding.file ?? 'unknown file'}
          {finding.line != null && `:${finding.line}`}
        </span>
        {finding.ruleId && <span className="finding-rule">{finding.ruleId}</span>}
        <span className={`infra-source infra-source-${finding.source}`}>{finding.source}</span>
      </div>

      {hasGuidance ? (
        <div className="infra-guidance">
          {finding.impact && (
            <p className="infra-guidance-line">
              <span className="infra-guidance-label">Impact</span>
              {finding.impact}
            </p>
          )}
          {finding.remediation && (
            <p className="infra-guidance-line">
              <span className="infra-guidance-label">Fix</span>
              {finding.remediation}
            </p>
          )}
          {finding.link && (
            <p className="infra-guidance-line">
              <span className="infra-guidance-label">Docs</span>
              <a className="infra-guidance-link" href={finding.link} target="_blank" rel="noreferrer noopener">
                {finding.link}
              </a>
            </p>
          )}
        </div>
      ) : (
        // checkov often reports neither a fix nor a link, so this is a
        // normal outcome rather than a data problem worth alarming about.
        <p className="empty-note infra-no-guidance">{finding.source} offered no remediation guidance for this rule.</p>
      )}
    </li>
  )
}

/**
 * Everything both Terraform scanners found against one resource.
 *
 * Reached from either the resource graph or the findings table - both reduce
 * to the same resource key first (see `infraResource.js`), so a resource
 * flagged by checkov *and* tfsec shows both tools' findings together. That's
 * the useful side of the tools not being deduplicated.
 *
 * @param {object} props
 * @param {import('./infraResource.js').ResourceKey|null} props.resourceKey Null closes the panel.
 * @param {object[]} [props.findings] `infrastructure.findings`.
 * @param {() => void} props.onClose
 */
function InfraDetailPanel({ resourceKey, findings = [], onClose }) {
  if (!resourceKey) return null

  const matching = rankFindings(findingsForResource(findings, resourceKey))
  const sources = [...new Set(matching.map((finding) => finding.source))]

  return (
    <DetailPanel
      open
      tag="Resource"
      title={resourceKey.resource}
      subtitle={resourceKey.modulePath || 'repo root'}
      onClose={onClose}
    >
      <section className="module-section">
        <h3 className="module-section-title">
          Findings <span className="module-section-count">{matching.length}</span>
        </h3>

        {matching.length === 0 ? (
          <p className="empty-note">
            Neither checkov nor tfsec flagged this resource. It still appears in the graph because inframap
            found it declared.
          </p>
        ) : (
          <>
            {sources.length > 1 && (
              <p className="section-caption infra-both-sources">
                Flagged by {sources.join(' and ')} - the two tools overlap, and their findings are not merged.
              </p>
            )}
            <ul className="infra-finding-list">
              {matching.map((finding, index) => (
                <InfraFindingCard key={`${finding.source}-${finding.ruleId}-${index}`} finding={finding} />
              ))}
            </ul>
          </>
        )}
      </section>
    </DetailPanel>
  )
}

export default InfraDetailPanel
