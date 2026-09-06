/**
 * Formats a duration in milliseconds as the mission-control shell's
 * "elapsed" readout - "T+HH:MM:SS", matching the mockup's REPO.elapsed
 * field (e.g. "T+00:04:12").
 *
 * @param {number|null|undefined} ms Non-negative; null/undefined if unknown.
 * @returns {string} "—" when `ms` isn't a usable non-negative number.
 */
export function formatElapsed(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—'

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n) => String(n).padStart(2, '0')

  return `T+${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
