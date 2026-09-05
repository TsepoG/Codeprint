import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ModuleDetailPanel from '../../../src/components/dashboard/ModuleDetailPanel.jsx'
import { buildDependencyModel } from '../../../src/components/dashboard/dependencyModel.js'

const NODES = [
  { id: 'src/index.js' },
  { id: 'src/handlers/create.js' },
  { id: 'src/handlers/update.js' },
  { id: 'src/utils/parse.js' },
]

const EDGES = [
  { from: 'src/index.js', to: 'src/handlers/create.js' },
  { from: 'src/index.js', to: 'src/handlers/update.js' },
  { from: 'src/handlers/create.js', to: 'src/utils/parse.js' },
]

const FILES = [
  { name: 'src/handlers/create.js', complexity: 14, coverage: null, severity: 'high' },
  { name: 'src/index.js', complexity: 3, coverage: 87, severity: 'low' },
]

const FINDINGS = [
  {
    id: 'b1', category: 'bug', source: 'eslint', file: 'src/handlers/create.js', line: 42, endLine: 42,
    severity: 'high', ruleId: 'no-undef', description: "'ctx' is not defined.", snippet: null,
  },
  {
    id: 'd1', category: 'duplication', source: 'jscpd', file: 'src/handlers/create.js', line: 10, endLine: 51,
    severity: 'medium', ruleId: 'duplicate-code', description: '42 duplicated lines, also at src/handlers/update.js:8',
    snippet: null,
    duplicateOf: { file: 'src/handlers/update.js', line: 8, endLine: 49, snippet: null },
  },
  {
    id: 'b2', category: 'bug', source: 'eslint', file: 'src/utils/parse.js', line: 3, endLine: 3,
    severity: 'low', ruleId: 'no-empty', description: 'Empty block statement.', snippet: null,
  },
]

/** @param {object} [props] */
function renderPanel(props = {}) {
  const { nodes = NODES, edges = EDGES, ...rest } = props
  return render(
    <ModuleDetailPanel
      moduleId="src/handlers/create.js"
      model={buildDependencyModel(nodes, edges)}
      files={FILES}
      findings={FINDINGS}
      onSelectModule={() => {}}
      onClose={() => {}}
      {...rest}
    />,
  )
}

describe('ModuleDetailPanel', () => {
  it('renders nothing when no module is selected', () => {
    const { container } = renderPanel({ moduleId: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('opens as a dialog titled with the module’s full path', () => {
    renderPanel()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'src/handlers/create.js' })).toBeInTheDocument()
  })

  describe('stats', () => {
    it('shows the file’s complexity', () => {
      renderPanel()
      const stats = screen.getByLabelText('Module stats')
      expect(within(stats).getByText('Complexity').nextSibling).toHaveTextContent('14')
    })

    it('says coverage is not measured, rather than showing a made-up number', () => {
      renderPanel()
      const stats = screen.getByLabelText('Module stats')
      expect(within(stats).getByText(/not measured/i)).toBeInTheDocument()
    })

    it('shows a coverage percentage if one is ever recorded', () => {
      renderPanel({ moduleId: 'src/index.js' })
      const stats = screen.getByLabelText('Module stats')
      expect(within(stats).getByText('87%')).toBeInTheDocument()
    })

    it('counts duplication from the clone findings that touch this file', () => {
      renderPanel()
      const stats = screen.getByLabelText('Module stats')
      expect(within(stats).getByText('1 block')).toBeInTheDocument()
    })

    it('says duplication is none rather than zero when the file is clean', () => {
      renderPanel({ moduleId: 'src/utils/parse.js' })
      const stats = screen.getByLabelText('Module stats')
      expect(within(stats).getByText(/none found/i)).toBeInTheDocument()
    })

    it('handles a module with no entry in the files array at all', () => {
      // `files` only carries files ESLint flagged, so most graph nodes
      // aren't in it.
      renderPanel({ moduleId: 'src/handlers/update.js' })
      const stats = screen.getByLabelText('Module stats')
      expect(within(stats).getByText(/not flagged/i)).toBeInTheDocument()
    })
  })

  describe('dependents and dependencies', () => {
    it('lists what imports this module', () => {
      renderPanel()
      const section = screen.getByRole('heading', { name: /imported by/i }).parentElement
      expect(within(section).getByRole('button', { name: 'src/index.js' })).toBeInTheDocument()
    })

    it('lists what this module imports', () => {
      renderPanel()
      const section = screen.getByRole('heading', { name: /^imports/i }).parentElement
      expect(within(section).getByRole('button', { name: 'src/utils/parse.js' })).toBeInTheDocument()
    })

    it('counts each list beside its heading', () => {
      renderPanel({ moduleId: 'src/index.js' })
      const imports = screen.getByRole('heading', { name: /^imports/i })
      expect(imports).toHaveTextContent('2')
    })

    it('explains an empty dependents list rather than showing nothing', () => {
      renderPanel({ moduleId: 'src/index.js' })
      expect(screen.getByText(/nothing imports this module/i)).toBeInTheDocument()
    })

    it('explains an empty dependencies list', () => {
      renderPanel({ moduleId: 'src/utils/parse.js' })
      expect(screen.getByText(/imports nothing else/i)).toBeInTheDocument()
    })

    it('re-aims the panel when a listed module is clicked', () => {
      const onSelectModule = vi.fn()
      renderPanel({ onSelectModule })

      fireEvent.click(screen.getByRole('button', { name: 'src/utils/parse.js' }))

      expect(onSelectModule).toHaveBeenCalledWith('src/utils/parse.js')
    })
  })

  describe('circular dependencies', () => {
    const CYCLE_EDGES = [
      { from: 'src/handlers/create.js', to: 'src/utils/parse.js' },
      { from: 'src/utils/parse.js', to: 'src/handlers/create.js' },
    ]

    it('says nothing about cycles for a module in none', () => {
      renderPanel()
      expect(screen.queryByText(/circular dependency/i)).not.toBeInTheDocument()
    })

    it('calls out a cycle prominently, above the stats', () => {
      const { container } = renderPanel({ edges: CYCLE_EDGES })

      const warning = screen.getByText(/part of a circular dependency/i)
      expect(warning).toBeInTheDocument()

      // Ahead of the stats row in document order, not buried in the findings.
      const body = container.querySelector('.detail-panel-body')
      const positions = [...body.children]
      expect(positions[0]).toHaveClass('module-cycle')
    })

    it('shows the cycle as a walkable path', () => {
      renderPanel({ edges: CYCLE_EDGES })

      const path = screen.getByText(/part of a circular dependency/i).parentElement
      expect(path).toHaveTextContent('src/handlers/create.js → src/utils/parse.js → src/handlers/create.js')
    })

    it('lets the user follow a hop in the cycle', () => {
      const onSelectModule = vi.fn()
      renderPanel({ edges: CYCLE_EDGES, onSelectModule })

      const cycle = document.querySelector('.module-cycle')
      fireEvent.click(within(cycle).getByRole('button', { name: 'src/utils/parse.js' }))

      expect(onSelectModule).toHaveBeenCalledWith('src/utils/parse.js')
    })

    it('flags a module that imports itself', () => {
      renderPanel({ edges: [{ from: 'src/handlers/create.js', to: 'src/handlers/create.js' }] })
      expect(screen.getByText(/part of a circular dependency/i)).toBeInTheDocument()
    })
  })

  describe('findings', () => {
    it('lists the findings recorded against this file, worst first', () => {
      renderPanel()

      const descriptions = screen.getAllByRole('listitem')
        .filter((item) => item.classList.contains('finding-row'))
        .map((item) => item.textContent)

      expect(descriptions[0]).toContain("'ctx' is not defined.")
      expect(descriptions[1]).toContain('42 duplicated lines')
    })

    it('shows a severity chip on each finding, as the Overview drawer does', () => {
      renderPanel()
      const row = screen.getByText("'ctx' is not defined.").closest('.finding-row')
      expect(within(row).getByText('High')).toBeInTheDocument()
    })

    it('leaves out findings belonging to other files', () => {
      renderPanel()
      expect(screen.queryByText('Empty block statement.')).not.toBeInTheDocument()
    })

    it('matches the far half of a duplicate pair, so the second file is not shown as clean', () => {
      // update.js is only named in the finding's `duplicateOf`.
      renderPanel({ moduleId: 'src/handlers/update.js' })
      expect(screen.getByText(/42 duplicated lines/)).toBeInTheDocument()
    })

    it('says so when a file has no findings', () => {
      renderPanel({ moduleId: 'src/index.js' })
      expect(screen.getByText(/no findings recorded against this file/i)).toBeInTheDocument()
    })

    it('drops the file path from each row, since the whole panel is one file', () => {
      renderPanel()
      const row = screen.getByText("'ctx' is not defined.").closest('.finding-row')
      expect(within(row).getByText('line 42')).toBeInTheDocument()
      expect(within(row).queryByText('src/handlers/create.js:42')).not.toBeInTheDocument()
    })
  })

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
})
