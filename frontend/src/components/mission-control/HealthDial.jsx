import { useEffect, useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import Tooltip from './Tooltip.jsx'
import { useCountUp } from './useCountUp.js'
import './missionControl.css'

// Kept exactly as the mockup words it - only the score's *meaning* changes
// here (a real computed value instead of a hardcoded mock), not this text.
const HEALTH_DESC =
  'A single score built from bugs, vulnerabilities, code smells, duplication and test coverage across the repo. Calculation: start at 100, subtract 6 points per critical finding and 2 per caution finding, subtract 1 point per percentage of duplication above 5%, and subtract up to 15 points for coverage under 70%.'

// The mockup has no "unavailable" state - it always has a mock score - so
// this copy is new, for a scan that predates health-score capture.
const UNAVAILABLE_DESC =
  'Not available for this scan: health scores are computed from per-finding severity, and this scan predates that capture. Re-run the scan to see one.'

const RADIUS = 74
const TICK_COUNT = 48

/** @param {number} angleDeg @param {number} r @param {number} cx @param {number} cy */
function polar(angleDeg, r, cx, cy) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
}

/**
 * The mission-control theme's animated radial "code health" gauge, ported
 * from the mockup's HealthDial. Extended with a neutral state for a scan
 * that predates health-score capture (`score` null/undefined) - showing a
 * dial permanently at 0 would misreport a scan the score simply couldn't be
 * computed for as if it were the worst possible score.
 *
 * @param {object} props
 * @param {number|null} [props.score] 0-100, or null/undefined if unavailable.
 */
function HealthDial({ score }) {
  const available = typeof score === 'number'
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60)
    return () => clearTimeout(t)
  }, [])
  const animated = useCountUp(ready && available ? score : 0, 1100)

  const circ = 2 * Math.PI * RADIUS
  const offset = circ - (ready && available ? score / 100 : 0) * circ
  const color = !available ? 'var(--ink-dim)' : score >= 75 ? 'var(--mint)' : score >= 50 ? 'var(--amber)' : 'var(--red)'

  const ticks = useMemo(() => {
    const arr = []
    for (let i = 0; i < TICK_COUNT; i++) {
      const angle = (i / TICK_COUNT) * 360
      const major = i % 6 === 0
      const p1 = polar(angle, major ? 60 : 64, 90, 90)
      const p2 = polar(angle, 68, 90, 90)
      arr.push({ ...p1, x2: p2.x, y2: p2.y, major })
    }
    return arr
  }, [])

  return (
    <div className="mc-dial-wrap">
      <svg viewBox="0 0 180 180" width="180" height="180">
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x}
            y1={t.y}
            x2={t.x2}
            y2={t.y2}
            stroke={t.major ? 'var(--ink-dim)' : 'var(--border)'}
            strokeWidth={t.major ? 1.4 : 1}
          />
        ))}
        <circle cx="90" cy="90" r={RADIUS} fill="none" stroke="rgba(77,216,255,0.1)" strokeWidth="8" />
        {available && (
          <circle
            cx="90"
            cy="90"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform="rotate(-90 90 90)"
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)' }}
          />
        )}
      </svg>
      <div className="mc-dial-num">
        <div className="mc-dial-val" style={{ color }}>
          {available ? Math.round(animated) : 'N/A'}
        </div>
        <Tooltip position="below" tip={available ? HEALTH_DESC : UNAVAILABLE_DESC}>
          <span className="mc-dial-lbl">CODE HEALTH</span>
          <Info size={10} color="var(--ink-dim)" />
        </Tooltip>
      </div>
    </div>
  )
}

export default HealthDial
