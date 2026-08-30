import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
