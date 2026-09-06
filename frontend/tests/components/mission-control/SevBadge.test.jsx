import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SevBadge from '../../../src/components/mission-control/SevBadge.jsx'
import { SEV_LABEL, SEV_DESC } from '../../../src/components/mission-control/severity.js'

describe('SevBadge', () => {
  it.each(['high', 'medium', 'low'])('shows the label for %s severity', (severity) => {
    render(<SevBadge severity={severity} />)
    expect(screen.getByText(SEV_LABEL[severity])).toBeInTheDocument()
  })

  it.each(['high', 'medium', 'low'])('explains what %s means, in the hover tip', (severity) => {
    render(<SevBadge severity={severity} />)
    expect(screen.getByText(SEV_DESC[severity])).toBeInTheDocument()
  })

  it('renders a severity dot', () => {
    const { container } = render(<SevBadge severity="low" />)
    expect(container.querySelector('.mc-dot')).toBeInTheDocument()
  })

  it('shows a custom label instead of the severity word, when given one', () => {
    render(<SevBadge severity="low" label="Complete" />)
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.queryByText(SEV_LABEL.low)).not.toBeInTheDocument()
    // The tooltip still explains the underlying severity, not the label.
    expect(screen.getByText(SEV_DESC.low)).toBeInTheDocument()
  })

  it('is built on the shared tooltip primitive', () => {
    const { container } = render(<SevBadge severity="high" />)
    const wrap = container.querySelector('.mc-tip-wrap')
    expect(wrap).toHaveClass('mc-sev')
    expect(container.querySelector('.mc-tip')).toHaveClass('above')
  })
})
