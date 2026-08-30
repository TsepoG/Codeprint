#!/usr/bin/env node
// Entry point for the scan-runner container (see ../../../../Dockerfile.scan-runner).
//
// Runs entirely inside the sandboxed container - this is the only place
// that actually clones an untrusted repo and runs eslint/madge/jscpd/npm
// against its contents. Takes the repo URL as argv[1], writes exactly one
// JSON line to stdout, and exits. Never throws past `main()`: every
// failure is captured and reported through the same envelope so the host
// side always has valid JSON to parse.
import { isValidGithubUrl } from '../clone.js';
import { scanRepoInProcess } from '../index.js';

/**
 * @param {unknown} result
 */
function reportSuccess(result) {
  process.stdout.write(JSON.stringify({ ok: true, result }));
}

/**
 * @param {Error} err
 */
function reportFailure(err) {
  process.stdout.write(JSON.stringify({ ok: false, error: err.name, message: err.message }));
}

async function main() {
  const repoUrl = process.argv[2];

  if (!isValidGithubUrl(repoUrl)) {
    reportFailure(new Error('repoUrl must be a valid https://github.com/<owner>/<repo> URL'));
    process.exitCode = 1;
    return;
  }

  try {
    const result = await scanRepoInProcess(repoUrl);
    reportSuccess(result);
  } catch (err) {
    reportFailure(err);
    process.exitCode = 1;
  }
}

main();
