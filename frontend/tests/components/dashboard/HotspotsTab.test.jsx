import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HotspotsTab from '../../../src/components/dashboard/HotspotsTab.jsx'
import { buildDependencyModel } from '../../../src/components/dashboard/dependencyModel.js'

describe('HotspotsTab', () => {
  it('shows an empty message when there are no flagged files', () => {
    render(<HotspotsTab files={[]} />)
    expect(screen.getByText(/no hotspots/i)).toBeInTheDocument()
  })

  it('ranks files by severity first (high, then medium, then low)', () => {
    const files = [
      { name: 'low.js', complexity: 1, coverage: null, severity: 'low' },
      { name: 'high.js', complexity: 1, coverage: null, severity: 'high' },
      { name: 'medium.js', complexity: 1, coverage: null, severity: 'medium' },
    ]
    render(<HotspotsTab files={files} />)

    const names = screen.getAllByRole('cell').filter((_, i) => i % 4 === 0).map((cell) => cell.textContent)
    expect(names).toEqual(['high.js', 'medium.js', 'low.js'])
  })

  it('breaks ties within the same severity by complexity, descending', () => {
    const files = [
      { name: 'low-complexity.js', complexity: 3, coverage: null, severity: 'high' },
      { name: 'high-complexity.js', complexity: 9, coverage: null, severity: 'high' },
    ]
    render(<HotspotsTab files={files} />)

    const names = screen.getAllByRole('cell').filter((_, i) => i % 4 === 0).map((cell) => cell.textContent)
    expect(names).toEqual(['high-complexity.js', 'low-complexity.js'])
  })

  it('does not mutate the files array passed in', () => {
    const files = [
      { name: 'a.js', complexity: 1, coverage: null, severity: 'low' },
      { name: 'b.js', complexity: 1, coverage: null, severity: 'high' },
    ]
    const original = [...files]
    render(<HotspotsTab files={files} />)

    expect(files).toEqual(original)
  })

  describe('view-in-context highlighting', () => {
    const FILES = [
      { name: 'a.js', complexity: 1, coverage: null, severity: 'high' },
      { name: 'b.js', complexity: 1, coverage: null, severity: 'high' },
    ]

    it('marks the row the user was sent to', () => {
      render(<HotspotsTab files={FILES} highlightFile="b.js" />)

      expect(screen.getByText('b.js').closest('tr')).toHaveClass('row-highlighted')
      expect(screen.getByText('a.js').closest('tr')).not.toHaveClass('row-highlighted')
    })

    it('marks nothing when no jump is in progress', () => {
      const { container } = render(<HotspotsTab files={FILES} />)
      expect(container.querySelectorAll('.row-highlighted')).toHaveLength(0)
    })

    it('renders normally when the file to highlight is not in the table', () => {
      const { container } = render(<HotspotsTab files={FILES} highlightFile="not-here.js" />)

      expect(container.querySelectorAll('.row-highlighted')).toHaveLength(0)
      expect(screen.getByText('a.js')).toBeInTheDocument()
    })

    it('scrolls the highlighted row into view', () => {
      const scrollIntoView = vi.fn()
      // jsdom doesn't implement scrollIntoView, so the component guards on
      // its presence - stub it to prove the call still happens where it is.
      Element.prototype.scrollIntoView = scrollIntoView

      render(<HotspotsTab files={FILES} highlightFile="b.js" />)

      expect(scrollIntoView).toHaveBeenCalled()
      delete Element.prototype.scrollIntoView
    })
  })

  describe('file detail panel', () => {
    const FILES = [
      { name: 'src/handlers/create.js', complexity: 14, coverage: null, severity: 'high' },
      { name: 'src/utils/parse.js', complexity: 3, coverage: null, severity: 'low' },
    ]

    const FINDINGS = [
      {
        id: 'b1', category: 'bug', source: 'eslint', file: 'src/handlers/create.js', line: 42, endLine: 42,
        severity: 'high', ruleId: 'no-undef', description: "'ctx' is not defined.", snippet: null,
      },
      {
        id: 'd1', category: 'duplication', source: 'jscpd', file: 'src/handlers/create.js', line: 10, endLine: 51,
        severity: 'medium', ruleId: 'duplicate-code', description: '42 duplicated lines, also at src/handlers/update.js:8',
        snippet: { startLine: 10, text: 'const schema = z.object({' },
        duplicateOf: { file: 'src/handlers/update.js', line: 8, endLine: 49, snippet: { startLine: 8, text: 'const schema = z.object({' } },
      },
      {
        id: 'b2', category: 'bug', source: 'eslint', file: 'src/utils/parse.js', line: 3, endLine: 3,
        severity: 'low', ruleId: 'no-empty', description: 'Empty block statement.', snippet: null,
      },
    ]

    function renderTab(props = {}) {
      return render(<HotspotsTab files={FILES} findings={FINDINGS} {...props} />)
    }

    it('invites the user to select a file', () => {
      renderTab()
      expect(screen.getByText(/select a file for its detail/i)).toBeInTheDocument()
    })

    it('does not invite selection when there are no hotspots', () => {
      render(<HotspotsTab files={[]} />)
      expect(screen.queryByText(/select a file/i)).not.toBeInTheDocument()
    })

    it('shows no panel until a file is chosen', () => {
      renderTab()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens the panel on the clicked file', () => {
      renderTab()

      fireEvent.click(screen.getByRole('button', { name: 'src/handlers/create.js' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'src/handlers/create.js' })).toBeInTheDocument()
    })

    it('shows only that file’s findings', () => {
      renderTab()
      fireEvent.click(screen.getByRole('button', { name: 'src/handlers/create.js' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText("'ctx' is not defined.")).toBeInTheDocument()
      expect(within(dialog).queryByText('Empty block statement.')).not.toBeInTheDocument()
    })

    it('omits the import sections when there is no dependency graph to speak of', () => {
      // Hotspots is reachable without a graph; claiming "nothing imports
      // this" would be an assertion the scan can't support.
      renderTab()
      fireEvent.click(screen.getByRole('button', { name: 'src/handlers/create.js' }))

      expect(screen.queryByRole('heading', { name: /imported by/i })).not.toBeInTheDocument()
    })

    it('includes them when the graph does contain the file', () => {
      const model = buildDependencyModel(
        [{ id: 'src/handlers/create.js' }, { id: 'src/utils/parse.js' }],
        [{ from: 'src/handlers/create.js', to: 'src/utils/parse.js' }],
      )
      renderTab({ model })

      fireEvent.click(screen.getByRole('button', { name: 'src/handlers/create.js' }))

      expect(screen.getByRole('heading', { name: /imported by/i })).toBeInTheDocument()
      const imports = screen.getByRole('heading', { name: /^imports/i }).parentElement
      expect(within(imports).getByRole('button', { name: 'src/utils/parse.js' })).toBeInTheDocument()
    })

    it('shows both copies of a duplication finding side by side', () => {
      renderTab()
      fireEvent.click(screen.getByRole('button', { name: 'src/handlers/create.js' }))
      fireEvent.click(screen.getByText(/compare both copies/i))

      const pair = document.querySelector('.snippet-pair')
      expect(pair).toBeInTheDocument()
      expect(within(pair).getByText('src/handlers/create.js:10')).toBeInTheDocument()
      expect(within(pair).getByText('src/handlers/update.js:8')).toBeInTheDocument()
      expect(pair.querySelectorAll('.snippet-code')).toHaveLength(2)
    })

    it('closes the panel again, leaving the table in place', () => {
      renderTab()
      fireEvent.click(screen.getByRole('button', { name: 'src/handlers/create.js' }))

      fireEvent.click(screen.getByRole('button', { name: /close detail panel/i }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'src/handlers/create.js' })).toBeInTheDocument()
    })
  })
})
