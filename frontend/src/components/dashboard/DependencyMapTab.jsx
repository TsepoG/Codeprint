import { useMemo, useState } from 'react'
import { DependencyGraph } from './shared.jsx'
import ModuleDetailPanel from './ModuleDetailPanel.jsx'
import { buildDependencyModel } from './dependencyModel.js'

/**
 * @param {object} props
 * @param {{nodes: object[], edges: object[]}} props.dependencyGraph
 * @param {object[]} [props.files] The scan's `files` array, for module stats.
 * @param {object[]} [props.findings] The scan's `findings` array.
 */
function DependencyMapTab({ dependencyGraph, files = [], findings = [] }) {
  // The selection lives here rather than in the dashboard: following an
  // import from inside the panel re-aims it without leaving this view.
  const [selectedModule, setSelectedModule] = useState(null)

  const model = useMemo(
    () => buildDependencyModel(dependencyGraph.nodes, dependencyGraph.edges),
    [dependencyGraph],
  )

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

      <ModuleDetailPanel
        moduleId={selectedModule}
        model={model}
        files={files}
        findings={findings}
        onSelectModule={setSelectedModule}
        onClose={() => setSelectedModule(null)}
      />
    </div>
  )
}

export default DependencyMapTab
