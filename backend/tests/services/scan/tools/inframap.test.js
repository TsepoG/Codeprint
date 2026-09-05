import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { childProcess } from '../../../../src/services/scan/runTool.js';
import { runInframap } from '../../../../src/services/scan/tools/inframap.js';

const REPO_DIR = '/tmp/repo';

// Verbatim inframap output shape (captured from inframap 0.8.0 with
// --show-icons=false --clean=false).
const DOT_PROD = `strict digraph G {
\t"aws_instance.prod_app"->"aws_security_group.sg";
\t"aws_instance.prod_app" [ shape=ellipse ];
\t"aws_s3_bucket.prod_assets" [ shape=ellipse ];
\t"aws_security_group.sg" [ shape=rectangle ];

}
`;

let originalExecFile;
/** @type {{command: string, args: string[]}[]} */
let calls;

beforeEach(() => {
  originalExecFile = childProcess.execFile;
  calls = [];
});

afterEach(() => {
  childProcess.execFile = originalExecFile;
});

/**
 * @param {(args: string[]) => {stdout?: string, error?: Error}} respond
 */
function mockInframap(respond) {
  childProcess.execFile = (command, args, options, callback) => {
    calls.push({ command, args });
    const { stdout = '', error = null } = respond(args);
    callback(error, stdout, error ? 'inframap: error output' : '');
  };
}

test('runs once per Terraform directory, with the HCL parser and absolute paths', async () => {
  mockInframap(() => ({ stdout: DOT_PROD }));

  const result = await runInframap(REPO_DIR, { terraformDirs: ['envs/prod', 'envs/dev'], stateFiles: [] });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'inframap');
  assert.deepEqual(calls[0].args, [
    'generate', '--show-icons=false', '--clean=false', '--hcl', '/tmp/repo/envs/prod',
  ]);
  assert.deepEqual(calls[1].args, [
    'generate', '--show-icons=false', '--clean=false', '--hcl', '/tmp/repo/envs/dev',
  ]);
});

test('passes the repo root itself for root-level Terraform', async () => {
  mockInframap(() => ({ stdout: DOT_PROD }));

  await runInframap(REPO_DIR, { terraformDirs: [''], stateFiles: [] });

  assert.deepEqual(calls[0].args.slice(-2), ['--hcl', REPO_DIR]);
});

test('prefers state files over HCL when the repo committed any', async () => {
  mockInframap(() => ({ stdout: DOT_PROD }));

  const result = await runInframap(REPO_DIR, {
    terraformDirs: ['infra'],
    stateFiles: ['infra/terraform.tfstate'],
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1, 'state files replace the HCL pass rather than adding to it');
  assert.deepEqual(calls[0].args.slice(-2), ['--tfstate', '/tmp/repo/infra/terraform.tfstate']);
  assert.equal(result.graphs[0].dir, 'infra');
});

test('a state file at the repo root is tagged with the root, not "."', async () => {
  mockInframap(() => ({ stdout: DOT_PROD }));

  const result = await runInframap(REPO_DIR, { terraformDirs: [''], stateFiles: ['terraform.tfstate'] });

  assert.deepEqual(calls[0].args.slice(-2), ['--tfstate', '/tmp/repo/terraform.tfstate']);
  assert.equal(result.graphs[0].dir, '', 'a "." here would namespace every node under "./"');
});

test('returns each directory\'s DOT tagged with the directory it came from', async () => {
  mockInframap((args) => ({ stdout: args.includes('/tmp/repo/envs/prod') ? DOT_PROD : 'strict digraph G {\n}\n' }));

  const result = await runInframap(REPO_DIR, { terraformDirs: ['envs/prod', 'envs/dev'], stateFiles: [] });

  assert.deepEqual(result.graphs.map((g) => g.dir), ['envs/prod', 'envs/dev']);
  assert.equal(result.graphs[0].dot, DOT_PROD);
});

test('a directory that fails is skipped while the rest still graph', async () => {
  mockInframap((args) =>
    args.includes('/tmp/repo/broken')
      ? { error: new Error('Command failed: inframap\nInvalid block definition') }
      : { stdout: DOT_PROD },
  );

  const result = await runInframap(REPO_DIR, { terraformDirs: ['good', 'broken'], stateFiles: [] });

  assert.equal(result.ok, true);
  assert.deepEqual(result.graphs.map((g) => g.dir), ['good']);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].dir, 'broken');
  assert.match(result.skipped[0].reason, /Command failed: inframap/);
  assert.ok(!result.skipped[0].reason.includes('\n'), 'reason should be one line');
});

test('fails only when no directory produced a graph', async () => {
  mockInframap(() => ({ error: new Error('spawn inframap ENOENT') }));

  const result = await runInframap(REPO_DIR, { terraformDirs: ['a', 'b'], stateFiles: [] });

  assert.equal(result.ok, false);
  assert.match(result.reason, /inframap failed to run: spawn inframap ENOENT/);
});

test('treats output with no digraph as a failure even when the exit code was clean', async () => {
  mockInframap(() => ({ stdout: 'Usage:\n  inframap generate [FILE] [flags]\n' }));

  const result = await runInframap(REPO_DIR, { terraformDirs: ['infra'], stateFiles: [] });

  assert.equal(result.ok, false);
  assert.match(result.reason, /inframap produced no graph/);
});

test('reports a clear reason when there is nothing to graph', async () => {
  mockInframap(() => ({ stdout: DOT_PROD }));

  const result = await runInframap(REPO_DIR, { terraformDirs: [], stateFiles: [] });

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test('never throws, whatever the tool does', async () => {
  mockInframap(() => ({ error: new Error('killed by timeout') }));

  await assert.doesNotReject(runInframap(REPO_DIR, { terraformDirs: ['infra'], stateFiles: [] }));
});
