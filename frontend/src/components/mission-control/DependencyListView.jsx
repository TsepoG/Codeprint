import SevBadge from './SevBadge.jsx'
import './missionControl.css'

/**
 * Flat fallback for a dependency graph too large to render legibly as an
 * orbital diagram (see OrbitalMap.jsx's `onViewAsList`) - every module,
 * not just the highest-severity/most-connected ones the diagram truncates
 * to. Same click-through to a module's detail panel as the diagram.
 *
 * @param {object} props
 * @param {{id: string}[]} props.nodes
 * @param {(id: string) => 'high'|'medium'|'low'} props.severityOf
 * @param {(id: string) => string[]} props.dependentsOf
 * @param {(id: string) => string[]} props.dependenciesOf
 * @param {(id: string) => void} [props.onSelectNode]
 */
function DependencyListView({ nodes, severityOf, dependentsOf, dependenciesOf, onSelectNode }) {
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id))

  return (
    <table className="mc-table">
      <thead>
        <tr>
          <th>Module</th>
          <th>Dependents</th>
          <th>Dependencies</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((node) => (
          <tr key={node.id}>
            <td className="mc-mono">
              {onSelectNode ? (
                <button type="button" className="mc-link" onClick={() => onSelectNode(node.id)}>
                  {node.id}
                </button>
              ) : (
                node.id
              )}
            </td>
            <td className="mc-mono">{dependentsOf(node.id).length}</td>
            <td className="mc-mono">{dependenciesOf(node.id).length}</td>
            <td>
              <SevBadge severity={severityOf(node.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default DependencyListView
