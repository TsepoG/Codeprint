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

  it('shows a loading state while the scan is in flight', async () => {
    let resolveFetch
    global.fetch.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))

    render(<CodebaseDashboard />)
    scanRepo('https://github.com/owner/repo')

    expect(await screen.findByRole('status')).toHaveTextContent(/cloning and analyzing/i)

    resolveFetch({ ok: true, json: async () => SCAN_RESULT })
  })

  it('renders metrics, files, and the dependency graph on success', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => SCAN_RESULT })

    render(<CodebaseDashboard />)
    scanRepo('https://github.com/owner/repo')

    expect(await screen.findByText('src/index.js', { selector: 'td' })).toBeInTheDocument()
    expect(screen.getByText('12.5%')).toBeInTheDocument()
    expect(screen.getByText(/no package-lock\.json found/i)).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/scan'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ repoUrl: 'https://github.com/owner/repo' }),
      }),
    )
  })

  it('shows an error message when the backend rejects the request', async () => {
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
