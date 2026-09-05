import DetailPanel from './DetailPanel.jsx'
import FindingRow from './FindingRow.jsx'
import { rankFindings } from './rankFindings.js'

/**
 * Findings that concern this file. A duplication finding is anchored at one
 * of its two locations, so the other half has to be matched too - otherwise
 * the second file in a clone pair looks clean.
 *
 * @param {object[]} findings
 * @param {string} moduleId
 * @returns {object[]}
 */
function findingsForModule(findings, moduleId) {
  return findings.filter((finding) => finding.file === moduleId || finding.duplicateOf?.file === moduleId)
}

/**
 * jscpd reports duplication per matched pair, not per file, and the `files`
 * entries carry no duplication figure at all - so a module's duplication is
 * counted from the clone findings that touch it.
 *
 * @param {object[]} moduleFindings
 * @returns {{blocks: number, lines: number}}
 */
function duplicationOf(moduleFindings) {
  const clones = moduleFindings.filter((finding) => finding.category === 'duplication')
  const lines = clones.reduce((total, finding) => {
    const span = finding.file && finding.line != null && finding.endLine != null
      ? finding.endLine - finding.line + 1
      : 0
    return total + span
  }, 0)

  return { blocks: clones.length, lines }
}

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value
 * @param {string} [props.note] Shown instead of a value when there is none.
 */
function Stat({ label, value, note }) {
  return (
    <div className="module-stat">
      <span className="module-stat-label">{label}</span>
      {value != null ? <span className="module-stat-value">{value}</span> : <span className="module-stat-none">{note}</span>}
    </div>
  )
}

/**
 * A list of related modules, each one a link that re-aims the panel.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string[]} props.modules
 * @param {string} props.emptyMessage
 * @param {(id: string) => void} props.onSelect
 */
function ModuleList({ title, modules, emptyMessage, onSelect }) {
  return (
    <section className="module-section">
      <h3 className="module-section-title">
        {title} <span className="module-section-count">{modules.length}</span>
      </h3>

      {modules.length === 0 ? (
        <p className="empty-note">{emptyMessage}</p>
      ) : (
        <ul className="module-link-list">
          {modules.map((id) => (
            <li key={id}>
              <button type="button" className="module-link" onClick={() => onSelect(id)}>
                {id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Everything the scan knows about one module in the dependency graph: its
 * quick-reference numbers, whether it sits in an import cycle, what it's
 * wired to in both directions, and the findings recorded against it.
 *
 * @param {object} props
 * @param {string|null} props.moduleId Which module to show; null closes the panel.
 * @param {import('./dependencyModel.js').DependencyModel} props.model
 * @param {object[]} [props.files] The scan's `files` array, for the stats row.
 * @param {object[]} [props.findings] The scan's whole `findings` array.
 * @param {(id: string) => void} props.onSelectModule Re-aims the panel at another module.
 * @param {() => void} props.onClose
 */
function ModuleDetailPanel({ moduleId, model, files = [], findings = [], onSelectModule, onClose }) {
  if (!moduleId) return null

  const file = files.find((entry) => entry.name === moduleId)
  const moduleFindings = rankFindings(findingsForModule(findings, moduleId))
  const duplication = duplicationOf(moduleFindings)
  const cyclePath = model.cyclePath(moduleId)
  const dependents = model.dependents(moduleId)
  const dependencies = model.dependencies(moduleId)

  return (
    <DetailPanel
      open
      tag="Module"
      title={moduleId}
      subtitle={`${dependents.length} in · ${dependencies.length} out`}
      onClose={onClose}
    >
      {/* Ahead of everything else: a cycle is a property of the module's
          position in the graph, not one more lint finding in a list. */}
      {cyclePath && (
        <div className="status-panel warning-panel module-cycle" role="status">
          <strong>Part of a circular dependency</strong>
          <p className="module-cycle-path">
            {cyclePath.map((id, index) => (
              <span key={`${id}-${index}`}>
                {index > 0 && <span className="module-cycle-arrow" aria-hidden="true"> → </span>}
                {/* The path closes on the module itself; that last hop is
                    the same node, so it isn't offered as a link. */}
                {index > 0 && index === cyclePath.length - 1 ? (
                  <span className="module-cycle-node">{id}</span>
                ) : (
                  <button type="button" className="module-link" onClick={() => onSelectModule(id)}>
                    {id}
                  </button>
                )}
              </span>
            ))}
          </p>
        </div>
      )}

      <section className="module-stats" aria-label="Module stats">
        <Stat
          label="Complexity"
          value={file ? String(file.complexity) : null}
          note="not flagged"
        />
        <Stat
          label="Coverage"
          value={file?.coverage == null ? null : `${file.coverage}%`}
          // No coverage tool runs in the scan pipeline, so this is
          // structurally absent rather than merely missing for this file.
          note="not measured"
        />
        <Stat
          label="Duplication"
          value={duplication.blocks > 0 ? `${duplication.blocks} block${duplication.blocks === 1 ? '' : 's'}` : null}
          note="none found"
        />
      </section>

      <ModuleList
        title="Imported by"
        modules={dependents}
        emptyMessage="Nothing imports this module - it's an entry point, or unused."
        onSelect={onSelectModule}
      />

      <ModuleList
        title="Imports"
        modules={dependencies}
        emptyMessage="This module imports nothing else in the repo."
        onSelect={onSelectModule}
      />

      <section className="module-section">
        <h3 className="module-section-title">
          Findings <span className="module-section-count">{moduleFindings.length}</span>
        </h3>

        {moduleFindings.length === 0 ? (
          <p className="empty-note">No findings recorded against this file.</p>
        ) : (
          <ul className="findings-list">
            {moduleFindings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} showLocation={false} />
            ))}
          </ul>
        )}
      </section>
    </DetailPanel>
  )
}

export default ModuleDetailPanel
