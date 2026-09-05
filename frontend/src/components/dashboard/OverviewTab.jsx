import { StatTile, DuplicationMeter } from './shared.jsx'
import SummaryPanel from './SummaryPanel.jsx'

function formatCount(value) {
  const n = Number(value) || 0
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

/** The worst severity present, which is what the tile's border reports. */
function worstSeverity(findings) {
  if (findings.some((finding) => finding.severity === 'high')) return 'high'
  if (findings.some((finding) => finding.severity === 'medium')) return 'medium'
  return 'low'
}

function OverviewTab({ result }) {
  const infrastructure = result.infrastructure
  const infraFindings = infrastructure?.findings ?? []

  return (
    <div className="dashboard-section">
      <section className="kpi-row" aria-label="Scan metrics">
        <StatTile label="Bugs" value={formatCount(result.metrics.bugs)} />
        <StatTile label="Vulnerabilities" value={formatCount(result.metrics.vulnerabilities)} />
        <StatTile label="Code smells" value={formatCount(result.metrics.codeSmells)} />
        <DuplicationMeter pct={result.metrics.duplicationPct} />
        {/* Only for repos that actually have Terraform - a permanent "0" on
            every JS repo would be noise, not information. */}
        {infrastructure?.detected && (
          <StatTile
            label="Infra findings"
            value={formatCount(infraFindings.length)}
            severity={worstSeverity(infraFindings)}
          />
        )}
      </section>

      <SummaryPanel narrative={result.narrative} />

      {result.warnings?.length > 0 && (
        <div className="status-panel warning-panel">
          <strong>Some checks were skipped:</strong>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default OverviewTab
