import test from 'node:test';
import assert from 'node:assert/strict';
import { progressReporter } from '../browser/progress.mjs';

test('the exporter second argument reaches the job as measured stage progress', () => {
  const job = {}; let updates = 0;
  const report = progressReporter(job, () => updates++);
  report('Prepared voice 2/4', { phase: 'speech', progress: .5, message: 'Prepared voice 2/4' });
  assert.deepEqual(job.progressDetail, { phase: 'speech', progress: .5, message: 'Prepared voice 2/4' });
  assert.equal(job.progress, 'Prepared voice 2/4');
  assert.equal(updates, 1);
  report('Loading the scene', { phase: 'loading', progress: null });
  assert.equal(job.progressDetail.progress, null, 'unknown work is indeterminate, not a fake percentage');
  report('Legacy text');
  assert.equal(job.progressDetail.progress, null);
  assert.equal(job.progressDetail.message, 'Legacy text');
});
