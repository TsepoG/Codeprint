import { describe, expect, it } from 'vitest'
import { repoLabel } from '../../../src/components/dashboard/repoLabel.js'

describe('repoLabel', () => {
  it('extracts owner/repo from a GitHub URL', () => {
    expect(repoLabel('https://github.com/acme/storefront-web')).toBe('acme/storefront-web')
  })

  it('extracts owner/repo from a GitLab URL', () => {
    expect(repoLabel('https://gitlab.com/acme/storefront-web')).toBe('acme/storefront-web')
  })

  it('strips a trailing .git', () => {
    expect(repoLabel('https://github.com/acme/storefront-web.git')).toBe('acme/storefront-web')
  })

  it('strips a trailing slash', () => {
    expect(repoLabel('https://github.com/acme/storefront-web/')).toBe('acme/storefront-web')
  })

  it('tolerates surrounding whitespace', () => {
    expect(repoLabel('  https://github.com/acme/storefront-web  ')).toBe('acme/storefront-web')
  })

  it('returns null for a non-repo URL', () => {
    expect(repoLabel('https://example.com/not-a-repo')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(repoLabel('')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(repoLabel(null)).toBeNull()
    expect(repoLabel(undefined)).toBeNull()
  })
})
