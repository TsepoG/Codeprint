import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import InfraGraph from '../../../src/components/dashboard/InfraGraph.jsx'

describe('InfraGraph', () => {
  it('shows an empty note when there are no resources', () => {
    render(<InfraGraph nodes={[]} edges={[]} />)
    expect(screen.getByText(/no infrastructure graph available/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders a rectangle per resource, with the full id available on hover', () => {
    const { container } = render(
      <InfraGraph nodes={[{ id: 'aws_s3_bucket.assets' }, { id: 'aws_instance.app' }]} edges={[]} />,
    )

    expect(container.querySelectorAll('.mc-infra-node rect')).toHaveLength(2)
    // Queried directly rather than via getByTitle, which only matches an SVG
    // <title> that is a direct child of <svg> - these hang off each node's <g>.
    const titles = [...container.querySelectorAll('.mc-infra-node title')].map((t) => t.textContent)
    expect(titles).toEqual(['aws_s3_bucket.assets', 'aws_instance.app'])
  })

  it('draws one orthogonal trace per edge, using only right angles', () => {
    const { container } = render(
      <InfraGraph
        nodes={[{ id: 'aws_instance.app' }, { id: 'aws_security_group.web' }]}
        edges={[{ from: 'aws_instance.app', to: 'aws_security_group.web' }]}
      />,
    )

    const traces = container.querySelectorAll('.mc-infra-trace')
    expect(traces).toHaveLength(1)
    // V/H commands only - a diagonal would need L or C.
    expect(traces[0].getAttribute('d')).toMatch(/^M [\d.]+ [\d.]+ V [\d.]+ H [\d.]+ V [\d.]+$/)
  })

  it('splits a namespaced id into its module path and resource name', () => {
    const { container } = render(<InfraGraph nodes={[{ id: 'envs/prod/aws_s3_bucket.assets' }]} edges={[]} />)

    expect(screen.getByText('envs/prod')).toBeInTheDocument()
    expect(screen.getByText('aws_s3_bucket.assets')).toBeInTheDocument()
    expect(container.querySelector('.mc-infra-node title').textContent).toBe('envs/prod/aws_s3_bucket.assets')
  })

  it('middle-truncates a long resource name so both ends stay readable', () => {
    render(<InfraGraph nodes={[{ id: 'alicloud_actiontrail_trail.a_very_long_instance_name' }]} edges={[]} />)

    const label = screen.getByText(/…/)
    expect(label.textContent.startsWith('alicloud')).toBe(true)
    expect(label.textContent.endsWith('name')).toBe(true)
  })

  it('skips an edge that references a resource not in the node list', () => {
    const { container } = render(
      <InfraGraph nodes={[{ id: 'a' }]} edges={[{ from: 'a', to: 'missing' }]} />,
    )
    expect(container.querySelectorAll('.mc-infra-trace')).toHaveLength(0)
  })

  it('falls back to counts when there are too many resources to draw clearly', () => {
    const nodes = Array.from({ length: 61 }, (_, i) => ({ id: `aws_s3_bucket.b${i}` }))
    render(<InfraGraph nodes={nodes} edges={[]} />)

    expect(screen.getByText(/61 resources and 0 relationships/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
