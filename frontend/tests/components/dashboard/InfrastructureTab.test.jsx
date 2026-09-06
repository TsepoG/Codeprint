import { render, screen, within, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import InfrastructureTab from '../../../src/components/dashboard/InfrastructureTab.jsx'

const FINDINGS = [
  {
    resource: 'aws_s3_bucket.assets',
    file: 'infra/s3.tf',
    line: 12,
    ruleId: 'CKV_AWS_18',
    severity: 'medium',
    description: 'Ensure the S3 bucket has access logging enabled',
    source: 'checkov',
  },
  {
    resource: 'aws_security_group.web',
    file: 'infra/network.tf',
    line: 4,
    ruleId: 'aws-ec2-no-public-ingress-sgr',
    severity: 'high',
    description: 'Security group rule allows ingress from public internet',
    source: 'tfsec',
  },
]

// inframap namespaces its nodes by the Terraform directory it was run on,
// which is the directory the findings above name too - the two identify the
// same resource, and have to agree for a graph selection to match a finding.
const GRAPH = {
  nodes: [{ id: 'infra/aws_s3_bucket.assets' }, { id: 'infra/aws_instance.app' }, { id: 'infra/aws_security_group.web' }],
  edges: [{ from: 'infra/aws_instance.app', to: 'infra/aws_security_group.web' }],
}

const DETECTED = { detected: true, findings: FINDINGS, graph: GRAPH }

describe('InfrastructureTab', () => {
  it('explains itself when the repo has no Terraform', () => {
    render(<InfrastructureTab infrastructure={{ detected: false, findings: [], graph: { nodes: [], edges: [] } }} />)
    expect(screen.getByText(/no terraform found in this repo/i)).toBeInTheDocument()
  })

  it('handles a scan recorded before infrastructure scanning existed', () => {
    expect(() => render(<InfrastructureTab infrastructure={undefined} />)).not.toThrow()
    expect(screen.getByText(/no terraform found in this repo/i)).toBeInTheDocument()
  })

  it('captions the graph with resource and relationship counts', () => {
    render(<InfrastructureTab infrastructure={DETECTED} />)
    expect(screen.getByText(/3 resources, 1 relationships/i)).toBeInTheDocument()
  })

  it('renders the graph as its own labelled figure, distinct from the dependency map', () => {
    render(<InfrastructureTab infrastructure={DETECTED} />)
    expect(
      screen.getByRole('img', { name: /infrastructure graph with 3 resources and 1 relationships/i }),
    ).toBeInTheDocument()
  })

  it('lists findings with rule, severity, source and file:line', () => {
    render(<InfrastructureTab infrastructure={DETECTED} />)

    // Scoped to the table: the graph above it labels the same resource.
    const row = within(screen.getByRole('table')).getByText('aws_security_group.web').closest('tr')
    expect(within(row).getByText('aws-ec2-no-public-ingress-sgr')).toBeInTheDocument()
    expect(within(row).getByText('CRITICAL')).toBeInTheDocument() // 'high' severity, via SevBadge
    expect(within(row).getByText('tfsec')).toBeInTheDocument()
    expect(within(row).getByText(/infra\/network\.tf/)).toBeInTheDocument()
    expect(within(row).getByText(':4')).toBeInTheDocument()
  })

  it('orders findings by severity, worst first', () => {
    render(<InfrastructureTab infrastructure={DETECTED} />)

    const resources = screen
      .getAllByRole('row')
      .slice(1) // drop the header row
      .map((row) => within(row).getAllByRole('cell')[0].textContent)

    expect(resources).toEqual(['aws_security_group.web', 'aws_s3_bucket.assets'])
  })

  it('says so when Terraform was found but nothing was flagged', () => {
    render(<InfrastructureTab infrastructure={{ detected: true, findings: [], graph: GRAPH }} />)
    expect(screen.getByText(/no misconfigurations found/i)).toBeInTheDocument()
  })

  it('surfaces partial results when an infra tool failed but the scan succeeded', () => {
    render(
      <InfrastructureTab
        infrastructure={DETECTED}
        warnings={[
          'no package-lock.json found; skipping npm audit',
          'checkov failed to run: spawn checkov ENOENT',
          'inframap could not graph 1 Terraform directory',
        ]}
      />,
    )

    expect(screen.getByText(/some infrastructure checks did not complete/i)).toBeInTheDocument()
    expect(screen.getByText('checkov failed to run: spawn checkov ENOENT')).toBeInTheDocument()
    expect(screen.getByText('inframap could not graph 1 Terraform directory')).toBeInTheDocument()
    // A JS-tool warning belongs to the Overview panel, not this one.
    expect(screen.queryByText(/no package-lock\.json/i)).not.toBeInTheDocument()
  })

  it('shows no partial-results banner when every infra tool ran', () => {
    render(<InfrastructureTab infrastructure={DETECTED} warnings={['no package-lock.json found; skipping npm audit']} />)
    expect(screen.queryByText(/did not complete/i)).not.toBeInTheDocument()
  })

  it('notes when the graph is empty even though Terraform was detected', () => {
    render(
      <InfrastructureTab
        infrastructure={{ detected: true, findings: FINDINGS, graph: { nodes: [], edges: [] } }}
        warnings={['inframap failed to run: spawn inframap ENOENT']}
      />,
    )

    expect(screen.getByText(/no infrastructure graph available/i)).toBeInTheDocument()
    // ...but the findings that did come back are still shown.
    expect(screen.getByText('aws_s3_bucket.assets')).toBeInTheDocument()
  })

  it('marks the findings for the file a view-in-context jump asked for', () => {
    render(<InfrastructureTab infrastructure={DETECTED} highlightFile="infra/network.tf" />)

    const highlighted = within(screen.getByRole('table')).getByText('aws_security_group.web').closest('tr')
    expect(highlighted).toHaveClass('row-highlighted')

    const other = within(screen.getByRole('table')).getByText('aws_s3_bucket.assets').closest('tr')
    expect(other).not.toHaveClass('row-highlighted')
  })

  it('marks every finding sharing the highlighted file, not just the first', () => {
    const twoInOneFile = {
      ...DETECTED,
      findings: [
        FINDINGS[0],
        { ...FINDINGS[0], resource: 'aws_s3_bucket.other', ruleId: 'CKV_AWS_21' },
      ],
    }
    const { container } = render(<InfrastructureTab infrastructure={twoInOneFile} highlightFile="infra/s3.tf" />)

    expect(container.querySelectorAll('.row-highlighted')).toHaveLength(2)
  })

  it('renders normally when nothing is highlighted', () => {
    const { container } = render(<InfrastructureTab infrastructure={DETECTED} />)
    expect(container.querySelectorAll('.row-highlighted')).toHaveLength(0)
  })

  it('caps very long findings lists and says how many it is showing', () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      ...FINDINGS[0],
      resource: `aws_s3_bucket.b${String(i).padStart(3, '0')}`,
      ruleId: `CKV_AWS_${i}`,
    }))
    render(<InfrastructureTab infrastructure={{ detected: true, findings: many, graph: GRAPH }} />)

    expect(screen.getByText(/showing 100 of 150/i)).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(101) // 100 findings + header
  })

  describe('resource detail panel', () => {
    it('shows no panel until a resource is chosen', () => {
      render(<InfrastructureTab infrastructure={DETECTED} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens from a graph node', () => {
      render(<InfrastructureTab infrastructure={DETECTED} />)

      fireEvent.click(screen.getByRole('button', { name: 'infra/aws_s3_bucket.assets - view resource' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'aws_s3_bucket.assets' })).toBeInTheDocument()
    })

    it('opens from a findings-table row', () => {
      render(<InfrastructureTab infrastructure={DETECTED} />)

      const table = screen.getByRole('table')
      fireEvent.click(within(table).getByRole('button', { name: 'aws_security_group.web' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'aws_security_group.web' })).toBeInTheDocument()
    })

    it('opens from the keyboard on a graph node', () => {
      render(<InfrastructureTab infrastructure={DETECTED} />)

      fireEvent.keyDown(screen.getByRole('button', { name: 'infra/aws_s3_bucket.assets - view resource' }), { key: 'Enter' })

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('shows that resource’s findings only', () => {
      render(<InfrastructureTab infrastructure={DETECTED} />)

      const table = screen.getByRole('table')
      fireEvent.click(within(table).getByRole('button', { name: 'aws_security_group.web' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/allows ingress from public internet/i)).toBeInTheDocument()
      expect(within(dialog).queryByText(/access logging/i)).not.toBeInTheDocument()
    })

    it('marks the matching graph node when the selection came from the table', () => {
      const { container } = render(<InfrastructureTab infrastructure={DETECTED} />)

      const table = screen.getByRole('table')
      fireEvent.click(within(table).getByRole('button', { name: 'aws_s3_bucket.assets' }))

      const selected = container.querySelectorAll('.mc-infra-node.selected')
      expect(selected).toHaveLength(1)
      expect(selected[0]).toHaveAttribute('aria-label', 'infra/aws_s3_bucket.assets - view resource')
    })

    it('opens on a graphed resource that no tool flagged', () => {
      render(<InfrastructureTab infrastructure={DETECTED} />)

      // aws_instance.app is in the graph but has no findings.
      fireEvent.click(screen.getByRole('button', { name: 'infra/aws_instance.app - view resource' }))

      expect(screen.getByText(/neither checkov nor tfsec flagged this resource/i)).toBeInTheDocument()
    })

    it('says findings are unavailable, rather than "not flagged", for a scan that predates extraction', () => {
      render(<InfrastructureTab infrastructure={DETECTED} findingsAvailable={false} />)

      fireEvent.click(screen.getByRole('button', { name: 'infra/aws_instance.app - view resource' }))

      expect(screen.getByText(/predates per-finding capture/i)).toBeInTheDocument()
    })

    it('closes again, leaving the tab in place', () => {
      render(<InfrastructureTab infrastructure={DETECTED} />)
      fireEvent.click(screen.getByRole('button', { name: 'infra/aws_s3_bucket.assets - view resource' }))

      fireEvent.click(screen.getByRole('button', { name: /close detail panel/i }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
  })
})
