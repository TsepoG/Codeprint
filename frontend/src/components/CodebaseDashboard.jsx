import { useState } from 'react'
import './CodebaseDashboard.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

const MAX_GRAPH_NODES = 60

const SEVERITY = {
  high: { label: 'High', className: 'critical' },
  medium: { label: 'Medium', className: 'warning' },
  low: { label: 'Low', className: 'good' },
}

function formatCount(value) {
  const n = Number(value) || 0
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

function meterSeverity(pct) {
  if (pct > 25) return 'critical'
  if (pct > 10) return 'warning'
  return 'good'
}

function StatTile({ label, value }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value">{value}</span>
    </div>
  )
}

function DuplicationMeter({ pct }) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0))
  const severity = meterSeverity(clamped)
  return (
    <div className="stat-tile">
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

function SeverityBadge({ severity }) {
  const info = SEVERITY[severity] ?? SEVERITY.low
  return (
    <span className={`severity-badge ${info.className}`}>
      <span className="severity-dot" aria-hidden="true" />
      {info.label}
    </span>
  )
}

function FilesTable({ files }) {
  if (files.length === 0) {
    return <p className="empty-note">No flagged files - the linter found nothing to report.</p>
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

function DependencyGraph({ nodes, edges }) {
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

function CodebaseDashboard() {
  const [repoUrl, setRepoUrl] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = repoUrl.trim()
    if (!trimmed) return

    setStatus('loading')
    setError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: trimmed }),
      })

      const body = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(body?.error || `Scan failed with status ${response.status}`)
      }

      setResult(body)
      setStatus('success')
    } catch (err) {
      setError(err.message || 'Something went wrong while scanning this repository.')
      setStatus('error')
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Codeprint</h1>
        <p className="dashboard-subtitle">
          Code quality, dependency, and security analysis for any public GitHub repo.
        </p>
      </header>

      <form className="scan-form" onSubmit={handleSubmit}>
        <label htmlFor="repo-url" className="visually-hidden">
          GitHub repository URL
        </label>
        <input
          id="repo-url"
          type="url"
          inputMode="url"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          disabled={status === 'loading'}
          required
        />
        <button type="submit" disabled={status === 'loading' || repoUrl.trim() === ''}>
          {status === 'loading' ? 'Scanning…' : 'Scan repository'}
        </button>
      </form>

      {status === 'loading' && (
        <div className="status-panel loading-panel" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          Cloning and analyzing the repository - this can take a minute…
        </div>
      )}

      {status === 'error' && (
        <div className="status-panel error-panel" role="alert">
          <strong>Scan failed.</strong> {error}
        </div>
      )}

      {status === 'idle' && (
        <div className="status-panel empty-panel">
          Enter a public GitHub repository URL above to get started.
        </div>
      )}

      {status === 'success' && result && (
        <div className="dashboard-results">
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

          <section className="dashboard-section">
            <h2>Flagged files</h2>
            <FilesTable files={result.files} />
          </section>

          <section className="dashboard-section">
            <h2>Dependency graph</h2>
            <p className="section-caption">
              {result.dependencyGraph.nodes.length} files, {result.dependencyGraph.edges.length}{' '}
              imports
            </p>
            <DependencyGraph
              nodes={result.dependencyGraph.nodes}
              edges={result.dependencyGraph.edges}
            />
          </section>
        </div>
      )}
    </div>
  )
}

export default CodebaseDashboard
