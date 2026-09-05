#!/usr/bin/env node
// Entry point for the network-disabled ("--network none") "analyze"
// container (see ../../../../Dockerfile.scan-runner and ../dockerRunner.js).
// Runs eslint/madge/jscpd - plus checkov/tfsec/inframap when clonePhase.js
// found Terraform - against the workspace clonePhase.js already populated,
// and produces the final unified scan response, folding in clonePhase's
// npm-audit result and the Terraform layout it found (both passed through
// as env vars, since that phase ran as a separate exec). Writes exactly one
// JSON line to stdout. Never throws past `main()`.
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

/**
 * @returns {import('../detectTerraform.js').TerraformLayout}
 */
function readTerraformLayout() {
  const empty = { terraformDirs: [], stateFiles: [] };
  try {
    const parsed = JSON.parse(process.env.CODEPRINT_TERRAFORM ?? 'null');
    if (!Array.isArray(parsed?.terraformDirs)) return empty;
    return { terraformDirs: parsed.terraformDirs, stateFiles: parsed.stateFiles ?? [] };
  } catch {
    return empty;
  }
}

async function main() {
  try {
    const result = await analyzePhase(WORKSPACE, readAuditResult(), readTerraformLayout());
    report({ ok: true, result });
  } catch (err) {
    report({ ok: false, error: err.name, message: err.message });
    process.exitCode = 1;
  }
}

main();
