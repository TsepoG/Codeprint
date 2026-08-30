import { useEffect, useRef, useState } from 'react'
import './CodebaseDashboard.css'
import OverviewTab from './dashboard/OverviewTab.jsx'
import DependencyMapTab from './dashboard/DependencyMapTab.jsx'
import HotspotsTab from './dashboard/HotspotsTab.jsx'
import HistoryTab from './dashboard/HistoryTab.jsx'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
const POLL_INTERVAL_MS = 2500

const STATUS_MESSAGES = {
  queued: 'Waiting for the scan to start…',
  running: 'Cloning and analyzing the repository - this can take a few minutes…',
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'dependency-map', label: 'Dependency Map' },
  { id: 'hotspots', label: 'Hotspots' },
  { id: 'history', label: 'History' },
]

function CodebaseDashboard() {
  const [repoUrl, setRepoUrl] = useState('')
  const [status, setStatus] = useState('idle') // idle | queued | running | success | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  // Set only when the visible result came from History > View, so the
  // banner below can distinguish "this is the scan I just ran" from
  // "you're looking at an older one".
  const [viewedScan, setViewedScan] = useState(null)

  // Tracks the in-flight poll loop so a new scan (or unmount) can cancel a
  // previous one instead of letting it keep updating state in the background.
  const pollTokenRef = useRef(null)

  useEffect(() => {
    return () => {
      if (pollTokenRef.current) pollTokenRef.current.cancelled = true
    }
  }, [])

  async function pollJob(jobId, token) {
    if (token.cancelled) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/scan/${jobId}`)
      const body = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(body?.error || `Checking scan status failed with status ${response.status}`)
      }
      if (token.cancelled) return

      if (body.status === 'complete') {
        setResult(body.result)
        setViewedScan(null)
        setStatus('success')
        return
      }
      if (body.status === 'failed') {
        setError(body.error || 'Scan failed.')
        setStatus('error')
        return
      }

      setStatus(body.status) // 'queued' or 'running'
      setTimeout(() => pollJob(jobId, token), POLL_INTERVAL_MS)
    } catch (err) {
      if (token.cancelled) return
      setError(err.message || 'Lost connection while checking the scan status.')
      setStatus('error')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = repoUrl.trim()
    if (!trimmed) return

    if (pollTokenRef.current) pollTokenRef.current.cancelled = true
    const token = { cancelled: false }
    pollTokenRef.current = token

    setStatus('queued')
    setError(null)
    setResult(null)
    setViewedScan(null)
    setActiveTab('overview')

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
      if (token.cancelled) return

      setTimeout(() => pollJob(body.jobId, token), POLL_INTERVAL_MS)
    } catch (err) {
      if (token.cancelled) return
      setError(err.message || 'Something went wrong while starting the scan.')
      setStatus('error')
    }
  }

  async function handleViewScan(scanId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/scans/${scanId}`)
      const body = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(body?.error || `Could not load that scan (status ${response.status})`)
      }

      if (pollTokenRef.current) pollTokenRef.current.cancelled = true
      setResult(body.result)
      setViewedScan({ completedAt: body.completedAt, branch: body.branch, commitSha: body.commitSha })
      setStatus('success')
      setActiveTab('overview')
    } catch (err) {
      setError(err.message || 'Could not load that scan.')
      setStatus('error')
    }
  }

  const isBusy = status === 'queued' || status === 'running'

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
          disabled={isBusy}
          required
        />
        <button type="submit" disabled={isBusy || repoUrl.trim() === ''}>
          {isBusy ? 'Scanning…' : 'Scan repository'}
        </button>
      </form>

      {isBusy && (
        <div className="status-panel loading-panel" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          {STATUS_MESSAGES[status]}
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
          {viewedScan && (
            <div className="status-panel viewing-panel">
              Viewing a past scan from <strong>{new Date(viewedScan.completedAt).toISOString().slice(0, 16).replace('T', ' ')}</strong>
              {viewedScan.branch && <> on <strong>{viewedScan.branch}</strong></>}
              {viewedScan.commitSha && <> @ <code>{viewedScan.commitSha.slice(0, 7)}</code></>} - not the latest.
            </div>
          )}

          <nav className="tab-bar" aria-label="Scan result sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === 'overview' && <OverviewTab result={result} />}
          {activeTab === 'dependency-map' && <DependencyMapTab dependencyGraph={result.dependencyGraph} />}
          {activeTab === 'hotspots' && <HotspotsTab files={result.files} />}
          {activeTab === 'history' && (
            <HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={repoUrl.trim()} onViewScan={handleViewScan} />
          )}
        </div>
      )}
    </div>
  )
}

export default CodebaseDashboard
