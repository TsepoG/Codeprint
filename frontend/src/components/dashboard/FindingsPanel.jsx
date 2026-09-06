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
 * @param {boolean} [props.findingsAvailable] Whether this scan ran per-finding
 *   extraction at all (see `services/scan/normalize.js`'s `findingsVersion`).
 *   False tells "this scan predates per-finding capture" apart from "this
 *   category is genuinely clean" when the filtered list comes out empty.
 * @param {(finding: object) => boolean} [props.canViewInContext]
 * @param {(finding: object) => void} [props.onViewInContext]
 * @param {() => void} props.onClose
 */
function FindingsPanel({ category, findings = [], findingsAvailable = true, canViewInContext, onViewInContext, onClose }) {
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
        <EmptyState findingsAvailable={findingsAvailable} />
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
 * @param {boolean} props.findingsAvailable
 */
function EmptyState({ findingsAvailable }) {
  if (!findingsAvailable) {
    return (
      <p className="empty-note">
        Findings are not available for this scan - it predates per-finding capture. Re-run the scan to see them.
      </p>
    )
  }

  return <p className="empty-note">No issues found in this category.</p>
}

export default FindingsPanel
