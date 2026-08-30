import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { childProcess } from '../../../src/services/scan/runTool.js';
import { runScan } from '../../../src/services/scan/dockerRunner.js';
import { CloneError, RepoTooLargeError, ScanTimeoutError } from '../../../src/services/scan/errors.js';

const REPO_URL = 'https://github.com/owner/repo';

const CLONE_OK = { ok: true, result: { auditResult: { ok: true, audit: { metadata: { vulnerabilities: { total: 0 } } } }, branch: 'main', commitSha: 'abc123' } };
const ANALYZE_OK = {
  ok: true,
  result: {
    metrics: { bugs: 1, vulnerabilities: 0, codeSmells: 0, duplicationPct: 0 },
    files: [{ name: 'src/index.js', complexity: 3, coverage: null, severity: 'low' }],
    dependencyGraph: { nodes: [], edges: [] },
    warnings: [],
  },
};

let originalExecFile;
let originalFetch;
/** Every `docker` invocation the mock saw, as `args` arrays - lets tests assert on call order/count. */
let calls;

beforeEach(() => {
  originalExecFile = childProcess.execFile;
  originalFetch = global.fetch;
  calls = [];
  // The pre-flight size check (repoSizeCheck.js) hits a real provider API by
  // default - fail it fast and "unknown" so runScan falls through to
  // starting the container, exactly as it would if GitHub's API were
  // unreachable or rate-limited.
  global.fetch = () => Promise.reject(new Error('network disabled in tests'));
});

afterEach(() => {
  childProcess.execFile = originalExecFile;
  global.fetch = originalFetch;
});

/**
 * Installs a mock `execFile` that answers the exact `docker` subcommand
 * sequence `dockerRunner.js` runs (`run`, `exec` x2, `network disconnect`,
 * `stop`), so no real Docker daemon is ever touched.
 *
 * @param {object} [opts]
 * @param {object} [opts.cloneResult] Parsed JSON `clonePhase.js` "wrote to stdout".
 * @param {object} [opts.analyzeResult] Parsed JSON `analyzePhase.js` "wrote to stdout".
 * @param {boolean} [opts.runFails]
 * @param {boolean} [opts.networkDisconnectFails]
 */
function mockDocker({ cloneResult = CLONE_OK, analyzeResult = ANALYZE_OK, runFails = false, networkDisconnectFails = false } = {}) {
  childProcess.execFile = (command, args, options, callback) => {
    calls.push(args);
    assert.equal(command, 'docker');
    const [sub] = args;

    if (sub === 'run') {
      if (runFails) return callback(new Error('spawn docker ENOENT'), '', 'docker: command not found');
      return callback(null, 'fake-container-id\n', '');
    }
    if (sub === 'exec') {
      const isClonePhase = args.some((a) => typeof a === 'string' && a.includes('clonePhase.js'));
      return callback(null, JSON.stringify(isClonePhase ? cloneResult : analyzeResult), '');
    }
    if (sub === 'network') {
      if (networkDisconnectFails) return callback(new Error('disconnect failed'), '', 'no such network');
      return callback(null, '', '');
    }
    if (sub === 'stop') {
      return callback(null, '', '');
    }
    return callback(new Error(`mockDocker: unexpected subcommand "${sub}"`), '', '');
  };
}

test('runScan resolves the normalized result merged with the clone phase branch/commitSha', async () => {
  mockDocker();

  const result = await runScan(REPO_URL);

  assert.deepEqual(result, { ...ANALYZE_OK.result, branch: 'main', commitSha: 'abc123' });
});

test('runScan stops the container after a successful scan', async () => {
  mockDocker();
  await runScan(REPO_URL);

  assert.ok(calls.some((args) => args[0] === 'stop'));
});

test('runScan rejects with CloneError when the clone phase reports one, and never runs the analyze phase', async () => {
  mockDocker({ cloneResult: { ok: false, error: 'CloneError', message: 'git clone failed: repository not found' } });

  await assert.rejects(runScan(REPO_URL), (err) => {
    assert.ok(err instanceof CloneError);
    assert.equal(err.message, 'git clone failed: repository not found');
    return true;
  });

  assert.ok(!calls.some((args) => args[0] === 'network'), 'should not disconnect the network for a clone that never succeeded');
  assert.ok(!calls.some((args) => args.some((a) => typeof a === 'string' && a.includes('analyzePhase.js'))));
});

test('runScan rejects with RepoTooLargeError when the clone phase reports the repo exceeds the size cap', async () => {
  mockDocker({ cloneResult: { ok: false, error: 'RepoTooLargeError', message: 'Repository is ~600MB, which exceeds the 500MB scan limit' } });

  await assert.rejects(runScan(REPO_URL), (err) => {
    assert.ok(err instanceof RepoTooLargeError);
    assert.match(err.message, /exceeds the 500MB scan limit/);
    return true;
  });
});

test('runScan rejects with ScanTimeoutError when the analyze phase reports one', async () => {
  mockDocker({ analyzeResult: { ok: false, error: 'ScanTimeoutError', message: 'Scan timed out' } });

  await assert.rejects(runScan(REPO_URL), (err) => {
    assert.ok(err instanceof ScanTimeoutError);
    return true;
  });
});

test('runScan falls back to a plain Error for an unrecognized error name from either phase', async () => {
  mockDocker({ cloneResult: { ok: false, error: 'SomethingUnexpected', message: 'boom' } });

  await assert.rejects(runScan(REPO_URL), (err) => {
    assert.equal(err.constructor, Error);
    assert.equal(err.message, 'boom');
    return true;
  });
});

test('runScan rejects when the container itself fails to start, without ever exec-ing into it', async () => {
  mockDocker({ runFails: true });

  await assert.rejects(runScan(REPO_URL), /failed to start scan container/);

  assert.ok(!calls.some((args) => args[0] === 'exec'));
});

test('runScan rejects when disconnecting the network fails, and still stops the container', async () => {
  mockDocker({ networkDisconnectFails: true });

  await assert.rejects(runScan(REPO_URL), /failed to disconnect scan container network/);
  assert.ok(calls.some((args) => args[0] === 'stop'), 'cleanup should still run after a mid-scan failure');
});

test('runScan still stops the container when the clone phase fails', async () => {
  mockDocker({ cloneResult: { ok: false, error: 'CloneError', message: 'nope' } });

  await assert.rejects(runScan(REPO_URL));
  assert.ok(calls.some((args) => args[0] === 'stop'));
});

test('runScan rejects with RepoTooLargeError from the pre-flight check, without starting a container at all', async () => {
  global.fetch = (url) => {
    assert.match(String(url), /api\.github\.com/);
    return Promise.resolve({ ok: true, json: async () => ({ size: 600_000 }) }); // 600,000 KB ~= 586MB
  };
  mockDocker();

  await assert.rejects(runScan(REPO_URL), (err) => {
    assert.ok(err instanceof RepoTooLargeError);
    return true;
  });

  assert.equal(calls.length, 0, 'docker should never be invoked once the pre-flight check rejects the repo');
});
