import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Tooltip from '../../../src/components/mission-control/Tooltip.jsx'

describe('Tooltip', () => {
  it('renders the trigger and the tip content', () => {
    render(<Tooltip tip="explains itself">trigger</Tooltip>)

    expect(screen.getByText('trigger')).toBeInTheDocument()
    expect(screen.getByText('explains itself')).toBeInTheDocument()
  })

  it('defaults to positioning the tip below the trigger', () => {
    const { container } = render(<Tooltip tip="x">trigger</Tooltip>)
    expect(container.querySelector('.mc-tip')).toHaveClass('below')
  })

  it('positions the tip above the trigger when asked', () => {
    const { container } = render(<Tooltip tip="x" position="above">trigger</Tooltip>)
    expect(container.querySelector('.mc-tip')).toHaveClass('above')
  })

  it('merges an extra class onto the wrapper, so a trigger can be its own hover target', () => {
    const { container } = render(<Tooltip tip="x" className="mc-sev">trigger</Tooltip>)
    const wrap = container.querySelector('.mc-tip-wrap')
    expect(wrap).toHaveClass('mc-sev')
  })

  it('works with no extra class at all', () => {
    const { container } = render(<Tooltip tip="x">trigger</Tooltip>)
    expect(container.querySelector('.mc-tip-wrap').className.trim()).toBe('mc-tip-wrap')
  })

  it('forwards a style prop onto the wrapper', () => {
    const { container } = render(<Tooltip tip="x" style={{ color: 'red' }}>trigger</Tooltip>)
    expect(container.querySelector('.mc-tip-wrap')).toHaveStyle({ color: 'rgb(255, 0, 0)' })
  })
})
