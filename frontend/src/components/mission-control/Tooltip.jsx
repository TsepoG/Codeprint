import './missionControl.css'

/**
 * Generic hover-tooltip primitive for the mission-control theme (the
 * mockup's `.mc-tip-wrap` / `.mc-tip` pattern): wraps a trigger and reveals
 * `tip` above or below it on hover. SevBadge builds on this rather than
 * rolling its own hover/positioning logic, and the health-score dial (not
 * ported yet) uses the same pattern for its "CODE HEALTH" label.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children The hover target.
 * @param {import('react').ReactNode} props.tip Tooltip content.
 * @param {'above'|'below'} [props.position]
 * @param {string} [props.className] Extra class(es) merged onto the wrapper
 *   (e.g. SevBadge's `mc-sev`) - lets the trigger itself carry the hover
 *   styling rather than needing a second wrapping element.
 * @param {object} [props.style] Inline style for the wrapper.
 */
function Tooltip({ children, tip, position = 'below', className, style }) {
  return (
    <span className={['mc-tip-wrap', className].filter(Boolean).join(' ')} style={style}>
      {children}
      <span className={`mc-tip ${position}`}>{tip}</span>
    </span>
  )
}

export default Tooltip
