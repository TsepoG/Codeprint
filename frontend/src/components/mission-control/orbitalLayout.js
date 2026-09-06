// Radial layout for the mission-control orbital dependency map. The mockup
// hardcodes 11 nodes at hand-picked positions; a real repo's graph is an
// arbitrary shape, so this computes where everything goes: pick an entry
// point, rank everything else by BFS distance from it, and place each ring
// evenly by angle - growing crowded rings (or shrinking their labels) so
// they don't overlap. See OrbitalMap.jsx, which renders the result.

const RING_RADIUS = { 1: 90, 2: 170 }
const DEEP_RING_RADIUS = 250
// A real file path ("services/vectorStore.js") at the diagram's label font
// size runs to ~80-100px, not the couple of characters a hand-picked mockup
// label ("Router") needs - the spacing target has to fit real labels, or
// "grow the ring" never actually kicks in before they overlap.
const MIN_ARC_SPACING = 80 // px between adjacent node centers along a ring
const MAX_RING_RADIUS = 258 // stays inside the crosshair/sweep's 260px extent
const MIN_LABEL_SCALE = 0.55
// Above this many modules, an orbital diagram stops being legible at all -
// see selectTopNodes.
export const MAX_ORBITAL_NODES = 40

/** @param {number} depth */
function baseRadiusForDepth(depth) {
  return RING_RADIUS[depth] ?? DEEP_RING_RADIUS
}

/**
 * Picks the graph's entry point (nodes with no incoming edges - nothing
 * depends on them) and each node's distance from it, following
 * dependencies (outgoing edges) outward.
 *
 * A graph can have several such entry points (several files nothing
 * imports); the one wiring up the most of the rest of the app becomes the
 * literal center, and the others are treated as one hop out, since they
 * can't also occupy the center. A graph with *no* zero-incoming node at
 * all (fully cyclic) falls back to whichever node is depended on least, so
 * there's always somewhere to start from.
 *
 * @param {{id: string}[]} nodes
 * @param {{from: string, to: string}[]} edges
 * @returns {{depths: Map<string, number>, core: string|null}}
 */
export function computeDepths(nodes, edges) {
  const ids = nodes.map((node) => node.id)
  if (ids.length === 0) return { depths: new Map(), core: null }

  const idSet = new Set(ids)
  const outEdges = new Map(ids.map((id) => [id, []]))
  const inDegree = new Map(ids.map((id) => [id, 0]))
  for (const edge of edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue
    outEdges.get(edge.from).push(edge.to)
    inDegree.set(edge.to, inDegree.get(edge.to) + 1)
  }

  let roots = ids.filter((id) => inDegree.get(id) === 0)
  if (roots.length === 0) {
    const minIn = Math.min(...ids.map((id) => inDegree.get(id)))
    roots = ids.filter((id) => inDegree.get(id) === minIn)
  }

  const core = roots.reduce((best, id) => {
    const byOutDegree = outEdges.get(id).length - outEdges.get(best).length
    return byOutDegree > 0 || (byOutDegree === 0 && id < best) ? id : best
  })

  const depths = new Map([[core, 0]])
  const queue = [core]
  for (const root of roots) {
    if (root === core) continue
    depths.set(root, 1)
    queue.push(root)
  }

  while (queue.length > 0) {
    const current = queue.shift()
    const depth = depths.get(current)
    for (const next of outEdges.get(current)) {
      if (depths.has(next)) continue
      depths.set(next, depth + 1)
      queue.push(next)
    }
  }

  // Anything still unreached is a disconnected component whose own local
  // "entry point" has incoming edges only from within that component - park
  // it one ring beyond the deepest node found rather than leaving it out.
  const maxDepth = Math.max(0, ...depths.values())
  for (const id of ids) {
    if (!depths.has(id)) depths.set(id, maxDepth + 1)
  }

  return { depths, core }
}

/**
 * Turns depths into `{x, y}` positions on concentric rings: evenly spaced
 * by angle within a ring, with a small per-ring rotation offset so
 * successive rings don't line every node up along the same spokes. A ring
 * with too many nodes for `MIN_ARC_SPACING` at its nominal radius grows
 * (capped at `MAX_RING_RADIUS`); past that cap, nodes and labels shrink
 * instead so they still don't overlap.
 *
 * @param {{id: string}[]} nodes
 * @param {Map<string, number>} depths
 * @param {{x: number, y: number}} center
 * @returns {Map<string, {x: number, y: number, depth: number, scale: number}>}
 */
export function layoutRings(nodes, depths, center) {
  /** @type {Map<number, string[]>} */
  const byDepth = new Map()
  for (const node of nodes) {
    const depth = depths.get(node.id) ?? 0
    if (!byDepth.has(depth)) byDepth.set(depth, [])
    byDepth.get(depth).push(node.id)
  }

  const positions = new Map()

  for (const [depth, idsAtDepth] of byDepth) {
    if (depth === 0) {
      for (const id of idsAtDepth) positions.set(id, { x: center.x, y: center.y, depth, scale: 1 })
      continue
    }

    const ids = [...idsAtDepth].sort()
    const base = baseRadiusForDepth(depth)
    const needed = (ids.length * MIN_ARC_SPACING) / (2 * Math.PI)
    const radius = Math.min(MAX_RING_RADIUS, Math.max(base, needed))
    const scale = needed > MAX_RING_RADIUS ? Math.max(MIN_LABEL_SCALE, MAX_RING_RADIUS / needed) : 1

    const offsetDeg = (depth * 17) % 360
    ids.forEach((id, i) => {
      const angleDeg = (i / ids.length) * 360 + offsetDeg
      const angleRad = (angleDeg * Math.PI) / 180
      positions.set(id, {
        x: center.x + radius * Math.cos(angleRad),
        y: center.y + radius * Math.sin(angleRad),
        depth,
        scale,
      })
    })
  }

  return positions
}

/**
 * Picks which nodes to actually draw when there are too many for an
 * orbital diagram to stay legible: highest-severity, most-connected first,
 * always keeping the entry point BFS picked (without it the diagram has no
 * center to draw rings around).
 *
 * @param {{id: string}[]} nodes
 * @param {{from: string, to: string}[]} edges
 * @param {(id: string) => 'high'|'medium'|'low'} severityOf
 * @param {string|null} core
 * @returns {{id: string}[]}
 */
export function selectTopNodes(nodes, edges, severityOf, core) {
  if (nodes.length <= MAX_ORBITAL_NODES) return nodes

  const degree = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) {
    if (degree.has(edge.from)) degree.set(edge.from, degree.get(edge.from) + 1)
    if (degree.has(edge.to)) degree.set(edge.to, degree.get(edge.to) + 1)
  }

  const severityRank = { high: 0, medium: 1, low: 2 }
  const ranked = [...nodes].sort((a, b) => {
    if (a.id === core) return -1
    if (b.id === core) return 1
    const bySeverity = severityRank[severityOf(a.id)] - severityRank[severityOf(b.id)]
    return bySeverity !== 0 ? bySeverity : degree.get(b.id) - degree.get(a.id)
  })

  return ranked.slice(0, MAX_ORBITAL_NODES)
}
