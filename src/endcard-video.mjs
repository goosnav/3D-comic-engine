const TIMEOUT_MS = 8000;
const LOAD_TIMEOUT_MS = 30000;
// Chromium reports fractional seeks a few microseconds off the requested time.
// 0.1ms covers one 1/12288s source clock tick, far below a 24fps frame (41.67ms).
const SEEK_TOLERANCE_SECONDS = .0001;

// HAVE_CURRENT_DATA after seeked means drawImage can consume the decoded frame.
// A video-frame callback alone can hang on paused/repeated-frame seeks.
function stateOf(video) {
  return `readyState=${video.readyState}, networkState=${video.networkState}, duration=${video.duration}, mediaError=${video.error?.code ?? 'none'}`;
}
function waitForFrame(video, start, label, target, timeoutMs = TIMEOUT_MS, signal) {
  return new Promise((resolve, reject) => {
    const events = ['loadedmetadata', 'loadeddata', 'durationchange', 'seeked', 'canplay', 'playing'];
    let settled = false;
    const cleanup = () => {
      settled = true;
      clearTimeout(timer);
      events.forEach(event => video.removeEventListener(event, check));
      video.removeEventListener('error', fail);
      video.removeEventListener('emptied', fail);
      signal?.removeEventListener('abort', aborted);
    };
    const fail = () => { cleanup(); reject(new Error(`Endcard video ${label} failed (${stateOf(video)})`)); };
    const aborted = () => { cleanup(); reject(signal.reason ?? new DOMException('Cancelled', 'AbortError')); };
    const check = () => {
      if (video.error) return fail();
      if (!video.seeking && video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0 &&
          (target === undefined || Math.abs(video.currentTime - target) <= SEEK_TOLERANCE_SECONDS)) { cleanup(); resolve(); }
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Endcard video ${label} timed out after ${timeoutMs}ms (${stateOf(video)}). Keep the screen unlocked and tap Generate to retry.`)); }, timeoutMs);
    events.forEach(event => video.addEventListener(event, check));
    video.addEventListener('error', fail);
    // load() emits emptied during normal startup. It is an error only for an
    // already loaded video being sought; cancellation has its own signal.
    if (label !== 'load') video.addEventListener('emptied', fail);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) { aborted(); return; }
    try {
      const pending = start(); check();
      if (pending?.then) pending.catch(error => {
        if (settled) return;
        // Muted inline play should be allowed on iOS. Expose policy failures
        // explicitly instead of sitting at an unexplained timeout.
        cleanup();
        reject(new Error(error.name === 'NotAllowedError'
          ? 'Endcard video playback was blocked. Keep this tab visible, disable Low Power Mode if necessary, and tap Generate again.'
          : `Endcard video ${label} failed: ${error.message} (${stateOf(video)})`));
      });
    } catch (error) { cleanup(); reject(error); }
  });
}

/** Caller owns this resource and must dispose it, including on player failure. */
export async function loadEndcardVideo(url, { signal, timeoutMs = LOAD_TIMEOUT_MS } = {}) {
  if (typeof url !== 'string' || !url.trim()) throw new Error('Endcard video URL is required');
  signal?.throwIfAborted();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Endcard load timeout must be positive');
  const video = document.createElement('video');
  video.preload = 'auto'; video.muted = true; video.defaultMuted = true; video.playsInline = true;
  video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
  video.crossOrigin = 'anonymous';
  let disposed = false, objectURL;
  const controller = new AbortController();
  const aborted = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', aborted, { once: true });
  let timer;
  const dispose = () => {
    if (disposed) return;
    controller.abort(new Error('Endcard video disposed'));
    disposed = true; video.pause(); video.removeAttribute('src'); video.load();
    if (objectURL) URL.revokeObjectURL(objectURL);
  };
  try {
    // Frozen production assets are full HTTP 200 responses without Range support.
    // Chromium may clamp HTTP media seeks to zero even with Content-Length.
    // Own the complete MP4 locally so absolute seeks do not depend on the server.
    // The browser adapter already owns a verified blob: don't fetch, copy, and
    // retain another full MP4 buffer on memory-constrained phones.
    if (url.startsWith('blob:')) video.src = url;
    else {
      timer = setTimeout(() => controller.abort(new Error(`Endcard video download timed out after ${timeoutMs}ms`)), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Endcard video load failed (HTTP ${response.status})`);
      const bytes = await response.blob();
      controller.signal.throwIfAborted(); clearTimeout(timer);
      objectURL = URL.createObjectURL(bytes.slice(0, bytes.size, 'video/mp4'));
      video.src = objectURL;
    }
    // iOS can stop paused preload at metadata. Prime its decoder explicitly,
    // then pause again before deterministic absolute-frame seeking begins.
    await waitForFrame(video, () => { video.load(); return video.play(); }, 'load', undefined, timeoutMs, controller.signal);
    video.pause();
    return { video, dispose };
  } catch (error) { dispose(); throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', aborted); }
}

export async function seekEndcardVideo(video, seconds) {
  if (!video?.getAttribute('src') || !Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Endcard requires a loaded video');
  if (!Number.isFinite(seconds)) throw new Error('Endcard time must be finite');
  video.pause();
  const target = ((seconds % video.duration) + video.duration) % video.duration;
  await waitForFrame(video, () => {
    // Setting the same currentTime can trigger a new seek without a new frame.
    if (video.currentTime !== target) video.currentTime = target;
  }, 'seek', target);
  return target;
}
