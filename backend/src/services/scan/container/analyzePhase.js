#!/usr/bin/env node
// Entry point for the network-disabled ("--network none") "analyze"
// container (see ../../../../Dockerfile.scan-runner and ../dockerRunner.js).
// Runs eslint/madge/jscpd - plus checkov/tfsec when clonePhase.js found
// Terraform - against the workspace clonePhase.js already populated, and
// produces the final unified scan response, folding in clonePhase's
// npm-audit result and its .tf detection (both passed through as env vars,
// since that phase ran as a separate exec). Writes exactly one JSON line to
// stdout. Never throws past `main()`.
import { analyzePhase } from '../index.js';
import { WORKSPACE } from './workspace.js';

/**
 * @param {unknown} payload
 */
function report(payload) {
  process.stdout.write(JSON.stringify(payload));
}

/**
 * @returns {unknown}
 */
function readAuditResult() {
  try {
    return JSON.parse(process.env.CODEPRINT_AUDIT_RESULT ?? 'null');
  } catch {
    return null;
  }
}

async function main() {
  try {
    const result = await analyzePhase(WORKSPACE, readAuditResult(), process.env.CODEPRINT_HAS_TERRAFORM === 'true');
    report({ ok: true, result });
  } catch (err) {
    report({ ok: false, error: err.name, message: err.message });
    process.exitCode = 1;
  }
}

main();
