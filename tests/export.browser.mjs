import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { browserFixture, shortScript } from './speech-export-fixture.mjs';
const exec = promisify(execFile);
const entries = ['browser/export.mjs', 'browser/voice-worker.mjs', 'browser/assets.mjs', 'src/player.mjs'];

test('MP4 start exceptions and asynchronous startup errors retry with a complete WebM recording', { timeout: 120000 }, async t => {
  const { page, catalog } = await browserFixture(t, entries);
  const result = await page.evaluate(async ({ script, catalog }) => {
    const { exportFilm } = await import('/browser/export.mjs');
    const NativeRecorder = MediaRecorder, attempts = [];
    window.MediaRecorder = class {
      static isTypeSupported(type) { return type.startsWith('video/mp4') || NativeRecorder.isTypeSupported(type); }
      constructor(stream, options) {
        attempts.push(options.mimeType);
        if (!options.mimeType.startsWith('video/mp4')) return new NativeRecorder(stream, options);
        const synchronous = attempts.length === 1;
        return new class extends EventTarget {
          mimeType = options.mimeType; state = 'inactive';
          start() {
            if (synchronous) throw new DOMException('Encoder unavailable', 'NotSupportedError');
            this.state = 'recording';
            setTimeout(() => { const event = new Event('error'); event.error = new Error('Encoder startup failed'); this.dispatchEvent(event); }, 10);
          }
          stop() { this.state = 'inactive'; this.dispatchEvent(new Event('stop')); }
        }();
      }
    };
    try {
      const output = await exportFilm({ canvas: document.querySelector('canvas'), script, catalog });
      return { attempts, extension: output.extension, bytes: output.blob.size, lines: output.timeline.events.filter(e => e.type === 'line').length };
    } finally { window.MediaRecorder = NativeRecorder; }
  }, { script: shortScript, catalog });
  assert.equal(result.attempts.length, 3);
  assert.ok(result.attempts[0].startsWith('video/mp4'));
  assert.ok(result.attempts[1].startsWith('video/mp4'));
  assert.equal(result.extension, 'webm');
  assert.equal(result.lines, 2); assert.ok(result.bytes > 10000);
});

test('real browser export includes both voices, complete duration, and real video with no external requests', { timeout: 90000 }, async t => {
  const { page, catalog } = await browserFixture(t, entries);
  const result = await page.evaluate(async ({ script, catalog }) => {
    const { exportFilm } = await import('/browser/export.mjs');
    const { verifyAssetCatalog } = await import('/browser/assets.mjs');
    const verified = await verifyAssetCatalog(catalog, { baseURL: location.origin });
    const context = new AudioContext();
    const trace = [], epoch = performance.now(), stamp = label => trace.push([label, +((performance.now() - epoch) / 1000).toFixed(3), +context.currentTime.toFixed(3)]);
    const NativeRecorder = window.MediaRecorder;
    window.MediaRecorder = class extends NativeRecorder {
      constructor(...args) { super(...args); this.addEventListener('start', () => stamp('recorder start event')); this.addEventListener('stop', () => stamp('recorder stop event')); }
      start(...args) { stamp('recorder start call'); return super.start(...args); }
      stop(...args) { stamp('recorder stop call'); return super.stop(...args); }
    };
    const canvas = document.querySelector('canvas'), toBlob = canvas.toBlob.bind(canvas);
    canvas.toBlob = (callback, ...args) => { stamp('GPU flush begin'); return toBlob(blob => { stamp('GPU flush end'); callback(blob); }, ...args); };
    try {
      const progress = [];
      const output = await exportFilm({ canvas: document.querySelector('canvas'), script, catalog: verified.catalog,
        audioContext: context, onProgress: (message, p) => { progress.push({ ...p, at: performance.now() }); if (p.phase === 'recording' && p.progress === 0 || p.phase === 'complete') stamp(p.phase); } });
      const { createPlayer } = await import('/src/player.mjs');
      const reference = await createPlayer(document.querySelector('canvas'), { timeline: output.timeline, catalog: verified.catalog });
      let finalImage;
      try { await reference.renderAt(output.timeline.frames - 1); finalImage = document.querySelector('canvas').toDataURL(); }
      finally { reference.dispose(); }
      return { bytes: Array.from(new Uint8Array(await output.blob.arrayBuffer())), mimeType: output.mimeType,
        blobType: output.blob.type, extension: output.extension, timeline: output.timeline, progress, state: context.state, finalImage, trace };
    } finally { window.MediaRecorder = NativeRecorder; canvas.toBlob = toBlob; verified.dispose(); await context.close(); }
  }, { script: { ...shortScript, output: { width: 432, height: 540, fps: 12 }, characters: { reader: 'blue-beady', friend: 'rust' },
    lines: [{ speaker: 'reader', text: 'An inside source.', shot: 'two-shot' }, { speaker: 'friend', text: 'I have my doubts.', shot: 'speaker' }],
    endCard: { enabled: true, seconds: 1 } }, catalog });
  t.diagnostic(`Recorder clock trace [event, wall seconds, audio seconds]: ${JSON.stringify(result.trace.filter(e => !e[0].startsWith('GPU')))}`);
  assert.match(result.mimeType, /^video\/(webm|mp4)/);
  assert.equal(result.blobType, result.mimeType);
  assert.equal(result.extension, result.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm');
  assert.equal(result.state, 'running', 'the caller retains ownership of its AudioContext');
  assert.equal(result.timeline.events.filter(e => e.type === 'line').length, 2);
  assert.equal(result.progress.at(-1).phase, 'complete');
  const recordingUpdates = result.progress.filter(p => p.phase === 'recording');
  assert.ok(recordingUpdates.every((p, i) => !i || p.at - recordingUpdates[i - 1].at >= 240), 'recording progress must not rebuild the GUI more than four times per second');
  const dir = await mkdtemp(join(tmpdir(), 'comic-export-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'film.' + result.extension);
  await writeFile(path, new Uint8Array(result.bytes));
  const probe = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path])).stdout);
  assert.ok(probe.streams.some(s => s.codec_type === 'video' && s.width === 432 && s.height === 540));
  assert.ok(probe.streams.some(s => s.codec_type === 'audio'));
  const referencePath = join(dir, 'last-frame.png');
  await writeFile(referencePath, Buffer.from(result.finalImage.split(',')[1], 'base64'));
  const { stdout: lastFrame } = await exec('ffmpeg', ['-v', 'error', '-i', path, '-vf', 'reverse', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
  const { stdout: expectedFrame } = await exec('ffmpeg', ['-v', 'error', '-i', referencePath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
  assert.equal(lastFrame.length, expectedFrame.length);
  const pixelError = lastFrame.reduce((sum, value, i) => sum + Math.abs(value - expectedFrame[i]), 0) / lastFrame.length;
  assert.ok(pixelError < 8, `last encoded frame matches an independent render of the final timeline frame (mean error ${pixelError})`);
  const { stdout: pcm } = await exec('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:1'], { encoding: 'buffer', maxBuffer: 16e6 });
  const seconds = pcm.length / 4 / 16000;
  t.diagnostic(`Recorded ${seconds.toFixed(3)}s for ${result.timeline.duration.toFixed(3)}s timeline; lines ${JSON.stringify(result.timeline.events.filter(e => e.type === 'line').map(e => [e.start, e.end]))}`);
  assert.ok(seconds >= result.timeline.duration - .08, `decoded audio ${seconds}s covers timeline ${result.timeline.duration}s`);
  assert.ok(seconds < result.timeline.duration + 1, `recording ${seconds}s does not include a long setup gap beyond ${result.timeline.duration}s`);
  let onset = Infinity;
  for (let offset = 0; offset < pcm.length; offset += 320 * 4) {
    let energy = 0, count = 0;
    for (let i = offset; i < Math.min(pcm.length, offset + 320 * 4); i += 4) { energy += pcm.readFloatLE(i) ** 2; count++; }
    if (Math.sqrt(energy / count) > .01) { onset = offset / 4 / 16000; break; }
  }
  assert.ok(onset < .6, `first speech starts promptly, not after delayed recorder callbacks: ${onset}s`);
  for (const line of result.timeline.events.filter(e => e.type === 'line')) {
    // Check inside each distinct line, away from recorder preroll and phrase silence.
    let sum = 0, count = 0;
    for (let i = Math.floor((line.start + .3) * 16000); i < Math.floor((line.end - .2) * 16000); i++) {
      const value = pcm.readFloatLE(i * 4); sum += value * value; count++;
    }
    assert.ok(Math.sqrt(sum / count) > .005, `audible recorded ${line.speaker} speech: RMS ${Math.sqrt(sum / count)}`);
  }
  t.diagnostic(`Decoded ${seconds.toFixed(3)}s audio for ${result.timeline.duration.toFixed(3)}s timeline; first speech ${onset.toFixed(3)}s; ${result.mimeType}; ${result.bytes.length} bytes`);
});

test('export rejects unsupported capture, hidden tabs, and pre-cancelled input', { timeout: 60000 }, async t => {
  const { page, catalog } = await browserFixture(t, entries);
  const errors = await page.evaluate(async ({ script, catalog }) => {
    const { exportFilm } = await import('/browser/export.mjs');
    const run = async options => { try { await exportFilm({ canvas: document.querySelector('canvas'), script, catalog, ...options }); return 'success'; } catch (e) { return e.name + ': ' + e.message; } };
    const controller = new AbortController(); controller.abort();
    const cancelled = await run({ signal: controller.signal });
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const hidden = await run(); delete document.hidden;
    const original = MediaRecorder.isTypeSupported;
    MediaRecorder.isTypeSupported = () => false;
    const unsupported = await run(); MediaRecorder.isTypeSupported = original;
    return { cancelled, hidden, unsupported };
  }, { script: shortScript, catalog });
  assert.match(errors.cancelled, /AbortError/);
  assert.match(errors.hidden, /visible|hidden|background/i);
  assert.match(errors.unsupported, /support|codec/i);
});

test('mid-record cancellation, hidden tab, and audio suspension reject and stop capture tracks', { timeout: 90000 }, async t => {
  const { page, catalog } = await browserFixture(t, entries);
  for (const mode of ['cancel', 'hidden', 'suspend']) {
    const result = await page.evaluate(async ({ script, catalog, mode }) => {
      const { exportFilm } = await import('/browser/export.mjs');
      const context = new AudioContext(), controller = new AbortController();
      const canvas = document.querySelector('canvas'), original = canvas.captureStream.bind(canvas);
      let tracks = [], triggered = false;
      canvas.captureStream = (...args) => { const stream = original(...args); tracks = stream.getTracks(); return stream; };
      try {
        await exportFilm({ canvas, script, catalog, audioContext: context, signal: controller.signal,
          onProgress: (message, p) => {
            if (p.phase !== 'recording' || triggered) return;
            triggered = true;
            setTimeout(() => {
              if (mode === 'cancel') controller.abort();
              if (mode === 'suspend') context.suspend();
              if (mode === 'hidden') { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }
            }, 150);
          } });
        return { error: 'unexpected success' };
      } catch (e) { return { error: e.name + ': ' + e.message, tracks: tracks.map(t => t.readyState), context: context.state }; }
      finally { delete document.hidden; canvas.captureStream = original; await context.close(); }
    }, { script: shortScript, catalog, mode });
    assert.match(result.error, { cancel: /AbortError/, hidden: /visible|background|hidden/i, suspend: /audio|suspend/i }[mode]);
    assert.deepEqual(result.tracks, ['ended']);
    assert.notEqual(result.context, 'closed', 'caller context is not closed on failure');
  }
});

test('a busy main thread may drop frames without failing when the audio clock keeps advancing', { timeout: 60000 }, async t => {
  const { page, catalog } = await browserFixture(t, entries);
  const result = await page.evaluate(async ({ script, catalog }) => {
    const { exportFilm } = await import('/browser/export.mjs');
    const context = new AudioContext();
    let blocked = false, audioAdvanced = 0;
    try {
      const output = await exportFilm({ canvas: document.querySelector('canvas'), script, catalog, audioContext: context,
        onProgress: (message, detail) => {
          if (detail.phase !== 'recording' || blocked) return;
          blocked = true;
          const start = performance.now(), audioStart = context.currentTime;
          while (performance.now() - start < 4500) { /* real foreground CPU stall, past the film's duration */ }
          audioAdvanced = context.currentTime - audioStart;
        } });
      return { bytes: Array.from(new Uint8Array(await output.blob.arrayBuffer())), extension: output.extension,
        finalImage: document.querySelector('canvas').toDataURL(), audioAdvanced };
    } finally { await context.close(); }
  }, { script: { ...shortScript, endCard: { enabled: true, seconds: 1 } }, catalog });
  assert.ok(result.audioAdvanced > 4, 'actual audio processing continued during the blocked JS task');
  assert.ok(result.bytes.length > 10000);
  const dir = await mkdtemp(join(tmpdir(), 'comic-busy-export-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const film = join(dir, 'film.' + result.extension), reference = join(dir, 'final.png');
  await writeFile(film, new Uint8Array(result.bytes));
  await writeFile(reference, Buffer.from(result.finalImage.split(',')[1], 'base64'));
  const { stdout: encoded } = await exec('ffmpeg', ['-v', 'error', '-i', film, '-vf', 'reverse', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
  const { stdout: rendered } = await exec('ffmpeg', ['-v', 'error', '-i', reference, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
  const error = encoded.reduce((sum, value, i) => sum + Math.abs(value - rendered[i]), 0) / encoded.length;
  assert.ok(error < 8, `the final frame must reach the encoder even after a stall past the film's duration: ${error}`);
});
