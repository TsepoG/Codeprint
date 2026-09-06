import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OverviewTab from '../../../src/components/dashboard/OverviewTab.jsx'

const BASE = {
  metrics: { bugs: 2, vulnerabilities: 1, codeSmells: 5, duplicationPct: 12.5 },
  files: [],
  dependencyGraph: { nodes: [], edges: [] },
  warnings: [],
}

/** @param {string[]} severities */
function withInfra(...severities) {
  return {
    ...BASE,
    infrastructure: {
      detected: true,
      findings: severities.map((severity) => ({ severity, resource: 'r', ruleId: 'x', source: 'checkov' })),
      graph: { nodes: [], edges: [] },
    },
  }
}

/** @param {string} category @param {string[]} severities */
function withFindings(category, ...severities) {
  return {
    ...BASE,
    findings: severities.map((severity, i) => ({ id: `${category}-${i}`, category, severity, source: 'eslint' })),
  }
}

function chip(label) {
  return screen.getByText(label).closest('.mc-chip')
}

describe('OverviewTab health dial', () => {
  it('shows the real score when one is available', () => {
    render(<OverviewTab result={{ ...BASE, healthScore: 78 }} />)
    expect(screen.queryByText('N/A')).not.toBeInTheDocument()
  })

  it('shows a neutral "not available" state rather than 0, for a scan predating health-score capture', () => {
    render(<OverviewTab result={{ ...BASE, healthScore: null }} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('treats a missing healthScore field the same as null', () => {
    render(<OverviewTab result={BASE} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('explains itself differently when unavailable than when it has a real score', () => {
    const { rerender } = render(<OverviewTab result={{ ...BASE, healthScore: 78 }} />)
    expect(screen.getByText(/start at 100/i)).toBeInTheDocument()

    rerender(<OverviewTab result={{ ...BASE, healthScore: null }} />)
    expect(screen.getByText(/predates that capture/i)).toBeInTheDocument()
    expect(screen.queryByText(/start at 100/i)).not.toBeInTheDocument()
  })
})

describe('OverviewTab metric chips', () => {
  it('shows every core metric', () => {
    render(<OverviewTab result={BASE} />)
    expect(chip('Bugs')).toHaveTextContent('2')
    expect(chip('Vulnerabilities')).toHaveTextContent('1')
    expect(chip('Code smells')).toHaveTextContent('5')
    expect(chip('Duplication')).toHaveTextContent('12.5%')
  })

  describe('infra chip', () => {
    it('is absent for a repo with no Terraform', () => {
      render(<OverviewTab result={{ ...BASE, infrastructure: { detected: false, findings: [], graph: { nodes: [], edges: [] } } }} />)
      expect(screen.queryByText('Infra findings')).not.toBeInTheDocument()
    })

    it('is absent for a scan recorded before infrastructure scanning existed', () => {
      render(<OverviewTab result={BASE} />)
      expect(screen.queryByText('Infra findings')).not.toBeInTheDocument()
    })

    it('shows the finding count for a Terraform repo', () => {
      render(<OverviewTab result={withInfra('low', 'low', 'medium')} />)
      expect(chip('Infra findings')).toHaveTextContent('3')
    })

    it('shows a zero count when Terraform is clean', () => {
      render(<OverviewTab result={withInfra()} />)
      expect(chip('Infra findings')).toHaveTextContent('0')
    })
  })

  describe('severity dot', () => {
    /** @param {string} label */
    function dotColor(label) {
      return chip(label).querySelector('.mc-dot').style.background
    }

    it('is nominal (mint) when the category has no findings at all', () => {
      render(<OverviewTab result={BASE} />)
      expect(dotColor('Bugs')).toBe('rgb(79, 232, 160)')
    })

    it('turns critical (red) when the category has a high-severity finding', () => {
      render(<OverviewTab result={withFindings('bug', 'low', 'high')} />)
      expect(dotColor('Bugs')).toBe('rgb(255, 92, 92)')
    })

    it('turns caution (amber) when the worst in the category is medium', () => {
      render(<OverviewTab result={withFindings('codeSmell', 'medium', 'low')} />)
      expect(dotColor('Code smells')).toBe('rgb(255, 184, 77)')
    })

    it('only colors the category the findings actually belong to', () => {
      render(<OverviewTab result={withFindings('bug', 'high')} />)
      expect(dotColor('Bugs')).toBe('rgb(255, 92, 92)')
      expect(dotColor('Vulnerabilities')).toBe('rgb(79, 232, 160)')
    })
  })

  describe('as controls', () => {
    it('leaves the chips as plain blocks when nothing handles a selection', () => {
      render(<OverviewTab result={BASE} />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it.each([
      ['Bugs', 'bug'],
      ['Vulnerabilities', 'vulnerability'],
      ['Code smells', 'codeSmell'],
      ['Duplication', 'duplication'],
    ])('opens the %s chip onto the %s category', (label, category) => {
      const onSelectCategory = vi.fn()
      render(<OverviewTab result={BASE} onSelectCategory={onSelectCategory} />)

      fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label} - view findings`, 'i') }))

      expect(onSelectCategory).toHaveBeenCalledWith(category)
    })

    it('opens the infra chip onto the infra category', () => {
      const onSelectCategory = vi.fn()
      render(<OverviewTab result={withInfra('high')} onSelectCategory={onSelectCategory} />)

      fireEvent.click(screen.getByRole('button', { name: /infra findings - view findings/i }))

      expect(onSelectCategory).toHaveBeenCalledWith('infra')
    })

    it('keeps a zero-count chip clickable, since an empty category still has a story', () => {
      const onSelectCategory = vi.fn()
      const clean = { ...BASE, metrics: { bugs: 0, vulnerabilities: 0, codeSmells: 0, duplicationPct: 0 } }
      render(<OverviewTab result={clean} onSelectCategory={onSelectCategory} />)

      fireEvent.click(screen.getByRole('button', { name: /bugs - view findings/i }))

      expect(onSelectCategory).toHaveBeenCalledWith('bug')
    })
  })
})

describe('OverviewTab top hotspot targets', () => {
  const FILES = [
    { name: 'a.js', complexity: 3, coverage: null, severity: 'low' },
    { name: 'b.js', complexity: 20, coverage: 41, severity: 'high' },
    { name: 'c.js', complexity: 12, coverage: 60, severity: 'medium' },
  ]

  it('says so when there are no hotspots', () => {
    render(<OverviewTab result={BASE} />)
    expect(screen.getByText(/no hotspots/i)).toBeInTheDocument()
  })

  it('ranks files worst-first, same as the Hotspots tab', () => {
    render(<OverviewTab result={{ ...BASE, files: FILES }} />)

    const names = screen.getAllByRole('cell').filter((_, i) => i % 4 === 0).map((cell) => cell.textContent)
    expect(names).toEqual(['b.js', 'c.js', 'a.js'])
  })

  it('caps the table at the top 5 files', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `f${i}.js`, complexity: i, coverage: null, severity: 'low' }))
    render(<OverviewTab result={{ ...BASE, files: many }} />)

    expect(screen.getAllByRole('row')).toHaveLength(6) // 5 files + header
  })

  it('shows a coverage percentage when one is recorded, and a dash otherwise', () => {
    render(<OverviewTab result={{ ...BASE, files: FILES }} />)
    const table = screen.getByRole('table')

    const aRow = within(table).getByText('a.js').closest('tr')
    expect(within(aRow).getByText('—')).toBeInTheDocument()

    const bRow = within(table).getByText('b.js').closest('tr')
    expect(within(bRow).getByText('41%')).toBeInTheDocument()
  })

  it('shows each row\'s status as a SevBadge, with its explanatory tooltip', () => {
    render(<OverviewTab result={{ ...BASE, files: FILES }} />)

    const bRow = within(screen.getByRole('table')).getByText('b.js').closest('tr')
    expect(within(bRow).getByText('CRITICAL')).toBeInTheDocument()
    expect(within(bRow).getByText(/fix before adding more code here/i)).toBeInTheDocument()
  })

  it('does not make hotspot rows clickable here - that is the Hotspots tab\'s job', () => {
    render(<OverviewTab result={{ ...BASE, files: FILES }} />)
    expect(screen.queryByRole('button', { name: 'b.js' })).not.toBeInTheDocument()
  })
})

describe('OverviewTab hero status', () => {
  const FILES = [
    { name: 'a.js', complexity: 3, coverage: null, severity: 'low' },
    { name: 'b.js', complexity: 20, coverage: 41, severity: 'high' },
    { name: 'c.js', complexity: 12, coverage: 60, severity: 'medium' },
    { name: 'd.js', complexity: 5, coverage: null, severity: 'low' },
  ]

  it('reads healthy in mint at 75 or above', () => {
    render(<OverviewTab result={{ ...BASE, healthScore: 75 }} />)
    expect(screen.getByText(/nominal — healthy/i)).toHaveStyle({ color: 'var(--mint)' })
  })

  it('reads caution in amber between 50 and 74', () => {
    render(<OverviewTab result={{ ...BASE, healthScore: 50 }} />)
    expect(screen.getByText(/caution — attention required/i)).toHaveStyle({ color: 'var(--amber)' })
  })

  it('reads critical in red below 50', () => {
    render(<OverviewTab result={{ ...BASE, healthScore: 49 }} />)
    expect(screen.getByText(/critical — immediate action required/i)).toHaveStyle({ color: 'var(--red)' })
  })

  it('reads as unavailable when there is no score to grade', () => {
    render(<OverviewTab result={{ ...BASE, healthScore: null }} />)
    expect(screen.getByText(/health score unavailable/i)).toBeInTheDocument()
  })

  it('summarizes how many files were flagged, and how many critically', () => {
    render(<OverviewTab result={{ ...BASE, files: FILES }} />)
    expect(screen.getByText('4 files flagged this scan, 1 at critical severity.')).toBeInTheDocument()
  })

  it('says so when nothing was flagged', () => {
    render(<OverviewTab result={BASE} />)
    expect(screen.getByText('No files were flagged this scan.')).toBeInTheDocument()
  })

  it('lists only the top 3 hotspots, worst first, same ranking as the table', () => {
    render(<OverviewTab result={{ ...BASE, files: FILES }} />)

    const items = document.querySelectorAll('.mc-hero-item')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('b.js')
    expect(items[1]).toHaveTextContent('c.js')
    expect(items[2]).toHaveTextContent('d.js') // both 'low', but higher complexity (5 > 3) than a.js
  })
})
