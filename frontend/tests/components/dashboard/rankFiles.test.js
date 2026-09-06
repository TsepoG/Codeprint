import { describe, expect, it } from 'vitest'
import { rankFiles } from '../../../src/components/dashboard/rankFiles.js'

describe('rankFiles', () => {
  it('ranks by severity first (high, then medium, then low)', () => {
    const files = [
      { name: 'low.js', complexity: 1, severity: 'low' },
      { name: 'high.js', complexity: 1, severity: 'high' },
      { name: 'medium.js', complexity: 1, severity: 'medium' },
    ]
    expect(rankFiles(files).map((f) => f.name)).toEqual(['high.js', 'medium.js', 'low.js'])
  })

  it('breaks ties within the same severity by complexity, descending', () => {
    const files = [
      { name: 'low-complexity.js', complexity: 3, severity: 'high' },
      { name: 'high-complexity.js', complexity: 9, severity: 'high' },
    ]
    expect(rankFiles(files).map((f) => f.name)).toEqual(['high-complexity.js', 'low-complexity.js'])
  })

  it('does not mutate the array passed in', () => {
    const files = [
      { name: 'a.js', complexity: 1, severity: 'low' },
      { name: 'b.js', complexity: 1, severity: 'high' },
    ]
    const original = [...files]
    rankFiles(files)
    expect(files).toEqual(original)
  })

  it('returns a new array even when already sorted', () => {
    const files = [{ name: 'a.js', complexity: 1, severity: 'low' }]
    expect(rankFiles(files)).not.toBe(files)
  })
})
