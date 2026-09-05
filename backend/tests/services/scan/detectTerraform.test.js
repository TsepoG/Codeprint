import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanForTerraform } from '../../../src/services/scan/detectTerraform.js';

let workspace;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'codeprint-tf-'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

/** @param {string} relPath @param {string} [contents] */
async function write(relPath, contents = '') {
  const full = path.join(workspace, ...relPath.split('/'));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, contents);
}

test('reports no Terraform directories for a repo with no .tf files', async () => {
  await write('src/index.js', 'export default 1');
  await write('README.md', '# hi');

  assert.deepEqual(await scanForTerraform(workspace), { terraformDirs: [], stateFiles: [] });
});

test('reports the repo root as an empty-string directory for root-level .tf files', async () => {
  await write('main.tf', 'resource "aws_s3_bucket" "b" {}');

  const { terraformDirs } = await scanForTerraform(workspace);
  assert.deepEqual(terraformDirs, ['']);
});

test('reports every directory that directly contains .tf files, not their parents', async () => {
  await write('envs/prod/main.tf', 'resource "aws_vpc" "v" {}');
  await write('envs/dev/main.tf', 'resource "aws_vpc" "v" {}');
  await write('modules/network/vpc.tf', 'resource "aws_vpc" "v" {}');
  await write('src/index.js', '');

  const { terraformDirs } = await scanForTerraform(workspace);
  // `envs` itself holds no .tf files, so it isn't a Terraform directory -
  // inframap would fail if pointed at it.
  assert.deepEqual(terraformDirs, ['envs/dev', 'envs/prod', 'modules/network']);
});

test('lists several .tf files in one directory as a single directory entry', async () => {
  await write('infra/main.tf', '');
  await write('infra/variables.tf', '');
  await write('infra/outputs.tf', '');

  const { terraformDirs } = await scanForTerraform(workspace);
  assert.deepEqual(terraformDirs, ['infra']);
});

test('detects Terraform alongside JS in the same repo', async () => {
  await write('src/index.js', 'export default 1');
  await write('package.json', '{}');
  await write('infra/main.tf', 'resource "aws_s3_bucket" "b" {}');

  const { terraformDirs } = await scanForTerraform(workspace);
  assert.deepEqual(terraformDirs, ['infra']);
});

test('reports committed .tfstate files separately from .tf directories', async () => {
  await write('infra/main.tf', '');
  await write('infra/terraform.tfstate', '{"version":4}');

  const { terraformDirs, stateFiles } = await scanForTerraform(workspace);
  assert.deepEqual(terraformDirs, ['infra']);
  assert.deepEqual(stateFiles, ['infra/terraform.tfstate']);
});

test('ignores .tf files vendored inside .terraform, node_modules, and .git', async () => {
  await write('.terraform/modules/vpc/main.tf', 'resource "aws_vpc" "v" {}');
  await write('node_modules/some-pkg/fixtures/example.tf', 'resource "null_resource" "n" {}');
  await write('.git/objects/weird.tf', '');

  assert.deepEqual(await scanForTerraform(workspace), { terraformDirs: [], stateFiles: [] });
});

test('does not treat a file merely containing "tf" as Terraform', async () => {
  await write('src/tfidf.js', '');
  await write('notes.tf.md', '');
  await write('config.tfvars', 'region = "us-east-1"');

  assert.deepEqual(await scanForTerraform(workspace), { terraformDirs: [], stateFiles: [] });
});

test('returns directories in a stable, sorted order', async () => {
  await write('z/main.tf', '');
  await write('a/main.tf', '');
  await write('m/main.tf', '');

  const { terraformDirs } = await scanForTerraform(workspace);
  assert.deepEqual(terraformDirs, ['a', 'm', 'z']);
});

test('does not follow directory symlinks out of the repo', async () => {
  const outside = await mkdtemp(path.join(tmpdir(), 'codeprint-outside-'));
  try {
    await writeFile(path.join(outside, 'escaped.tf'), 'resource "aws_s3_bucket" "b" {}');
    await write('src/index.js', '');
    try {
      await symlink(outside, path.join(workspace, 'link'), 'dir');
    } catch {
      return; // symlink creation needs privileges on some Windows setups
    }

    assert.deepEqual(await scanForTerraform(workspace), { terraformDirs: [], stateFiles: [] });
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
