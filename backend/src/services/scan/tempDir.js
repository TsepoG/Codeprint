import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PREFIX = 'codeprint-scan-';

/**
 * Creates a fresh, uniquely-named directory under the OS temp dir for one
 * scan request to clone into.
 *
 * @returns {Promise<string>} Absolute path to the new directory.
 */
export async function createScanDir() {
  const dir = path.join(tmpdir(), `${PREFIX}${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Recursively deletes a scan directory. Never throws - logs and swallows
 * failures so cleanup can never mask (or replace) the scan's own result/error.
 *
 * @param {string|undefined} dir
 * @returns {Promise<void>}
 */
export async function cleanupScanDir(dir) {
  if (!dir) return;
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch (err) {
    console.error(`Failed to clean up scan directory ${dir}:`, err.message);
  }
}
