import { resolveScript, selectScript } from '../src/contracts.mjs';
import { verifyAssetCatalog } from './assets.mjs';
import { progressReporter } from './progress.mjs';
import { supportedRecordingTypes, isCompatibleMP4Type } from './recording.mjs';

async function waitForAudio(promise, signal) {
  let timer, abort;
  try {
    signal.throwIfAborted();
    return await Promise.race([promise, new Promise((_, reject) => {
      abort = () => reject(signal.reason ?? new Error('Export cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => reject(new Error('Audio startup timed out. Start export again to retry.')), 10000);
    })]);
  } finally { clearTimeout(timer); if (abort) signal.removeEventListener('abort', abort); }
}

function batchEntries(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !['entries', 'voice'].includes(key))) {
    throw new Error('A batch must contain entries and an optional voice.');
  }
  if (!Array.isArray(data.entries) || data.entries.length < 1 || data.entries.length > 100) {
    throw new Error('A batch needs 1–100 JSON script entries.');
  }
  for (const entry of data.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['name', 'script'].includes(key)) ||
      typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 1024 || !Object.hasOwn(entry, 'script')) {
      throw new Error('Each batch entry needs a filename (1–1024 characters) and a JSON script.');
    }
  }
  // Freeze the raw imported documents before audio, asset loading, or any
  // other asynchronous boundary. Editor changes cannot alter queued films.
  try { return structuredClone(data.entries.map(({ name, script }) => ({ name, script }))); }
  catch { throw new Error('Batch entries must contain JSON data that can be copied.'); }
}

function batchFilename(name, index) {
  const base = name.split(/[\\/]/).at(-1).replace(/\.json$/i, '').normalize('NFKD')
    .replace(/[^a-z0-9._-]+/gi, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 100) || 'script';
  return `${String(index + 1).padStart(3, '0')}-${base}.mp4`;
}

function countBatch(batch) {
  for (const status of ['complete', 'failed', 'cancelled']) {
    batch[status === 'complete' ? 'completed' : status] = batch.items.filter(item => item.status === status).length;
  }
}

function finishBatch(batch) {
  countBatch(batch);
  batch.status = batch.cancelled ? 'cancelled' : batch.failed ? (batch.completed ? 'partial' : 'failed') : 'complete';
  batch.finishedAt = Date.now();
}

/** Same envelopes as loopback API, but no remote API requests or server jobs.
 * Asset/export adapters are injectable so queue behavior can be tested without
 * replacing the production contract validator or a browser's recording APIs.
 */
export function createBrowserBackend({ catalog, canvas, onChange = () => {},
  verifyAssets = verifyAssetCatalog, loadExporter = () => import('./export.mjs') }) {
  const jobs = [], batches = [], batchStates = new Map(), controllers = new Map(), urls = new Set();
  let activeExport = null, disposed = false;
  const notify = () => {
    try { onChange(); }
    catch (error) { console.error('Browser export UI update failed', error); }
  };
  const id = prefix => `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const assertIdle = () => {
    if (disposed) throw new Error('This browser renderer is closed. Reload the app to start another export.');
    if (activeExport) throw new Error('One browser export at a time. Finish or cancel the active export or batch first.');
  };
  const startAudio = () => {
    const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Audio || !globalThis.MediaRecorder || !canvas?.captureStream) {
      throw new Error('This browser cannot export video with audio. Try a current Chrome/Safari browser or use the desktop app.');
    }
    // This must remain synchronous in the original Generate/Start batch click.
    const audioContext = new Audio();
    try { return { audioContext, resumed: audioContext.resume() }; }
    catch (error) { void audioContext.close().catch(() => {}); throw error; }
  };
  const closeAudio = async context => {
    try { if (context && context.state !== 'closed') await context.close(); } catch {}
  };
  const updateItem = (record, batch) => {
    const { item, job } = record;
    item.status = job.status;
    for (const key of ['video', 'error', 'filename']) if (job[key] !== undefined) item[key] = job[key];
    countBatch(batch);
    notify();
  };
  const cancelQueued = state => {
    for (const record of state.records) {
      if (record.item.status !== 'queued') continue;
      record.item.status = record.job.status = 'cancelled';
      record.job.finishedAt = Date.now();
      record.item.error = record.job.error = 'Cancelled before rendering.';
    }
    countBatch(state.batch);
  };

  async function renderJob({ job, script, jobCatalog, audioContext, resumed, format, music, changed = notify }) {
    const controller = new AbortController();
    controllers.set(job.id, controller);
    job.status = 'running'; job.startedAt = Date.now();
    const report = progressReporter(job, changed);
    report('Starting audio', { phase: 'audio', progress: null });
    let snapshot;
    try {
      await waitForAudio(resumed, controller.signal); controller.signal.throwIfAborted();
      report('Checking selected source assets', { phase: 'assets', progress: 0 });
      snapshot = await verifyAssets(jobCatalog, { script, signal: controller.signal, onProgress: report });
      controller.signal.throwIfAborted();
      const { exportFilm } = await loadExporter();
      controller.signal.throwIfAborted();
      const result = await exportFilm({ canvas, script, catalog: snapshot.catalog, assetBase: '', audioContext,
        ...(format ? { format } : {}), ...(music ? { music } : {}), signal: controller.signal, onProgress: report });
      controller.signal.throwIfAborted();
      if (disposed) throw new Error('Browser renderer was closed.');
      if (!['mp4', 'webm'].includes(result.extension) || !result.mimeType?.startsWith(`video/${result.extension}`) || !result.blob?.type?.startsWith(`video/${result.extension}`) || (result.extension === 'mp4' && !isCompatibleMP4Type(result.mimeType))) {
        throw new Error('The browser did not return an H.264/AAC MP4. Use the desktop app for batch MP4 export.');
      }
      job.video = URL.createObjectURL(result.blob); urls.add(job.video);
      job.filename ??= `${script.title.normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'comic'}-${job.id}.${result.extension}`;
      if (job.filename) job.filename = job.filename.replace(/\.(mp4|webm)$/i, `.${result.extension}`);
      job.backend = 'webgl'; job.format = result.extension;
      job.status = 'complete';
      report(`Ready — ${result.extension.toUpperCase()}. Download before closing this page.${result.extension === 'webm' ? ' This browser cannot start MP4 recording; desktop export always produces MP4.' : ''}`, { phase: 'complete', progress: 1 });
    } catch (error) {
      job.status = controller.signal.aborted ? 'cancelled' : 'failed';
      job.error = error?.message ?? String(error);
    } finally {
      try { snapshot?.dispose(); }
      catch (error) { job.status = 'failed'; job.error = `Asset cleanup failed: ${error?.message ?? error}`; }
      controllers.delete(job.id); job.finishedAt = Date.now(); changed();
    }
  }

  const api = async (route, data) => {
    if (route === '/api/session') return { token: 'on-device' };
    if (route === '/api/catalog') return structuredClone(catalog);
    if (route === '/api/select') return { script: selectScript(data.template, data.seed, catalog) };
    if (route === '/api/validate') return { script: resolveScript(data.script, catalog) };
    if (route === '/api/jobs') return { jobs: structuredClone(jobs) };
    if (route === '/api/batches') return { batches: structuredClone(batches) };
    if (route === '/api/draft') throw new Error('Optional local AI writing is available in the desktop app. Browser authoring needs no AI.');
    if (route === '/api/cancel') {
      controllers.get(data.id)?.abort(new Error('Export cancelled. Your script is preserved; generate again to retry.'));
      return { ok: true };
    }
    if (route === '/api/batch/cancel') {
      const state = batchStates.get(data?.id);
      if (!state) throw new Error('Unknown batch. Refresh the batch list and try again.');
      if (state.batch.status === 'running') { cancelQueued(state); notify(); }
      return { batch: structuredClone(state.batch) };
    }
    if (route === '/api/render') {
      assertIdle();
      if (data.voice !== 'flite') throw new Error('Browser mode uses on-device Flite. Use desktop for Kokoro or recorded files.');
      const script = resolveScript(data.script, catalog);
      if (script.lines.some(line => line.audio)) throw new Error('Recorded audio paths need the desktop app. Remove audio fields to use browser speech.');
      const { audioContext, resumed } = startAudio();
      const job = { id: id('device'), status: 'running', startedAt: Date.now(), script };
      jobs.unshift(job);
      const operation = activeExport = { kind: 'single' };
      void (async () => {
        try { await renderJob({ job, script, jobCatalog: catalog, audioContext, resumed, music: data.music }); }
        finally { await closeAudio(audioContext); if (activeExport === operation) activeExport = null; notify(); }
      })();
      return { id: job.id, status: job.status };
    }
    if (route === '/api/batch') {
      assertIdle();
      const entries = batchEntries(data), voice = data.voice ?? 'flite';
      if (voice !== 'flite') throw new Error('Browser batches use on-device Flite. Use the desktop app for other voices or recorded audio.');
      if (!supportedRecordingTypes().length) {
        throw new Error('No supported audio/video recording format. Download a render job and use the local CLI.');
      }
      const jobCatalog = structuredClone(catalog), createdAt = Date.now();
      const batch = { id: id('device-batch'), status: 'running', createdAt, total: entries.length,
        completed: 0, failed: 0, cancelled: 0, items: [] };
      const records = entries.map((entry, index) => {
        const job = { id: id('device'), status: 'queued', createdAt, script: entry.script,
          batchId: batch.id, batchIndex: index, filename: batchFilename(entry.name, index) };
        const item = { index, name: entry.name, status: 'queued', jobId: job.id, filename: job.filename };
        batch.items.push(item);
        let script;
        try {
          script = resolveScript(entry.script, jobCatalog);
          if (script.lines.some(line => line.audio)) throw new Error('This JSON references recorded audio files. Use the desktop app for this script; browser batch export preserves these fields and cannot load local audio paths.');
          job.script = script;
        } catch (error) {
          item.status = job.status = 'failed'; item.error = job.error = error?.message ?? String(error); job.finishedAt = Date.now();
        }
        return { item, job, script };
      });
      countBatch(batch);
      // Create/resume exactly one context now, in the initial user gesture.
      const audio = records.some(record => record.item.status === 'queued') ? startAudio() : null;
      const state = { batch, records, controller: new AbortController() };
      batchStates.set(batch.id, state); batches.unshift(batch); jobs.unshift(...records.map(record => record.job));
      if (!audio) { finishBatch(batch); state.records = []; notify(); return { batch: structuredClone(batch) }; }
      activeExport = state;
      const ready = waitForAudio(audio.resumed, state.controller.signal);
      // A cancelled first item may leave no consumer until context cleanup.
      ready.catch(() => {});
      void (async () => {
        try {
          for (const record of records) {
            if (record.item.status !== 'queued') continue;
            if (disposed) { cancelQueued(state); break; }
            await renderJob({ job: record.job, script: record.script, jobCatalog, audioContext: audio.audioContext,
              resumed: ready, changed: () => updateItem(record, batch) });
          }
        } finally {
          state.controller.abort();
          await closeAudio(audio.audioContext);
          finishBatch(batch); state.records = []; if (activeExport === state) activeExport = null; notify();
        }
      })();
      notify();
      return { batch: structuredClone(batch) };
    }
    throw new Error('Unknown on-device action');
  };
  api.ownsURL = url => urls.has(url);
  api.dispose = () => {
    disposed = true;
    for (const state of batchStates.values()) if (state.batch.status === 'running') { cancelQueued(state); state.controller.abort(); }
    for (const controller of controllers.values()) controller.abort();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  };
  return api;
}
