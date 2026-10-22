function measured(take) {
  const { samples, sampleRate } = take, duration = samples.length / sampleRate, mouth = [];
  const step = Math.max(1, Math.round(sampleRate * .02));
  let level = 0, peak = 0;
  for (let offset = 0; offset < samples.length; offset += step) {
    let sum = 0;
    const end = Math.min(offset + step, samples.length), t = offset / sampleRate;
    for (let i = offset; i < end; i++) { peak = Math.max(peak, Math.abs(samples[i])); sum += samples[i] ** 2; }
    const target = Math.min(1, Math.sqrt(sum / (end - offset)) * 12) * .75;
    level += (target - level) * (1 - Math.exp(-.02 / (target > level ? .04 : .07)));
    mouth.push({ t, value: level * Math.max(0, Math.min(1, t / .06, (duration - t) / .08)) });
  }
  if (!Number.isFinite(duration) || duration <= 0 || peak < .0001) throw new Error('Silent or invalid audio take');
  mouth.push({ t: duration, value: 0 });
  return { ...take, duration, mouth };
}

// Terminating the dedicated worker also cancels synchronous WASM synthesis.
export async function prepareSpeech(script, { signal, onProgress = () => {} } = {}) {
  signal?.throwIfAborted();
  const lines = script.lines.filter(line => !line.action);
  if (lines.some(line => line.audio)) throw new Error('Browser speech cannot load desktop audio filenames; remove audio fields to use on-device speech');
  if (!lines.length) throw new Error('At least one speech line is required');
  const worker = new Worker(new URL('./browser/voice-worker.mjs', document.baseURI), { type: 'module' });
  let timer, abort;
  try {
    return await new Promise((resolve, reject) => {
      const takes = {};
      const resetTimeout = () => {
        clearTimeout(timer);
        timer = setTimeout(() => reject(new Error('On-device speech timed out')), 60000);
      };
      abort = () => reject(signal.reason ?? new DOMException('Export cancelled', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      worker.onerror = event => { event.preventDefault(); reject(new Error(event.message || 'Speech worker failed')); };
      worker.onmessageerror = () => reject(new Error('Invalid speech worker response'));
      worker.onmessage = ({ data }) => {
        try {
          if (data.error) throw new Error(data.error);
          if (data.done) {
            if (Object.keys(takes).length !== lines.length) throw new Error('Speech worker omitted a take');
            resolve(takes); return;
          }
          takes[data.id] = measured(data.take);
          const message = `Prepared voice ${data.index + 1}/${lines.length}`;
          onProgress(message, { phase: 'speech', progress: (data.index + 1) / lines.length, message });
          resetTimeout();
        } catch (error) { reject(error); }
      };
      resetTimeout();
      worker.postMessage({ lines });
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    worker.terminate();
  }
}
