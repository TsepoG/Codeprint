import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJob, getJob, markJobRunning, completeJob, failJob } from './jobStore.js';

test('createJob starts a job in the queued state with no result/error', () => {
  const job = createJob();
  assert.equal(job.status, 'queued');
  assert.equal(job.result, null);
  assert.equal(job.error, null);
  assert.equal(typeof job.id, 'string');
});

test('getJob returns undefined for an unknown id', () => {
  assert.equal(getJob('does-not-exist'), undefined);
});

test('a job transitions queued -> running -> complete, and getJob reflects each change', () => {
  const job = createJob();

  markJobRunning(job.id);
  assert.equal(getJob(job.id).status, 'running');

  completeJob(job.id, { metrics: { bugs: 0 } });
  const done = getJob(job.id);
  assert.equal(done.status, 'complete');
  assert.deepEqual(done.result, { metrics: { bugs: 0 } });
  assert.equal(done.error, null);
});

test('a job can transition to failed with an error message', () => {
  const job = createJob();
  markJobRunning(job.id);
  failJob(job.id, 'Could not clone repository: fatal: repository not found');

  const failed = getJob(job.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'Could not clone repository: fatal: repository not found');
  assert.equal(failed.result, null);
});

test('updating an unknown job id is a harmless no-op', () => {
  assert.doesNotThrow(() => {
    markJobRunning('does-not-exist');
    completeJob('does-not-exist', {});
    failJob('does-not-exist', 'nope');
  });
});
