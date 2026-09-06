import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HotspotScatter from '../../../src/components/mission-control/HotspotScatter.jsx'

const FILES = [
  { name: 'src/checkout/Checkout.jsx', complexity: 24, coverage: 41, loc: 412, severity: 'high' },
  { name: 'src/utils/validators.js', complexity: 9, coverage: null, loc: 96, severity: 'low' },
]

describe('HotspotScatter', () => {
  it('shows an empty message when there are no files', () => {
    render(<HotspotScatter files={[]} />)
    expect(screen.getByText(/no hotspots/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders the plot as a labelled figure with a point per file', () => {
    const { container } = render(<HotspotScatter files={FILES} />)
    expect(screen.getByRole('img', { name: /complexity versus test coverage plot of 2 files/i })).toBeInTheDocument()
    // Two data points plus the two size-legend swatches.
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2)
  })

  it('draws the risk-zone callout and both axis titles', () => {
    render(<HotspotScatter files={FILES} />)
    expect(screen.getByText(/harder to change, less tested/i)).toBeInTheDocument()
    expect(screen.getByText(/complexity.*harder to follow/i)).toBeInTheDocument()
    expect(screen.getByText(/test coverage.*safer to change/i)).toBeInTheDocument()
  })

  it('shows the size and severity legend', () => {
    render(<HotspotScatter files={FILES} />)
    expect(screen.getByText(/point size = file length/i)).toBeInTheDocument()
    expect(screen.getByText('Nominal')).toBeInTheDocument()
    expect(screen.getByText('Caution')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })

  it('marks a file with no measured coverage in the N/A lane instead of at 0%', () => {
    const { container } = render(<HotspotScatter files={FILES} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()

    const titles = [...container.querySelectorAll('circle > title')].map((t) => t.textContent)
    expect(titles.some((t) => /coverage not measured/i.test(t))).toBe(true)
    expect(titles.some((t) => /41% coverage/i.test(t))).toBe(true)
  })

  describe('selectable points', () => {
    it('leaves points inert when nothing handles a selection', () => {
      render(<HotspotScatter files={FILES} />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('makes each point a named button when onSelectFile is given', () => {
      render(<HotspotScatter files={FILES} onSelectFile={() => {}} />)
      expect(screen.getByRole('button', { name: /src\/checkout\/Checkout\.jsx - complexity 24, 41% coverage/i })).toBeInTheDocument()
    })

    it('calls back with the file name on click', () => {
      const onSelectFile = vi.fn()
      render(<HotspotScatter files={FILES} onSelectFile={onSelectFile} />)

      fireEvent.click(screen.getByRole('button', { name: /Checkout\.jsx/i }))

      expect(onSelectFile).toHaveBeenCalledWith('src/checkout/Checkout.jsx')
    })

    it.each(['Enter', ' '])('activates on %s', (key) => {
      const onSelectFile = vi.fn()
      render(<HotspotScatter files={FILES} onSelectFile={onSelectFile} />)

      fireEvent.keyDown(screen.getByRole('button', { name: /Checkout\.jsx/i }), { key })

      expect(onSelectFile).toHaveBeenCalledWith('src/checkout/Checkout.jsx')
    })
  })
})
