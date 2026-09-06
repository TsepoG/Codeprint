import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OrbitalMap from '../../../src/components/mission-control/OrbitalMap.jsx'
import { computeDepths } from '../../../src/components/mission-control/orbitalLayout.js'

const NODES = [{ id: 'app' }, { id: 'router' }, { id: 'cart' }, { id: 'productlist' }]
const EDGES = [
  { from: 'app', to: 'router' },
  { from: 'router', to: 'cart' },
  { from: 'cart', to: 'productlist' },
  { from: 'productlist', to: 'cart' },
]

const severityOf = (id) => (id === 'cart' || id === 'productlist' ? 'high' : 'low')

/** @param {object} [props] */
function renderMap(props = {}) {
  const { depths, core } = computeDepths(NODES, EDGES)
  return render(
    <OrbitalMap
      nodes={NODES}
      edges={EDGES}
      depths={depths}
      core={core}
      severityOf={severityOf}
      isCircularEdge={(from, to) => (from === 'cart' && to === 'productlist') || (from === 'productlist' && to === 'cart')}
      {...props}
    />,
  )
}

describe('OrbitalMap', () => {
  it('shows an empty message when there is no graph', () => {
    render(<OrbitalMap nodes={[]} edges={[]} depths={new Map()} core={null} severityOf={() => 'low'} isCircularEdge={() => false} />)
    expect(screen.getByText(/no dependency graph available/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders the diagram as a labelled figure with node and edge counts', () => {
    renderMap()
    expect(screen.getByRole('img', { name: /dependency map with 4 modules and 4 imports/i })).toBeInTheDocument()
  })

  it('draws the ring guides, crosshair, and radar sweep', () => {
    const { container } = renderMap()
    expect(container.querySelectorAll('.mc-ring-guide')).toHaveLength(3)
    expect(container.querySelector('animateTransform')).toBeInTheDocument()
  })

  it('labels every node', () => {
    renderMap()
    for (const node of NODES) {
      expect(screen.getByText(node.id, { selector: 'text' })).toBeInTheDocument()
    }
  })

  it('dashes the circular edge red, and leaves ordinary edges alone', () => {
    const { container } = renderMap()
    expect(container.querySelectorAll('.mc-edge-circ')).toHaveLength(2) // cart->productlist and productlist->cart
    expect(container.querySelectorAll('.mc-edge').length).toBeGreaterThan(0)
  })

  it('skips an edge referencing a node not being rendered, rather than crashing', () => {
    const { depths, core } = computeDepths(NODES, EDGES)
    expect(() =>
      render(
        <OrbitalMap
          nodes={NODES}
          edges={[...EDGES, { from: 'app', to: 'ghost' }]}
          depths={depths}
          core={core}
          severityOf={severityOf}
          isCircularEdge={() => false}
        />,
      ),
    ).not.toThrow()
  })

  describe('selectable nodes', () => {
    it('leaves nodes as plain marks when nothing handles a selection', () => {
      renderMap()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('makes each node a named button when onSelectNode is given', () => {
      renderMap({ onSelectNode: () => {} })
      expect(screen.getByRole('button', { name: 'app - view module' })).toBeInTheDocument()
    })

    it('calls back with the node id on click', () => {
      const onSelectNode = vi.fn()
      renderMap({ onSelectNode })

      fireEvent.click(screen.getByRole('button', { name: 'cart - view module' }))

      expect(onSelectNode).toHaveBeenCalledWith('cart')
    })

    it.each(['Enter', ' '])('activates on %s', (key) => {
      const onSelectNode = vi.fn()
      renderMap({ onSelectNode })

      fireEvent.keyDown(screen.getByRole('button', { name: 'app - view module' }), { key })

      expect(onSelectNode).toHaveBeenCalledWith('app')
    })

    it('marks the selected node', () => {
      const { container } = renderMap({ onSelectNode: () => {}, selectedNode: 'cart' })
      expect(container.querySelector('.mc-node.selected')).toHaveAttribute('aria-label', 'cart - view module')
    })
  })

  describe('truncated (too-large) graphs', () => {
    it('says how many modules are hidden and offers a list-view link', () => {
      const onViewAsList = vi.fn()
      renderMap({ totalCount: 60, onViewAsList })

      const link = screen.getByRole('button', { name: /56 more modules, view as list/i })
      fireEvent.click(link)
      expect(onViewAsList).toHaveBeenCalled()
    })

    it('says nothing extra when nothing was truncated', () => {
      renderMap({ totalCount: NODES.length })
      expect(screen.queryByText(/more modules/i)).not.toBeInTheDocument()
    })
  })
})
