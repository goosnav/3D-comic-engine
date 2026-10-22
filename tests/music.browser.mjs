import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

let browser, server, origin;
before(async () => {
  server = createServer(async (req, res) => {
    if (req.url === '/browser/music.mjs') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(await readFile(new URL('../browser/music.mjs', import.meta.url)));
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Music tests (no canvas)</title>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-software-rasterizer'] });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
});

async function musicPage(t) {
  const page = await browser.newPage();
  t.after(() => page.close());
  const unexpected = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) {
      unexpected.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', error => unexpected.push(error.message));
  t.after(() => assert.deepEqual(unexpected, []));
  await page.goto(origin);
  await page.evaluate(async () => {
    window.prepareMusic = (await import('/browser/music.mjs')).prepareMusic;
    window.context = new OfflineAudioContext(2, 1, 8000);
    // Real 16-bit PCM WAV: alternating plateaus make start-of-track and gain
    // assertions independent of the implementation, with no codec fixtures.
    window.wav = ({ seconds = .1, channels = 1, amplitude = 16384 } = {}) => {
      const frames = Math.round(seconds * 8000), bytes = new ArrayBuffer(44 + frames * channels * 2);
      const view = new DataView(bytes);
      const ascii = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
      ascii(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, 'WAVE');
      ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, channels, true); view.setUint32(24, 8000, true);
      view.setUint32(28, 8000 * channels * 2, true); view.setUint16(32, channels * 2, true);
      view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
      for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
        view.setInt16(44 + (i * channels + c) * 2, (i % 40 < 20 ? 1 : -1) * amplitude / (c + 1), true);
      }
      return new File([bytes], 'music.wav', { type: 'audio/wav' });
    };
    window.errorOf = async operation => {
      try { await operation(); return null; }
      catch (error) { return { name: error.name, message: error.message }; }
    };
    // Observe resource ownership without replacing native metadata loading.
    window.created = []; window.revoked = []; window.audioElements = []; window.allocations = [];
    const createURL = URL.createObjectURL.bind(URL), revokeURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = createURL(blob); created.push(url); return url; };
    URL.revokeObjectURL = url => { revoked.push(url); revokeURL(url); };
    const createElement = document.createElement.bind(document);
    document.createElement = (...args) => {
      const element = createElement(...args);
      if (args[0] === 'audio') audioElements.push(element);
      return element;
    };
    const createBuffer = context.createBuffer.bind(context);
    context.createBuffer = (...args) => { allocations.push(args); return createBuffer(...args); };
  });
  return page;
}

test('decodes a real stereo WAV, keeps its start, and allocates only the quiet trimmed frames', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const buffer = await prepareMusic(context, wav({ channels: 2 }), { maxSeconds: .02509 });
    return { audioBuffer: buffer instanceof AudioBuffer, length: buffer.length, sampleRate: buffer.sampleRate,
      duration: buffer.duration, channels: buffer.numberOfChannels,
      samples: [buffer.getChannelData(0)[0], buffer.getChannelData(0)[20], buffer.getChannelData(1)[0]],
      peak: Math.max(...Array.from({ length: 2 }, (_, c) => [...buffer.getChannelData(c)].map(Math.abs)).flat()),
      allocations, created, revoked, released: audioElements.every(audio => !audio.hasAttribute('src')) };
  });
  assert.equal(result.audioBuffer, true);
  assert.equal(result.length, 200);
  assert.equal(result.sampleRate, 8000);
  assert.equal(result.duration, .025);
  assert.equal(result.channels, 2);
  assert.ok(result.peak <= .08 && result.peak > .079);
  // PCM decoders may map positive/negative int16 extrema asymmetrically.
  for (const [i, expected] of [.08, -.08, .04].entries()) assert.ok(Math.abs(result.samples[i] - expected) < 3e-6);
  assert.deepEqual(result.allocations, [[2, 200, 8000]]);
  assert.equal(result.created.length, 1);
  assert.deepEqual(result.revoked, result.created);
  assert.equal(result.released, true);
});

test('accepts a Blob, preserves already quiet audio, and does not pad a short track', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const buffer = await prepareMusic(context, new Blob([wav({ amplitude: 1024 })]), { maxSeconds: 1 });
    return { length: buffer.length, channels: buffer.numberOfChannels, sample: buffer.getChannelData(0)[0] };
  });
  assert.equal(result.length, 800);
  assert.equal(result.channels, 1);
  assert.ok(Math.abs(result.sample - .03125) < 1 / 32768);
});

test('silent audio stays finite and silent with the default duration limit', async t => {
  const page = await musicPage(t);
  assert.equal(await page.evaluate(async () => {
    const buffer = await prepareMusic(context, wav({ amplitude: 0 }));
    return buffer.length === 800 && buffer.getChannelData(0).every(sample => sample === 0);
  }), true);
});

test('rejects non-attachments, empty/oversized files, and invalid trim limits before loading media', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const inputs = [
      ['https://example.com/music.mp3', {}, /file|blob|attachment/i],
      [new Blob(), {}, /empty/i],
      [new Blob([new Uint8Array(15 * 1024 * 1024 + 1)]), {}, /15.*MiB/i],
      ...[0, -1, NaN, Infinity, '1'].map(maxSeconds => [wav(), { maxSeconds }, /maxSeconds|duration|positive/i]),
    ];
    const results = [];
    for (const [file, options, message] of inputs) {
      const error = await errorOf(() => prepareMusic(context, file, options));
      results.push({ error, useful: !!error && message.test(error.message) });
    }
    return { results, created, allocations };
  });
  assert.ok(result.results.every(result => result.useful), JSON.stringify(result.results));
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.allocations, []);
});

test('rejects an already aborted request before allocating resources', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const controller = new AbortController(); controller.abort();
    return { error: await errorOf(() => prepareMusic(context, wav(), { signal: controller.signal })), created };
  });
  assert.equal(result.error?.name, 'AbortError');
  assert.deepEqual(result.created, []);
});

test('rejects corrupt audio with useful format guidance and releases the metadata URL', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => ({
    error: await errorOf(() => prepareMusic(context, new File(['not music'], 'bad.mp3', { type: 'audio/mpeg' }))),
    created, revoked, released: audioElements.every(audio => !audio.hasAttribute('src')),
  }));
  assert.match(result.error?.message ?? '', /browser.supported.*MP3.*WAV.*M4A.*Ogg/i);
  assert.equal(result.created.length, 1);
  assert.deepEqual(result.revoked, result.created);
  assert.equal(result.released, true);
});

test('rejects real WAV metadata over 180 seconds before reading encoded bytes or decoding', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const file = wav({ seconds: 180.01 });
    let reads = 0, decodes = 0;
    file.arrayBuffer = async () => { reads++; throw new Error('Must not read'); };
    context.decodeAudioData = async () => { decodes++; throw new Error('Must not decode'); };
    return { error: await errorOf(() => prepareMusic(context, file, { maxSeconds: .1 })), reads, decodes, created, revoked };
  });
  assert.match(result.error?.message ?? '', /180.*second/i);
  assert.equal(result.reads, 0);
  assert.equal(result.decodes, 0);
  assert.deepEqual(result.revoked, result.created);
});

test('rejects nonfinite and empty metadata duration before decoding', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const createElement = document.createElement.bind(document);
    let duration, decodes = 0;
    document.createElement = (...args) => {
      const element = createElement(...args);
      if (args[0] === 'audio') Object.defineProperty(element, 'duration', { get: () => duration });
      return element;
    };
    context.decodeAudioData = async () => { decodes++; throw new Error('Must not decode'); };
    const errors = [];
    for (duration of [Infinity, NaN, 0]) errors.push(await errorOf(() => prepareMusic(context, wav())));
    return { errors, decodes, created, revoked };
  });
  assert.ok(result.errors.every(error => /duration|180.*second/i.test(error?.message ?? '')));
  assert.equal(result.decodes, 0);
  assert.deepEqual(result.revoked, result.created);
});

test('rejects real multichannel WAV and oversized decoded PCM before allocating the trim', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const channels = await errorOf(() => prepareMusic(context, wav({ channels: 3 })));
    // Oversized decode descriptors avoid allocating >64 MiB just to test a guard.
    context.decodeAudioData = async () => ({ numberOfChannels: 2, length: 8388609, sampleRate: 96000,
      duration: 8388609 / 96000, getChannelData() { throw new Error('Must reject before reading PCM'); } });
    const size = await errorOf(() => prepareMusic(context, wav(), { maxSeconds: .01 }));
    return { channels, size, allocations };
  });
  assert.match(result.channels?.message ?? '', /mono|stereo|channel/i);
  assert.match(result.size?.message ?? '', /64.*MiB/i);
  assert.deepEqual(result.allocations, []);
});

test('reports decode failures and rejects a trim shorter than one frame', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const tiny = await errorOf(() => prepareMusic(context, wav(), { maxSeconds: .00001 }));
    context.decodeAudioData = async () => { throw new DOMException('Invalid bytes', 'EncodingError'); };
    const decode = await errorOf(() => prepareMusic(context, wav()));
    return { tiny, decode, created, revoked, allocations };
  });
  assert.match(result.tiny?.message ?? '', /frame|maxSeconds/i);
  assert.match(result.decode?.message ?? '', /decode.*browser|browser.*decode/i);
  assert.deepEqual(result.revoked, result.created);
  assert.deepEqual(result.allocations, []);
});

test('a 600-second film accepts a short track without padding or rejecting the requested length', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const buffer = await prepareMusic(context, wav(), { maxSeconds: 600 });
    return { duration: buffer.duration, allocations };
  });
  assert.equal(result.duration, .1);
  assert.deepEqual(result.allocations, [[1, 800, 8000]]);
});

// Only stalled browser boundaries are replaced; normal metadata and WAV decode
// above run natively. A late completion must never allocate or return music.
for (const stage of ['metadata', 'read', 'decode']) {
  for (const interruption of ['abort', 'timeout']) {
    test(`${interruption} during ${stage} rejects promptly, cleans up, and ignores late completion`, { timeout: 10000 }, async t => {
      const page = await musicPage(t);
      await page.clock.install();
      await page.evaluate(async stage => {
        window.controller = new AbortController();
        window.outcome = 'pending';
        window.timers = new Set(); window.abortListeners = new Set();
        const set = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
        window.setTimeout = (callback, ms) => {
          const id = set(() => { timers.delete(id); callback(); }, ms);
          timers.add(id); return id;
        };
        window.clearTimeout = id => { timers.delete(id); clear(id); };
        const signal = controller.signal;
        const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
        signal.addEventListener = (type, listener, options) => { if (type === 'abort') abortListeners.add(listener); add(type, listener, options); };
        signal.removeEventListener = (type, listener, options) => { abortListeners.delete(listener); remove(type, listener, options); };
        let reached;
        const started = new Promise(resolve => { reached = resolve; });
        const file = wav();
        if (stage === 'metadata') {
          const create = document.createElement.bind(document);
          document.createElement = (...args) => {
            const audio = create(...args);
            if (args[0] === 'audio') {
              Object.defineProperty(audio, 'duration', { value: .1 });
              Object.defineProperty(audio, 'src', { set() { reached(); } });
              window.finishStage = () => audio.dispatchEvent(new Event('loadedmetadata'));
            }
            return audio;
          };
        } else if (stage === 'read') {
          file.arrayBuffer = () => new Promise(resolve => {
            window.finishStage = () => resolve(new ArrayBuffer(0)); reached();
          });
        } else {
          context.decodeAudioData = () => new Promise(resolve => {
            window.finishStage = () => resolve(new AudioBuffer({ numberOfChannels: 1, length: 8, sampleRate: 8000 }));
            reached();
          });
        }
        errorOf(() => prepareMusic(context, file, { signal })).then(result => { outcome = result; });
        await started;
      }, stage);
      if (interruption === 'abort') await page.evaluate(() => controller.abort());
      else await page.clock.fastForward(60_000);
      const result = await page.evaluate(() => ({ outcome, created, revoked,
        timers: timers.size, listeners: abortListeners.size,
        released: audioElements.every(audio => !audio.hasAttribute('src') && !audio.onloadedmetadata && !audio.onerror) }));
      assert.notEqual(result.outcome, 'pending');
      if (interruption === 'abort') assert.equal(result.outcome?.name, 'AbortError');
      else assert.match(result.outcome?.message ?? '', /timed out/i);
      assert.equal(result.created.length, 1);
      assert.deepEqual(result.revoked, result.created);
      assert.equal(result.released, true);
      assert.equal(result.timers, 0);
      assert.equal(result.listeners, 0);
      await page.evaluate(() => finishStage());
      assert.deepEqual(await page.evaluate(() => allocations), []);
    });
  }
}

test('aborting as decode completes is checked before allocating the output', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const controller = new AbortController();
    const decode = context.decodeAudioData.bind(context);
    context.decodeAudioData = async bytes => {
      const buffer = await decode(bytes); controller.abort(); return buffer;
    };
    return { error: await errorOf(() => prepareMusic(context, wav(), { signal: controller.signal })), allocations };
  });
  assert.equal(result.error?.name, 'AbortError');
  assert.deepEqual(result.allocations, []);
});

test('rejects invalid decoded duration and nonfinite PCM before allocating output', async t => {
  const page = await musicPage(t);
  const result = await page.evaluate(async () => {
    const errors = [];
    context.decodeAudioData = async () => ({ numberOfChannels: 1, length: 1448000, sampleRate: 8000,
      duration: 181, getChannelData() { throw new Error('Must reject before reading PCM'); } });
    errors.push(await errorOf(() => prepareMusic(context, wav(), { maxSeconds: .01 })));
    for (const sample of [NaN, Infinity]) {
      const buffer = new AudioBuffer({ numberOfChannels: 1, length: 8, sampleRate: 8000 });
      buffer.getChannelData(0)[0] = sample;
      context.decodeAudioData = async () => buffer;
      errors.push(await errorOf(() => prepareMusic(context, wav())));
    }
    return { errors, allocations };
  });
  assert.match(result.errors[0]?.message ?? '', /180.*second/i);
  assert.ok(result.errors.slice(1).every(error => /finite|invalid.*sample/i.test(error?.message ?? '')));
  assert.deepEqual(result.allocations, []);
});
