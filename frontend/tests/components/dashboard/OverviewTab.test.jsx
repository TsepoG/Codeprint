import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OverviewTab from '../../../src/components/dashboard/OverviewTab.jsx'

const BASE = {
  metrics: { bugs: 2, vulnerabilities: 1, codeSmells: 5, duplicationPct: 12.5 },
  files: [],
  dependencyGraph: { nodes: [], edges: [] },
  warnings: [],
}

/** @param {string} severity */
function withFindings(...severities) {
  return {
    ...BASE,
    infrastructure: {
      detected: true,
      findings: severities.map((severity) => ({ severity, resource: 'r', ruleId: 'x', source: 'checkov' })),
      graph: { nodes: [], edges: [] },
    },
  }
}

/** The tile is the element carrying the severity border class. */
function infraTile() {
  return screen.getByText('Infra findings').closest('.stat-tile')
}

describe('OverviewTab infra metric', () => {
  it('is absent for a repo with no Terraform', () => {
    render(<OverviewTab result={{ ...BASE, infrastructure: { detected: false, findings: [], graph: { nodes: [], edges: [] } } }} />)
    expect(screen.queryByText('Infra findings')).not.toBeInTheDocument()
  })

  it('is absent for a scan recorded before infrastructure scanning existed', () => {
    render(<OverviewTab result={BASE} />)
    expect(screen.queryByText('Infra findings')).not.toBeInTheDocument()
  })

  it('shows the finding count for a Terraform repo', () => {
    render(<OverviewTab result={withFindings('low', 'low', 'medium')} />)
    expect(infraTile()).toHaveTextContent('3')
  })

  it('borders the tile critical when anything is high severity', () => {
    render(<OverviewTab result={withFindings('low', 'high', 'medium')} />)
    expect(infraTile()).toHaveClass('stat-tile-critical')
  })

  it('borders the tile warning when the worst is medium', () => {
    render(<OverviewTab result={withFindings('low', 'medium')} />)
    expect(infraTile()).toHaveClass('stat-tile-warning')
  })

  it('borders the tile good when everything is low severity', () => {
    render(<OverviewTab result={withFindings('low', 'low')} />)
    expect(infraTile()).toHaveClass('stat-tile-good')
  })

  it('shows a zero count, styled as good, when Terraform is clean', () => {
    render(<OverviewTab result={withFindings()} />)
    expect(infraTile()).toHaveTextContent('0')
    expect(infraTile()).toHaveClass('stat-tile-good')
  })

  it('leaves the other tiles unstyled by severity', () => {
    render(<OverviewTab result={withFindings('high')} />)
    const bugsTile = screen.getByText('Bugs').closest('.stat-tile')
    expect(bugsTile.className).not.toMatch(/stat-tile-(good|warning|critical)/)
  })
})

describe('OverviewTab metric tiles as controls', () => {
  it('leaves the tiles as plain blocks when nothing handles a selection', () => {
    render(<OverviewTab result={BASE} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each([
    ['Bugs', 'bug'],
    ['Vulnerabilities', 'vulnerability'],
    ['Code smells', 'codeSmell'],
    ['Duplication', 'duplication'],
  ])('opens the %s tile onto the %s category', (label, category) => {
    const onSelectCategory = vi.fn()
    render(<OverviewTab result={BASE} onSelectCategory={onSelectCategory} />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label} - view findings`, 'i') }))

    expect(onSelectCategory).toHaveBeenCalledWith(category)
  })

  it('opens the infra tile onto the infra category', () => {
    const onSelectCategory = vi.fn()
    render(<OverviewTab result={withFindings('high')} onSelectCategory={onSelectCategory} />)

    fireEvent.click(screen.getByRole('button', { name: /infra findings - view findings/i }))

    expect(onSelectCategory).toHaveBeenCalledWith('infra')
  })

  it('names each tile so the control says what it opens, not just its number', () => {
    render(<OverviewTab result={BASE} onSelectCategory={vi.fn()} />)
    // "Bugs 3" alone gives no hint the tile does anything.
    expect(screen.getByRole('button', { name: 'Bugs - view findings' })).toBeInTheDocument()
  })

  it('keeps a zero-count tile clickable, since an empty category still has a story', () => {
    const onSelectCategory = vi.fn()
    const clean = { ...BASE, metrics: { bugs: 0, vulnerabilities: 0, codeSmells: 0, duplicationPct: 0 } }
    render(<OverviewTab result={clean} onSelectCategory={onSelectCategory} />)

    fireEvent.click(screen.getByRole('button', { name: /bugs - view findings/i }))

    expect(onSelectCategory).toHaveBeenCalledWith('bug')
  })
})
