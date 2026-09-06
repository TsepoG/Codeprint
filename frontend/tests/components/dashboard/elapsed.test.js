import { describe, expect, it } from 'vitest'
import { formatElapsed } from '../../../src/components/dashboard/elapsed.js'

describe('formatElapsed', () => {
  it('formats a sub-minute duration', () => {
    expect(formatElapsed(7000)).toBe('T+00:00:07')
  })

  it('formats minutes and seconds', () => {
    expect(formatElapsed(4 * 60000 + 12000)).toBe('T+00:04:12')
  })

  it('formats hours', () => {
    expect(formatElapsed(2 * 3600000 + 5 * 60000 + 9000)).toBe('T+02:05:09')
  })

  it('formats exactly zero', () => {
    expect(formatElapsed(0)).toBe('T+00:00:00')
  })

  it('floors sub-second remainders rather than rounding', () => {
    expect(formatElapsed(1999)).toBe('T+00:00:01')
  })

  it.each([null, undefined, NaN, -5, 'nope'])('returns a dash for %p', (value) => {
    expect(formatElapsed(value)).toBe('—')
  })
})
