import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HealthDial from '../../../src/components/mission-control/HealthDial.jsx'

describe('HealthDial', () => {
  it('shows the "CODE HEALTH" label', () => {
    render(<HealthDial score={78} />)
    expect(screen.getByText('CODE HEALTH')).toBeInTheDocument()
  })

  it('explains the scoring formula on hover, worded exactly as the approved copy', () => {
    render(<HealthDial score={78} />)
    expect(
      screen.getByText(
        'A single score built from bugs, vulnerabilities, code smells, duplication and test coverage across the repo. Calculation: start at 100, subtract 6 points per critical finding and 2 per caution finding, subtract 1 point per percentage of duplication above 5%, and subtract up to 15 points for coverage under 70%.',
      ),
    ).toBeInTheDocument()
  })

  it('draws the progress ring when a score is available', () => {
    const { container } = render(<HealthDial score={78} />)
    // The gauge SVG (not the Info icon's own tiny svg, which is also a
    // circle): the track ring is always drawn, a real score adds a second.
    expect(container.querySelector('svg[viewBox="0 0 180 180"]').querySelectorAll('circle')).toHaveLength(2)
  })

  describe('unavailable state', () => {
    it('shows N/A instead of a number when the score is null', () => {
      render(<HealthDial score={null} />)
      expect(screen.getByText('N/A')).toBeInTheDocument()
    })

    it('shows N/A when the score is undefined too', () => {
      render(<HealthDial />)
      expect(screen.getByText('N/A')).toBeInTheDocument()
    })

    it('draws no progress ring - only the track - when unavailable', () => {
      const { container } = render(<HealthDial score={null} />)
      expect(container.querySelector('svg[viewBox="0 0 180 180"]').querySelectorAll('circle')).toHaveLength(1)
    })

    it('explains why, rather than repeating the scoring formula', () => {
      render(<HealthDial score={null} />)
      expect(screen.getByText(/predates that capture/i)).toBeInTheDocument()
    })
  })

  it('positions the tip below the label, as the mockup does', () => {
    render(<HealthDial score={78} />)
    expect(screen.getByText(/start at 100/i)).toHaveClass('below')
  })
})
