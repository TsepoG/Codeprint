import { render, screen, within, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FindingsPanel from '../../../src/components/dashboard/FindingsPanel.jsx'

const BUG = {
  id: 'b1',
  category: 'bug',
  source: 'eslint',
  file: 'src/index.js',
  line: 12,
  endLine: 12,
  severity: 'high',
  ruleId: 'no-undef',
  description: "'foo' is not defined.",
  snippet: { startLine: 10, text: 'const a = 1\nconst b = 2\nfoo()' },
}

const SMELL = {
  id: 's1',
  category: 'codeSmell',
  source: 'eslint',
  file: 'src/legacy.js',
  line: 3,
  endLine: 3,
  severity: 'medium',
  ruleId: 'sonarjs/no-duplicate-string',
  description: 'Define a constant instead of duplicating this literal.',
  snippet: null,
}

const VULN = {
  id: 'v1',
  category: 'vulnerability',
  source: 'npm-audit',
  file: null,
  line: null,
  endLine: null,
  severity: 'high',
  ruleId: 'GHSA-xxxx',
  description: 'minimist <1.2.6: Prototype Pollution',
  snippet: null,
}

const DUPLICATION = {
  id: 'd1',
  category: 'duplication',
  source: 'jscpd',
  file: 'src/a.js',
  line: 10,
  endLine: 20,
  severity: 'low',
  ruleId: 'duplicate-code',
  description: '11 duplicated lines, also at src/b.js:5',
  snippet: { startLine: 8, text: 'first copy' },
  duplicateOf: { file: 'src/b.js', line: 5, endLine: 15, snippet: { startLine: 3, text: 'second copy' } },
}

const ALL = [BUG, SMELL, VULN, DUPLICATION]

/** @param {object} [props] */
function renderPanel(props = {}) {
  return render(
    <FindingsPanel category="bug" findings={ALL} onClose={() => {}} {...props} />,
  )
}

describe('FindingsPanel', () => {
  it('renders nothing when no category is selected', () => {
    const { container } = render(<FindingsPanel category={null} findings={ALL} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens as a labelled dialog named for the category', () => {
    renderPanel()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Bugs' })).toBeInTheDocument()
  })

  it('shows only findings of the selected category', () => {
    renderPanel({ category: 'codeSmell' })

    expect(screen.getByText(SMELL.description)).toBeInTheDocument()
    expect(screen.queryByText(BUG.description)).not.toBeInTheDocument()
    expect(screen.queryByText(VULN.description)).not.toBeInTheDocument()
  })

  it('counts the findings it is showing, not the whole array', () => {
    renderPanel({ category: 'bug' })
    expect(screen.getByText('1 finding')).toBeInTheDocument()
  })

  it('pluralizes the count', () => {
    renderPanel({ category: 'bug', findings: [BUG, { ...BUG, id: 'b2' }] })
    expect(screen.getByText('2 findings')).toBeInTheDocument()
  })

  it('shows each finding with its description, file:line and severity', () => {
    renderPanel()

    expect(screen.getByText("'foo' is not defined.")).toBeInTheDocument()
    expect(screen.getByText('src/index.js:12')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('no-undef')).toBeInTheDocument()
  })

  it('says so when a finding has no place in the repo to point at', () => {
    renderPanel({ category: 'vulnerability' })
    expect(screen.getByText(/no file location/i)).toBeInTheDocument()
  })

  it('orders findings worst-severity-first', () => {
    renderPanel({
      category: 'bug',
      findings: [
        { ...BUG, id: 'low', severity: 'low', description: 'low one' },
        { ...BUG, id: 'high', severity: 'high', description: 'high one' },
      ],
    })

    const descriptions = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(descriptions[0]).toContain('high one')
    expect(descriptions[1]).toContain('low one')
  })

  describe('snippets', () => {
    it('keeps the snippet collapsed behind a toggle', () => {
      renderPanel()

      const details = screen.getByText('Snippet').closest('details')
      expect(details).not.toHaveAttribute('open')

      fireEvent.click(screen.getByText('Snippet'))
      expect(details).toHaveAttribute('open')
    })

    it('renders the snippet as numbered monospace lines starting at the captured line', () => {
      renderPanel()

      expect(screen.getByText('10')).toBeInTheDocument()
      expect(screen.getByText('11')).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText(/const a = 1/)).toBeInTheDocument()
    })

    it('shows both halves of a duplication pair, each labelled with its location', () => {
      renderPanel({ category: 'duplication' })

      expect(screen.getByText(/first copy/)).toBeInTheDocument()
      expect(screen.getByText(/second copy/)).toBeInTheDocument()
      // The second block is captioned with the other location.
      expect(screen.getByText('src/b.js:5')).toBeInTheDocument()
    })

    it('offers no snippet toggle for a finding that has none', () => {
      renderPanel({ category: 'codeSmell' })
      expect(screen.queryByText('Snippet')).not.toBeInTheDocument()
    })
  })

  describe('view in context', () => {
    it('calls back with the finding when the action is used', () => {
      const onViewInContext = vi.fn()
      renderPanel({ onViewInContext })

      fireEvent.click(screen.getByRole('button', { name: /view in context/i }))

      expect(onViewInContext).toHaveBeenCalledWith(BUG)
    })

    it('omits the action for a finding the destination view cannot show', () => {
      renderPanel({ onViewInContext: vi.fn(), canViewInContext: () => false })
      expect(screen.queryByRole('button', { name: /view in context/i })).not.toBeInTheDocument()
    })

    it('omits the action entirely when no handler is wired up', () => {
      renderPanel()
      expect(screen.queryByRole('button', { name: /view in context/i })).not.toBeInTheDocument()
    })
  })

  describe('empty states', () => {
    it('says no issues were found for a genuinely clean category', () => {
      renderPanel({ category: 'bug', findings: [], expectedCount: 0 })

      expect(screen.getByText(/no issues found in this category/i)).toBeInTheDocument()
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    })

    it('is still a real panel, not a blank flash, when there is nothing to list', () => {
      renderPanel({ category: 'bug', findings: [] })

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Bugs' })).toBeInTheDocument()
      expect(screen.getByText('0 findings')).toBeInTheDocument()
    })

    it('explains an empty list that contradicts the metric, rather than claiming the scan is clean', () => {
      // A scan recorded before findings were captured still reports its old
      // summary counts.
      renderPanel({ category: 'bug', findings: [], expectedCount: 3 })

      expect(screen.getByText(/predates their capture/i)).toBeInTheDocument()
      expect(screen.queryByText(/no issues found/i)).not.toBeInTheDocument()
    })
  })

  describe('dismissal', () => {
    it('closes on the close button', () => {
      const onClose = vi.fn()
      renderPanel({ onClose })

      fireEvent.click(screen.getByRole('button', { name: /close detail panel/i }))

      expect(onClose).toHaveBeenCalled()
    })

    it('closes on Escape', () => {
      const onClose = vi.fn()
      renderPanel({ onClose })

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).toHaveBeenCalled()
    })

    it('closes when the backdrop is clicked', () => {
      const onClose = vi.fn()
      const { container } = renderPanel({ onClose })

      fireEvent.click(container.querySelector('.panel-backdrop'))

      expect(onClose).toHaveBeenCalled()
    })

    it('moves focus to the panel on open so the keyboard lands inside it', () => {
      renderPanel()
      expect(screen.getByRole('button', { name: /close detail panel/i })).toHaveFocus()
    })
  })
})
