import { FilesTable } from './shared.jsx'

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

function HotspotsTab({ files }) {
  const ranked = [...files].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    return bySeverity !== 0 ? bySeverity : b.complexity - a.complexity
  })

  return (
    <div className="dashboard-section">
      <p className="section-caption">Files ranked by severity, then cognitive complexity</p>
      <FilesTable files={ranked} emptyMessage="No hotspots - the linter found nothing to report." />
    </div>
  )
}

export default HotspotsTab
