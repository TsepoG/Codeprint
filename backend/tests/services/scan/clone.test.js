import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isValidRepoUrl, cloneRepo, getClonedRevision } from '../../../src/services/scan/clone.js';
import { CloneError } from '../../../src/services/scan/errors.js';
import { childProcess } from '../../../src/services/scan/runTool.js';

test('isValidRepoUrl accepts github.com and gitlab.com repo URLs', () => {
  assert.equal(isValidRepoUrl('https://github.com/owner/repo'), true);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo.git'), true);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo/'), true);
  assert.equal(isValidRepoUrl('https://gitlab.com/owner/repo'), true);
  assert.equal(isValidRepoUrl('  https://github.com/owner/repo  '), true);
});

test('isValidRepoUrl rejects non-string/empty input', () => {
  assert.equal(isValidRepoUrl(undefined), false);
  assert.equal(isValidRepoUrl(null), false);
  assert.equal(isValidRepoUrl(42), false);
  assert.equal(isValidRepoUrl(''), false);
  assert.equal(isValidRepoUrl('not a url at all'), false);
});

test('isValidRepoUrl rejects non-https schemes', () => {
  assert.equal(isValidRepoUrl('http://github.com/owner/repo'), false);
  assert.equal(isValidRepoUrl('git://github.com/owner/repo'), false);
  assert.equal(isValidRepoUrl('ssh://git@github.com/owner/repo'), false);
  assert.equal(isValidRepoUrl('git@github.com:owner/repo.git'), false);
  assert.equal(isValidRepoUrl('file:///etc/passwd'), false);
  assert.equal(isValidRepoUrl('ext::sh -c curl evil.example'), false);
});

test('isValidRepoUrl rejects hosts outside the allowlist, including SSRF targets', () => {
  assert.equal(isValidRepoUrl('https://evil.example/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://localhost/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://127.0.0.1/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://[::1]/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://169.254.169.254/owner/repo'), false); // cloud metadata endpoint
  assert.equal(isValidRepoUrl('https://10.0.0.5/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://internal.corp/owner/repo'), false);
  // Decimal-encoded 127.0.0.1 - the URL parser canonicalizes this to a
  // dotted-decimal IPv4 hostname before our allowlist check ever runs.
  assert.equal(isValidRepoUrl('https://2130706433/owner/repo'), false);
});

test('isValidRepoUrl rejects hostname confusion tricks', () => {
  assert.equal(isValidRepoUrl('https://github.com.evil.example/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://evil.example/github.com/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://github.com@evil.example/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://github.com%2F@evil.example/owner/repo'), false);
});

test('isValidRepoUrl rejects userinfo, a non-default port, and query/fragment', () => {
  assert.equal(isValidRepoUrl('https://user:pass@github.com/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://github.com:8443/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo?x=1'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo#frag'), false);
});

test('isValidRepoUrl rejects malformed or extra path segments', () => {
  assert.equal(isValidRepoUrl('https://github.com/'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo/extra'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner//repo'), false);
});

let originalExecFile;

beforeEach(() => {
  originalExecFile = childProcess.execFile;
});

afterEach(() => {
  childProcess.execFile = originalExecFile;
});

test('cloneRepo runs a shallow, single-branch, no-tags git clone with the given URL and destination', () => {
  let capturedArgs;
  childProcess.execFile = (command, args, options, callback) => {
    capturedArgs = args;
    assert.equal(command, 'git');
    callback(null, '', '');
  };

  return cloneRepo('https://github.com/owner/repo', '/tmp/dest').then(() => {
    assert.deepEqual(capturedArgs, [
      'clone',
      '--depth', '1',
      '--single-branch',
      '--no-tags',
      '--',
      'https://github.com/owner/repo',
      '/tmp/dest',
    ]);
  });
});

test('cloneRepo throws CloneError with git\'s stderr when the clone fails', async () => {
  childProcess.execFile = (command, args, options, callback) => {
    callback(new Error('exit code 128'), '', "fatal: repository 'https://github.com/owner/repo' not found\n");
  };

  await assert.rejects(cloneRepo('https://github.com/owner/repo', '/tmp/dest'), (err) => {
    assert.ok(err instanceof CloneError);
    assert.match(err.message, /repository 'https:\/\/github\.com\/owner\/repo' not found/);
    return true;
  });
});

test("cloneRepo falls back to the error's own message when git produced no stderr", async () => {
  childProcess.execFile = (command, args, options, callback) => {
    callback(new Error('spawn git ENOENT'), '', '');
  };

  await assert.rejects(cloneRepo('https://github.com/owner/repo', '/tmp/dest'), /spawn git ENOENT/);
});

test('getClonedRevision reads back the checked-out branch and commit via git rev-parse', async () => {
  childProcess.execFile = (command, args, options, callback) => {
    if (args.includes('--abbrev-ref')) return callback(null, 'main\n', '');
    return callback(null, 'abc123def456\n', '');
  };

  const revision = await getClonedRevision('/tmp/dest');
  assert.deepEqual(revision, { branch: 'main', commitSha: 'abc123def456' });
});

test('getClonedRevision resolves branch/commitSha as null (rather than throwing) when git fails', async () => {
  childProcess.execFile = (command, args, options, callback) => {
    callback(new Error('not a git repository'), '', 'fatal: not a git repository');
  };

  const revision = await getClonedRevision('/tmp/dest');
  assert.deepEqual(revision, { branch: null, commitSha: null });
});
