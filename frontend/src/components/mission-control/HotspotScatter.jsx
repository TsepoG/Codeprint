import { SEV } from './severity.js'
import './missionControl.css'

const WIDTH = 800
const HEIGHT = 380
const PAD = 48
// The mockup's mock data tops out around complexity 24; a real repo can run
// well past that, so anything above this is clamped to the right edge
// rather than stretching (and flattening) every other point's position.
const MAX_COMPLEXITY = 30
const COMPLEXITY_TICKS = [0, 10, 20, 30]
const COVERAGE_TICKS = [0, 25, 50, 75, 100]
// No tool in the pipeline measures per-file coverage yet (see
// normalize.js's `coverage: null`), so every point lands here today - a
// dedicated lane below the 0% line rather than a fabricated position, so
// "not measured" never reads as "measured at zero".
const NA_LANE_HEIGHT = 34
const PLOT_BOTTOM = HEIGHT - PAD - NA_LANE_HEIGHT
const MIN_RADIUS = 4
const MAX_RADIUS = 22

const toX = (complexity) => PAD + (Math.min(complexity, MAX_COMPLEXITY) / MAX_COMPLEXITY) * (WIDTH - PAD * 2)
const toY = (coveragePct) => PLOT_BOTTOM - (coveragePct / 100) * (PLOT_BOTTOM - PAD)
const NA_Y = PLOT_BOTTOM + NA_LANE_HEIGHT / 2

/** A file's point radius scales with its line count - the mockup's "point size = LOC" legend entry. */
function radiusOf(loc) {
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, MIN_RADIUS + loc / 70))
}

// The "start here" corner: high complexity and low coverage at once. Anchored
// off the same toX/toY as the points, so it always lines up with them.
const RISK_X = toX(15)
const RISK_Y = toY(50)
const RISK_WIDTH = toX(MAX_COMPLEXITY) - RISK_X
const RISK_HEIGHT = toY(0) - RISK_Y

/**
 * The mission-control theme's complexity/coverage scatter - the mockup's
 * HotspotsView plot, wired to the scan's real `files` (each already carries
 * `complexity`, `coverage`, `loc`, `severity` - see normalize.js) instead of
 * the mockup's hardcoded HOTSPOTS array. A file with unmeasured coverage
 * (`coverage: null`, true of every file today - no coverage tool runs yet)
 * plots in a dedicated "not measured" lane rather than being misplaced at
 * 0%, or silently dropped.
 *
 * @param {object} props
 * @param {object[]} props.files
 * @param {(name: string) => void} [props.onSelectFile] Opens the file's
 *   detail panel. Without it, points are inert marks.
 */
function HotspotScatter({ files, onSelectFile }) {
  if (files.length === 0) {
    return <p className="empty-note">No hotspots - the linter found nothing to report.</p>
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        style={{ minHeight: 340 }}
        role="img"
        aria-label={`Complexity versus test coverage plot of ${files.length} files`}
      >
        <rect
          x={RISK_X}
          y={RISK_Y}
          width={RISK_WIDTH}
          height={RISK_HEIGHT}
          fill="rgba(255,92,92,0.06)"
          stroke="rgba(255,92,92,0.3)"
          strokeDasharray="4 3"
        />
        <text
          x={RISK_X + RISK_WIDTH - 8}
          y={RISK_Y + 16}
          textAnchor="end"
          style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9.5, fill: '#ffb0ab', letterSpacing: '0.05em' }}
        >
          HARDER TO CHANGE, LESS TESTED
        </text>

        {COVERAGE_TICKS.map((t) => (
          <g key={`h${t}`}>
            <line x1={PAD} x2={WIDTH - PAD} y1={toY(t)} y2={toY(t)} stroke="rgba(77,216,255,0.08)" />
            <text x={PAD - 8} y={toY(t) + 3} textAnchor="end" className="mc-axis">
              {t}
            </text>
          </g>
        ))}

        <line x1={PAD} x2={WIDTH - PAD} y1={PLOT_BOTTOM + 6} y2={PLOT_BOTTOM + 6} stroke="var(--border)" strokeDasharray="2 3" />
        <text x={PAD - 8} y={NA_Y + 3} textAnchor="end" className="mc-axis">
          N/A
        </text>

        {COMPLEXITY_TICKS.map((t) => (
          <g key={`v${t}`}>
            <line y1={PAD} y2={PLOT_BOTTOM} x1={toX(t)} x2={toX(t)} stroke="rgba(77,216,255,0.08)" />
            <text x={toX(t)} y={HEIGHT - PAD + 16} textAnchor="middle" className="mc-axis">
              {t}
            </text>
          </g>
        ))}
        <text x={(PAD + (WIDTH - PAD)) / 2} y={HEIGHT - 8} textAnchor="middle" className="mc-axis" style={{ fontSize: 10, letterSpacing: '0.06em' }}>
          COMPLEXITY — higher means harder to follow →
        </text>
        <text
          x={14}
          y={HEIGHT / 2}
          textAnchor="middle"
          className="mc-axis"
          style={{ fontSize: 10, letterSpacing: '0.06em' }}
          transform={`rotate(-90 14 ${HEIGHT / 2})`}
        >
          TEST COVERAGE % — higher means safer to change →
        </text>

        {files.map((file) => {
          const measured = typeof file.coverage === 'number'
          const cx = toX(file.complexity)
          const cy = measured ? toY(file.coverage) : NA_Y
          const r = radiusOf(file.loc)
          const label = measured
            ? `${file.name} - complexity ${file.complexity}, ${file.coverage}% coverage`
            : `${file.name} - complexity ${file.complexity}, coverage not measured`

          const dot = (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={measured ? SEV[file.severity] : 'none'}
              fillOpacity="0.85"
              stroke={measured ? 'var(--bg)' : SEV[file.severity]}
              strokeWidth={measured ? 1 : 1.5}
              strokeDasharray={measured ? undefined : '3 2'}
            >
              <title>{label}</title>
            </circle>
          )

          if (!onSelectFile) {
            return <g key={file.name}>{dot}</g>
          }

          return (
            <g
              key={file.name}
              role="button"
              tabIndex={0}
              aria-label={label}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectFile(file.name)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onSelectFile(file.name)
              }}
            >
              <circle cx={cx} cy={cy} r={r + 6} fill="transparent" />
              {dot}
            </g>
          )
        })}
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, padding: '8px 18px 16px', fontSize: 11.5, color: 'var(--ink-dim)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="26" height="18">
            <circle cx="6" cy="9" r="3" fill="var(--cyan)" />
            <circle cx="19" cy="9" r="7" fill="var(--cyan)" />
          </svg>
          <span>Point size = file length (LOC)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="mc-dot" style={{ background: SEV.low }} />
            Nominal
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="mc-dot" style={{ background: SEV.medium }} />
            Caution
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="mc-dot" style={{ background: SEV.high }} />
            Critical
          </span>
        </div>
      </div>
    </div>
  )
}

export default HotspotScatter
