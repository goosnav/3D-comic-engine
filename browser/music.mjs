// Bounds caller waiting; native Blob reads / decodeAudioData cannot be cancelled.
// Their eventual settlement is consumed, but cannot continue this preparation.
async function bounded(operation, signal, milliseconds, label) {
  signal?.throwIfAborted();
  let timer, abort;
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(signal.reason ?? new DOMException('Music preparation cancelled', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => reject(new Error(`${label} timed out. Try a shorter music file.`)), milliseconds);
      Promise.resolve().then(() => {
        signal?.throwIfAborted();
        return operation();
      }).then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function checkDuration(duration) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 180) {
    throw new Error('Music must have a finite duration greater than zero and at most 180 seconds.');
  }
}

async function readDuration(file, signal) {
  const audio = document.createElement('audio');
  const url = URL.createObjectURL(file);
  try {
    return await bounded(() => new Promise((resolve, reject) => {
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error('Cannot read music: choose a browser-supported MP3, WAV, M4A or Ogg file.'));
      audio.preload = 'metadata';
      audio.src = url;
    }), signal, 10000, 'Music metadata');
  } finally {
    audio.onloadedmetadata = audio.onerror = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Prepare a user-attached File/Blob locally using the caller's AudioContext or
 * OfflineAudioContext. Returns an AudioBuffer; never plays audio or owns context.
 * Source: <=15 MiB encoded, <=180 seconds, <=2 channels, <=64 MiB decoded PCM.
 * maxSeconds defaults to 180, must be positive/finite, and may exceed 180 for a
 * long film. Copy only min(track frames, floor(maxSeconds * sampleRate)) from
 * the start, without padding/looping. Attenuate peaks to <=.08; never amplify.
 * Metadata/read/decode waits are capped at 10/10/20 seconds respectively.
 * Abort rejects with signal.reason; native decoding may finish in the background.
 */
export async function prepareMusic(context, file, { signal, maxSeconds = 180 } = {}) {
  signal?.throwIfAborted();
  if (!(file instanceof Blob)) throw new TypeError('Music must be an attached File or Blob.');
  if (!file.size) throw new Error('The music file is empty.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Music files must be at most 15 MiB.');
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new RangeError('maxSeconds must be a positive finite duration.');
  const duration = await readDuration(file, signal);
  signal?.throwIfAborted();
  checkDuration(duration);
  const bytes = await bounded(() => file.arrayBuffer(), signal, 10000, 'Reading music');
  signal?.throwIfAborted();
  const decoded = await bounded(async () => {
    try { return await context.decodeAudioData(bytes); }
    catch (cause) { throw new Error('Cannot decode music in this browser. Try a supported MP3, WAV, M4A or Ogg file.', { cause }); }
  }, signal, 20000, 'Music decoding');
  signal?.throwIfAborted();
  if (decoded.numberOfChannels > 2) throw new Error('Music must be mono or stereo (at most 2 channels).');
  if (decoded.length * decoded.numberOfChannels * 4 > 64 * 1024 * 1024) {
    throw new Error('Decoded music exceeds 64 MiB. Choose a shorter track or lower sample rate.');
  }
  checkDuration(decoded.duration);
  const frames = Math.min(decoded.length, Math.floor(maxSeconds * decoded.sampleRate));
  if (frames < 1) throw new RangeError('maxSeconds must allow at least one audio frame.');
  let peak = 0;
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const samples = decoded.getChannelData(c);
    for (let i = 0; i < frames; i++) {
      if (!Number.isFinite(samples[i])) throw new Error('Music contains invalid, nonfinite audio samples.');
      peak = Math.max(peak, Math.abs(samples[i]));
    }
  }
  const gain = peak > .08 ? .08 / peak : 1;
  const output = context.createBuffer(decoded.numberOfChannels, frames, decoded.sampleRate);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const source = decoded.getChannelData(c), target = output.getChannelData(c);
    for (let i = 0; i < frames; i++) target[i] = source[i] * gain;
  }
  return output;
}
