import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserBackend } from '../browser/backend.mjs';
import { loadCatalog } from '../src/library.mjs';
import { resolveScript } from '../src/contracts.mjs';

const mp4Type = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
const film = (extension = 'mp4') => {
  const mimeType = extension === 'mp4' ? mp4Type : 'video/webm;codecs=vp8,opus';
  return { blob: new Blob(['test recording'], { type: mimeType }), extension, mimeType };
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function until(check) {
  for (let count = 0; count < 200; count++) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Browser batch did not reach its expected state.');
}
const completedBatch = (api, id) => until(async () => {
  const batch = (await api('/api/batches')).batches.find(batch => batch.id === id);
  return batch?.status !== 'running' && batch;
});
const script = title => ({
  template: 'book-duet', title, comics: ['book2-036'], seed: 719, scene: 'library',
  output: { width: 640, height: 480, fps: 30 }, characters: { reader: 'blue-beady', friend: 'rust' },
  endCard: { enabled: true, title: 'Authored ending', text: 'Keep this text.', url: 'example.test', seconds: 2 },
  lines: [
    { action: 'open', seconds: .6 },
    { speaker: 'reader', text: 'This book is overdue for a vacation.', pause: .7, shot: 'over-shoulder',
      emotion: 'pleased', gesture: 'nod', face: { blink: 'once', mouth_curve: .3 },
      reaction: { actor: 'friend', emotion: 'neutral', gesture: 'head_tilt', at: 'line_start', duration: .5 } },
    { action: 'hold', seconds: .8 },
    { speaker: 'friend', text: 'I booked it a shelf.', pause: .2, shot: 'book' },
    { action: 'place', seconds: .9 },
    { action: 'close', seconds: 1.2 },
  ],
});

async function fixture(t, { exportFilm = async () => film(), resume } = {}) {
  const originalAudio = globalThis.AudioContext, originalRecorder = globalThis.MediaRecorder;
  const contexts = [], calls = [], verified = [], released = [];
  globalThis.AudioContext = class {
    state = 'suspended'; resumes = 0; closes = 0;
    constructor() { contexts.push(this); }
    resume() { this.resumes++; this.state = 'running'; return resume?.() ?? Promise.resolve(); }
    async close() { this.closes++; this.state = 'closed'; }
  };
  globalThis.MediaRecorder = class { static isTypeSupported() { return true; } };
  const catalog = await loadCatalog();
  let changes = 0;
  const api = createBrowserBackend({ catalog, canvas: { captureStream() {} }, onChange: () => { changes++; },
    verifyAssets: async (catalog, options) => {
      verified.push(options.script.title);
      return { catalog, dispose() { released.push(options.script.title); } };
    },
    loadExporter: async () => ({ exportFilm: async options => { calls.push(options); return exportFilm(options); } }),
  });
  t.after(() => {
    api.dispose();
    globalThis.AudioContext = originalAudio; globalThis.MediaRecorder = originalRecorder;
  });
  return { api, catalog, contexts, calls, verified, released, changes: () => changes };
}

test('browser batch snapshots all authored scripts, renders serially, and reuses one initial audio context', async t => {
  const gates = [deferred(), deferred()]; let index = 0;
  const f = await fixture(t, { exportFilm: async () => { await gates[index++].promise; return film(); } });
  const entries = [{ name: '../Same skit.json', script: script('First film') }, { name: 'C:\\scripts\\Same skit.JSON', script: script('Second film') }];
  entries[1].script.output = { width: 720, height: 1280, fps: 24 };
  const expected = entries.map(entry => resolveScript(entry.script, f.catalog));
  const pending = f.api('/api/batch', { entries, voice: 'flite' });
  assert.equal(f.contexts.length, 1, 'AudioContext is created in the original synchronous click');
  assert.equal(f.contexts[0].resumes, 1, 'audio is resumed before returning the request promise');
  entries[0].script.lines[1].text = 'A later editor change';
  entries[1].script.output.width = 256;
  entries[1].name = 'changed.json';
  const { batch } = await pending;
  await until(() => f.calls.length === 1);
  assert.deepEqual(f.calls[0].script, expected[0]);
  assert.equal(f.calls[0].format, undefined);
  assert.equal(f.calls[0].music, undefined);
  assert.equal((await f.api('/api/jobs')).jobs.length, 2, 'queued items appear in the existing jobs list');
  gates[0].resolve();
  await until(() => f.calls.length === 2);
  const midway = (await f.api('/api/batches')).batches[0];
  assert.equal(midway.status, 'running'); assert.equal(midway.completed, 1);
  assert.equal(f.api.ownsURL(midway.items[0].video), true, 'finished films are downloadable before the queue ends');
  assert.equal(f.contexts[0].state, 'running');
  assert.equal(f.calls[0].audioContext, f.calls[1].audioContext);
  assert.deepEqual(f.calls[1].script, expected[1]);
  gates[1].resolve();
  const done = await completedBatch(f.api, batch.id);
  assert.equal(done.status, 'complete'); assert.equal(done.completed, 2);
  assert.deepEqual(done.items.map(item => item.filename), ['001-Same-skit.mp4', '002-Same-skit.mp4']);
  assert.deepEqual(done.items.map(item => item.index), [0, 1]);
  assert.equal(f.contexts[0].closes, 1); assert.equal(f.contexts[0].resumes, 1);
  assert.deepEqual(f.released, ['First film', 'Second film']); assert.ok(f.changes() > 2);
  done.items[0].status = 'failed';
  assert.equal((await f.api('/api/batches')).batches[0].items[0].status, 'complete', 'API snapshots cannot mutate internal state');
});

test('validation, recorded-audio, and runtime failures are isolated while later scripts render', async t => {
  const f = await fixture(t, { exportFilm: async ({ script }) => {
    if (script.title === 'Encoder failure') throw new Error('GPU encoder failed');
    return film();
  } });
  const invalid = { ...script('Invalid JSON schema'), mystery: 'preserved' };
  const recorded = script('Recorded take'); recorded.lines[1].audio = 'voices/take.wav';
  const entries = [script('Good first'), invalid, recorded, script('Encoder failure'), script('Good last')]
    .map((script, index) => ({ name: `film-${index}.json`, script }));
  const { batch } = await f.api('/api/batch', { entries });
  const done = await completedBatch(f.api, batch.id);
  assert.equal(done.status, 'partial'); assert.equal(done.completed, 2); assert.equal(done.failed, 3);
  assert.deepEqual(done.items.map(item => item.status), ['complete', 'failed', 'failed', 'failed', 'complete']);
  assert.match(done.items[1].error, /unknown field/i);
  assert.match(done.items[2].error, /recorded audio.*desktop/i);
  assert.match(done.items[3].error, /GPU encoder failed/);
  assert.deepEqual(f.calls.map(call => call.script.title), ['Good first', 'Encoder failure', 'Good last']);
  const jobs = (await f.api('/api/jobs')).jobs;
  assert.deepEqual(jobs.find(job => job.id === done.items[2].jobId).script, recorded, 'recorded audio fields are preserved, never stripped to force speech');
  assert.deepEqual(jobs.find(job => job.id === done.items[1].jobId).script, invalid);
  assert.equal(f.contexts[0].closes, 1); assert.equal(f.released.length, 3);
});

test('batch cancellation finishes the current film and cancels queued items without overlap', async t => {
  const gate = deferred();
  const f = await fixture(t, { exportFilm: async () => { await gate.promise; return film(); } });
  const entries = ['Current', 'Queued 1', 'Queued 2'].map(title => ({ name: `${title}.json`, script: script(title) }));
  const { batch } = await f.api('/api/batch', { entries });
  await until(() => f.calls.length === 1);
  await assert.rejects(f.api('/api/render', { script: script('Overlap'), voice: 'flite' }), /one browser export at a time/i);
  await assert.rejects(f.api('/api/batch', { entries }), /one browser export at a time/i);
  const stopped = (await f.api('/api/batch/cancel', { id: batch.id })).batch;
  assert.equal(stopped.status, 'running'); assert.equal(stopped.cancelled, 2);
  assert.deepEqual(stopped.items.map(item => item.status), ['running', 'cancelled', 'cancelled']);
  assert.equal(f.calls[0].signal.aborted, false, 'Stop batch does not interrupt its current MP4');
  gate.resolve();
  const done = await completedBatch(f.api, batch.id);
  assert.equal(done.status, 'cancelled'); assert.equal(done.completed, 1); assert.equal(done.cancelled, 2);
  assert.equal(f.calls.length, 1); assert.equal(f.contexts[0].closes, 1);
  const next = await f.api('/api/batch', { entries: [entries[0]] });
  assert.equal((await completedBatch(f.api, next.batch.id)).status, 'complete');
});

test('cancelling an individual batch job still advances automatically to the next film', async t => {
  const f = await fixture(t, { exportFilm: async options => {
    if (options.script.title === 'Cancel this one') await new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
    return film();
  } });
  const { batch } = await f.api('/api/batch', { entries: ['Cancel this one', 'Still render this one'].map(title => ({ name: `${title}.json`, script: script(title) })) });
  await until(() => f.calls.length === 1);
  await f.api('/api/cancel', { id: batch.items[0].jobId });
  const done = await completedBatch(f.api, batch.id);
  assert.deepEqual(done.items.map(item => item.status), ['cancelled', 'complete']);
  assert.equal(done.completed, 1); assert.equal(done.cancelled, 1); assert.equal(f.contexts.length, 1);
});

test('browser batch accepts WebM when MP4 is unavailable and labels every download honestly', async t => {
  const f = await fixture(t, { exportFilm: async () => film('webm') });
  MediaRecorder.isTypeSupported = type => type.startsWith('video/webm');
  const { batch } = await f.api('/api/batch', { entries: [{ name: 'film.json', script: script('Film') }] });
  const done = await completedBatch(f.api, batch.id);
  assert.equal(done.status, 'complete');
  assert.match(done.items[0].filename, /\.webm$/);
  assert.equal(f.calls[0].format, undefined);
});

test('a mislabeled or fallback WebM result cannot become a batch MP4 and does not stop later entries', async t => {
  let attempt = 0;
  const f = await fixture(t, { exportFilm: async () => ++attempt === 1 ? { ...film('webm'), extension: 'mp4' } : film() });
  const { batch } = await f.api('/api/batch', { entries: ['First', 'Second'].map(title => ({ name: `${title}.json`, script: script(title) })) });
  const done = await completedBatch(f.api, batch.id);
  assert.equal(done.status, 'partial'); assert.equal(done.items[0].status, 'failed');
  assert.equal(done.items[0].video, undefined); assert.match(done.items[0].error, /H\.264\/AAC MP4/);
  assert.equal(done.items[1].status, 'complete');
});

test('invalid batch envelopes reject atomically; invalid JSON documents fail individually; 100 is accepted', async t => {
  const f = await fixture(t);
  for (const data of [undefined, {}, { entries: [] }, { entries: Array(101).fill({ name: 'a.json', script: {} }) },
    { entries: [{ name: '', script: {} }] }, { entries: [{ name: 'missing.json' }] },
    { entries: [{ name: 'extra.json', script: {}, width: 432 }] }, { entries: [{ name: 'extra.json', script: {} }], music: {} }]) {
    await assert.rejects(f.api('/api/batch', data), /batch|entry/i);
  }
  assert.deepEqual(await f.api('/api/jobs'), { jobs: [] }); assert.equal(f.contexts.length, 0);
  const { batch } = await f.api('/api/batch', { entries: Array.from({ length: 100 }, (_, index) => ({ name: `invalid-${index}.json`, script: null })) });
  assert.equal(batch.status, 'failed'); assert.equal(batch.failed, 100); assert.equal(batch.items[99].filename, '100-invalid-99.mp4');
  assert.equal(f.contexts.length, 0, 'all-invalid batches do not allocate recording resources');
  await assert.rejects(f.api('/api/batch/cancel', { id: 'unknown' }), /unknown batch/i);
});

test('failed audio initialization fails all pending films and closes the one context', async t => {
  const f = await fixture(t, { resume: () => Promise.reject(new Error('Audio could not resume')) });
  const { batch } = await f.api('/api/batch', { entries: ['First', 'Second'].map(title => ({ name: `${title}.json`, script: script(title) })) });
  const done = await completedBatch(f.api, batch.id);
  assert.equal(done.status, 'failed'); assert.equal(done.failed, 2); assert.equal(f.calls.length, 0);
  assert.equal(f.contexts.length, 1); assert.equal(f.contexts[0].closes, 1);
});

test('disposing a batch cancels pending work, releases active assets, and revokes owned videos', async t => {
  const f = await fixture(t, { exportFilm: async options => {
    if (options.script.title === 'Second') await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    return film();
  } });
  const { batch } = await f.api('/api/batch', { entries: ['First', 'Second', 'Third'].map(title => ({ name: `${title}.json`, script: script(title) })) });
  await until(() => f.calls.length === 2);
  const url = (await f.api('/api/batches')).batches[0].items[0].video;
  assert.equal(f.api.ownsURL(url), true);
  f.api.dispose();
  const done = await completedBatch(f.api, batch.id);
  assert.deepEqual(done.items.map(item => item.status), ['complete', 'cancelled', 'cancelled']);
  assert.equal(f.api.ownsURL(url), false); assert.equal(f.contexts[0].closes, 1); assert.equal(f.released.length, 2);
});
