import { useState } from 'react'
import { FilesTable } from './shared.jsx'
import FileDetailPanel from './FileDetailPanel.jsx'
import { rankFiles } from './rankFiles.js'

/**
 * @param {object} props
 * @param {object[]} props.files
 * @param {string|null} [props.highlightFile] Set when the user got here via
 *   "view in context" from a finding.
 * @param {object[]} [props.findings] The scan's `findings` array.
 * @param {boolean} [props.findingsAvailable] Whether this scan ran per-finding extraction at all.
 * @param {import('./dependencyModel.js').DependencyModel} [props.model] The
 *   import graph, so a file's panel here says the same as on the map.
 */
function HotspotsTab({ files, highlightFile, findings = [], findingsAvailable = true, model }) {
  const [selectedFile, setSelectedFile] = useState(null)

  const ranked = rankFiles(files)

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
        findingsAvailable={findingsAvailable}
        onSelectModule={setSelectedFile}
        onClose={() => setSelectedFile(null)}
      />
    </div>
  )
}

export default HotspotsTab
