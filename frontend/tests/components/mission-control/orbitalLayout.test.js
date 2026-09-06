import { describe, expect, it } from 'vitest'
import { computeDepths, layoutRings, selectTopNodes, MAX_ORBITAL_NODES } from '../../../src/components/mission-control/orbitalLayout.js'

/** @param {string[]} ids @param {[string, string][]} pairs */
function graph(ids, pairs) {
  return { nodes: ids.map((id) => ({ id })), edges: pairs.map(([from, to]) => ({ from, to })) }
}

describe('computeDepths', () => {
  it('picks the only zero-incoming node as the core, at depth 0', () => {
    const { nodes, edges } = graph(['app', 'router', 'auth'], [['app', 'router'], ['router', 'auth']])
    const { depths, core } = computeDepths(nodes, edges)

    expect(core).toBe('app')
    expect(depths.get('app')).toBe(0)
    expect(depths.get('router')).toBe(1)
    expect(depths.get('auth')).toBe(2)
  })

  it('picks the entry point with the most outgoing edges among several candidates', () => {
    // `a` and `b` both have nothing depending on them, but `a` wires up two
    // modules to `b`'s one.
    const g = graph(['a', 'b', 'c', 'x'], [['a', 'c'], ['a', 'x'], ['b', 'c']])
    const { core } = computeDepths(g.nodes, g.edges)

    expect(core).toBe('a')
  })

  it('breaks a tie between equally-connected roots by id', () => {
    const g = graph(['b', 'a'], [])
    const { core } = computeDepths(g.nodes, g.edges)
    expect(core).toBe('a')
  })

  it('treats other zero-incoming nodes as one ring out, not left unplaced', () => {
    // `app` is the real entry point; `standalone.js` is a second file
    // nothing imports, e.g. a script - it can't also be at the center.
    const g = graph(['app', 'router', 'standalone'], [['app', 'router']])
    const { depths, core } = computeDepths(g.nodes, g.edges)

    expect(core).toBe('app')
    expect(depths.get('standalone')).toBe(1)
  })

  it('falls back to the least-depended-on node when nothing has zero incoming edges', () => {
    // A pure cycle: every node has an incoming edge, so there is no true
    // entry point at all.
    const g = graph(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']])
    const { depths, core } = computeDepths(g.nodes, g.edges)

    expect(core).not.toBeNull()
    expect(depths.get(core)).toBe(0)
    // Every node is still placed somewhere.
    expect(depths.size).toBe(3)
  })

  it('places a disconnected component (unreachable from the core) one ring beyond the deepest reached node', () => {
    const g = graph(['app', 'router', 'x', 'y'], [['app', 'router'], ['x', 'y']])
    const { depths } = computeDepths(g.nodes, g.edges)

    // app=0, router=1 reached from the core; x has zero incoming edges too,
    // so it starts at 1 and reaches y at 2 via the multi-source BFS.
    expect(depths.get('app')).toBe(0)
    expect(depths.get('router')).toBe(1)
    expect(depths.get('x')).toBe(1)
    expect(depths.get('y')).toBe(2)
  })

  it('does not crash on an empty graph', () => {
    const { depths, core } = computeDepths([], [])
    expect(core).toBeNull()
    expect(depths.size).toBe(0)
  })

  it('does not crash on a single self-importing node', () => {
    const g = graph(['a'], [['a', 'a']])
    const { depths, core } = computeDepths(g.nodes, g.edges)
    expect(core).toBe('a')
    expect(depths.get('a')).toBe(0)
  })

  it('ignores an edge referencing a node the graph never declared', () => {
    const g = graph(['a'], [['a', 'ghost']])
    expect(() => computeDepths(g.nodes, g.edges)).not.toThrow()
  })

  it('takes the shorter of two paths to the same node', () => {
    // b is reachable from app directly (depth 1) and via router (depth 2) -
    // BFS must keep the shorter one.
    const g = graph(['app', 'router', 'b'], [['app', 'router'], ['app', 'b'], ['router', 'b']])
    const { depths } = computeDepths(g.nodes, g.edges)
    expect(depths.get('b')).toBe(1)
  })
})

describe('layoutRings', () => {
  const CENTER = { x: 300, y: 300 }

  it('places the core exactly at the center', () => {
    const nodes = [{ id: 'app' }]
    const positions = layoutRings(nodes, new Map([['app', 0]]), CENTER)
    expect(positions.get('app')).toMatchObject({ x: 300, y: 300, depth: 0 })
  })

  it('places ring-1 nodes at radius 90 from the center', () => {
    const nodes = [{ id: 'a' }]
    const positions = layoutRings(nodes, new Map([['a', 1]]), CENTER)
    const { x, y } = positions.get('a')
    const r = Math.hypot(x - CENTER.x, y - CENTER.y)
    expect(r).toBeCloseTo(90, 5)
  })

  it('places ring-2 nodes at radius 170', () => {
    const nodes = [{ id: 'a' }]
    const positions = layoutRings(nodes, new Map([['a', 2]]), CENTER)
    const r = Math.hypot(positions.get('a').x - CENTER.x, positions.get('a').y - CENTER.y)
    expect(r).toBeCloseTo(170, 5)
  })

  it('caps ring radius at 250 for depth 3 and beyond', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }]
    const positions = layoutRings(nodes, new Map([['a', 3], ['b', 9]]), CENTER)
    const rA = Math.hypot(positions.get('a').x - CENTER.x, positions.get('a').y - CENTER.y)
    const rB = Math.hypot(positions.get('b').x - CENTER.x, positions.get('b').y - CENTER.y)
    expect(rA).toBeCloseTo(250, 5)
    expect(rB).toBeCloseTo(250, 5)
  })

  it('spaces nodes within a ring evenly by angle', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const depths = new Map(nodes.map((n) => [n.id, 1]))
    const positions = layoutRings(nodes, depths, CENTER)

    const angles = nodes
      .map((n) => positions.get(n.id))
      .map((p) => Math.atan2(p.y - CENTER.y, p.x - CENTER.x))
      .sort((x, y) => x - y)

    // 4 evenly-spaced points are 90 degrees (pi/2 radians) apart.
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(Math.PI / 2, 2)
    }
  })

  it('grows a crowded ring past its nominal radius rather than overlapping labels', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}` }))
    const depths = new Map(many.map((n) => [n.id, 1]))
    const positions = layoutRings(many, depths, CENTER)

    const r = Math.hypot(positions.get('n0').x - CENTER.x, positions.get('n0').y - CENTER.y)
    expect(r).toBeGreaterThan(90)
  })

  it('shrinks label/node scale once ring growth hits its cap', () => {
    const huge = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}` }))
    const depths = new Map(huge.map((n) => [n.id, 1]))
    const positions = layoutRings(huge, depths, CENTER)

    expect(positions.get('n0').scale).toBeLessThan(1)
  })

  it('does not shrink or grow a lightly-populated ring', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }]
    const depths = new Map(nodes.map((n) => [n.id, 1]))
    const positions = layoutRings(nodes, depths, CENTER)

    expect(positions.get('a').scale).toBe(1)
    const r = Math.hypot(positions.get('a').x - CENTER.x, positions.get('a').y - CENTER.y)
    expect(r).toBeCloseTo(90, 5)
  })
})

describe('selectTopNodes', () => {
  const severityOf = (id) => (id.startsWith('high') ? 'high' : id.startsWith('med') ? 'medium' : 'low')

  it('returns every node unchanged when under the threshold', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }]
    expect(selectTopNodes(nodes, [], severityOf, 'a')).toEqual(nodes)
  })

  it('always keeps the core, even if it would not otherwise rank in the top N', () => {
    const nodes = Array.from({ length: MAX_ORBITAL_NODES + 5 }, (_, i) => ({ id: `low-${i}` }))
    const core = 'low-0'
    const shown = selectTopNodes(nodes, [], severityOf, core)

    expect(shown.length).toBe(MAX_ORBITAL_NODES)
    expect(shown.some((n) => n.id === core)).toBe(true)
  })

  it('prefers higher severity over lower when truncating', () => {
    const nodes = [
      ...Array.from({ length: MAX_ORBITAL_NODES }, (_, i) => ({ id: `low-${i}` })),
      { id: 'high-1' },
    ]
    const shown = selectTopNodes(nodes, [], severityOf, 'low-0')

    expect(shown.some((n) => n.id === 'high-1')).toBe(true)
  })

  it('breaks ties within the same severity by connectivity (degree), most-connected first', () => {
    const nodes = [
      ...Array.from({ length: MAX_ORBITAL_NODES - 1 }, (_, i) => ({ id: `low-${i}` })),
      { id: 'low-hub' },
      { id: 'low-leaf' },
    ]
    const edges = Array.from({ length: 10 }, (_, i) => ({ from: 'low-hub', to: `low-${i}` }))
    const shown = selectTopNodes(nodes, edges, severityOf, 'low-0')

    expect(shown.some((n) => n.id === 'low-hub')).toBe(true)
    expect(shown.some((n) => n.id === 'low-leaf')).toBe(false)
  })
})
