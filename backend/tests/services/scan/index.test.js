// Covers the orchestration in src/services/scan/index.js: which tools
// analyzePhase actually spawns, and how the Terraform layout that
// clonePhase found decides that. The individual tool wrappers and the
// normalization they feed are covered in tools/*.test.js and
// normalize.test.js - what matters here is the wiring between them, so
// every child process is stubbed at the runTool.js seam and no real
// binary (checkov, tfsec, inframap, eslint, ...) is ever invoked.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { childProcess } from '../../../src/services/scan/runTool.js';
import { scanForTerraform } from '../../../src/services/scan/detectTerraform.js';
import { analyzePhase } from '../../../src/services/scan/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '__fixtures__');

const INFRA_TOOLS = ['checkov', 'tfsec', 'inframap'];

// Verbatim inframap 0.8.0 output (--show-icons=false --clean=false).
const DOT = `strict digraph G {
\t"aws_instance.app"->"aws_security_group.web";
\t"aws_instance.app" [ shape=ellipse ];
\t"aws_security_group.web" [ shape=rectangle ];

}
`;

/** @param {string} name @returns {any} */
function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

let workspace;
let originalExecFile;
/** @type {{tool: string, args: string[]}[]} */
let spawned;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'codeprint-analyze-'));
  originalExecFile = childProcess.execFile;
  spawned = [];
});

afterEach(async () => {
  childProcess.execFile = originalExecFile;
  await rm(workspace, { recursive: true, force: true });
});

/** @param {string} relPath @param {string} [contents] */
async function write(relPath, contents = '') {
  const full = path.join(workspace, ...relPath.split('/'));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, contents);
}

/**
 * The JS tools are spawned as `node <path/to/pkg/bin>`, the infra tools by
 * name off PATH, so the tool a call belongs to is read back out of either.
 *
 * @param {string} command @param {string[]} args
 */
function toolName(command, args) {
  if (command !== process.execPath) return command;
  return ['eslint', 'madge', 'jscpd'].find((pkg) => args[0]?.includes(pkg)) ?? path.basename(args[0] ?? command);
}

/**
 * Records every spawn and answers with plausible output for that tool.
 * jscpd is deliberately left to fail: it reads its report back from a file
 * no stubbed process ever writes, which is a realistic partial failure and
 * keeps the assertions below about the infra half.
 *
 * @param {Record<string, string>} [overrides] Per-tool stdout, keyed by tool name.
 */
function mockTools(overrides = {}) {
  const stdout = {
    eslint: '[]',
    madge: '{}',
    checkov: JSON.stringify(loadFixture('checkov-report.json')),
    tfsec: JSON.stringify(tfsecReport()),
    inframap: DOT,
    ...overrides,
  };

  childProcess.execFile = (command, args, options, callback) => {
    const tool = toolName(command, args);
    spawned.push({ tool, args });
    callback(null, stdout[tool] ?? '', '');
  };
}

/** tfsec reports absolute paths under the directory it was pointed at; the fixture stores them repo-relative. */
function tfsecReport() {
  const report = loadFixture('tfsec-report.json');
  return {
    results: report.results.map((result) => ({
      ...result,
      location: { ...result.location, filename: path.join(workspace, ...result.location.filename.split('/')) },
    })),
  };
}

/** Runs the phases in the order dockerRunner.js does: detect during the clone, then analyze. */
async function scan() {
  const terraform = await scanForTerraform(workspace);
  return analyzePhase(workspace, { ok: false, reason: 'no package-lock.json found; skipping npm audit' }, terraform);
}

/** @param {string} tool */
function spawnsOf(tool) {
  return spawned.filter((call) => call.tool === tool);
}

test('a repo with no .tf files never spawns the infrastructure tools', async () => {
  await write('src/index.js', 'export default 1');
  await write('package.json', '{"name":"app"}');
  mockTools();

  await scan();

  assert.deepEqual(
    spawned.map((call) => call.tool).filter((tool) => INFRA_TOOLS.includes(tool)),
    [],
  );
  // ...while the JS tools still ran, so this is a skip, not a dead pipeline.
  assert.equal(spawnsOf('eslint').length, 1);
  assert.equal(spawnsOf('madge').length, 1);
});

test('a repo with no .tf files reports infrastructure.detected false with an empty section', async () => {
  await write('src/index.js', 'export default 1');
  mockTools();

  const { infrastructure } = await scan();

  assert.deepEqual(infrastructure, { detected: false, findings: [], graph: { nodes: [], edges: [] } });
});

test('a repo with no .tf files gains no infrastructure warnings', async () => {
  await write('src/index.js', 'export default 1');
  mockTools();

  const { warnings } = await scan();

  assert.deepEqual(warnings.filter((warning) => INFRA_TOOLS.some((tool) => warning.startsWith(tool))), []);
});

test('a .tf file anywhere in the repo turns the infrastructure tools on', async () => {
  await write('src/index.js', 'export default 1');
  await write('infra/s3.tf', 'resource "aws_s3_bucket" "data" {}');
  mockTools();

  const { infrastructure } = await scan();

  assert.equal(spawnsOf('checkov').length, 1);
  assert.equal(spawnsOf('tfsec').length, 1);
  assert.equal(infrastructure.detected, true);
});

test('checkov and tfsec are pointed at the repo root once, since both recurse on their own', async () => {
  await write('envs/prod/main.tf', 'resource "aws_vpc" "v" {}');
  await write('envs/dev/main.tf', 'resource "aws_vpc" "v" {}');
  mockTools();

  await scan();

  assert.ok(spawnsOf('checkov')[0].args.includes(workspace));
  assert.ok(spawnsOf('tfsec')[0].args.includes(workspace));
});

test('inframap runs once per Terraform directory the clone phase found, since it does not recurse', async () => {
  await write('envs/prod/main.tf', 'resource "aws_vpc" "v" {}');
  await write('envs/dev/main.tf', 'resource "aws_vpc" "v" {}');
  mockTools();

  await scan();

  assert.deepEqual(
    spawnsOf('inframap').map((call) => call.args.at(-1)),
    [path.posix.join(workspace, 'envs/dev'), path.posix.join(workspace, 'envs/prod')],
  );
});

test('findings from both tools reach the response, each tagged by source', async () => {
  await write('infra/s3.tf', 'resource "aws_s3_bucket" "data" {}');
  mockTools();

  const { infrastructure } = await scan();

  // 3 failed checkov checks in the fixture + 3 tfsec results.
  assert.equal(infrastructure.findings.length, 6);
  assert.deepEqual(new Set(infrastructure.findings.map((f) => f.source)), new Set(['checkov', 'tfsec']));
});

test('the inframap graph reaches the response as nodes and edges', async () => {
  await write('main.tf', 'resource "aws_instance" "app" {}');
  mockTools();

  const { infrastructure } = await scan();

  assert.deepEqual(infrastructure.graph, {
    nodes: [{ id: 'aws_instance.app' }, { id: 'aws_security_group.web' }],
    edges: [{ from: 'aws_instance.app', to: 'aws_security_group.web' }],
  });
});

test('an infra tool failing degrades to a warning rather than failing the scan', async () => {
  await write('src/index.js', 'export default 1');
  await write('infra/s3.tf', 'resource "aws_s3_bucket" "data" {}');
  mockTools({ checkov: 'Traceback (most recent call last):' });

  const result = await scan();

  assert.ok(result.warnings.some((warning) => warning.startsWith('checkov')));
  // The JS half and the surviving infra tool still report.
  assert.equal(result.metrics.bugs, 0);
  assert.ok(result.infrastructure.findings.every((finding) => finding.source === 'tfsec'));
  assert.equal(result.infrastructure.graph.nodes.length, 2);
});

test('a tool crashing outright is caught and reported as a warning', async () => {
  await write('infra/s3.tf', 'resource "aws_s3_bucket" "data" {}');
  mockTools();
  const stub = childProcess.execFile;
  childProcess.execFile = (command, args, options, callback) => {
    if (toolName(command, args) === 'tfsec') throw new Error('spawn EACCES');
    return stub(command, args, options, callback);
  };

  const result = await scan();

  assert.ok(result.warnings.some((warning) => warning.startsWith('tfsec crashed unexpectedly')));
  assert.equal(result.infrastructure.detected, true);
});
