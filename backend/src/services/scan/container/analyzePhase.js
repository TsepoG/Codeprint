#!/usr/bin/env node
// Entry point for the network-disabled ("--network none") "analyze"
// container (see ../../../../Dockerfile.scan-runner and ../dockerRunner.js).
// Runs eslint/madge/jscpd against the workspace volume clonePhase.js
// already populated (mounted here read-only) and produces the final
// unified scan response, folding in clonePhase's npm-audit result (passed
// through as an env var, since it ran in a different container). Writes
// exactly one JSON line to stdout. Never throws past `main()`.
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
    const result = await analyzePhase(WORKSPACE, readAuditResult());
    report({ ok: true, result });
  } catch (err) {
    report({ ok: false, error: err.name, message: err.message });
    process.exitCode = 1;
  }
}

main();
