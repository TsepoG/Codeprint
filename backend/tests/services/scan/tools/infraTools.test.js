import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { childProcess } from '../../../../src/services/scan/runTool.js';
import { runCheckov } from '../../../../src/services/scan/tools/checkov.js';
import { runTfsec } from '../../../../src/services/scan/tools/tfsec.js';

const TARGET_DIR = '/tmp/repo';

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
 * @param {{stdout?: string, error?: Error}} response What the mocked child process "returns".
 */
function mockTool({ stdout = '', error = null }) {
  childProcess.execFile = (command, args, options, callback) => {
    calls.push({ command, args });
    callback(error, stdout, error ? 'some stderr' : '');
  };
}

test('runCheckov scans the target directory as terraform, in JSON', async () => {
  mockTool({ stdout: JSON.stringify({ check_type: 'terraform', results: { failed_checks: [] } }) });

  const result = await runCheckov(TARGET_DIR);

  assert.equal(result.ok, true);
  assert.equal(calls[0].command, 'checkov');
  assert.deepEqual(calls[0].args, ['-d', TARGET_DIR, '-o', 'json', '--framework', 'terraform', '--compact', '--quiet']);
});

test('runCheckov returns the parsed report on success', async () => {
  const report = { check_type: 'terraform', results: { failed_checks: [{ check_id: 'CKV_AWS_18' }] } };
  mockTool({ stdout: JSON.stringify(report) });

  const result = await runCheckov(TARGET_DIR);

  assert.deepEqual(result, { ok: true, report });
});

test('runCheckov still succeeds when checkov exits non-zero but printed a report (it does that when checks fail)', async () => {
  const report = { check_type: 'terraform', results: { failed_checks: [{ check_id: 'CKV_AWS_18' }] } };
  mockTool({ stdout: JSON.stringify(report), error: new Error('Command failed: exit code 1') });

  const result = await runCheckov(TARGET_DIR);

  assert.equal(result.ok, true);
  assert.deepEqual(result.report, report);
});

test('runCheckov degrades to a reason when checkov is not installed', async () => {
  mockTool({ error: new Error('spawn checkov ENOENT') });

  const result = await runCheckov(TARGET_DIR);

  assert.equal(result.ok, false);
  assert.match(result.reason, /checkov failed to run: spawn checkov ENOENT/);
});

test('runCheckov degrades to a reason when the output is unparseable (e.g. malformed HCL bailout)', async () => {
  mockTool({ stdout: '[ERROR] failed to parse main.tf' });

  const result = await runCheckov(TARGET_DIR);

  assert.deepEqual(result, { ok: false, reason: 'checkov produced no parseable output' });
});

test('runCheckov never throws, whatever the tool does', async () => {
  mockTool({ stdout: '', error: new Error('killed by timeout') });

  await assert.doesNotReject(runCheckov(TARGET_DIR));
});

test('runTfsec scans the target directory in JSON, with colour and hard-fail off', async () => {
  mockTool({ stdout: JSON.stringify({ results: [] }) });

  const result = await runTfsec(TARGET_DIR);

  assert.equal(result.ok, true);
  assert.equal(calls[0].command, 'tfsec');
  assert.deepEqual(calls[0].args, [TARGET_DIR, '--format', 'json', '--no-colour', '--soft-fail']);
});

test('runTfsec returns the parsed report on success', async () => {
  const report = { results: [{ long_id: 'aws-s3-enable-bucket-encryption', severity: 'HIGH' }] };
  mockTool({ stdout: JSON.stringify(report) });

  assert.deepEqual(await runTfsec(TARGET_DIR), { ok: true, report });
});

test('runTfsec degrades to a reason when tfsec is not installed', async () => {
  mockTool({ error: new Error('spawn tfsec ENOENT') });

  const result = await runTfsec(TARGET_DIR);

  assert.equal(result.ok, false);
  assert.match(result.reason, /tfsec failed to run: spawn tfsec ENOENT/);
});

test('runTfsec degrades to a reason when the output is unparseable', async () => {
  mockTool({ stdout: 'failed to parse HCL: main.tf:3,1-2: Argument or block definition required' });

  const result = await runTfsec(TARGET_DIR);

  assert.deepEqual(result, { ok: false, reason: 'tfsec produced no parseable output' });
});

test('runTfsec never throws, whatever the tool does', async () => {
  mockTool({ stdout: '', error: new Error('killed by timeout') });

  await assert.doesNotReject(runTfsec(TARGET_DIR));
});

test('runTfsec keeps the failure reason to one line, discarding the deprecation banner tfsec prints on every run', async () => {
  // Verbatim shape of what a real tfsec failure produces: execFile folds the
  // child's whole stderr - banner included - into error.message.
  mockTool({
    error: new Error(
      [
        'Command failed: tfsec /tmp/repo --format json --no-colour --soft-fail',
        '',
        '======================================================',
        'tfsec is joining the Trivy family',
        '',
        'tfsec will continue to remain available ',
        'for the time being, although our engineering ',
        'attention will be directed at Trivy going forward.',
        '',
        'You can read more here: ',
        'https://github.com/aquasecurity/tfsec/discussions/1994',
        '======================================================',
      ].join('\n'),
    ),
  });

  const result = await runTfsec(TARGET_DIR);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'tfsec failed to run: Command failed: tfsec /tmp/repo --format json --no-colour --soft-fail');
  assert.ok(!result.reason.includes('\n'), 'reason should be a single line');
  assert.ok(!result.reason.includes('Trivy'), 'banner text should not leak into the warning');
});

test('an over-long failure reason is truncated rather than dumped whole', async () => {
  mockTool({ error: new Error('x'.repeat(500)) });

  const result = await runCheckov(TARGET_DIR);

  assert.ok(result.reason.length < 250, `reason was ${result.reason.length} chars`);
  assert.ok(result.reason.endsWith('…'));
});
