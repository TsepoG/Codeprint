import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatTile, DuplicationMeter, SeverityBadge, FilesTable, DependencyGraph } from '../../../src/components/dashboard/shared.jsx'

describe('StatTile', () => {
  it('renders a label and value', () => {
    render(<StatTile label="Bugs" value="3" />)
    expect(screen.getByText('Bugs')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})

describe('DuplicationMeter', () => {
  it('is "good" at and below 10%', () => {
    render(<DuplicationMeter pct={10} />)
    expect(screen.getByRole('img', { name: '10.0% duplicated lines' }).firstChild).toHaveClass('meter-fill', 'good')
  })

  it('is "warning" above 10% and at/below 25%', () => {
    render(<DuplicationMeter pct={25} />)
    expect(screen.getByRole('img', { name: '25.0% duplicated lines' }).firstChild).toHaveClass('meter-fill', 'warning')
  })

  it('is "critical" above 25%', () => {
    render(<DuplicationMeter pct={25.1} />)
    expect(screen.getByRole('img', { name: '25.1% duplicated lines' }).firstChild).toHaveClass('meter-fill', 'critical')
  })

  it('clamps out-of-range values into 0-100', () => {
    render(<DuplicationMeter pct={-5} />)
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })

  it('treats a non-numeric pct as 0', () => {
    render(<DuplicationMeter pct={undefined} />)
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })
})

describe('SeverityBadge', () => {
  it('renders the matching label for a known severity', () => {
    render(<SeverityBadge severity="high" />)
    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('falls back to "low" styling for an unrecognized severity', () => {
    render(<SeverityBadge severity="unknown-value" />)
    expect(screen.getByText('Low')).toBeInTheDocument()
  })

  it('uses a custom label override when given, without changing the dot styling', () => {
    render(<SeverityBadge severity="high" label="Failed" />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.queryByText('High')).not.toBeInTheDocument()
  })
})

describe('FilesTable', () => {
  it('shows the given empty message when there are no files', () => {
    render(<FilesTable files={[]} emptyMessage="Nothing to see here." />)
    expect(screen.getByText('Nothing to see here.')).toBeInTheDocument()
  })

  it('renders one row per file, with "—" for missing coverage', () => {
    const files = [
      { name: 'a.js', complexity: 4, coverage: null, severity: 'low' },
      { name: 'b.js', complexity: 8, coverage: 87, severity: 'high' },
    ]
    render(<FilesTable files={files} emptyMessage="unused" />)

    expect(screen.getByText('a.js')).toBeInTheDocument()
    expect(screen.getByText('b.js')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('87%')).toBeInTheDocument()
  })
})

describe('DependencyGraph', () => {
  it('shows an empty message when there are no nodes', () => {
    render(<DependencyGraph nodes={[]} edges={[]} />)
    expect(screen.getByText(/no dependency graph available/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows counts instead of a diagram when there are too many nodes to render clearly', () => {
    const nodes = Array.from({ length: 61 }, (_, i) => ({ id: `file-${i}.js` }))
    render(<DependencyGraph nodes={nodes} edges={[]} />)

    expect(screen.getByText(/61 files and 0 imports/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders an svg graph for a normal-sized node set, labeling each node', () => {
    const nodes = [{ id: 'a.js' }, { id: 'b.js' }]
    const edges = [{ from: 'a.js', to: 'b.js' }]
    render(<DependencyGraph nodes={nodes} edges={edges} />)

    expect(screen.getByRole('img', { name: /dependency graph with 2 files and 1 imports/i })).toBeInTheDocument()
    expect(screen.getByText('a.js')).toBeInTheDocument()
    expect(screen.getByText('b.js')).toBeInTheDocument()
  })

  it('silently skips an edge that references a node not in the list, rather than crashing', () => {
    const nodes = [{ id: 'a.js' }]
    const edges = [{ from: 'a.js', to: 'does-not-exist.js' }]

    expect(() => render(<DependencyGraph nodes={nodes} edges={edges} />)).not.toThrow()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})
