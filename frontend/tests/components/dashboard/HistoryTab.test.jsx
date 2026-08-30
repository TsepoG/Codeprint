import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HistoryTab from '../../../src/components/dashboard/HistoryTab.jsx'

const API_BASE_URL = 'http://api.test'
const REPO_URL = 'https://github.com/owner/repo'

const NEWER = {
  id: 'newer',
  branch: 'main',
  commitSha: 'newerSha1234567',
  completedAt: 180000, // "1970-01-01 00:03"
  status: 'complete',
  metrics: { bugs: 1, vulnerabilities: 0, codeSmells: 0, duplicationPct: 20 },
  avgComplexity: 8,
}
const OLDER = {
  id: 'older',
  branch: 'main',
  commitSha: 'olderSha7654321',
  completedAt: 120000, // "1970-01-01 00:02"
  status: 'complete',
  metrics: { bugs: 2, vulnerabilities: 1, codeSmells: 1, duplicationPct: 10 },
  avgComplexity: 4,
}
const BROKEN = {
  id: 'broken',
  branch: null,
  commitSha: null,
  completedAt: 60000, // "1970-01-01 00:01"
  status: 'failed',
  metrics: null,
  avgComplexity: null,
}

function mockScansResponse(scans) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ scans, total: scans.length }) })
}

describe('HistoryTab', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading message while the history request is in flight', () => {
    global.fetch = vi.fn(() => new Promise(() => {}))
    render(<HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={REPO_URL} onViewScan={() => {}} />)

    expect(screen.getByText(/loading scan history/i)).toBeInTheDocument()
  })

  it('shows an error message when the request rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    render(<HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={REPO_URL} onViewScan={() => {}} />)

    expect(await screen.findByText(/could not load scan history/i)).toBeInTheDocument()
  })

  it('shows an error message when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    render(<HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={REPO_URL} onViewScan={() => {}} />)

    expect(await screen.findByText(/could not load scan history/i)).toBeInTheDocument()
  })

  it('shows an empty-state message when the repo has no past scans', async () => {
    mockScansResponse([])
    render(<HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={REPO_URL} onViewScan={() => {}} />)

    expect(await screen.findByText(/no past scans recorded for this repo yet/i)).toBeInTheDocument()
  })

  it('requests history for the given repo, most-recent-first, with the configured page size', async () => {
    mockScansResponse([NEWER])
    render(<HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={REPO_URL} onViewScan={() => {}} />)

    await screen.findByText('Complete')
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/scans?repoUrl=${encodeURIComponent(REPO_URL)}&pageSize=10`,
    )
  })

  it('builds trend charts from completed scans only, in chronological (oldest-first) order', async () => {
    mockScansResponse([NEWER, OLDER, BROKEN]) // API order: most-recent-first
    render(<HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={REPO_URL} onViewScan={() => {}} />)

    await screen.findByText('AVG COMPLEXITY')

    // completed = [OLDER, NEWER] once re-sorted chronologically - the failed
    // scan is excluded, and the trend runs from the older value to the newer one.
    expect(
      screen.getByRole('img', { name: /AVG COMPLEXITY across the last 2 scans: from 4\.0 to 8\.0/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /DUPLICATION across the last 2 scans: from 10\.0% to 20\.0%/ }),
    ).toBeInTheDocument()
  })

  it('renders one table row per scan, formatting failed/complete scans differently', async () => {
    mockScansResponse([NEWER, OLDER, BROKEN])
    render(<HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={REPO_URL} onViewScan={() => {}} />)

    await screen.findByText('1970-01-01 00:03')

    // Complete rows: truncated (7-char) commit, real metrics, a "Complete" badge and a View button.
    expect(screen.getByText('newerSh')).toBeInTheDocument()
    expect(screen.getByText('olderSh')).toBeInTheDocument()
    expect(screen.getAllByText('Complete')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2)

    // The failed row: no branch/commit/metrics, a "Failed" badge, no View button.
    expect(screen.getByText('1970-01-01 00:01')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(5) // branch, commit, bugs, vulns, dup% for the failed row
  })

  it('calls onViewScan with the scan id when its View button is clicked', async () => {
    mockScansResponse([NEWER, OLDER])
    const onViewScan = vi.fn()
    render(<HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={REPO_URL} onViewScan={onViewScan} />)

    const [firstViewButton] = await screen.findAllByRole('button', { name: 'View' })
    fireEvent.click(firstViewButton)

    expect(onViewScan).toHaveBeenCalledWith('newer')
  })

  it('re-fetches when repoUrl changes', async () => {
    mockScansResponse([NEWER])
    const { rerender } = render(<HistoryTab apiBaseUrl={API_BASE_URL} repoUrl={REPO_URL} onViewScan={() => {}} />)
    await screen.findByText('Complete')

    mockScansResponse([OLDER])
    rerender(<HistoryTab apiBaseUrl={API_BASE_URL} repoUrl="https://github.com/owner/other" onViewScan={() => {}} />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        expect.stringContaining(encodeURIComponent('https://github.com/owner/other')),
      )
    })
  })
})
