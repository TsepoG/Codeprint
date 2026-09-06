import { describe, expect, it } from 'vitest'
import { duplicationPctByFile } from '../../../src/components/dashboard/fileDuplication.js'

const FILES = [
  { name: 'src/a.js', loc: 100 },
  { name: 'src/b.js', loc: 50 },
  { name: 'src/c.js', loc: 0 },
]

describe('duplicationPctByFile', () => {
  it('is empty when there are no duplication findings', () => {
    expect(duplicationPctByFile([], FILES).size).toBe(0)
  })

  it('ignores findings of other categories', () => {
    const findings = [{ category: 'bug', file: 'src/a.js', line: 1, endLine: 100 }]
    expect(duplicationPctByFile(findings, FILES).size).toBe(0)
  })

  it('counts a duplication finding at its own file', () => {
    const findings = [{ category: 'duplication', file: 'src/a.js', line: 1, endLine: 20 }]
    expect(duplicationPctByFile(findings, FILES).get('src/a.js')).toBe(20)
  })

  it("also counts the pair's other side, at its own loc - not doubled onto the first file", () => {
    const findings = [
      { category: 'duplication', file: 'src/a.js', line: 1, endLine: 20, duplicateOf: { file: 'src/b.js', line: 1, endLine: 20 } },
    ]
    const result = duplicationPctByFile(findings, FILES)
    expect(result.get('src/a.js')).toBe(20) // 20/100
    expect(result.get('src/b.js')).toBe(40) // 20/50
  })

  it('sums multiple duplication findings against the same file', () => {
    const findings = [
      { category: 'duplication', file: 'src/a.js', line: 1, endLine: 10 },
      { category: 'duplication', file: 'src/a.js', line: 20, endLine: 29 },
    ]
    expect(duplicationPctByFile(findings, FILES).get('src/a.js')).toBe(20) // (10+10)/100
  })

  it('clamps at 100% when duplicated spans overlap or exceed the file', () => {
    const findings = [{ category: 'duplication', file: 'src/a.js', line: 1, endLine: 500 }]
    expect(duplicationPctByFile(findings, FILES).get('src/a.js')).toBe(100)
  })

  it('omits a file with no known (or zero) loc rather than dividing by zero', () => {
    const findings = [{ category: 'duplication', file: 'src/c.js', line: 1, endLine: 10 }]
    expect(duplicationPctByFile(findings, FILES).has('src/c.js')).toBe(false)
  })

  it('ignores a finding missing line info', () => {
    const findings = [{ category: 'duplication', file: 'src/a.js', line: null, endLine: null }]
    expect(duplicationPctByFile(findings, FILES).size).toBe(0)
  })
})
