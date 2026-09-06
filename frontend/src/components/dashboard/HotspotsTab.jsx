import { useState } from 'react'
import HudFrame from '../mission-control/HudFrame.jsx'
import HotspotScatter from '../mission-control/HotspotScatter.jsx'
import SevBadge from '../mission-control/SevBadge.jsx'
import FileDetailPanel from './FileDetailPanel.jsx'
import { rankFiles } from './rankFiles.js'
import { duplicationPctByFile } from './fileDuplication.js'
import { useScrollIntoView } from './useScrollIntoView.js'

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
  const highlightRef = useScrollIntoView(highlightFile)

  const ranked = rankFiles(files)
  const dupPctByFile = duplicationPctByFile(findings, files)

  return (
    <div className="dashboard-section mc">
      <HudFrame style={{ marginBottom: 18 }}>
        <div className="mc-panel-head">
          <span>Complexity / coverage plot</span>
        </div>
        <div style={{ padding: '12px 18px 0', fontSize: 12.5, color: 'var(--ink-dim)', lineHeight: 1.6 }}>
          Each point is one file. Further right means the logic is harder to follow; lower means less of
          it is covered by tests. Files inside the shaded corner have both problems at once — start there.
        </div>
        <div style={{ padding: '14px 18px 4px' }}>
          <HotspotScatter files={ranked} onSelectFile={setSelectedFile} />
        </div>
      </HudFrame>

      <HudFrame>
        <div className="mc-panel-head">
          <span>All flagged modules</span>
        </div>
        {ranked.length === 0 ? (
          <p className="empty-note" style={{ padding: '0 18px 16px' }}>
            No hotspots - the linter found nothing to report.
          </p>
        ) : (
          <table className="mc-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Complexity</th>
                <th>Duplication</th>
                <th>Coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((file) => {
                const highlighted = file.name === highlightFile
                return (
                  // A `<tr role="button">` would replace its implicit "row"
                  // role, breaking the table's semantics for assistive tech -
                  // so the click target is the module name (a real button,
                  // as the plain table before this used), not the row itself.
                  <tr key={file.name} ref={highlighted ? highlightRef : undefined} className={highlighted ? 'row-highlighted' : undefined}>
                    <td className="mc-mono">
                      <button type="button" className="mc-link" onClick={() => setSelectedFile(file.name)}>
                        {file.name}
                      </button>
                    </td>
                    <td className="mc-mono">{file.complexity}</td>
                    <td className="mc-mono">{dupPctByFile.get(file.name) ?? 0}%</td>
                    <td className="mc-mono">{file.coverage == null ? '—' : `${file.coverage}%`}</td>
                    <td>
                      <SevBadge severity={file.severity} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </HudFrame>

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
