import Tooltip from './Tooltip.jsx'
import { SEV, SEV_LABEL, SEV_DESC } from './severity.js'
import './missionControl.css'

/**
 * A severity dot + label that explains what that status means on hover -
 * the mockup's `.mc-sev` pattern, built on the shared `Tooltip` primitive.
 *
 * @param {object} props
 * @param {'high'|'medium'|'low'} props.severity
 * @param {string} [props.label] Overrides the default CRITICAL/CAUTION/NOMINAL
 *   text - e.g. a scan history row wants "Complete"/"Failed" in the same
 *   dot-plus-tooltip shape, keyed off severity purely for its color.
 */
function SevBadge({ severity, label }) {
  return (
    <Tooltip className="mc-sev" style={{ color: SEV[severity] }} position="above" tip={SEV_DESC[severity]}>
      <span className="mc-dot" style={{ background: SEV[severity] }} />
      {label ?? SEV_LABEL[severity]}
    </Tooltip>
  )
}

export default SevBadge
