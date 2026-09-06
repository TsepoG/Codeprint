import './missionControl.css'

/**
 * The mission-control theme's corner-bracket panel wrapper: a bordered box
 * (`.mc-frame`) with four accent brackets layered over its corners
 * (`.mc-corner`) - the recurring HUD motif throughout the mockup. Purely
 * presentational - it imposes no padding or layout of its own, so callers
 * arrange their own content inside it exactly as the mockup's panels do.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {object} [props.style] Inline style for the frame itself (e.g. `marginBottom`).
 */
function HudFrame({ children, style }) {
  return (
    <div className="mc-frame" style={style}>
      <div className="mc-corner tl" />
      <div className="mc-corner tr" />
      <div className="mc-corner bl" />
      <div className="mc-corner br" />
      {children}
    </div>
  )
}

export default HudFrame
