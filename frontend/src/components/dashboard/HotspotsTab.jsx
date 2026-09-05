import { useState } from 'react'
import { FilesTable } from './shared.jsx'
import FileDetailPanel from './FileDetailPanel.jsx'

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

/**
 * @param {object} props
 * @param {object[]} props.files
 * @param {string|null} [props.highlightFile] Set when the user got here via
 *   "view in context" from a finding.
 * @param {object[]} [props.findings] The scan's `findings` array.
 * @param {import('./dependencyModel.js').DependencyModel} [props.model] The
 *   import graph, so a file's panel here says the same as on the map.
 */
function HotspotsTab({ files, highlightFile, findings = [], model }) {
  const [selectedFile, setSelectedFile] = useState(null)

  const ranked = [...files].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    return bySeverity !== 0 ? bySeverity : b.complexity - a.complexity
  })

  return (
    <div className="dashboard-section">
      <p className="section-caption">
        Files ranked by severity, then cognitive complexity
        {ranked.length > 0 && ' - select a file for its detail'}
      </p>
      <FilesTable
        files={ranked}
        emptyMessage="No hotspots - the linter found nothing to report."
        highlightFile={highlightFile}
        onSelectFile={setSelectedFile}
      />

      <FileDetailPanel
        moduleId={selectedFile}
        model={model}
        files={files}
        findings={findings}
        onSelectModule={setSelectedFile}
        onClose={() => setSelectedFile(null)}
      />
    </div>
  )
}

export default HotspotsTab
