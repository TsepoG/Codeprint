import { useMemo } from 'react'
import { layoutRings } from './orbitalLayout.js'
import { SEV } from './severity.js'
import './missionControl.css'

const VIEWPORT = 600
const CENTER = { x: VIEWPORT / 2, y: VIEWPORT / 2 }
const CROSSHAIR_EXTENT = 260
const SWEEP_RADIUS = 260
const RING_GUIDES = [90, 170, 250]

/**
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 */
function arcPath(a, b) {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const cx = mx + (CENTER.x - mx) * 0.25
  const cy = my + (CENTER.y - my) * 0.25
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
}

/**
 * The mission-control theme's radial dependency map: the graph's entry
 * point at the center, everything else on concentric rings by BFS depth
 * (see orbitalLayout.js), a rotating radar sweep, and arc-curved edges
 * (dashed red for a circular import) - ported from the mockup's
 * OrbitalMapView, which hardcoded 11 nodes at fixed positions since a real
 * repo's graph shape is arbitrary.
 *
 * Renders exactly the `nodes` it's given - a caller showing fewer than the
 * full graph (see orbitalLayout.js's `selectTopNodes`) passes `totalCount`
 * so the overflow note and `onViewAsList` link can say how much was left
 * out. `depths`/`core` come from the caller too (computed once, from the
 * *full* graph - see orbitalLayout.js's `computeDepths`) rather than being
 * recomputed here from a possibly-truncated `nodes`, which would otherwise
 * cut edges to hidden nodes and mis-measure everyone's real distance from
 * the entry point.
 *
 * @param {object} props
 * @param {{id: string}[]} props.nodes
 * @param {{from: string, to: string}[]} props.edges
 * @param {Map<string, number>} props.depths
 * @param {string|null} props.core
 * @param {(id: string) => 'high'|'medium'|'low'} props.severityOf
 * @param {(from: string, to: string) => boolean} props.isCircularEdge
 * @param {(id: string) => void} [props.onSelectNode]
 * @param {string|null} [props.selectedNode]
 * @param {number} [props.totalCount] The full graph's node count, if different from `nodes.length`.
 * @param {() => void} [props.onViewAsList] Shown as a link when `totalCount` exceeds `nodes.length`.
 */
function OrbitalMap({ nodes, edges, depths, core, severityOf, isCircularEdge, onSelectNode, selectedNode, totalCount, onViewAsList }) {
  const positions = useMemo(() => layoutRings(nodes, depths, CENTER), [nodes, depths])

  if (nodes.length === 0) {
    return <p className="empty-note">No dependency graph available for this repo.</p>
  }

  const hiddenCount = (totalCount ?? nodes.length) - nodes.length
  // An edge to/from a node this view isn't showing (truncated for size -
  // see selectTopNodes) has nowhere to be drawn; exclude it up front so the
  // accessible label's count matches what's actually on screen.
  const visibleEdges = edges.filter((edge) => positions.has(edge.from) && positions.has(edge.to))

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEWPORT} ${VIEWPORT}`}
        width="100%"
        style={{ minHeight: 460, maxWidth: VIEWPORT, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label={`Dependency map with ${nodes.length} modules and ${visibleEdges.length} imports`}
      >
        <defs>
          <radialGradient id="mc-sweep-grad" gradientUnits="userSpaceOnUse" cx={CENTER.x} cy={CENTER.y} r={SWEEP_RADIUS}>
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {RING_GUIDES.map((r) => (
          <circle key={r} className="mc-ring-guide" cx={CENTER.x} cy={CENTER.y} r={r} />
        ))}
        <line x1={CENTER.x - CROSSHAIR_EXTENT} y1={CENTER.y} x2={CENTER.x + CROSSHAIR_EXTENT} y2={CENTER.y} stroke="var(--border)" strokeWidth="1" />
        <line x1={CENTER.x} y1={CENTER.y - CROSSHAIR_EXTENT} x2={CENTER.x} y2={CENTER.y + CROSSHAIR_EXTENT} stroke="var(--border)" strokeWidth="1" />

        <g>
          <path
            d={`M ${CENTER.x} ${CENTER.y} L ${CENTER.x + SWEEP_RADIUS} ${CENTER.y} A ${SWEEP_RADIUS} ${SWEEP_RADIUS} 0 0 0 ${CENTER.x + SWEEP_RADIUS * Math.cos(Math.PI / 6)} ${CENTER.y - SWEEP_RADIUS * Math.sin(Math.PI / 6)} Z`}
            fill="url(#mc-sweep-grad)"
          />
          <line x1={CENTER.x} y1={CENTER.y} x2={CENTER.x + SWEEP_RADIUS} y2={CENTER.y} stroke="var(--cyan)" strokeWidth="1.2" opacity="0.7" />
          <animateTransform attributeName="transform" type="rotate" from={`0 ${CENTER.x} ${CENTER.y}`} to={`360 ${CENTER.x} ${CENTER.y}`} dur="7s" repeatCount="indefinite" />
        </g>

        {visibleEdges.map((edge, i) => (
          <path
            key={`${edge.from}->${edge.to}-${i}`}
            d={arcPath(positions.get(edge.from), positions.get(edge.to))}
            className={isCircularEdge(edge.from, edge.to) ? 'mc-edge-circ' : 'mc-edge'}
          />
        ))}

        {nodes.map((node) => {
          const pos = positions.get(node.id)
          if (!pos) return null

          const isCore = node.id === core
          const severity = severityOf(node.id)
          const r = isCore ? 12 : 7 * pos.scale
          const labelY = pos.y + (isCore ? 26 : 20 * pos.scale)
          const selected = node.id === selectedNode
          const className = `mc-node${selected ? ' selected' : ''}${onSelectNode ? ' clickable' : ''}`
          // The full path is what identifies the module (click target, tooltip,
          // aria-label) - the drawn label is just the filename, since a real
          // repo-relative path routinely runs long enough to overlap its
          // neighbors even after a ring has grown and shrunk to fit.
          const displayLabel = node.id.slice(node.id.lastIndexOf('/') + 1)

          const dot = (
            <circle
              cx={pos.x}
              cy={pos.y}
              r={r}
              fill={isCore ? 'var(--cyan)' : 'var(--panel-raised)'}
              stroke={SEV[severity]}
              strokeWidth={isCore ? 0 : 1.6}
              style={{ filter: severity === 'high' ? `drop-shadow(0 0 5px ${SEV[severity]}88)` : 'none' }}
            >
              <title>{node.id}</title>
            </circle>
          )

          if (!onSelectNode) {
            return (
              <g key={node.id} className={className}>
                {dot}
                <text x={pos.x} y={labelY} textAnchor="middle" style={{ fontSize: 9.5 * pos.scale }}>
                  {displayLabel}
                </text>
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
                event.preventDefault()
                onSelectNode(node.id)
              }}
            >
              {/* A larger transparent hit target - the drawn dot is too small to click reliably. */}
              <circle cx={pos.x} cy={pos.y} r={r + 7} className="mc-node-target" />
              {dot}
              <text x={pos.x} y={labelY} textAnchor="middle" style={{ fontSize: 9.5 * pos.scale }}>
                {displayLabel}
              </text>
            </g>
          )
        })}
      </svg>

      {hiddenCount > 0 && (
        <p className="mc-orbital-overflow">
          Showing the {nodes.length} highest-severity, most-connected modules.{' '}
          <button type="button" className="mc-link" onClick={onViewAsList}>
            +{hiddenCount} more modules, view as list
          </button>
        </p>
      )}
    </div>
  )
}

export default OrbitalMap
