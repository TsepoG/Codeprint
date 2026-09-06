import { useEffect, useState } from 'react'
import HudFrame from '../mission-control/HudFrame.jsx'
import SevBadge from '../mission-control/SevBadge.jsx'
import TrendChart from './TrendChart.jsx'

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
    return (
      <div className="dashboard-section mc">
        <p className="empty-note">Loading scan history…</p>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="dashboard-section mc">
        <p className="empty-note">Could not load scan history for this repo.</p>
      </div>
    )
  }
  if (state.scans.length === 0) {
    return (
      <div className="dashboard-section mc">
        <p className="empty-note">No past scans recorded for this repo yet.</p>
      </div>
    )
  }

  // The API returns most-recent-first; charts read left-to-right chronologically.
  const chronological = [...state.scans].reverse()
  const completed = chronological.filter((scan) => scan.status === 'complete')

  return (
    <div className="dashboard-section mc">
      <div className="mc-trend-row">
        <TrendChart
          title="AVG COMPLEXITY"
          unit=""
          color="var(--cyan)"
          points={completed.map((scan) => ({ value: scan.avgComplexity ?? 0 }))}
        />
        <TrendChart
          title="DUPLICATION"
          unit="%"
          color="var(--amber)"
          points={completed.map((scan) => ({ value: scan.metrics.duplicationPct }))}
        />
      </div>

      <HudFrame>
        <table className="mc-table">
          <thead>
            <tr>
              <th>Scanned</th>
              <th>Branch</th>
              <th>Commit</th>
              <th className="numeric">Bugs</th>
              <th className="numeric">Vulns</th>
              <th className="numeric">Dup %</th>
              <th>Status</th>
              <th>Findings</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.scans.map((scan) => (
              <tr key={scan.id}>
                <td className="mc-mono">{formatTimestamp(scan.completedAt)}</td>
                <td className="mc-mono">{scan.branch ?? '—'}</td>
                <td className="mc-mono">{scan.commitSha ? scan.commitSha.slice(0, 7) : '—'}</td>
                <td className="numeric mc-mono">{scan.metrics ? scan.metrics.bugs : '—'}</td>
                <td className="numeric mc-mono">{scan.metrics ? scan.metrics.vulnerabilities : '—'}</td>
                <td className="numeric mc-mono">
                  {scan.metrics ? `${scan.metrics.duplicationPct.toFixed(1)}%` : '—'}
                </td>
                <td>
                  {scan.status === 'complete' ? (
                    <SevBadge severity="low" label="Complete" />
                  ) : (
                    <SevBadge severity="high" label="Failed" />
                  )}
                </td>
                <td>
                  {scan.status === 'complete' &&
                    (scan.findingsAvailable ? (
                      <span className="mc-availability">Available</span>
                    ) : (
                      // This scan predates per-finding capture - its metrics
                      // are real, but there's nothing to list behind them.
                      <span className="mc-availability mc-availability-unavailable">Not recorded</span>
                    ))}
                </td>
                <td>
                  {scan.status === 'complete' && (
                    <button type="button" className="mc-link" onClick={() => onViewScan(scan.id)}>
                      View
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </HudFrame>
    </div>
  )
}

export default HistoryTab
