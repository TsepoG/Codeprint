import HudFrame from '../mission-control/HudFrame.jsx'

const WIDTH = 280
const HEIGHT = 90
const PADDING = 14

// A compact single-series sparkline, not a shared-axis multi-series chart -
// deliberately: complexity and duplication % are different units/scales,
// and a dual-axis chart to force them onto one plot is the #1 chart
// mistake to avoid. Two of these side by side instead.
function TrendChart({ title, unit, points, color }) {
  if (points.length < 2) {
    return (
      <HudFrame>
        <div style={{ padding: 14 }}>
          <div className="mc-trend-title">{title}</div>
          <p className="empty-note">Not enough scans yet for a trend.</p>
        </div>
      </HudFrame>
    )
  }

  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = (WIDTH - PADDING * 2) / (points.length - 1)

  const coords = points.map((point, index) => ({
    x: PADDING + index * stepX,
    y: HEIGHT - PADDING - ((point.value - min) / range) * (HEIGHT - PADDING * 2),
  }))

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
  const last = coords[coords.length - 1]
  const format = (value) => `${value.toFixed(1)}${unit}`

  return (
    <HudFrame>
      <div style={{ padding: 14 }}>
        <div className="mc-trend-title">{title}</div>
        <svg
          className="mc-trend-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${title} across the last ${points.length} scans: from ${format(values[0])} to ${format(values[values.length - 1])}`}
        >
          <line x1={PADDING} y1={HEIGHT / 2} x2={WIDTH - PADDING} y2={HEIGHT / 2} className="mc-trend-gridline" />
          <path d={path} className="mc-trend-line" style={{ stroke: color }} />
          <circle cx={last.x} cy={last.y} r="3" style={{ fill: color }} />
        </svg>
        <div className="mc-trend-values">
          <span>{format(values[0])}</span>
          <span className="mc-trend-current" style={{ color }}>
            {format(values[values.length - 1])}
          </span>
        </div>
      </div>
    </HudFrame>
  )
}

export default TrendChart
