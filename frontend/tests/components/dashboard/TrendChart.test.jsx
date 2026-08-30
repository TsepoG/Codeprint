import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TrendChart from '../../../src/components/dashboard/TrendChart.jsx'

describe('TrendChart', () => {
  it('shows a "not enough data" note instead of a chart when there are fewer than 2 points', () => {
    render(<TrendChart title="AVG COMPLEXITY" unit="" points={[]} color="red" />)
    expect(screen.getByText('AVG COMPLEXITY')).toBeInTheDocument()
    expect(screen.getByText(/not enough scans yet for a trend/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('still shows the "not enough data" note with exactly one point', () => {
    render(<TrendChart title="AVG COMPLEXITY" unit="" points={[{ value: 5 }]} color="red" />)
    expect(screen.getByText(/not enough scans yet for a trend/i)).toBeInTheDocument()
  })

  it('renders a chart with a from/to aria-label and start/end value labels for 2+ points', () => {
    render(
      <TrendChart
        title="DUPLICATION"
        unit="%"
        points={[{ value: 10 }, { value: 25 }, { value: 12.3 }]}
        color="var(--bp-accent)"
      />,
    )

    const chart = screen.getByRole('img', { name: /DUPLICATION across the last 3 scans: from 10\.0% to 12\.3%/ })
    expect(chart).toBeInTheDocument()
    expect(screen.getByText('10.0%')).toBeInTheDocument() // first value label
    expect(screen.getByText('12.3%')).toBeInTheDocument() // last value label (also the "current" one)
  })

  it('does not crash and still renders a flat line when every point has the same value', () => {
    render(<TrendChart title="AVG COMPLEXITY" unit="" points={[{ value: 4 }, { value: 4 }]} color="cyan" />)

    expect(
      screen.getByRole('img', { name: /AVG COMPLEXITY across the last 2 scans: from 4\.0 to 4\.0/ }),
    ).toBeInTheDocument()
  })
})
