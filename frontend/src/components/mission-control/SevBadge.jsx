import Tooltip from './Tooltip.jsx'
import { SEV, SEV_LABEL, SEV_DESC } from './severity.js'
import './missionControl.css'

/**
 * A severity dot + label that explains what that status means on hover -
 * the mockup's `.mc-sev` pattern, built on the shared `Tooltip` primitive.
 *
 * @param {object} props
 * @param {'high'|'medium'|'low'} props.severity
 */
function SevBadge({ severity }) {
  return (
    <Tooltip className="mc-sev" style={{ color: SEV[severity] }} position="above" tip={SEV_DESC[severity]}>
      <span className="mc-dot" style={{ background: SEV[severity] }} />
      {SEV_LABEL[severity]}
    </Tooltip>
  )
}

export default SevBadge
