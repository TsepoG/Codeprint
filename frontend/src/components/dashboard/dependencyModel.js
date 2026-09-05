/**
 * Turns the flat `{nodes, edges}` dependency graph into something a detail
 * panel can answer questions about: who imports a module, what it imports,
 * and whether it sits in an import cycle.
 *
 * Cycles are computed here rather than read off the scan result: the backend
 * runs `madge --json`, which returns the dependency map only - `--circular`
 * is never run, so nothing upstream flags them. The graph itself has
 * everything needed to find them, so this derives them instead of asking for
 * a rescan.
 */

/**
 * @typedef {object} DependencyModel
 * @property {(id: string) => string[]} dependents What imports this module.
 * @property {(id: string) => string[]} dependencies What this module imports.
 * @property {(id: string) => string[]|null} cyclePath A cycle through this
 *   module as `[id, ...others, id]`, or null if it's in none.
 * @property {(id: string) => boolean} has
 */

/**
 * @param {{id: string}[]} nodes
 * @param {{from: string, to: string}[]} edges
 * @returns {DependencyModel}
 */
export function buildDependencyModel(nodes = [], edges = []) {
  const ids = new Set(nodes.map((node) => node.id))

  /** @type {Map<string, Set<string>>} */
  const out = new Map()
  /** @type {Map<string, Set<string>>} */
  const incoming = new Map()
  for (const id of ids) {
    out.set(id, new Set())
    incoming.set(id, new Set())
  }

  for (const edge of edges) {
    // An edge to a node the graph never declared would otherwise invent a
    // module that isn't there - the same dangling-edge case InfraGraph hits.
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue
    out.get(edge.from).add(edge.to)
    incoming.get(edge.to).add(edge.from)
  }

  const components = stronglyConnectedComponents(ids, out)

  /** @type {Map<string, Set<string>>} Node -> the cycle group it belongs to. */
  const cycleGroups = new Map()
  for (const component of components) {
    const selfImporting = component.length === 1 && out.get(component[0])?.has(component[0])
    if (component.length < 2 && !selfImporting) continue
    const group = new Set(component)
    for (const id of component) cycleGroups.set(id, group)
  }

  const sorted = (set) => [...set].sort((a, b) => a.localeCompare(b))

  return {
    has: (id) => ids.has(id),
    dependents: (id) => sorted(incoming.get(id) ?? new Set()),
    dependencies: (id) => sorted(out.get(id) ?? new Set()),
    cyclePath: (id) => {
      const group = cycleGroups.get(id)
      return group ? shortestCycleThrough(id, out, group) : null
    },
  }
}

/**
 * Tarjan's algorithm, iteratively - a repo's import graph can be deep enough
 * that the recursive form risks blowing the stack, and this runs on whatever
 * the scan produced rather than only the subset the diagram draws.
 *
 * @param {Set<string>} ids
 * @param {Map<string, Set<string>>} out
 * @returns {string[][]} One entry per strongly connected component.
 */
function stronglyConnectedComponents(ids, out) {
  const index = new Map()
  const low = new Map()
  const onStack = new Set()
  const stack = []
  const components = []
  let counter = 0

  for (const root of ids) {
    if (index.has(root)) continue

    const work = [{ node: root, children: [...(out.get(root) ?? [])], next: 0 }]
    index.set(root, counter)
    low.set(root, counter)
    counter += 1
    stack.push(root)
    onStack.add(root)

    while (work.length > 0) {
      const frame = work[work.length - 1]

      if (frame.next < frame.children.length) {
        const child = frame.children[frame.next]
        frame.next += 1

        if (!index.has(child)) {
          index.set(child, counter)
          low.set(child, counter)
          counter += 1
          stack.push(child)
          onStack.add(child)
          work.push({ node: child, children: [...(out.get(child) ?? [])], next: 0 })
        } else if (onStack.has(child)) {
          low.set(frame.node, Math.min(low.get(frame.node), index.get(child)))
        }
        continue
      }

      // Every child explored: close this node off.
      if (low.get(frame.node) === index.get(frame.node)) {
        const component = []
        let member
        do {
          member = stack.pop()
          onStack.delete(member)
          component.push(member)
        } while (member !== frame.node)
        components.push(component)
      }

      work.pop()
      const parent = work[work.length - 1]
      if (parent) low.set(parent.node, Math.min(low.get(parent.node), low.get(frame.node)))
    }
  }

  return components
}

/**
 * The shortest import cycle passing through `start`, as a walkable path -
 * `a -> b -> a` reads far better in the panel than "this file is in a cycle".
 * Searching is confined to the node's own cycle group, so it can't wander
 * into the rest of the graph.
 *
 * @param {string} start
 * @param {Map<string, Set<string>>} out
 * @param {Set<string>} group
 * @returns {string[]|null} `[start, ...others, start]`.
 */
function shortestCycleThrough(start, out, group) {
  if (out.get(start)?.has(start)) return [start, start]

  /** @type {Map<string, string>} child -> the node it was reached from */
  const cameFrom = new Map()
  const queue = []

  for (const next of out.get(start) ?? []) {
    if (!group.has(next)) continue
    cameFrom.set(next, start)
    queue.push(next)
  }

  while (queue.length > 0) {
    const node = queue.shift()

    for (const next of out.get(node) ?? []) {
      if (next === start) {
        const back = []
        for (let step = node; step !== start; step = cameFrom.get(step)) back.push(step)
        return [start, ...back.reverse(), start]
      }
      if (!group.has(next) || cameFrom.has(next)) continue
      cameFrom.set(next, node)
      queue.push(next)
    }
  }

  return null
}
