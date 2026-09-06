import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SeverityBadge, FilesTable } from '../../../src/components/dashboard/shared.jsx'

describe('SeverityBadge', () => {
  it('renders the matching label for a known severity', () => {
    render(<SeverityBadge severity="high" />)
    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('falls back to "low" styling for an unrecognized severity', () => {
    render(<SeverityBadge severity="unknown-value" />)
    expect(screen.getByText('Low')).toBeInTheDocument()
  })

  it('uses a custom label override when given, without changing the dot styling', () => {
    render(<SeverityBadge severity="high" label="Failed" />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.queryByText('High')).not.toBeInTheDocument()
  })
})

describe('FilesTable', () => {
  it('shows the given empty message when there are no files', () => {
    render(<FilesTable files={[]} emptyMessage="Nothing to see here." />)
    expect(screen.getByText('Nothing to see here.')).toBeInTheDocument()
  })

  it('renders one row per file, with "—" for missing coverage', () => {
    const files = [
      { name: 'a.js', complexity: 4, coverage: null, severity: 'low' },
      { name: 'b.js', complexity: 8, coverage: 87, severity: 'high' },
    ]
    render(<FilesTable files={files} emptyMessage="unused" />)

    expect(screen.getByText('a.js')).toBeInTheDocument()
    expect(screen.getByText('b.js')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('87%')).toBeInTheDocument()
  })
})
