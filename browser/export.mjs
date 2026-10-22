import { resolveScript } from '../src/contracts.mjs';
import { compileTimeline } from '../src/timeline.mjs';
import { createPlayer } from '../src/player.mjs';
import { prepareSpeech } from './voice.mjs';
import { createRecorder, supportedRecordingTypes } from './recording.mjs';
import { prepareMusic } from './music.mjs';

/** Catalog bytes must already be verified by the browser asset adapter.
 * The caller owns catalog blob URLs and any supplied AudioContext.
 * onProgress receives (message, {phase, progress: 0..1, message}).
 */
class RecorderStartupError extends Error {}

export async function exportFilm(options = {}) {
  options.signal?.throwIfAborted();
  const types = supportedRecordingTypes();
  // Snapshot once across fallback attempts; never consume later editor edits.
  const frozen = { ...options, script: structuredClone(options.script), catalog: structuredClone(options.catalog) };
  if (!types.length) return recordFilm(frozen);
  let lastError;
  for (const [index, mimeType] of types.entries()) {
    try { return await recordFilm(frozen, mimeType); }
    catch (error) {
      if (!(error instanceof RecorderStartupError) || options.signal?.aborted) throw error;
      lastError = error;
      if (index + 1 < types.length) {
        const message = 'Video encoder could not start; trying the next supported format from the beginning';
        options.onProgress?.(message, { phase: 'encoder', progress: null, message });
      }
    }
  }
  throw new Error(`No supported video encoder could start: ${lastError.message}`);
}

async function recordFilm({ canvas, script: input, catalog: inputCatalog, assetBase = '',
  onProgress = () => {}, signal, audioContext, music } = {}, requestedMime) {
  signal?.throwIfAborted();
  if (document.hidden) throw new Error('Keep the export tab visible; background recording is unsupported');
  if (!canvas?.captureStream || !globalThis.MediaRecorder || !globalThis.AudioContext) {
    throw new Error('This browser does not support canvas/audio recording');
  }
  if (!requestedMime) throw new Error('No supported audio/video recording codec is available');
  // Freeze host edits before the first asynchronous boundary.
  const catalog = structuredClone(inputCatalog), script = resolveScript(structuredClone(input), catalog);
  const context = audioContext ?? new AudioContext();
  const report = (phase, progress, message) => onProgress(message, { phase, progress, message });
  const controller = new AbortController(), sources = [], tracks = [], cleanups = [];
  let player, recorder, destination, silence, raf = 0, watchdog, stopped, stopping = false, finished = false;
  let audioRunning = false, failure, rejectFailure;
  const interrupted = new Promise((_, reject) => { rejectFailure = reject; });
  interrupted.catch(() => {});
  const fail = error => {
    if (failure || finished) return;
    failure = error instanceof Error ? error : new Error(String(error));
    controller.abort(failure); rejectFailure(failure);
  };
  const listen = (target, event, handler) => {
    target.addEventListener(event, handler);
    cleanups.push(() => target.removeEventListener(event, handler));
  };
  const guard = async (promise, timeout = 60000) => {
    let timer;
    try {
      return await Promise.race([promise, interrupted, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Browser export timed out')), timeout);
      })]);
    } finally { clearTimeout(timer); }
  };
  listen(document, 'visibilitychange', () => { if (document.hidden) fail(new Error('Export interrupted: tab became hidden')); });
  listen(window, 'pagehide', () => fail(new Error('Export interrupted: page left the foreground')));
  listen(context, 'statechange', () => {
    if (audioRunning && context.state !== 'running') fail(new Error('Export interrupted: audio was suspended or closed'));
  });
  listen(canvas, 'webglcontextlost', () => fail(new Error('Export interrupted: graphics context was lost')));
  if (signal) listen(signal, 'abort', () => fail(signal.reason ?? new DOMException('Export cancelled', 'AbortError')));
  try {
    // Called before synthesis/loading so the click's user activation can resume audio.
    await guard(context.resume(), 10000);
    if (context.state !== 'running') throw new Error('Audio is suspended; start export from a user gesture');
    audioRunning = true;
    report('speech', 0, 'Starting on-device voices');
    const takes = await guard(prepareSpeech(script, { signal: controller.signal, onProgress }), 600000);
    const timeline = compileTimeline(script, takes);
    if (timeline.duration > 600) throw new Error('Episode exceeds the 600-second resource safety bound; split into episodes');
    let musicBuffer;
    if (music) {
      report('music', null, 'Preparing quiet background music');
      musicBuffer = await guard(prepareMusic(context, music, { signal: controller.signal, maxSeconds: timeline.frames / timeline.fps }));
    }
    report('loading', null, 'Loading the scene');
    player = await guard(createPlayer(canvas, { timeline, catalog, assetBase, onProgress, signal: controller.signal, endcardMode: 'frames' }).then(value => {
      if (failure || finished) { value.dispose(); throw failure ?? new Error('Export already ended'); }
      return value;
    }));
    // Finish first-frame GPU/shader work before the recording clock starts.
    // Without a readback, the first captured frame can arrive seconds after
    // MediaRecorder starts collecting audio on software/slow mobile GPUs.
    const drawFrame = async frame => {
      await guard(Promise.resolve(player.renderAt(frame)));
      await guard(new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve() : reject(new Error('Canvas frame could not be captured')))));
    };
    // Warm each scene/shot/speaker combination, including source inserts and
    // the end card's text/video materials, before starting either media clock.
    report('warming', null, 'Preparing cameras and graphics');
    const warmed = new Set();
    for (const event of timeline.events) {
      const kind = event.type === 'endcard' ? 'endcard' : event.type === 'source' ? 'source' : 'scene';
      const key = `${kind}:${event.shot}:${event.speaker}:${event.bookState}`;
      if (warmed.has(key)) continue;
      warmed.add(key);
      await drawFrame(Math.min(timeline.frames - 1, Math.ceil(event.start * timeline.fps)));
    }
    await drawFrame(0);
    destination = context.createMediaStreamDestination();
    // Keep an audio clock flowing through startup, reaction pauses, and the
    // final frame. The audio clock starts with the recorder, not its callback.
    silence = context.createConstantSource(); silence.offset.value = 0;
    silence.connect(destination); silence.start();
    tracks.push(...destination.stream.getTracks());
    const video = canvas.captureStream(timeline.fps);
    tracks.push(...video.getTracks());
    if (!video.getVideoTracks().length || !destination.stream.getAudioTracks().length) throw new Error('Browser capture did not produce video and audio tracks');
    for (const track of tracks) {
      listen(track, 'ended', () => { if (!stopping) fail(new Error('Export interrupted: capture track ended')); });
      listen(track, 'mute', () => fail(new Error('Export interrupted: capture track muted')));
    }
    const stream = new MediaStream(tracks), chunks = [];
    let bytes = 0, resolveStart, resolveStop;
    const started = new Promise(resolve => { resolveStart = resolve; });
    stopped = new Promise(resolve => { resolveStop = resolve; });
    try { recorder = createRecorder(stream, MediaRecorder, [requestedMime]); }
    catch (error) { throw new RecorderStartupError(error.message, { cause: error }); }
    let recorderStarted = false;
    listen(recorder, 'start', () => { recorderStarted = true; resolveStart(); });
    listen(recorder, 'error', event => {
      const error = event.error ?? new Error('MediaRecorder failed');
      fail(recorderStarted ? error : new RecorderStartupError(error.message, { cause: error }));
    });
    listen(recorder, 'dataavailable', event => {
      if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
      if (bytes > 256 * 1024 * 1024) fail(new Error('Browser export exceeded its 256 MiB recording memory bound'));
    });
    listen(recorder, 'stop', () => {
      resolveStop();
      if (!stopping) fail(new Error('MediaRecorder stopped before the film finished'));
    });
    // Allocate every take before starting the real-time clock.
    let ended = 0;
    for (const event of timeline.events.filter(event => event.type === 'line')) {
      const take = takes[event.id], buffer = context.createBuffer(1, take.samples.length, take.sampleRate);
      buffer.copyToChannel(take.samples, 0);
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination);
      source.onended = () => { ended++; };
      sources.push({ source, start: event.start });
    }
    if (musicBuffer) {
      const source = context.createBufferSource(); source.buffer = musicBuffer; source.connect(destination);
      source.onended = () => { ended++; };
      sources.push({ source, start: 0 });
    }
    try { recorder.start(250); }
    catch (error) { throw new RecorderStartupError(error.message, { cause: error }); }
    // start() begins native collection immediately. Its event can be delayed
    // by GPU work; using that callback as the origin records avoidable silence.
    const origin = context.currentTime + .1, duration = timeline.frames / timeline.fps;
    for (const { source, start } of sources) source.start(origin + start);
    let previousWall = performance.now(), previousAudio = context.currentTime, lastFrame = -1;
    watchdog = setInterval(() => {
      const now = performance.now(), audio = context.currentTime;
      const wallElapsed = (now - previousWall) / 1000, audioElapsed = audio - previousAudio;
      // A busy foreground thread can delay timers and drop video frames while
      // Web Audio continues correctly. Fail only when the audio clock actually
      // falls behind wall time, not merely because a timer arrived late.
      if (wallElapsed - audioElapsed > 1 || (wallElapsed > .2 && audioElapsed < .01)) {
        fail(new Error('Export interrupted: recording clock stalled or device suspended'));
      }
      previousWall = now; previousAudio = audio;
    }, 250);
    let lastProgress = performance.now();
    report('recording', 0, 'Recording in real time; keep this tab visible');
    const rendered = new Promise((resolve, reject) => {
      const frame = async () => {
        try {
          if (failure || finished) return;
          const elapsed = Math.max(0, context.currentTime - origin);
          const index = Math.min(timeline.frames - 1, Math.floor(elapsed * timeline.fps));
          if (index !== lastFrame) {
            // Backpressure: finish this draw before submitting another. Slow
            // GPUs may drop frames, but cannot accumulate seconds of queued
            // rendering that would extend the recorded silence after speech.
            await drawFrame(index); lastFrame = index;
            video.getVideoTracks()[0].requestFrame?.();
          }
          if (failure || finished) return;
          if (performance.now() - lastProgress >= 250) {
            lastProgress = performance.now();
            report('recording', Math.min(1, elapsed / duration), `Recording ${Math.min(100, Math.round(elapsed / duration * 100))}% — keep this tab visible`);
          }
          if (elapsed >= duration && ended === sources.length) resolve();
          else raf = requestAnimationFrame(frame);
        } catch (error) { reject(error); }
      };
      raf = requestAnimationFrame(frame);
    });
    await guard(Promise.all([guard(started, 10000), rendered]), (duration + 15) * 1000);
    // The final draw is already flushed. Let capture/compositing consume it
    // before stopping, including when a late frame jumped to the final pose.
    video.getVideoTracks()[0].requestFrame?.();
    await guard(new Promise(resolve => {
      raf = requestAnimationFrame(() => { raf = requestAnimationFrame(resolve); });
    }));
    report('encoding', null, 'Finishing the video file');
    stopping = true;
    recorder.stop();
    await guard(stopped, 10000);
    const mimeType = recorder.mimeType || chunks[0]?.type || requestedMime;
    if (!/^video\/(webm|mp4)(;|$)/i.test(mimeType)) throw new Error(`Unexpected recorded container: ${mimeType}`);
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) throw new Error('Browser produced an empty film');
    report('complete', 1, 'Film ready to download');
    return { blob, mimeType, extension: mimeType.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm', timeline };
  } finally {
    finished = true; stopping = true;
    controller.abort();
    cancelAnimationFrame(raf); clearInterval(watchdog);
    for (const { source } of sources) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
    if (silence) { silence.stop(); silence.disconnect(); }
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      let timer;
      await Promise.race([stopped, new Promise(resolve => { timer = setTimeout(resolve, 1000); })]);
      clearTimeout(timer);
    }
    cleanups.forEach(fn => fn());
    tracks.forEach(track => track.stop());
    destination?.disconnect(); player?.dispose();
    if (!audioContext && context.state !== 'closed') await context.close();
  }
}
