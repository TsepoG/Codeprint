import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CodebaseDashboard from './CodebaseDashboard'

const SCAN_RESULT = {
  metrics: { bugs: 2, vulnerabilities: 1, codeSmells: 5, duplicationPct: 12.5 },
  files: [{ name: 'src/index.js', complexity: 8, coverage: null, severity: 'high' }],
  dependencyGraph: { nodes: [{ id: 'src/index.js' }], edges: [] },
  warnings: ['no package-lock.json found; skipping npm audit'],
}

function scanRepo(url) {
  fireEvent.change(screen.getByLabelText('GitHub repository URL'), { target: { value: url } })
  fireEvent.click(screen.getByRole('button', { name: /scan repository/i }))
}

/**
 * Mocks the POST /api/scan -> GET /api/scan/:jobId polling sequence: the
 * first fetch call (identified by method: 'POST') resolves with `post`,
 * every subsequent call (a GET poll) resolves with the next entry in
 * `gets` in order (repeating the last one past the end).
 */
function mockFetchSequence({ post, gets }) {
  let pollIndex = 0
  global.fetch = vi.fn((_url, opts) => {
    if (opts?.method === 'POST') return Promise.resolve(post)
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

  // These two use real timers rather than fake ones - the poll loop chains
  // several `await`s per cycle, and Vitest's fake-timer microtask flushing
  // doesn't reliably keep pace with that depth (nor does testing-library's
  // own findBy/waitFor polling, which is itself setTimeout-based and would
  // also be paused by fake timers). Real timers + a generous findBy
  // timeout is slower but far more robust here.

  it(
    'polls the job until it completes, then renders metrics, files, and the dependency graph',
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
      expect(
        await screen.findByText('src/index.js', { selector: 'td' }, { timeout: 8000 }),
      ).toBeInTheDocument()
      expect(screen.getByText('12.5%')).toBeInTheDocument()
      expect(screen.getByText(/no package-lock\.json found/i)).toBeInTheDocument()

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
})
