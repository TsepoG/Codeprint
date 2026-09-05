import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hasTerraformFiles } from '../../../src/services/scan/detectTerraform.js';

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

test('returns false for a repo with no .tf files at all', async () => {
  await write('src/index.js', 'export default 1');
  await write('README.md', '# hi');

  assert.equal(await hasTerraformFiles(workspace), false);
});

test('returns true for a .tf file at the repo root', async () => {
  await write('main.tf', 'resource "aws_s3_bucket" "b" {}');

  assert.equal(await hasTerraformFiles(workspace), true);
});

test('finds .tf files nested several directories deep', async () => {
  await write('src/index.js', '');
  await write('deploy/envs/prod/network.tf', 'resource "aws_vpc" "v" {}');

  assert.equal(await hasTerraformFiles(workspace), true);
});

test('detects Terraform alongside JS in the same repo', async () => {
  await write('src/index.js', 'export default 1');
  await write('package.json', '{}');
  await write('infra/main.tf', 'resource "aws_s3_bucket" "b" {}');

  assert.equal(await hasTerraformFiles(workspace), true);
});

test('ignores .tf files vendored inside .terraform, node_modules, and .git', async () => {
  await write('.terraform/modules/vpc/main.tf', 'resource "aws_vpc" "v" {}');
  await write('node_modules/some-pkg/fixtures/example.tf', 'resource "null_resource" "n" {}');
  await write('.git/objects/weird.tf', '');

  assert.equal(await hasTerraformFiles(workspace), false);
});

test('does not treat a file merely containing "tf" as Terraform', async () => {
  await write('src/tfidf.js', '');
  await write('notes.tf.md', '');
  await write('config.tfvars', 'region = "us-east-1"');

  assert.equal(await hasTerraformFiles(workspace), false);
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

    assert.equal(await hasTerraformFiles(workspace), false);
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
