import { useMemo, useState } from 'react'
import { DependencyGraph } from './shared.jsx'
import FileDetailPanel from './FileDetailPanel.jsx'
import { buildDependencyModel } from './dependencyModel.js'

/**
 * @param {object} props
 * @param {{nodes: object[], edges: object[]}} props.dependencyGraph
 * @param {object[]} [props.files] The scan's `files` array, for module stats.
 * @param {object[]} [props.findings] The scan's `findings` array.
 * @param {boolean} [props.findingsAvailable] Whether this scan ran per-finding extraction at all.
 * @param {import('./dependencyModel.js').DependencyModel} [props.model] Built
 *   by the dashboard and shared with Hotspots; derived here when this tab is
 *   rendered on its own.
 */
function DependencyMapTab({ dependencyGraph, files = [], findings = [], findingsAvailable = true, model }) {
  // The selection lives here rather than in the dashboard: following an
  // import from inside the panel re-aims it without leaving this view.
  const [selectedModule, setSelectedModule] = useState(null)

  const ownModel = useMemo(
    () => buildDependencyModel(dependencyGraph.nodes, dependencyGraph.edges),
    [dependencyGraph],
  )
  const graphModel = model ?? ownModel

  return (
    <div className="dashboard-section">
      <p className="section-caption">
        {dependencyGraph.nodes.length} files, {dependencyGraph.edges.length} imports
        {dependencyGraph.nodes.length > 0 && ' - select a module for its detail'}
      </p>
      <DependencyGraph
        nodes={dependencyGraph.nodes}
        edges={dependencyGraph.edges}
        onSelectNode={setSelectedModule}
        selectedNode={selectedModule}
      />

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
