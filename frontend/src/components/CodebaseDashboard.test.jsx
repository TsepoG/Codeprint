import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CodebaseDashboard from './CodebaseDashboard'

const SCAN_RESULT = {
  metrics: { bugs: 2, vulnerabilities: 1, codeSmells: 5, duplicationPct: 12.5 },
  files: [{ name: 'src/index.js', complexity: 8, coverage: null, severity: 'high' }],
  dependencyGraph: { nodes: [{ id: 'src/index.js' }], edges: [] },
  warnings: ['no package-lock.json found; skipping npm audit'],
  branch: 'main',
  commitSha: 'abc1234567',
}

function scanRepo(url) {
  fireEvent.change(screen.getByLabelText('GitHub repository URL'), { target: { value: url } })
  fireEvent.click(screen.getByRole('button', { name: /scan repository/i }))
}

function switchTab(name) {
  fireEvent.click(screen.getByRole('button', { name }))
}

/**
 * Mocks fetch across POST /api/scan, GET /api/scan/:jobId, and
 * GET /api/scans* calls, dispatching on method/URL shape. `gets` is
 * consumed in order for successive GET /api/scan/:jobId polls (repeating
 * the last entry past the end); `scansList` and `scanDetail` back the
 * History tab's list/detail fetches respectively.
 */
function mockFetchSequence({ post, gets = [], scansList, scanDetail }) {
  let pollIndex = 0
  global.fetch = vi.fn((url, opts) => {
    if (opts?.method === 'POST') return Promise.resolve(post)
    if (typeof url === 'string' && url.includes('/api/scans?')) return Promise.resolve(scansList)
    if (typeof url === 'string' && /\/api\/scans\/[^/?]+$/.test(url)) return Promise.resolve(scanDetail)
    const response = gets[Math.min(pollIndex, gets.length - 1)]
    pollIndex += 1
    return Promise.resolve(response)
  })
}

describe('CodebaseDashboard', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a prompt before any scan has run', () => {
    render(<CodebaseDashboard />)
    expect(screen.getByText(/enter a public github repository url/i)).toBeInTheDocument()
  })

  it('shows a queued state as soon as the scan is submitted', async () => {
    global.fetch.mockReturnValue(new Promise(() => {})) // POST never resolves in this test

    render(<CodebaseDashboard />)
    scanRepo('https://github.com/owner/repo')

    expect(await screen.findByRole('status')).toHaveTextContent(/waiting for the scan to start/i)
  })

  // These use real timers rather than fake ones - the poll loop chains
  // several `await`s per cycle, and Vitest's fake-timer microtask flushing
  // doesn't reliably keep pace with that depth (nor does testing-library's
  // own findBy/waitFor polling, which is itself setTimeout-based and would
  // also be paused by fake timers). Real timers + a generous findBy
  // timeout is slower but far more robust here.

  it(
    'polls the job until it completes, then renders the Overview tab, and lets you switch to Hotspots and Dependency Map',
    async () => {
      mockFetchSequence({
        post: { ok: true, json: async () => ({ jobId: 'job-1', status: 'queued' }) },
        gets: [
          { ok: true, json: async () => ({ status: 'running' }) },
          { ok: true, json: async () => ({ status: 'complete', result: SCAN_RESULT }) },
        ],
      })

      render(<CodebaseDashboard />)
      scanRepo('https://github.com/owner/repo')

      // findByRole('status') alone would resolve immediately against the
      // *queued* panel (it exists from the start) without ever waiting for
      // the text to change - wait for the specific "running" text instead.
      expect(await screen.findByText(/cloning and analyzing/i, {}, { timeout: 8000 })).toBeInTheDocument()

      // Lands on the Overview tab by default: metrics + warnings, no files table yet.
      expect(await screen.findByText('12.5%', {}, { timeout: 8000 })).toBeInTheDocument()
      expect(screen.getByText(/no package-lock\.json found/i)).toBeInTheDocument()
      expect(screen.queryByText('src/index.js')).not.toBeInTheDocument()

      switchTab(/hotspots/i)
      expect(screen.getByText('src/index.js', { selector: 'td' })).toBeInTheDocument()

      switchTab(/dependency map/i)
      expect(screen.getByText(/1 files, 0 imports/i)).toBeInTheDocument()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/scan'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ repoUrl: 'https://github.com/owner/repo' }),
        }),
      )
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/scan/job-1'))
    },
    15000,
  )

  it(
    'shows an error state when the job fails',
    async () => {
      mockFetchSequence({
        post: { ok: true, json: async () => ({ jobId: 'job-2', status: 'queued' }) },
        gets: [
          { ok: true, json: async () => ({ status: 'failed', error: 'Could not clone repository: not found' }) },
        ],
      })

      render(<CodebaseDashboard />)
      scanRepo('https://github.com/owner/repo')

      expect(await screen.findByRole('alert', {}, { timeout: 8000 })).toHaveTextContent(
        /could not clone repository/i,
      )
    },
    15000,
  )

  it('shows an error message when the initial POST is rejected', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'repoUrl must be a valid https://github.com/<owner>/<repo> URL' }),
    })

    render(<CodebaseDashboard />)
    scanRepo('https://example.com/owner/repo')

    expect(await screen.findByRole('alert')).toHaveTextContent(/repourl must be a valid/i)
  })

  it('shows an error message when the network request itself fails', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'))

    render(<CodebaseDashboard />)
    scanRepo('https://github.com/owner/repo')

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to fetch/i)
  })

  it(
    'History tab lists past scans and loading one shows the "viewing a past scan" banner',
    async () => {
      mockFetchSequence({
        post: { ok: true, json: async () => ({ jobId: 'job-3', status: 'queued' }) },
        gets: [{ ok: true, json: async () => ({ status: 'complete', result: SCAN_RESULT }) }],
        scansList: {
          ok: true,
          json: async () => ({
            scans: [
              {
                id: 'old-scan',
                repoUrl: 'https://github.com/owner/repo',
                branch: 'main',
                commitSha: 'deadbee0000',
                startedAt: 1000,
                completedAt: 2000,
                status: 'complete',
                metrics: { bugs: 9, vulnerabilities: 0, codeSmells: 1, duplicationPct: 3.2 },
                avgComplexity: 4,
              },
            ],
            total: 1,
          }),
        },
        scanDetail: {
          ok: true,
          json: async () => ({
            id: 'old-scan',
            repoUrl: 'https://github.com/owner/repo',
            branch: 'main',
            commitSha: 'deadbee0000',
            startedAt: 1000,
            completedAt: 2000,
            status: 'complete',
            result: { ...SCAN_RESULT, metrics: { bugs: 9, vulnerabilities: 0, codeSmells: 1, duplicationPct: 3.2 } },
          }),
        },
      })

      render(<CodebaseDashboard />)
      scanRepo('https://github.com/owner/repo')
      await screen.findByText('12.5%', {}, { timeout: 8000 })

      switchTab(/history/i)
      expect(await screen.findByText('deadbee', { exact: false })).toBeInTheDocument()

      // Exact match: a loose /view/i would also match the "Overview" tab button.
      fireEvent.click(screen.getByRole('button', { name: 'View' }))

      expect(await screen.findByText(/viewing a past scan/i)).toBeInTheDocument()
      expect(screen.getByText('9')).toBeInTheDocument() // bugs from the historical result, back on Overview
    },
    15000,
  )
})
