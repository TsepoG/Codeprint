import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HudFrame from '../../../src/components/mission-control/HudFrame.jsx'

describe('HudFrame', () => {
  it('renders its children inside the frame', () => {
    render(<HudFrame><p>content</p></HudFrame>)
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('renders all four corner brackets', () => {
    const { container } = render(<HudFrame>x</HudFrame>)

    expect(container.querySelectorAll('.mc-corner')).toHaveLength(4)
    expect(container.querySelector('.mc-corner.tl')).toBeInTheDocument()
    expect(container.querySelector('.mc-corner.tr')).toBeInTheDocument()
    expect(container.querySelector('.mc-corner.bl')).toBeInTheDocument()
    expect(container.querySelector('.mc-corner.br')).toBeInTheDocument()
  })

  it('forwards a style prop onto the frame itself, not a corner', () => {
    const { container } = render(<HudFrame style={{ marginBottom: 18 }}>x</HudFrame>)
    expect(container.querySelector('.mc-frame')).toHaveStyle({ marginBottom: '18px' })
  })
})
