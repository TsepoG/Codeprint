import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Orbit, Radar, Server, History as HistoryIcon, GitBranch } from 'lucide-react'
import './CodebaseDashboard.css'
import HudFrame from './mission-control/HudFrame.jsx'
import OverviewTab from './dashboard/OverviewTab.jsx'
import DependencyMapTab from './dashboard/DependencyMapTab.jsx'
import HotspotsTab from './dashboard/HotspotsTab.jsx'
import HistoryTab from './dashboard/HistoryTab.jsx'
import InfrastructureTab from './dashboard/InfrastructureTab.jsx'
import FindingsPanel from './dashboard/FindingsPanel.jsx'
import { buildDependencyModel } from './dashboard/dependencyModel.js'
import { repoLabel } from './dashboard/repoLabel.js'
import { formatElapsed } from './dashboard/elapsed.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
const POLL_INTERVAL_MS = 2500

const STATUS_MESSAGES = {
  queued: 'Waiting for the scan to start…',
  running: 'Cloning and analyzing the repository - this can take a few minutes…',
}

// Infrastructure is conditional: it only appears for repos that actually
// contain Terraform (and is absent from scans recorded before infra
// scanning existed, which have no `infrastructure` at all).
const TABS = [
  { id: 'overview', label: 'Overview', icon: Crosshair },
  { id: 'dependency-map', label: 'Dependency Map', icon: Orbit },
  { id: 'hotspots', label: 'Hotspots', icon: Radar },
  { id: 'infrastructure', label: 'Infrastructure', icon: Server, showFor: (result) => result.infrastructure?.detected === true },
  { id: 'history', label: 'History', icon: HistoryIcon },
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
  // The repo the *visible* result belongs to - distinct from `repoUrl`
  // (the live input value), which changes as the user types a new one
  // without necessarily having submitted it yet. Drives the sidebar/top
  // bar's "Mission" field.
  const [scannedRepoUrl, setScannedRepoUrl] = useState(null)
  // Wall-clock timing for the shell's "Elapsed" readout - a live scan ticks
  // (see the effect below) until `completedAt` is stamped; a scan loaded
  // from History gets its real recorded duration instead.
  const [scanTiming, setScanTiming] = useState({ startedAt: null, completedAt: null })
  const [nowTick, setNowTick] = useState(() => Date.now())

  // Tracks the in-flight poll loop so a new scan (or unmount) can cancel a
  // previous one instead of letting it keep updating state in the background.
  const pollTokenRef = useRef(null)

  useEffect(() => {
    return () => {
      if (pollTokenRef.current) pollTokenRef.current.cancelled = true
    }
  }, [])

  const isBusy = status === 'queued' || status === 'running'

  // Ticks the shell's elapsed-time readout once a second while a scan is
  // actually running - frozen (not running at all) the rest of the time.
  useEffect(() => {
    if (!isBusy) return undefined
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isBusy])

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
        setScanTiming((timing) => ({ ...timing, completedAt: Date.now() }))
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
    setScannedRepoUrl(trimmed)
    setScanTiming({ startedAt: Date.now(), completedAt: null })

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
      setScannedRepoUrl(body.repoUrl ?? repoUrl.trim())
      setScanTiming({ startedAt: body.startedAt ?? null, completedAt: body.completedAt ?? null })
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

  // Built once here rather than per tab: the Dependency Map and Hotspots
  // open the same file panel, and it should say the same thing either way.
  const dependencyModel = useMemo(
    () => buildDependencyModel(result?.dependencyGraph?.nodes, result?.dependencyGraph?.edges),
    [result?.dependencyGraph],
  )

  const visibleTabs = result ? TABS.filter((tab) => !tab.showFor || tab.showFor(result)) : TABS
  // Loading a past scan can take the current tab away with it (a Terraform
  // repo's Infrastructure tab, then a scan of a JS-only repo), so fall back
  // rather than leaving the pane blank.
  const currentTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : 'overview'

  const missionLabel = repoLabel(scannedRepoUrl) ?? '—'
  const elapsedMs = scanTiming.startedAt == null ? null : (scanTiming.completedAt ?? nowTick) - scanTiming.startedAt
  const elapsedLabel = formatElapsed(elapsedMs)
  const branchLabel = result?.branch ?? '—'
  const commitLabel = result?.commitSha ? result.commitSha.slice(0, 7) : '—'

  let statusModifier = 'idle'
  let statusLabel = 'STANDBY'
  let statusPulses = false
  if (status === 'queued' || status === 'running') {
    statusModifier = 'busy'
    statusLabel = status === 'queued' ? 'QUEUED' : 'SCANNING'
    statusPulses = true
  } else if (status === 'error') {
    statusModifier = 'failed'
    statusLabel = 'SCAN FAILED'
  } else if (status === 'success') {
    statusModifier = ''
    statusLabel = 'SCAN COMPLETE'
    statusPulses = true
  }

  return (
    <div className="dashboard mc mc-shell">
      <aside className="mc-side">
        <div className="mc-brand">
          <div className="mc-mark" />
          <div className="mc-brand-name">CODEPRINT</div>
        </div>

        <nav className="mc-nav" aria-label="Scan result sections">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                className={`mc-navitem ${currentTab === tab.id ? 'active' : ''}`}
                onClick={() => handleSelectTab(tab.id)}
                aria-current={currentTab === tab.id}
                disabled={!result}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </nav>

        <div className="mc-tblock mc-mono">
          <div className="mc-tblock-row">
            <div className="mc-tblock-cell">
              <span className="mc-tblock-label">Mission</span>
              {missionLabel}
            </div>
          </div>
          <div className="mc-tblock-row">
            <div className="mc-tblock-cell">
              <span className="mc-tblock-label">Branch</span>
              {branchLabel}
            </div>
            <div className="mc-tblock-cell">
              <span className="mc-tblock-label">Commit</span>
              {commitLabel}
            </div>
          </div>
          <div className="mc-tblock-row">
            <div className="mc-tblock-cell">
              <span className="mc-tblock-label">Elapsed</span>
              {elapsedLabel}
            </div>
          </div>
        </div>
      </aside>

      <div className="mc-main">
        <div className="mc-top">
          <div className="mc-repo">
            <GitBranch size={13} />
            {scannedRepoUrl ? (
              <>
                <b>{missionLabel}</b>
                <span>@ {branchLabel}</span>
                <span className="mc-elapsed mc-mono">// {elapsedLabel}</span>
              </>
            ) : (
              <span>No repository scanned yet</span>
            )}
          </div>

          <form className="mc-scan-form" onSubmit={handleSubmit}>
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
            <button type="submit" className="mc-scan-button" disabled={isBusy || repoUrl.trim() === ''}>
              {isBusy ? 'Scanning…' : 'Scan'}
            </button>
          </form>

          <div className={`mc-status ${statusModifier}`}>
            <span className={`mc-status-dot ${statusPulses ? 'pulse' : ''}`} />
            {statusLabel}
          </div>
        </div>

        <div className="mc-canvas">
          {status === 'success' && result ? (
            <>
              {viewedScan && (
                <p className="mc-notice">
                  Viewing a past scan from <strong>{new Date(viewedScan.completedAt).toISOString().slice(0, 16).replace('T', ' ')}</strong>
                  {viewedScan.branch && (
                    <>
                      {' '}
                      on <strong>{viewedScan.branch}</strong>
                    </>
                  )}
                  {viewedScan.commitSha && (
                    <>
                      {' '}
                      @ <code>{viewedScan.commitSha.slice(0, 7)}</code>
                    </>
                  )}{' '}
                  - not the latest.
                </p>
              )}

              {currentTab === 'overview' && <OverviewTab result={result} onSelectCategory={setOpenCategory} />}
              {currentTab === 'dependency-map' && (
                <DependencyMapTab
                  dependencyGraph={result.dependencyGraph}
                  files={result.files}
                  findings={result.findings}
                  findingsAvailable={result.findingsAvailable}
                  model={dependencyModel}
                />
              )}
              {currentTab === 'hotspots' && (
                <HotspotsTab
                  files={result.files}
                  highlightFile={highlightFile}
                  findings={result.findings}
                  findingsAvailable={result.findingsAvailable}
                  model={dependencyModel}
                />
              )}
              {currentTab === 'infrastructure' && (
                <InfrastructureTab
                  infrastructure={result.infrastructure}
                  warnings={result.warnings}
                  highlightFile={highlightFile}
                  findingsAvailable={result.findingsAvailable}
                />
              )}
              {currentTab === 'history' && (
                <HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={repoUrl.trim()} onViewScan={handleViewScan} />
              )}

              <FindingsPanel
                category={openCategory}
                findings={result.findings}
                findingsAvailable={result.findingsAvailable}
                canViewInContext={canViewInContext}
                onViewInContext={handleViewInContext}
                onClose={() => setOpenCategory(null)}
              />
            </>
          ) : (
            <HudFrame>
              <div
                className={`mc-placeholder ${status === 'error' ? 'failed' : ''}`}
                role={status === 'error' ? 'alert' : 'status'}
                aria-live={status === 'error' ? 'assertive' : 'polite'}
              >
                {status === 'idle' && <p>Enter a public GitHub repository URL above to get started.</p>}
                {isBusy && (
                  <>
                    <span className="mc-spinner" aria-hidden="true" />
                    <p>{STATUS_MESSAGES[status]}</p>
                  </>
                )}
                {status === 'error' && (
                  <p>
                    <strong>Scan failed.</strong> {error}
                  </p>
                )}
              </div>
            </HudFrame>
          )}
        </div>
      </div>
    </div>
  )
}

export default CodebaseDashboard
