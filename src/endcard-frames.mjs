const MAX_BYTES = 25 * 1024 * 1024;

/** A small indexed JPEG pack: one compressed asset, only one decoded frame. */
export function parseFramePack(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 9 || bytes.length > MAX_BYTES || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'GCEF') throw Error('Invalid endcard frame pack');
  const headerSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (!headerSize || headerSize > 16384 || headerSize + 8 >= bytes.length) throw Error('Invalid endcard frame header');
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerSize)));
  const { width, height, fps, lengths } = header;
  if (header.version !== 1 || ![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 1024) ||
      !Number.isFinite(fps) || fps <= 0 || fps > 60 || !Array.isArray(lengths) || !lengths.length || lengths.length > 600) throw Error('Invalid endcard frame metadata');
  let offset = 8 + headerSize;
  const frames = lengths.map(length => {
    if (!Number.isSafeInteger(length) || length < 4 || offset + length > bytes.length ||
        bytes[offset] !== 255 || bytes[offset + 1] !== 216 || bytes[offset + length - 2] !== 255 || bytes[offset + length - 1] !== 217) throw Error('Invalid endcard JPEG frame');
    const frame = bytes.subarray(offset, offset + length); offset += length; return frame;
  });
  if (offset !== bytes.length) throw Error('Unexpected trailing endcard frame bytes');
  return { width, height, fps, duration: frames.length / fps, frames };
}

// Image loading has no media autoplay policy. Keep it bounded and cancelable,
// revoke each temporary URL, and never retain a decoded full-film image bank.
function decodeFrame(bytes, { signal, timeoutMs, width, height }) {
  return new Promise((resolve, reject) => {
    const image = new Image(), url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    const cleanup = () => { clearTimeout(timer); image.onload = image.onerror = null; signal.removeEventListener('abort', aborted); URL.revokeObjectURL(url); };
    const fail = error => { cleanup(); image.removeAttribute('src'); reject(error); };
    const aborted = () => fail(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => fail(Error('Endcard frame decode timed out')), timeoutMs);
    image.onload = () => {
      if (image.naturalWidth !== width || image.naturalHeight !== height) return fail(Error('Endcard frame dimensions do not match its manifest'));
      cleanup(); resolve(image);
    };
    image.onerror = () => fail(Error('Endcard JPEG frame could not be decoded'));
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) return aborted();
    image.src = url;
  });
}

export async function loadEndcardFrames(url, { signal, timeoutMs = 30000 } = {}) {
  if (typeof url !== 'string' || !url.trim()) throw Error('Endcard frame URL is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('Endcard load timeout must be positive');
  signal?.throwIfAborted();
  const controller = new AbortController();
  const aborted = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', aborted, { once: true });
  let pack, image, current = -1, disposed = false, pending = Promise.resolve();
  const dispose = () => {
    if (disposed) return;
    disposed = true; controller.abort(Error('Endcard frames disposed'));
    signal?.removeEventListener('abort', aborted);
    image?.removeAttribute('src'); image = null; pack = null;
  };
  const timer = setTimeout(() => controller.abort(Error('Endcard frame download timed out')), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw Error(`Endcard frame load failed (HTTP ${response.status})`);
    if (Number(response.headers.get('Content-Length')) > MAX_BYTES) throw Error('Endcard frame pack exceeds size limit');
    pack = parseFramePack(await response.arrayBuffer());
    clearTimeout(timer); controller.signal.throwIfAborted();
    const { width, height, fps, duration } = pack;
    const getFrame = seconds => {
      const work = pending.then(async () => {
        controller.signal.throwIfAborted();
        if (!Number.isFinite(seconds)) throw Error('Endcard time must be finite');
        const time = ((seconds % duration) + duration) % duration;
        const index = Math.min(pack.frames.length - 1, Math.floor(time * fps + 1e-7));
        if (index !== current) {
          image?.removeAttribute('src'); image = null; current = -1;
          const decoded = await decodeFrame(pack.frames[index], { width, height, signal: controller.signal, timeoutMs });
          if (controller.signal.aborted) { decoded.removeAttribute('src'); controller.signal.throwIfAborted(); }
          image = decoded; current = index;
        }
        return { image, time: index / fps };
      });
      pending = work.catch(() => {}); return work;
    };
    await getFrame(0); // Fail before recording, not halfway through the film.
    return { width, height, duration, getFrame, dispose };
  } catch (error) { dispose(); throw error; }
  finally { clearTimeout(timer); }
}
