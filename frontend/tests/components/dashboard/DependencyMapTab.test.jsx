import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DependencyMapTab from '../../../src/components/dashboard/DependencyMapTab.jsx'
import { MAX_ORBITAL_NODES } from '../../../src/components/mission-control/orbitalLayout.js'

const GRAPH = {
  nodes: [{ id: 'src/index.js' }, { id: 'src/utils/parse.js' }],
  edges: [{ from: 'src/index.js', to: 'src/utils/parse.js' }],
}

const FILES = [{ name: 'src/index.js', complexity: 5, coverage: null, severity: 'medium' }]

const FINDINGS = [{
  id: 'b1', category: 'bug', source: 'eslint', file: 'src/index.js', line: 4, endLine: 4,
  severity: 'high', ruleId: 'no-undef', description: "'x' is not defined.", snippet: null,
}]

/** @param {object} [props] */
function renderTab(props = {}) {
  return render(<DependencyMapTab dependencyGraph={GRAPH} files={FILES} findings={FINDINGS} {...props} />)
}

function openNode(name) {
  fireEvent.click(screen.getByRole('button', { name: `${name} - view module` }))
}

describe('DependencyMapTab', () => {
  it('captions the diagram with its counts', () => {
    renderTab()
    expect(screen.getByText(/2 modules, 1 imports/)).toBeInTheDocument()
  })

  it('shows an empty message when there is no graph to draw', () => {
    renderTab({ dependencyGraph: { nodes: [], edges: [] } })
    expect(screen.getByText(/no dependency graph available/i)).toBeInTheDocument()
  })

  it('shows no panel until a node is chosen', () => {
    renderTab()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the module panel when a node is clicked', () => {
    renderTab()

    openNode('src/index.js')

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'src/index.js' })).toBeInTheDocument()
  })

  it('opens the panel from the keyboard', () => {
    renderTab()

    fireEvent.keyDown(screen.getByRole('button', { name: 'src/index.js - view module' }), { key: 'Enter' })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('passes the module its stats and findings', () => {
    renderTab()

    openNode('src/index.js')

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('5')).toBeInTheDocument() // complexity
    expect(within(dialog).getByText("'x' is not defined.")).toBeInTheDocument()
  })

  it('re-aims the panel at an imported module without leaving the view', () => {
    renderTab()
    openNode('src/index.js')

    fireEvent.click(screen.getByRole('button', { name: 'src/utils/parse.js' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'src/utils/parse.js' })).toBeInTheDocument()
    // Still on the dependency map, with the diagram behind it.
    expect(screen.getByText(/2 modules, 1 imports/)).toBeInTheDocument()
  })

  it('marks the selected node in the diagram', () => {
    const { container } = renderTab()

    openNode('src/utils/parse.js')

    const selected = container.querySelectorAll('.mc-node.selected')
    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveAttribute('aria-label', 'src/utils/parse.js - view module')
  })

  it('closes the panel again, leaving the diagram in place', () => {
    renderTab()
    openNode('src/index.js')

    fireEvent.click(screen.getByRole('button', { name: /close detail panel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/2 modules, 1 imports/)).toBeInTheDocument()
  })

  it('renders without files or findings, for a scan that carries neither', () => {
    render(<DependencyMapTab dependencyGraph={GRAPH} />)

    openNode('src/index.js')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/no findings recorded against this file/i)).toBeInTheDocument()
  })

  it('flags a circular dependency as high severity in the diagram, even with no lint finding', () => {
    const cyclic = {
      nodes: [{ id: 'a.js' }, { id: 'b.js' }],
      edges: [{ from: 'a.js', to: 'b.js' }, { from: 'b.js', to: 'a.js' }],
    }
    const { container } = render(<DependencyMapTab dependencyGraph={cyclic} />)

    // A circular edge is dashed red, whichever direction it's drawn.
    expect(container.querySelectorAll('.mc-edge-circ')).toHaveLength(2)
  })

  describe('a graph too large to render legibly', () => {
    const many = Array.from({ length: MAX_ORBITAL_NODES + 10 }, (_, i) => ({ id: `m${i}.js` }))
    const bigGraph = { nodes: many, edges: [] }

    it('shows a truncated diagram with a link to the full list', () => {
      renderTab({ dependencyGraph: bigGraph })
      expect(screen.getByRole('button', { name: /10 more modules, view as list/i })).toBeInTheDocument()
    })

    it('switches to a flat table listing every module', () => {
      renderTab({ dependencyGraph: bigGraph })

      fireEvent.click(screen.getByRole('button', { name: /view as list/i }))

      expect(screen.getByRole('table')).toBeInTheDocument()
      expect(screen.getAllByRole('row')).toHaveLength(many.length + 1) // + header
    })

    it('lets the user switch back to the orbital map', () => {
      renderTab({ dependencyGraph: bigGraph })
      fireEvent.click(screen.getByRole('button', { name: /view as list/i }))

      fireEvent.click(screen.getByRole('button', { name: /back to the orbital map/i }))

      expect(screen.getByRole('img', { name: /dependency map/i })).toBeInTheDocument()
    })

    it('still opens the same detail panel from the list view', () => {
      renderTab({ dependencyGraph: bigGraph, files: [{ name: 'm0.js', complexity: 3, coverage: null, severity: 'low' }] })
      fireEvent.click(screen.getByRole('button', { name: /view as list/i }))

      fireEvent.click(screen.getByRole('button', { name: 'm0.js' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'm0.js' })).toBeInTheDocument()
    })
  })
})
