import { DependencyGraph } from './shared.jsx'

function DependencyMapTab({ dependencyGraph }) {
  return (
    <div className="dashboard-section">
      <p className="section-caption">
        {dependencyGraph.nodes.length} files, {dependencyGraph.edges.length} imports
      </p>
      <DependencyGraph nodes={dependencyGraph.nodes} edges={dependencyGraph.edges} />
    </div>
  )
}

export default DependencyMapTab
