import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import InfraDetailPanel from '../../../src/components/dashboard/InfraDetailPanel.jsx'

const CHECKOV = {
  resource: 'aws_s3_bucket.assets',
  file: 'envs/prod/main.tf',
  line: 12,
  ruleId: 'CKV_AWS_18',
  severity: 'high',
  description: 'Ensure the S3 bucket has access logging enabled',
  remediation: null,
  impact: null,
  link: 'https://docs.example.test/s3-13-enable-logging',
  source: 'checkov',
}

const TFSEC = {
  resource: 'aws_s3_bucket.assets',
  file: 'envs/prod/main.tf',
  line: 12,
  ruleId: 'aws-s3-enable-bucket-encryption',
  severity: 'medium',
  description: 'Bucket does not have encryption enabled',
  remediation: 'Configure bucket encryption',
  impact: 'The bucket objects could be read if compromised',
  link: null,
  source: 'tfsec',
}

const OTHER_MODULE = { ...CHECKOV, file: 'envs/dev/main.tf', ruleId: 'CKV_AWS_18' }

const KEY = { modulePath: 'envs/prod', resource: 'aws_s3_bucket.assets' }

/** @param {object} [props] */
function renderPanel(props = {}) {
  return render(
    <InfraDetailPanel resourceKey={KEY} findings={[CHECKOV, TFSEC, OTHER_MODULE]} onClose={() => {}} {...props} />,
  )
}

describe('InfraDetailPanel', () => {
  it('renders nothing when no resource is selected', () => {
    const { container } = renderPanel({ resourceKey: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('opens as a dialog titled with the resource address', () => {
    renderPanel()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'aws_s3_bucket.assets' })).toBeInTheDocument()
  })

  it('names the module the resource is declared in', () => {
    renderPanel()
    expect(screen.getByText('envs/prod')).toBeInTheDocument()
  })

  it('says "repo root" for a resource declared at the top level', () => {
    renderPanel({ resourceKey: { modulePath: '', resource: 'aws_s3_bucket.assets' } })
    expect(screen.getByText('repo root')).toBeInTheDocument()
  })

  describe('filtering', () => {
    it('shows every finding for the selected resource', () => {
      renderPanel()

      expect(screen.getByText('Ensure the S3 bucket has access logging enabled')).toBeInTheDocument()
      expect(screen.getByText('Bucket does not have encryption enabled')).toBeInTheDocument()
    })

    it('leaves out the same resource name from another module', () => {
      renderPanel()
      // OTHER_MODULE shares a description with CHECKOV, so count instead.
      expect(screen.getAllByText('Ensure the S3 bucket has access logging enabled')).toHaveLength(1)
    })

    it('counts what it is showing', () => {
      renderPanel()
      expect(screen.getByRole('heading', { name: /findings/i })).toHaveTextContent('2')
    })

    it('notes when both tools flagged the same resource, since they are not merged', () => {
      renderPanel()
      expect(screen.getByText(/flagged by checkov and tfsec/i)).toBeInTheDocument()
    })

    it('says nothing about overlap when only one tool flagged it', () => {
      renderPanel({ findings: [CHECKOV] })
      expect(screen.queryByText(/flagged by/i)).not.toBeInTheDocument()
    })

    it('explains a resource that is in the graph but was never flagged', () => {
      renderPanel({ findings: [] })
      expect(screen.getByText(/neither checkov nor tfsec flagged this resource/i)).toBeInTheDocument()
    })
  })

  describe('finding detail', () => {
    it('shows the description, file:line, rule and source', () => {
      renderPanel({ findings: [TFSEC] })

      expect(screen.getByText('Bucket does not have encryption enabled')).toBeInTheDocument()
      expect(screen.getByText('envs/prod/main.tf:12')).toBeInTheDocument()
      expect(screen.getByText('aws-s3-enable-bucket-encryption')).toBeInTheDocument()
      expect(screen.getByText('tfsec')).toBeInTheDocument()
    })

    it('shows the severity chip', () => {
      renderPanel({ findings: [CHECKOV] })
      expect(screen.getByText('High')).toBeInTheDocument()
    })

    it('orders findings worst-severity-first', () => {
      renderPanel()

      const cards = screen.getAllByRole('listitem').map((item) => item.textContent)
      expect(cards[0]).toContain('access logging') // high
      expect(cards[1]).toContain('encryption enabled') // medium
    })

    it('shows tfsec’s remediation and impact', () => {
      renderPanel({ findings: [TFSEC] })

      expect(screen.getByText('Configure bucket encryption')).toBeInTheDocument()
      expect(screen.getByText(/could be read if compromised/i)).toBeInTheDocument()
    })

    it('links checkov’s policy documentation, opened safely', () => {
      renderPanel({ findings: [CHECKOV] })

      const link = screen.getByRole('link', { name: /docs\.example\.test/ })
      expect(link).toHaveAttribute('href', 'https://docs.example.test/s3-13-enable-logging')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
    })

    it('says so when the tool offered no guidance at all', () => {
      renderPanel({ findings: [{ ...CHECKOV, link: null }] })
      expect(screen.getByText(/checkov offered no remediation guidance/i)).toBeInTheDocument()
    })
  })

  it('closes on the close button', () => {
    const onClose = vi.fn()
    renderPanel({ onClose })

    fireEvent.click(screen.getByRole('button', { name: /close detail panel/i }))

    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    renderPanel({ onClose })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })
})
