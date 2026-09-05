import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HotspotsTab from '../../../src/components/dashboard/HotspotsTab.jsx'

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
})
