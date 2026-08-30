import { randomUUID } from 'node:crypto';

// Simple in-process job store: a Map keyed by job id, swept periodically
// on a TTL so it can't grow unbounded. This is intentionally not a real
// queue - there's no concurrency limit or persistence - just enough
// bookkeeping to let POST /api/scan return immediately and GET
// /api/scan/:jobId poll for the result. Swap for a real queue/store
// (Redis, a DB-backed table, etc.) before running more than one backend
// instance, since jobs created on one instance aren't visible to another.

const JOB_TTL_MS = Number(process.env.SCAN_JOB_TTL_MS) || 30 * 60 * 1000; // 30 minutes
const SWEEP_INTERVAL_MS = Number(process.env.SCAN_JOB_SWEEP_INTERVAL_MS) || 60 * 1000; // 1 minute

/**
 * @typedef {object} ScanJob
 * @property {string} id
 * @property {'queued'|'running'|'complete'|'failed'} status
 * @property {unknown} result Set once `status` is `'complete'`.
 * @property {string} error Set once `status` is `'failed'`.
 * @property {number} createdAt `Date.now()` when the job was created - what TTL expiry is measured against.
 * @property {number} updatedAt `Date.now()` of the last status change.
 */

/** @type {Map<string, ScanJob>} */
const jobs = new Map();

/**
 * Creates a new job in the `queued` state.
 *
 * @returns {ScanJob}
 */
export function createJob() {
  const now = Date.now();
  const job = {
    id: randomUUID(),
    status: 'queued',
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

/**
 * @param {string} id
 * @returns {ScanJob|undefined}
 */
export function getJob(id) {
  return jobs.get(id);
}

/** @param {string} id */
export function markJobRunning(id) {
  updateJob(id, { status: 'running' });
}

/**
 * @param {string} id
 * @param {unknown} result
 */
export function completeJob(id, result) {
  updateJob(id, { status: 'complete', result });
}

/**
 * @param {string} id
 * @param {string} error
 */
export function failJob(id, error) {
  updateJob(id, { status: 'failed', error });
}

/**
 * @param {string} id
 * @param {Partial<ScanJob>} patch
 */
function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return; // job already expired/swept - nothing to update
  Object.assign(job, patch, { updatedAt: Date.now() });
}

function sweepExpiredJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

const sweepTimer = setInterval(sweepExpiredJobs, SWEEP_INTERVAL_MS);
// Don't let this periodic timer keep the process alive on its own.
sweepTimer.unref();
