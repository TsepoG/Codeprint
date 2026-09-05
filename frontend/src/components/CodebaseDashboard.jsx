import { useEffect, useRef, useState } from 'react'
import './CodebaseDashboard.css'
import OverviewTab from './dashboard/OverviewTab.jsx'
import DependencyMapTab from './dashboard/DependencyMapTab.jsx'
import HotspotsTab from './dashboard/HotspotsTab.jsx'
import HistoryTab from './dashboard/HistoryTab.jsx'
import InfrastructureTab from './dashboard/InfrastructureTab.jsx'
import FindingsPanel from './dashboard/FindingsPanel.jsx'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
const POLL_INTERVAL_MS = 2500

const STATUS_MESSAGES = {
  queued: 'Waiting for the scan to start…',
  running: 'Cloning and analyzing the repository - this can take a few minutes…',
}

// Which metric tile's count backs each findings category, so an empty panel
// can tell "nothing found" apart from "this scan predates findings".
const CATEGORY_METRIC = {
  bug: (result) => result.metrics?.bugs,
  vulnerability: (result) => result.metrics?.vulnerabilities,
  codeSmell: (result) => result.metrics?.codeSmells,
  infra: (result) => result.infrastructure?.findings?.length,
  // Duplication's tile is a percentage, not a count of anything, so there's
  // no expected number of findings to reconcile against.
  duplication: () => 0,
}

// Infrastructure is conditional: it only appears for repos that actually
// contain Terraform (and is absent from scans recorded before infra
// scanning existed, which have no `infrastructure` at all).
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'dependency-map', label: 'Dependency Map' },
  { id: 'hotspots', label: 'Hotspots' },
  { id: 'infrastructure', label: 'Infrastructure', showFor: (result) => result.infrastructure?.detected === true },
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
  // Which metric tile's detail panel is open, and which file a "view in
  // context" jump asked the destination tab to mark.
  const [openCategory, setOpenCategory] = useState(null)
  const [highlightFile, setHighlightFile] = useState(null)

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
    setOpenCategory(null)
    setHighlightFile(null)

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
      setOpenCategory(null)
      setHighlightFile(null)
    } catch (err) {
      setError(err.message || 'Could not load that scan.')
      setStatus('error')
    }
  }

  /**
   * A finding is only worth offering a jump to if the destination view can
   * actually show it: an npm advisory has no file at all, and jscpd finds
   * duplication in files ESLint never flagged, so those never reach the
   * Hotspots table. Offering a button that lands on nothing is worse than
   * not offering one.
   *
   * @param {object} finding
   */
  function canViewInContext(finding) {
    if (!finding.file) return false
    if (finding.category === 'infra') return result?.infrastructure?.detected === true
    return (result?.files ?? []).some((file) => file.name === finding.file)
  }

  /** @param {object} finding */
  function handleViewInContext(finding) {
    setActiveTab(finding.category === 'infra' ? 'infrastructure' : 'hotspots')
    setHighlightFile(finding.file)
    setOpenCategory(null)
  }

  /** @param {string} tabId */
  function handleSelectTab(tabId) {
    setActiveTab(tabId)
    // A highlight is the tail end of one "view in context" jump; navigating
    // by hand starts something else, so it shouldn't stay pinned.
    setHighlightFile(null)
  }

  const isBusy = status === 'queued' || status === 'running'

  const visibleTabs = result ? TABS.filter((tab) => !tab.showFor || tab.showFor(result)) : TABS
  // Loading a past scan can take the current tab away with it (a Terraform
  // repo's Infrastructure tab, then a scan of a JS-only repo), so fall back
  // rather than leaving the pane blank.
  const currentTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : 'overview'

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
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tab-button ${currentTab === tab.id ? 'active' : ''}`}
                onClick={() => handleSelectTab(tab.id)}
                aria-current={currentTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {currentTab === 'overview' && <OverviewTab result={result} onSelectCategory={setOpenCategory} />}
          {currentTab === 'dependency-map' && <DependencyMapTab dependencyGraph={result.dependencyGraph} />}
          {currentTab === 'hotspots' && <HotspotsTab files={result.files} highlightFile={highlightFile} />}
          {currentTab === 'infrastructure' && (
            <InfrastructureTab
              infrastructure={result.infrastructure}
              warnings={result.warnings}
              highlightFile={highlightFile}
            />
          )}
          {currentTab === 'history' && (
            <HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={repoUrl.trim()} onViewScan={handleViewScan} />
          )}

          <FindingsPanel
            category={openCategory}
            findings={result.findings}
            expectedCount={openCategory ? CATEGORY_METRIC[openCategory]?.(result) : undefined}
            canViewInContext={canViewInContext}
            onViewInContext={handleViewInContext}
            onClose={() => setOpenCategory(null)}
          />
        </div>
      )}
    </div>
  )
}

export default CodebaseDashboard
