import { useEffect, useState } from 'react'
import TrendChart from './TrendChart.jsx'
import { SeverityBadge } from './shared.jsx'

const PAGE_SIZE = 10

function formatTimestamp(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

function HistoryTab({ apiBaseUrl, repoUrl, onViewScan }) {
  // repoUrl doesn't change during this component's lifetime in practice
  // (it only mounts fresh when the History tab is selected), so the
  // initial 'loading' state below is the only reset this effect needs -
  // it never has to set state synchronously within its own body.
  const [state, setState] = useState({ status: 'loading', scans: [] })

  useEffect(() => {
    let cancelled = false

    fetch(`${apiBaseUrl}/api/scans?repoUrl=${encodeURIComponent(repoUrl)}&pageSize=${PAGE_SIZE}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load history (status ${response.status})`)
        return response.json()
      })
      .then((body) => {
        if (!cancelled) setState({ status: 'loaded', scans: body.scans })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', scans: [] })
      })

    return () => {
      cancelled = true
    }
  }, [apiBaseUrl, repoUrl])

  if (state.status === 'loading') {
    return <p className="empty-note">Loading scan history…</p>
  }
  if (state.status === 'error') {
    return <p className="empty-note">Could not load scan history for this repo.</p>
  }
  if (state.scans.length === 0) {
    return <p className="empty-note">No past scans recorded for this repo yet.</p>
  }

  // The API returns most-recent-first; charts read left-to-right chronologically.
  const chronological = [...state.scans].reverse()
  const completed = chronological.filter((scan) => scan.status === 'complete')

  return (
    <div className="dashboard-section">
      <div className="trend-row">
        <TrendChart
          title="AVG COMPLEXITY"
          unit=""
          color="var(--bp-cyan)"
          points={completed.map((scan) => ({ value: scan.avgComplexity ?? 0 }))}
        />
        <TrendChart
          title="DUPLICATION"
          unit="%"
          color="var(--bp-accent)"
          points={completed.map((scan) => ({ value: scan.metrics.duplicationPct }))}
        />
      </div>

      <div className="table-scroll">
        <table className="files-table history-table">
          <thead>
            <tr>
              <th>Scanned</th>
              <th>Branch</th>
              <th>Commit</th>
              <th className="numeric">Bugs</th>
              <th className="numeric">Vulns</th>
              <th className="numeric">Dup %</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.scans.map((scan) => (
              <tr key={scan.id}>
                <td className="file-name">{formatTimestamp(scan.completedAt)}</td>
                <td className="file-name">{scan.branch ?? '—'}</td>
                <td className="file-name">{scan.commitSha ? scan.commitSha.slice(0, 7) : '—'}</td>
                <td className="numeric">{scan.metrics ? scan.metrics.bugs : '—'}</td>
                <td className="numeric">{scan.metrics ? scan.metrics.vulnerabilities : '—'}</td>
                <td className="numeric">
                  {scan.metrics ? `${scan.metrics.duplicationPct.toFixed(1)}%` : '—'}
                </td>
                <td>
                  {scan.status === 'complete' ? (
                    <SeverityBadge severity="low" label="Complete" />
                  ) : (
                    <SeverityBadge severity="high" label="Failed" />
                  )}
                </td>
                <td>
                  {scan.status === 'complete' && (
                    <button type="button" className="link-button" onClick={() => onViewScan(scan.id)}>
                      View
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default HistoryTab
