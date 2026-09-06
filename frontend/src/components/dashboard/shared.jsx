import { useScrollIntoView } from './useScrollIntoView.js'

const SEVERITY = {
  high: { label: 'High', className: 'critical' },
  medium: { label: 'Medium', className: 'warning' },
  low: { label: 'Low', className: 'good' },
}

export function SeverityBadge({ severity, label }) {
  const info = SEVERITY[severity] ?? SEVERITY.low
  return (
    <span className={`severity-badge ${info.className}`}>
      <span className="severity-dot" aria-hidden="true" />
      {label ?? info.label}
    </span>
  )
}

/**
 * @param {object} props
 * @param {object[]} props.files
 * @param {string} props.emptyMessage
 * @param {string|null} [props.highlightFile] Name of a file to mark and
 *   scroll to - set when the user arrived here via "view in context" from a
 *   finding, so the row they asked about isn't left for them to find.
 * @param {(name: string) => void} [props.onSelectFile] Makes the file name a
 *   button opening that file's detail. Without it the table stays read-only.
 */
export function FilesTable({ files, emptyMessage, highlightFile, onSelectFile }) {
  const highlightRef = useScrollIntoView(highlightFile)

  if (files.length === 0) {
    return <p className="empty-note">{emptyMessage}</p>
  }

  return (
    <div className="table-scroll">
      <table className="files-table">
        <thead>
          <tr>
            <th>File</th>
            <th className="numeric">Complexity</th>
            <th className="numeric">Coverage</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const highlighted = file.name === highlightFile
            return (
              <tr
                key={file.name}
                ref={highlighted ? highlightRef : undefined}
                className={highlighted ? 'row-highlighted' : undefined}
              >
                <td className="file-name">
                  {onSelectFile ? (
                    <button type="button" className="file-name-button" onClick={() => onSelectFile(file.name)}>
                      {file.name}
                    </button>
                  ) : (
                    file.name
                  )}
                </td>
                <td className="numeric">{file.complexity}</td>
                <td className="numeric">{file.coverage == null ? '—' : `${file.coverage}%`}</td>
                <td>
                  <SeverityBadge severity={file.severity} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
