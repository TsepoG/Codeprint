#!/usr/bin/env node
// Entry point for the network-enabled "clone" container (see
// ../../../../Dockerfile.scan-runner and ../dockerRunner.js). Runs inside
// the sandboxed container - this is one of only two places that ever
// touches an untrusted repo's actual content (the other is
// analyzePhase.js). Takes the repo URL as argv[2], clones it into the
// shared workspace volume, runs npm audit, and writes exactly one JSON
// line to stdout. Never throws past `main()`.
import { isValidRepoUrl } from '../clone.js';
import { clonePhase } from '../index.js';
import { WORKSPACE } from './workspace.js';

/**
 * @param {unknown} payload
 */
function report(payload) {
  process.stdout.write(JSON.stringify(payload));
}

async function main() {
  const repoUrl = process.argv[2];

  if (!isValidRepoUrl(repoUrl)) {
    report({
      ok: false,
      error: 'Error',
      message: 'repoUrl must be a valid https://github.com/<owner>/<repo> or https://gitlab.com/<owner>/<repo> URL',
    });
    process.exitCode = 1;
    return;
  }

  try {
    const result = await clonePhase(repoUrl, WORKSPACE);
    report({ ok: true, result });
  } catch (err) {
    report({ ok: false, error: err.name, message: err.message });
    process.exitCode = 1;
  }
}

main();
