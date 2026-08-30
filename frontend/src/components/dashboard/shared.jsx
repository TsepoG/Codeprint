const MAX_GRAPH_NODES = 60

const SEVERITY = {
  high: { label: 'High', className: 'critical' },
  medium: { label: 'Medium', className: 'warning' },
  low: { label: 'Low', className: 'good' },
}

function meterSeverity(pct) {
  if (pct > 25) return 'critical'
  if (pct > 10) return 'warning'
  return 'good'
}

export function StatTile({ label, value }) {
  return (
    <div className="stat-tile blueprint-panel">
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value">{value}</span>
    </div>
  )
}

export function DuplicationMeter({ pct }) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0))
  const severity = meterSeverity(clamped)
  return (
    <div className="stat-tile blueprint-panel">
      <span className="stat-tile-label">Duplication</span>
      <span className="stat-tile-value">{clamped.toFixed(1)}%</span>
      <div
        className="meter-track"
        role="img"
        aria-label={`${clamped.toFixed(1)}% duplicated lines`}
      >
        <div className={`meter-fill ${severity}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}

export function SeverityBadge({ severity, label }) {
  const info = SEVERITY[severity] ?? SEVERITY.low
  return (
    <span className={`severity-badge ${info.className}`}>
      <span className="severity-dot" aria-hidden="true" />
      {label ?? info.label}
    </span>
  )
}

export function FilesTable({ files, emptyMessage }) {
  if (files.length === 0) {
    return <p className="empty-note">{emptyMessage}</p>
  }

  return (
    <div className="table-scroll">
      <table className="files-table">
        <thead>
          <tr>
            <th>File</th>
            <th className="numeric">Complexity</th>
            <th className="numeric">Coverage</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.name}>
              <td className="file-name">{file.name}</td>
              <td className="numeric">{file.complexity}</td>
              <td className="numeric">{file.coverage == null ? '—' : `${file.coverage}%`}</td>
              <td>
                <SeverityBadge severity={file.severity} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DependencyGraph({ nodes, edges }) {
  if (nodes.length === 0) {
    return <p className="empty-note">No dependency graph available for this repo.</p>
  }

  if (nodes.length > MAX_GRAPH_NODES) {
    return (
      <p className="empty-note">
        {nodes.length} files and {edges.length} imports - too many to render clearly, showing
        counts only.
      </p>
    )
  }

  const size = 320
  const center = size / 2
  const radius = center - 24
  const positions = new Map(
    nodes.map((node, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2
      return [
        node.id,
        { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) },
      ]
    }),
  )

  return (
    <svg
      className="dependency-graph"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Dependency graph with ${nodes.length} files and ${edges.length} imports`}
    >
      {edges.map((edge) => {
        const from = positions.get(edge.from)
        const to = positions.get(edge.to)
        if (!from || !to) return null
        return (
          <line
            key={`${edge.from}->${edge.to}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className="graph-edge"
          />
        )
      })}
      {nodes.map((node) => {
        const pos = positions.get(node.id)
        return (
          <g key={node.id} className="graph-node">
            <circle cx={pos.x} cy={pos.y} r="5">
              <title>{node.id}</title>
            </circle>
          </g>
        )
      })}
    </svg>
  )
}
