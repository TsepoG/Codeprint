import { useEffect, useRef } from 'react'
import { SeverityBadge } from './shared.jsx'

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

// What each metric tile opens onto. The `blurb` matters more than it looks:
// "Code smells" and "Bugs" are both ESLint output and the difference between
// them (maintainability rules vs. correctness errors) isn't guessable from
// the tile.
const CATEGORIES = {
  bug: {
    title: 'Bugs',
    blurb: 'Correctness problems ESLint reported as errors.',
  },
  vulnerability: {
    title: 'Vulnerabilities',
    blurb: 'Advisories npm audit matched against this repo’s dependencies.',
  },
  codeSmell: {
    title: 'Code smells',
    blurb: 'Maintainability rules (sonarjs) - not correctness bugs.',
  },
  duplication: {
    title: 'Duplication',
    blurb: 'Blocks jscpd matched in more than one place.',
  },
  infra: {
    title: 'Infra findings',
    blurb: 'Terraform misconfigurations from checkov and tfsec.',
  },
}

/**
 * A finding's location, as `file:line` - or null when it has no place in the
 * repo to point at (an npm advisory is about a dependency, not a line).
 *
 * @param {object} finding
 * @returns {string|null}
 */
function locationOf(finding) {
  if (!finding.file) return null
  return finding.line == null ? finding.file : `${finding.file}:${finding.line}`
}

/**
 * @param {object} props
 * @param {{startLine: number, text: string}} props.snippet
 * @param {string} [props.caption]
 */
function SnippetBlock({ snippet, caption }) {
  const lines = snippet.text.split('\n')

  return (
    <div className="snippet-block">
      {caption && <p className="snippet-caption">{caption}</p>}
      <pre className="snippet-code">
        <code>
          {lines.map((line, index) => (
            // Each line is its own block (see .snippet-line) rather than a
            // newline character, so the layout doesn't depend on the app
            // shell's global `code` styling leaving whitespace alone.
            <span className="snippet-line" key={index}>
              <span className="snippet-line-number" aria-hidden="true">
                {snippet.startLine + index}
              </span>
              {line}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} props.finding
 * @param {(finding: object) => void} [props.onViewInContext] Omitted when
 *   there's nowhere to send the user (see `FindingsPanel`).
 */
function FindingRow({ finding, onViewInContext }) {
  const location = locationOf(finding)
  const hasSnippet = Boolean(finding.snippet) || Boolean(finding.duplicateOf?.snippet)

  return (
    <li className="finding-row">
      <div className="finding-row-head">
        <p className="finding-description">{finding.description}</p>
        <SeverityBadge severity={finding.severity} />
      </div>

      <div className="finding-meta">
        {location ? <span className="finding-location">{location}</span> : <span className="finding-location dim">no file location</span>}
        {finding.ruleId && <span className="finding-rule">{finding.ruleId}</span>}
        <span className="finding-source">{finding.source}</span>
      </div>

      {hasSnippet && (
        <details className="finding-snippet">
          <summary>Snippet</summary>
          {finding.snippet && (
            <SnippetBlock
              snippet={finding.snippet}
              // A duplication finding shows two blocks, so each needs saying
              // which half of the pair it is; every other finding has one.
              caption={finding.duplicateOf ? location : undefined}
            />
          )}
          {finding.duplicateOf?.snippet && (
            <SnippetBlock
              snippet={finding.duplicateOf.snippet}
              caption={locationOf(finding.duplicateOf) ?? 'matching block'}
            />
          )}
        </details>
      )}

      {onViewInContext && (
        <button type="button" className="link-button" onClick={() => onViewInContext(finding)}>
          View in context
        </button>
      )}
    </li>
  )
}

/**
 * A slide-in detail panel listing the individual findings behind one metric
 * tile - the tile says how many, this says which.
 *
 * @param {object} props
 * @param {string|null} props.category Which category to show; null closes the panel.
 * @param {object[]} props.findings The scan's whole `findings` array; filtered here.
 * @param {number} [props.expectedCount] What the metric tile claims, used to
 *   tell "this scan is clean" apart from "this scan predates per-finding
 *   capture" when the list comes out empty.
 * @param {(finding: object) => boolean} [props.canViewInContext]
 * @param {(finding: object) => void} [props.onViewInContext]
 * @param {() => void} props.onClose
 */
function FindingsPanel({ category, findings = [], expectedCount, canViewInContext, onViewInContext, onClose }) {
  const closeButtonRef = useRef(null)
  // Where focus was before the panel took it, so closing puts the user back
  // on the tile they opened rather than at the top of the document.
  const previouslyFocusedRef = useRef(null)

  useEffect(() => {
    if (!category) return

    previouslyFocusedRef.current = document.activeElement
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const previous = previouslyFocusedRef.current
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus()
    }
  }, [category, onClose])

  if (!category) return null

  const meta = CATEGORIES[category] ?? { title: 'Findings', blurb: '' }
  const matching = findings.filter((finding) => finding.category === category)
  const ranked = [...matching].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
    return (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0)
  })

  return (
    <>
      {/* Click-outside-to-close. The panel is not a focus trap, so this
          stays a plain overlay rather than something that can take focus. */}
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />

      <aside
        className="findings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="findings-panel-title"
      >
        <header className="findings-panel-head">
          <div className="findings-panel-titleblock">
            <span className="findings-panel-tag">Detail</span>
            <h2 id="findings-panel-title">{meta.title}</h2>
            <p className="findings-panel-count">
              {ranked.length} {ranked.length === 1 ? 'finding' : 'findings'}
            </p>
          </div>
          <button
            type="button"
            className="findings-panel-close"
            onClick={onClose}
            ref={closeButtonRef}
            aria-label="Close detail panel"
          >
            ×
          </button>
        </header>

        {meta.blurb && <p className="findings-panel-blurb">{meta.blurb}</p>}

        <div className="findings-panel-body">
          {ranked.length === 0 ? (
            <EmptyState title={meta.title} expectedCount={expectedCount} />
          ) : (
            <ul className="findings-list">
              {ranked.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  onViewInContext={
                    onViewInContext && (!canViewInContext || canViewInContext(finding))
                      ? onViewInContext
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}

/**
 * An empty list means one of two quite different things, and saying "no
 * issues found" for the second would be a lie: a scan recorded before
 * per-finding capture existed still reports its old summary counts, but has
 * no findings to show for them.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {number} [props.expectedCount]
 */
function EmptyState({ title, expectedCount }) {
  if (expectedCount > 0) {
    return (
      <p className="empty-note">
        This scan counted {expectedCount} under {title.toLowerCase()}, but recorded no individual findings -
        it predates their capture. Re-run the scan to see them.
      </p>
    )
  }

  return <p className="empty-note">No issues found in this category.</p>
}

export default FindingsPanel
