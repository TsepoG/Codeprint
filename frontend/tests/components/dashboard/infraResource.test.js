import { describe, expect, it } from 'vitest'
import {
  splitNodeId,
  keyFromNode,
  keyFromFinding,
  sameResource,
  findingsForResource,
} from '../../../src/components/dashboard/infraResource.js'

describe('splitNodeId', () => {
  it('splits a namespaced node into module path and resource', () => {
    expect(splitNodeId('envs/prod/aws_s3_bucket.assets')).toEqual({
      modulePath: 'envs/prod',
      resource: 'aws_s3_bucket.assets',
    })
  })

  it('treats a bare name as living at the repo root', () => {
    expect(splitNodeId('aws_s3_bucket.assets')).toEqual({ modulePath: '', resource: 'aws_s3_bucket.assets' })
  })
})

describe('reconciling a graph node with a findings row', () => {
  it('reduces a node and a finding for the same resource to the same key', () => {
    const fromNode = keyFromNode('envs/prod/aws_s3_bucket.assets')
    const fromFinding = keyFromFinding({ resource: 'aws_s3_bucket.assets', file: 'envs/prod/main.tf' })

    expect(sameResource(fromNode, fromFinding)).toBe(true)
  })

  it('matches a root-level resource, where the node carries no module path', () => {
    const fromNode = keyFromNode('aws_s3_bucket.assets')
    const fromFinding = keyFromFinding({ resource: 'aws_s3_bucket.assets', file: 'main.tf' })

    expect(sameResource(fromNode, fromFinding)).toBe(true)
  })

  it('keeps the same resource name in two modules apart', () => {
    // The whole reason inframap namespaces its nodes: prod and dev both
    // declare `aws_s3_bucket.assets`, and they are different buckets.
    const prod = keyFromFinding({ resource: 'aws_s3_bucket.assets', file: 'envs/prod/main.tf' })
    const dev = keyFromFinding({ resource: 'aws_s3_bucket.assets', file: 'envs/dev/main.tf' })

    expect(sameResource(prod, dev)).toBe(false)
  })

  it('handles a finding with no file', () => {
    expect(keyFromFinding({ resource: 'aws_s3_bucket.assets', file: null })).toEqual({
      modulePath: '',
      resource: 'aws_s3_bucket.assets',
    })
  })
})

describe('findingsForResource', () => {
  const FINDINGS = [
    { resource: 'aws_s3_bucket.assets', file: 'envs/prod/main.tf', ruleId: 'CKV_AWS_18', source: 'checkov' },
    { resource: 'aws_s3_bucket.assets', file: 'envs/prod/main.tf', ruleId: 'aws-s3-enable-logging', source: 'tfsec' },
    { resource: 'aws_s3_bucket.assets', file: 'envs/dev/main.tf', ruleId: 'CKV_AWS_18', source: 'checkov' },
    { resource: 'aws_security_group.web', file: 'envs/prod/main.tf', ruleId: 'CKV_AWS_23', source: 'checkov' },
  ]

  it('gathers both tools’ findings for one resource', () => {
    const matching = findingsForResource(FINDINGS, keyFromNode('envs/prod/aws_s3_bucket.assets'))

    expect(matching).toHaveLength(2)
    expect(matching.map((f) => f.source)).toEqual(['checkov', 'tfsec'])
  })

  it('does not pull in the same resource name from another module', () => {
    const matching = findingsForResource(FINDINGS, keyFromNode('envs/prod/aws_s3_bucket.assets'))
    expect(matching.every((f) => f.file === 'envs/prod/main.tf')).toBe(true)
  })

  it('does not pull in a different resource from the same file', () => {
    const matching = findingsForResource(FINDINGS, keyFromNode('envs/prod/aws_s3_bucket.assets'))
    expect(matching.some((f) => f.resource === 'aws_security_group.web')).toBe(false)
  })

  it('returns nothing for a resource with no findings', () => {
    expect(findingsForResource(FINDINGS, keyFromNode('envs/prod/aws_vpc.main'))).toEqual([])
  })

  it('returns nothing when no resource is selected', () => {
    expect(findingsForResource(FINDINGS, null)).toEqual([])
  })
})
