import { splitNodeId } from './infraResource.js'

const MAX_GRAPH_NODES = 60

const NODE_W = 160
const NODE_H = 40
const COL_GAP = 26
const ROW_GAP = 44
const PADDING = 12
const MAX_COLS = 4

/**
 * Orders nodes so each connected component sits together, which keeps the
 * orthogonal traces short and local instead of running across the whole
 * board. Isolated resources (common in Terraform - plenty of resources
 * reference nothing) fall to the end in their original order.
 */
function orderByComponent(nodes, edges) {
  const neighbours = new Map(nodes.map((node) => [node.id, []]))
  for (const edge of edges) {
    // Both ends must be real nodes, or traversal would walk into an id that
    // has no box - which would then get laid out as a phantom resource.
    if (!neighbours.has(edge.from) || !neighbours.has(edge.to)) continue
    neighbours.get(edge.from).push(edge.to)
    neighbours.get(edge.to).push(edge.from)
  }

  const seen = new Set()
  const ordered = []

  for (const node of nodes) {
    if (seen.has(node.id)) continue
    // Depth-first from this node so its whole component is emitted before
    // the next one starts.
    const stack = [node.id]
    while (stack.length > 0) {
      const id = stack.pop()
      if (seen.has(id)) continue
      seen.add(id)
      ordered.push(id)
      for (const next of neighbours.get(id) ?? []) {
        if (!seen.has(next)) stack.push(next)
      }
    }
  }

  return ordered
}



/**
 * Middle-truncates, because both ends of a resource name carry meaning -
 * `aws_s3_bucket.logs` and `aws_s3_bucket.assets` differ only at the tail.
 */
function truncateMiddle(text, max) {
  if (text.length <= max) return text
  const head = Math.ceil((max - 1) / 2)
  const tail = Math.floor((max - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

function truncateEnd(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/**
 * The infrastructure counterpart to `DependencyGraph`: same schematic
 * language, deliberately different marks. Resources are drawn as rectangles
 * wired with right-angle traces (a circuit/rack diagram), where the app's
 * dependency map uses circles on a radial layout - so the two views are
 * never mistaken for each other at a glance.
 *
 * @param {object} props
 * @param {{id: string}[]} props.nodes
 * @param {{from: string, to: string}[]} props.edges
 * @param {(id: string) => void} [props.onSelectNode] Makes each resource a
 *   button. Without it the diagram stays a plain figure.
 * @param {string|null} [props.selectedNode]
 */
function InfraGraph({ nodes, edges, onSelectNode, selectedNode }) {
  if (nodes.length === 0) {
    return <p className="empty-note">No infrastructure graph available for this repo.</p>
  }

  if (nodes.length > MAX_GRAPH_NODES) {
    return (
      <p className="empty-note">
        {nodes.length} resources and {edges.length} relationships - too many to render clearly, showing counts
        only.
      </p>
    )
  }

  const ordered = orderByComponent(nodes, edges)
  const cols = Math.min(MAX_COLS, Math.max(1, Math.ceil(Math.sqrt(ordered.length))))
  const rows = Math.ceil(ordered.length / cols)

  const positions = new Map(
    ordered.map((id, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      return [
        id,
        {
          x: PADDING + col * (NODE_W + COL_GAP),
          y: PADDING + row * (NODE_H + ROW_GAP),
          row,
        },
      ]
    }),
  )

  const width = PADDING * 2 + cols * NODE_W + (cols - 1) * COL_GAP
  const height = PADDING * 2 + rows * NODE_H + (rows - 1) * ROW_GAP

  return (
    <svg
      className="infra-graph"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Infrastructure graph with ${nodes.length} resources and ${edges.length} relationships`}
    >
      {edges.map((edge) => {
        const from = positions.get(edge.from)
        const to = positions.get(edge.to)
        if (!from || !to) return null

        // Every trace leaves the bottom of its source, runs along the
        // channel between rows, then turns into the nearest edge of its
        // target - right angles only.
        const fromX = from.x + NODE_W / 2
        const toX = to.x + NODE_W / 2
        const channelY = from.y + NODE_H + ROW_GAP / 2
        const entryY = to.y + NODE_H / 2 > channelY ? to.y : to.y + NODE_H

        return (
          <path
            key={`${edge.from}->${edge.to}`}
            d={`M ${fromX} ${from.y + NODE_H} V ${channelY} H ${toX} V ${entryY}`}
            className="infra-trace"
          />
        )
      })}

      {ordered.map((id) => {
        const pos = positions.get(id)
        const { modulePath, resource } = splitNodeId(id)
        const selected = id === selectedNode
        const className = `infra-node${selected ? ' selected' : ''}${onSelectNode ? ' clickable' : ''}`

        const interaction = onSelectNode
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': `${id} - view resource`,
              onClick: () => onSelectNode(id),
              onKeyDown: (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                // Space would otherwise scroll the page out from under the
                // diagram; SVG gives no default activation behaviour.
                event.preventDefault()
                onSelectNode(id)
              },
            }
          : {}

        return (
          <g key={id} className={className} {...interaction}>
            <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx="2" />
            {modulePath && (
              <text x={pos.x + 8} y={pos.y + 15} className="infra-node-module">
                {truncateEnd(modulePath, 24)}
              </text>
            )}
            <text x={pos.x + 8} y={modulePath ? pos.y + 30 : pos.y + 24} className="infra-node-label">
              {truncateMiddle(resource, 22)}
            </text>
            <title>{id}</title>
          </g>
        )
      })}
    </svg>
  )
}

export default InfraGraph
