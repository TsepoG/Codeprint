import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DependencyListView from '../../../src/components/mission-control/DependencyListView.jsx'

const NODES = [{ id: 'b.js' }, { id: 'a.js' }]

/** @param {object} [props] */
function renderList(props = {}) {
  return render(
    <DependencyListView
      nodes={NODES}
      severityOf={() => 'low'}
      dependentsOf={() => []}
      dependenciesOf={() => []}
      {...props}
    />,
  )
}

describe('DependencyListView', () => {
  it('lists every node, sorted alphabetically', () => {
    renderList()
    const cells = screen.getAllByRole('cell').filter((_, i) => i % 4 === 0).map((cell) => cell.textContent)
    expect(cells).toEqual(['a.js', 'b.js'])
  })

  it('shows dependent and dependency counts', () => {
    renderList({ dependentsOf: (id) => (id === 'a.js' ? ['b.js'] : []), dependenciesOf: () => [] })
    const row = screen.getByText('a.js').closest('tr')
    expect(row).toHaveTextContent('1')
  })

  it('shows a severity badge per row', () => {
    renderList({ severityOf: (id) => (id === 'a.js' ? 'high' : 'low') })
    const row = screen.getByText('a.js').closest('tr')
    expect(row).toHaveTextContent('CRITICAL')
  })

  it('leaves rows as plain text when nothing handles a selection', () => {
    renderList()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('makes each module name a button when onSelectNode is given', () => {
    const onSelectNode = vi.fn()
    renderList({ onSelectNode })

    fireEvent.click(screen.getByRole('button', { name: 'a.js' }))

    expect(onSelectNode).toHaveBeenCalledWith('a.js')
  })
})
