// Severity vocabulary for the mission-control theme (see
// frontend/design-reference/codebase-dashboard-v3-mission-control.jsx).
// Copied verbatim from the mockup's SEV/SEV_LABEL/SEV_DESC - only SevBadge
// uses these so far.

export const SEV = { high: '#ff5c5c', medium: '#ffb84d', low: '#4fe8a0' }

export const SEV_LABEL = { high: 'CRITICAL', medium: 'CAUTION', low: 'NOMINAL' }

export const SEV_DESC = {
  high: 'Critical — an active risk: a security vulnerability, a circular dependency, or complexity far past a safe threshold. Fix before adding more code here.',
  medium: "Caution — above a healthy threshold but not breaking anything today. Worth cleaning up next time you're in this file.",
  low: 'Nominal — within healthy thresholds for this project. No action needed.',
}
