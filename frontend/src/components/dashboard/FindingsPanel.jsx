import DetailPanel from './DetailPanel.jsx'
import FindingRow from './FindingRow.jsx'
import { rankFindings } from './rankFindings.js'

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
 * The findings behind one Overview metric tile - the tile says how many,
 * this says which.
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
  if (!category) return null

  const meta = CATEGORIES[category] ?? { title: 'Findings', blurb: '' }
  const ranked = rankFindings(findings.filter((finding) => finding.category === category))

  return (
    <DetailPanel
      open
      title={meta.title}
      subtitle={`${ranked.length} ${ranked.length === 1 ? 'finding' : 'findings'}`}
      blurb={meta.blurb}
      onClose={onClose}
    >
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
    </DetailPanel>
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
