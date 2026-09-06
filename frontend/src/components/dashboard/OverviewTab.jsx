import { Bug, ShieldAlert, FileCode2, Copy, Server } from 'lucide-react'
import HudFrame from '../mission-control/HudFrame.jsx'
import HealthDial from '../mission-control/HealthDial.jsx'
import SevBadge from '../mission-control/SevBadge.jsx'
import { SEV, SEV_LABEL } from '../mission-control/severity.js'
import SummaryPanel from './SummaryPanel.jsx'
import { rankFiles } from './rankFiles.js'

const MAX_HOTSPOT_ROWS = 5
const MAX_HERO_ITEMS = 3
const MAX_COMPLEXITY_SCALE = 30

function formatCount(value) {
  const n = Number(value) || 0
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

/** The worst severity among a set of findings - 'low' (nominal) when there are none. */
function worstSeverity(findings) {
  if (findings.some((finding) => finding.severity === 'high')) return 'high'
  if (findings.some((finding) => finding.severity === 'medium')) return 'medium'
  return 'low'
}

/**
 * The hero's headline + color, on the same 75/50 thresholds as the dial
 * itself (see HealthDial.jsx) so the two always agree.
 *
 * @param {number|null} score
 * @returns {{text: string, color: string}}
 */
function heroStatus(score) {
  if (typeof score !== 'number') return { text: 'Health score unavailable', color: 'var(--ink-dim)' }
  if (score >= 75) return { text: 'Nominal — healthy', color: 'var(--mint)' }
  if (score >= 50) return { text: 'Caution — attention required', color: 'var(--amber)' }
  return { text: 'Critical — immediate action required', color: 'var(--red)' }
}

/**
 * One mission-control metric chip: icon + severity dot on top, the value,
 * then the label. Renders as a button only when `onClick` is given, the
 * same way the tiles it replaces did - a chip that does nothing shouldn't
 * advertise itself as pressable.
 *
 * @param {object} props
 * @param {import('react').ComponentType} props.icon
 * @param {string} props.label
 * @param {string} props.value
 * @param {'high'|'medium'|'low'} props.severity
 * @param {() => void} [props.onClick]
 */
function Chip({ icon: Icon, label, value, severity, onClick }) {
  const content = (
    <>
      <div className="mc-chip-top">
        <Icon size={14} color="var(--ink-dim)" />
        <span className="mc-dot" style={{ background: SEV[severity] }} />
      </div>
      <div className="mc-chip-val">{value}</div>
      <div className="mc-chip-label">{label}</div>
    </>
  )

  if (!onClick) {
    return <div className="mc-chip">{content}</div>
  }

  return (
    <button type="button" className="mc-chip" onClick={onClick} aria-label={`${label} - view findings`}>
      {content}
    </button>
  )
}

/**
 * @param {object} props
 * @param {object} props.result
 * @param {(category: string) => void} [props.onSelectCategory] Opens the
 *   detail panel for a metric. Without it the chips stay plain blocks.
 */
function OverviewTab({ result, onSelectCategory }) {
  const findings = result.findings ?? []
  const infrastructure = result.infrastructure
  const infraFindings = infrastructure?.findings ?? []
  const files = result.files ?? []
  const ranked = rankFiles(files)
  const hotspots = ranked.slice(0, MAX_HOTSPOT_ROWS)
  const status = heroStatus(result.healthScore ?? null)
  const criticalFileCount = files.filter((file) => file.severity === 'high').length

  /** @param {string} category */
  const severityFor = (category) => worstSeverity(findings.filter((finding) => finding.category === category))
  /** @param {string} category */
  const open = (category) => (onSelectCategory ? () => onSelectCategory(category) : undefined)

  return (
    // `mc` brings in the mission-control theme's tokens (see
    // mission-control/missionControl.css) that HudFrame/Chip/HealthDial/
    // SevBadge below all read via var(--panel)/var(--cyan)/etc. - only
    // Overview has adopted the new look so far, so this class stays scoped
    // to this tab rather than the whole dashboard shell.
    <div className="dashboard-section mc">
      <HudFrame style={{ marginBottom: 18 }}>
        <div className="mc-hero">
          <HealthDial score={result.healthScore ?? null} />
          <div>
            <div className="mc-hero-status" style={{ color: status.color }}>
              {status.text}
            </div>
            <div className="mc-hero-sub">
              {files.length === 0
                ? 'No files were flagged this scan.'
                : `${files.length} file${files.length === 1 ? '' : 's'} flagged this scan${
                    criticalFileCount > 0 ? `, ${criticalFileCount} at critical severity` : ''
                  }.`}
            </div>
            {hotspots.slice(0, MAX_HERO_ITEMS).map((file) => (
              <div className="mc-hero-item" key={file.name}>
                <span className="mc-dot" style={{ background: SEV[file.severity] }} />
                <span className="mc-mono">{file.name}</span>
                <span>
                  cx {file.complexity} · {SEV_LABEL[file.severity]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </HudFrame>

      <div className="mc-chips">
        <Chip icon={Bug} label="Bugs" value={formatCount(result.metrics.bugs)} severity={severityFor('bug')} onClick={open('bug')} />
        <Chip
          icon={ShieldAlert}
          label="Vulnerabilities"
          value={formatCount(result.metrics.vulnerabilities)}
          severity={severityFor('vulnerability')}
          onClick={open('vulnerability')}
        />
        <Chip
          icon={FileCode2}
          label="Code smells"
          value={formatCount(result.metrics.codeSmells)}
          severity={severityFor('codeSmell')}
          onClick={open('codeSmell')}
        />
        <Chip
          icon={Copy}
          label="Duplication"
          value={`${result.metrics.duplicationPct.toFixed(1)}%`}
          severity={severityFor('duplication')}
          onClick={open('duplication')}
        />
        {/* Only for repos that actually have Terraform - a permanent "0" on
            every JS repo would be noise, not information. */}
        {infrastructure?.detected && (
          <Chip
            icon={Server}
            label="Infra findings"
            value={formatCount(infraFindings.length)}
            severity={worstSeverity(infraFindings)}
            onClick={open('infra')}
          />
        )}
      </div>

      <HudFrame style={{ marginBottom: 18 }}>
        <div className="mc-panel-head">
          <span>Top hotspot targets</span>
        </div>
        {hotspots.length === 0 ? (
          <p className="empty-note" style={{ padding: '0 18px 16px' }}>
            No hotspots - the linter found nothing to report.
          </p>
        ) : (
          <table className="mc-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Complexity</th>
                <th>Coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {hotspots.map((file) => (
                <tr key={file.name}>
                  <td className="mc-mono">{file.name}</td>
                  <td>
                    <span className="mc-bar">
                      <span
                        style={{
                          width: `${Math.min(100, (file.complexity / MAX_COMPLEXITY_SCALE) * 100)}%`,
                          background: SEV[file.severity],
                        }}
                      />
                    </span>
                    <span className="mc-mono">{file.complexity}</span>
                  </td>
                  <td>
                    {file.coverage == null ? (
                      <span className="mc-mono">—</span>
                    ) : (
                      <>
                        <span className="mc-bar">
                          <span style={{ width: `${file.coverage}%`, background: 'var(--cyan)' }} />
                        </span>
                        <span className="mc-mono">{file.coverage}%</span>
                      </>
                    )}
                  </td>
                  <td>
                    <SevBadge severity={file.severity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </HudFrame>

      <SummaryPanel narrative={result.narrative} />

      {result.warnings?.length > 0 && (
        <div className="status-panel warning-panel">
          <strong>Some checks were skipped:</strong>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default OverviewTab
