import { StatTile, DuplicationMeter } from './shared.jsx'

function formatCount(value) {
  const n = Number(value) || 0
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

function OverviewTab({ result }) {
  return (
    <div className="dashboard-section">
      <section className="kpi-row" aria-label="Scan metrics">
        <StatTile label="Bugs" value={formatCount(result.metrics.bugs)} />
        <StatTile label="Vulnerabilities" value={formatCount(result.metrics.vulnerabilities)} />
        <StatTile label="Code smells" value={formatCount(result.metrics.codeSmells)} />
        <DuplicationMeter pct={result.metrics.duplicationPct} />
      </section>

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
