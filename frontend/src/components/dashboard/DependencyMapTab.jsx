import { useMemo, useState } from 'react'
import HudFrame from '../mission-control/HudFrame.jsx'
import OrbitalMap from '../mission-control/OrbitalMap.jsx'
import DependencyListView from '../mission-control/DependencyListView.jsx'
import FileDetailPanel from './FileDetailPanel.jsx'
import { buildDependencyModel } from './dependencyModel.js'
import { computeDepths, selectTopNodes, MAX_ORBITAL_NODES } from '../mission-control/orbitalLayout.js'

/**
 * @param {object} props
 * @param {{nodes: object[], edges: object[]}} props.dependencyGraph
 * @param {object[]} [props.files] The scan's `files` array, for module stats and per-node severity.
 * @param {object[]} [props.findings] The scan's `findings` array.
 * @param {boolean} [props.findingsAvailable] Whether this scan ran per-finding extraction at all.
 * @param {import('./dependencyModel.js').DependencyModel} [props.model] Built
 *   by the dashboard and shared with Hotspots; derived here when this tab is
 *   rendered on its own.
 */
function DependencyMapTab({ dependencyGraph, files = [], findings = [], findingsAvailable = true, model }) {
  const [selectedModule, setSelectedModule] = useState(null)
  const [viewAsList, setViewAsList] = useState(false)

  const ownModel = useMemo(
    () => buildDependencyModel(dependencyGraph.nodes, dependencyGraph.edges),
    [dependencyGraph],
  )
  const graphModel = model ?? ownModel

  const filesByName = useMemo(() => new Map(files.map((file) => [file.name, file])), [files])
  // A module in a circular dependency counts as high severity even if the
  // linter never flagged it - the mockup treats "circular" the same way,
  // and it's the more actionable signal for a dependency diagram.
  const severityOf = (id) => (graphModel.cyclePath(id) ? 'high' : filesByName.get(id)?.severity ?? 'low')

  const { nodes, edges } = dependencyGraph
  const { depths, core } = useMemo(() => computeDepths(nodes, edges), [nodes, edges])
  const tooLarge = nodes.length > MAX_ORBITAL_NODES
  const shownNodes = tooLarge && !viewAsList ? selectTopNodes(nodes, edges, severityOf, core) : nodes

  return (
    <div className="dashboard-section mc">
      <HudFrame>
        <div className="mc-panel-head">
          <span>Orbital dependency map</span>
          <span className="mc-mono" style={{ fontSize: 10.5 }}>
            {nodes.length} modules, {edges.length} imports
          </span>
        </div>
        <div style={{ padding: 20 }}>
          {tooLarge && viewAsList ? (
            <>
              <DependencyListView
                nodes={nodes}
                severityOf={severityOf}
                dependentsOf={graphModel.dependents}
                dependenciesOf={graphModel.dependencies}
                onSelectNode={setSelectedModule}
              />
              <p className="mc-orbital-overflow">
                <button type="button" className="mc-link" onClick={() => setViewAsList(false)}>
                  Back to the orbital map
                </button>
              </p>
            </>
          ) : (
            <OrbitalMap
              nodes={shownNodes}
              edges={edges}
              depths={depths}
              core={core}
              severityOf={severityOf}
              isCircularEdge={graphModel.edgeIsCircular}
              onSelectNode={setSelectedModule}
              selectedNode={selectedModule}
              totalCount={nodes.length}
              onViewAsList={() => setViewAsList(true)}
            />
          )}
        </div>
      </HudFrame>

      <FileDetailPanel
        moduleId={selectedModule}
        model={graphModel}
        files={files}
        findings={findings}
        findingsAvailable={findingsAvailable}
        onSelectModule={setSelectedModule}
        onClose={() => setSelectedModule(null)}
      />
    </div>
  )
}

export default DependencyMapTab
