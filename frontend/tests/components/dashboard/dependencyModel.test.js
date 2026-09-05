import { describe, expect, it } from 'vitest'
import { buildDependencyModel } from '../../../src/components/dashboard/dependencyModel.js'

/** @param {string[]} ids @param {[string, string][]} pairs */
function model(ids, pairs) {
  return buildDependencyModel(
    ids.map((id) => ({ id })),
    pairs.map(([from, to]) => ({ from, to })),
  )
}

describe('buildDependencyModel', () => {
  describe('edges', () => {
    it('reads dependencies off outgoing edges', () => {
      const graph = model(['a', 'b', 'c'], [['a', 'b'], ['a', 'c']])
      expect(graph.dependencies('a')).toEqual(['b', 'c'])
    })

    it('reads dependents off incoming edges', () => {
      const graph = model(['a', 'b', 'c'], [['b', 'a'], ['c', 'a']])
      expect(graph.dependents('a')).toEqual(['b', 'c'])
    })

    it('reports an isolated module as having neither', () => {
      const graph = model(['a', 'b'], [])
      expect(graph.dependencies('a')).toEqual([])
      expect(graph.dependents('a')).toEqual([])
    })

    it('sorts both lists so the panel is stable between renders', () => {
      const graph = model(['a', 'x', 'm', 'b'], [['a', 'x'], ['a', 'm'], ['a', 'b']])
      expect(graph.dependencies('a')).toEqual(['b', 'm', 'x'])
    })

    it('collapses a repeated edge into one entry', () => {
      const graph = model(['a', 'b'], [['a', 'b'], ['a', 'b']])
      expect(graph.dependencies('a')).toEqual(['b'])
    })

    it('ignores an edge pointing at a module the graph never declared', () => {
      const graph = model(['a'], [['a', 'ghost.js'], ['ghost.js', 'a']])
      expect(graph.dependencies('a')).toEqual([])
      expect(graph.dependents('a')).toEqual([])
    })

    it('answers for an unknown module without throwing', () => {
      const graph = model(['a'], [])
      expect(graph.dependencies('nope')).toEqual([])
      expect(graph.dependents('nope')).toEqual([])
      expect(graph.cyclePath('nope')).toBeNull()
    })
  })

  describe('cycle detection', () => {
    it('reports no cycle for a plain chain', () => {
      const graph = model(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])
      expect(graph.cyclePath('a')).toBeNull()
      expect(graph.cyclePath('b')).toBeNull()
      expect(graph.cyclePath('c')).toBeNull()
    })

    it('reports no cycle for a diamond, which is not circular', () => {
      const graph = model(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']])
      expect(graph.cyclePath('a')).toBeNull()
      expect(graph.cyclePath('d')).toBeNull()
    })

    it('finds a two-module cycle and returns it as a walkable path', () => {
      const graph = model(['a', 'b'], [['a', 'b'], ['b', 'a']])
      expect(graph.cyclePath('a')).toEqual(['a', 'b', 'a'])
      expect(graph.cyclePath('b')).toEqual(['b', 'a', 'b'])
    })

    it('finds a longer cycle, in traversal order from the module asked about', () => {
      const graph = model(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']])
      expect(graph.cyclePath('b')).toEqual(['b', 'c', 'a', 'b'])
    })

    it('flags a module that imports itself', () => {
      const graph = model(['a'], [['a', 'a']])
      expect(graph.cyclePath('a')).toEqual(['a', 'a'])
    })

    it('leaves modules outside the cycle unflagged', () => {
      // c and d hang off a cycle between a and b without being in it.
      const graph = model(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'a'], ['c', 'a'], ['b', 'd']])

      expect(graph.cyclePath('a')).toEqual(['a', 'b', 'a'])
      expect(graph.cyclePath('c')).toBeNull()
      expect(graph.cyclePath('d')).toBeNull()
    })

    it('keeps separate cycles separate', () => {
      const graph = model(
        ['a', 'b', 'x', 'y'],
        [['a', 'b'], ['b', 'a'], ['x', 'y'], ['y', 'x']],
      )

      expect(graph.cyclePath('a')).toEqual(['a', 'b', 'a'])
      expect(graph.cyclePath('x')).toEqual(['x', 'y', 'x'])
    })

    it('prefers the shortest cycle when a module sits in more than one', () => {
      // a -> b -> a is shorter than a -> c -> d -> a.
      const graph = model(
        ['a', 'b', 'c', 'd'],
        [['a', 'b'], ['b', 'a'], ['a', 'c'], ['c', 'd'], ['d', 'a']],
      )

      expect(graph.cyclePath('a')).toEqual(['a', 'b', 'a'])
    })

    it('handles a deep chain without blowing the stack', () => {
      // Recursive Tarjan would risk overflowing here; the iterative form
      // is the reason this graph is worth testing at all.
      const size = 20000
      const ids = Array.from({ length: size }, (_, i) => `m${i}`)
      const pairs = ids.slice(0, -1).map((id, i) => [id, ids[i + 1]])
      pairs.push([ids[size - 1], ids[0]]) // close it into one giant cycle

      const graph = model(ids, pairs)

      expect(graph.cyclePath('m0')).toHaveLength(size + 1)
      expect(graph.cyclePath('m0')[0]).toBe('m0')
      expect(graph.cyclePath('m0').at(-1)).toBe('m0')
    })

    it('handles an empty graph', () => {
      const graph = buildDependencyModel()
      expect(graph.dependencies('anything')).toEqual([])
      expect(graph.cyclePath('anything')).toBeNull()
    })
  })
})
