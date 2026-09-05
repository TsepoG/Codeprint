import { useScrollIntoView } from './useScrollIntoView.js'

const MAX_GRAPH_NODES = 60

const SEVERITY = {
  high: { label: 'High', className: 'critical' },
  medium: { label: 'Medium', className: 'warning' },
  low: { label: 'Low', className: 'good' },
}

function meterSeverity(pct) {
  if (pct > 25) return 'critical'
  if (pct > 10) return 'warning'
  return 'good'
}

/**
 * Renders a tile as a plain block, or as a button when `onClick` is given -
 * a tile that does nothing shouldn't advertise itself as pressable, and one
 * that does needs to be reachable by keyboard, so the element itself changes
 * rather than a click handler being bolted onto a div.
 *
 * @param {object} props
 * @param {string} props.className
 * @param {() => void} [props.onClick]
 * @param {string} [props.actionLabel] Accessible name for the button form,
 *   which needs to say what opens - the visible label/value alone reads as
 *   "Bugs 3" with no hint that it does anything.
 * @param {import('react').ReactNode} props.children
 */
function Tile({ className, onClick, actionLabel, children }) {
  if (!onClick) {
    return <div className={className}>{children}</div>
  }

  return (
    <button type="button" className={`${className} stat-tile-button`} onClick={onClick} aria-label={actionLabel}>
      {children}
    </button>
  )
}

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value
 * @param {'high'|'medium'|'low'} [props.severity] When given, the tile gains a
 *   severity-coloured left border. Tiles that are a plain count (bugs, code
 *   smells) leave it off - a colour there would imply a judgement the number
 *   alone doesn't carry.
 * @param {() => void} [props.onClick] Makes the tile a button (see {@link Tile}).
 * @param {string} [props.actionLabel]
 */
export function StatTile({ label, value, severity, onClick, actionLabel }) {
  const severityClass = severity ? `stat-tile-${SEVERITY[severity] ? SEVERITY[severity].className : 'good'}` : ''
  return (
    <Tile
      className={`stat-tile blueprint-panel ${severityClass}`.trim()}
      onClick={onClick}
      actionLabel={actionLabel}
    >
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value">{value}</span>
    </Tile>
  )
}

export function DuplicationMeter({ pct, onClick, actionLabel }) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0))
  const severity = meterSeverity(clamped)
  return (
    <Tile className="stat-tile blueprint-panel" onClick={onClick} actionLabel={actionLabel}>
      <span className="stat-tile-label">Duplication</span>
      <span className="stat-tile-value">{clamped.toFixed(1)}%</span>
      <div
        className="meter-track"
        role="img"
        aria-label={`${clamped.toFixed(1)}% duplicated lines`}
      >
        <div className={`meter-fill ${severity}`} style={{ width: `${clamped}%` }} />
      </div>
    </Tile>
  )
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
 */
export function FilesTable({ files, emptyMessage, highlightFile }) {
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
                <td className="file-name">{file.name}</td>
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

/**
 * @param {object} props
 * @param {{id: string}[]} props.nodes
 * @param {{from: string, to: string}[]} props.edges
 * @param {(id: string) => void} [props.onSelectNode] Makes each node a
 *   button. Without it the diagram stays a plain figure.
 * @param {string|null} [props.selectedNode]
 */
export function DependencyGraph({ nodes, edges, onSelectNode, selectedNode }) {
  if (nodes.length === 0) {
    return <p className="empty-note">No dependency graph available for this repo.</p>
  }

  if (nodes.length > MAX_GRAPH_NODES) {
    return (
      <p className="empty-note">
        {nodes.length} files and {edges.length} imports - too many to render clearly, showing
        counts only.
      </p>
    )
  }

  const size = 320
  const center = size / 2
  const radius = center - 24
  const positions = new Map(
    nodes.map((node, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2
      return [
        node.id,
        { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) },
      ]
    }),
  )

  return (
    <svg
      className="dependency-graph"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Dependency graph with ${nodes.length} files and ${edges.length} imports`}
    >
      {edges.map((edge) => {
        const from = positions.get(edge.from)
        const to = positions.get(edge.to)
        if (!from || !to) return null
        return (
          <line
            key={`${edge.from}->${edge.to}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className="graph-edge"
          />
        )
      })}
      {nodes.map((node) => {
        const pos = positions.get(node.id)
        const selected = node.id === selectedNode
        const className = `graph-node${selected ? ' selected' : ''}${onSelectNode ? ' clickable' : ''}`

        if (!onSelectNode) {
          return (
            <g key={node.id} className={className}>
              <circle cx={pos.x} cy={pos.y} r="5">
                <title>{node.id}</title>
              </circle>
            </g>
          )
        }

        return (
          <g
            key={node.id}
            className={className}
            role="button"
            tabIndex={0}
            aria-label={`${node.id} - view module`}
            onClick={() => onSelectNode(node.id)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              // Space would otherwise scroll the page out from under the
              // diagram, which SVG gives no default activation behaviour for.
              event.preventDefault()
              onSelectNode(node.id)
            }}
          >
            {/* A 5px dot is far too small to hit; this transparent disc is
                the real target and keeps the drawn node visually light. */}
            <circle cx={pos.x} cy={pos.y} r="14" className="graph-node-target" />
            <circle cx={pos.x} cy={pos.y} r="5">
              <title>{node.id}</title>
            </circle>
          </g>
        )
      })}
    </svg>
  )
}
