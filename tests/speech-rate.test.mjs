import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveScript, repairScript } from '../src/contracts.mjs';
import { DEFAULT_SPEECH_RATE, resolveSpeechRate, fliteDurationStretch, captionCues } from '../src/speech-timing.mjs';
import { compileTimeline } from '../src/timeline.mjs';
import { sampleGesture } from '../src/gesture-performance.mjs';
import { prepareAudio, pythonCommand } from '../src/audio.mjs';
import { prepareSpeech } from '../browser/voice.mjs';
import { run } from '../src/process.mjs';

const catalog = { edition: { pdfSha256: 'a'.repeat(64) },
  templates: [{ id: 'book-duet', minComics: 1, maxComics: 1, speakers: ['reader', 'friend'], scenes: ['library'] }],
  comics: [{ id: 'p1', verified: true, pdfPage: 5, sha256: 'b'.repeat(64) }] };
const raw = () => ({ template: 'book-duet', title: 'Speech speed', seed: 17, comics: ['p1'],
  lines: [{ speaker: 'reader', text: 'A longer sentence to test the speech speed.' }] });
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('old inputs get a slightly faster default and explicit rates round-trip', () => {
  const input = raw(), before = structuredClone(input);
  const script = resolveScript(input, catalog);
  assert.equal(DEFAULT_SPEECH_RATE, 1.15);
  assert.equal(script.speechRate, DEFAULT_SPEECH_RATE);
  assert.deepEqual(input, before);
  assert.deepEqual(resolveScript(script, catalog), script);
  for (const speechRate of [.5, 1, 1.15, 1.4, 2]) {
    const selected = resolveScript({ ...input, speechRate }, catalog);
    assert.equal(selected.speechRate, speechRate);
    assert.deepEqual(resolveScript(JSON.parse(JSON.stringify(selected)), catalog), selected);
    assert.equal(selected.captions.position, 'top');
    assert.deepEqual(selected.captions.colors, { reader: '#FFFF00', friend: '#228B22' });
  }
});

test('invalid speech rates are repaired once and recorded; strict mode still rejects them', () => {
  for (const [value, expected] of [['1.3', 1.3], [0, .5], [9, 2], [-2, .5], [null, 1.15],
    ['fast', 1.15], ['', 1.15], [true, 1.15], [{ speed: 1 }, 1.15], [Infinity, 1.15], [NaN, 1.15]]) {
    const input = { ...raw(), speechRate: value };
    const script = resolveScript(input, catalog);
    assert.equal(script.speechRate, expected);
    assert.equal(script.warnings.length, 1);
    assert.match(script.warnings[0], /^speechRate:/);
    assert.deepEqual(resolveScript(script, catalog), script);
    assert.throws(() => resolveScript(input, catalog, { repair: false }), /speechRate/);
  }
  const draft = repairScript({ speechRate: '1.2', lines: [] });
  assert.equal(draft.speechRate, 1.2);
  assert.equal(draft.warnings.length, 1);
});

test('speed controls retain prior presentation recovery and source-lock protection', () => {
  const input = raw(); input.lines[0].gesture = 'concerned'; input.speechRate = 1.25;
  const script = resolveScript(input, catalog);
  assert.equal(script.lines[0].emotion, 'concerned'); assert.equal(script.lines[0].gesture, 'none');
  assert.equal(script.speechRate, 1.25); assert.equal(script.warnings.length, 2);
  script.sourceLock[0].sha256 = 'changed';
  assert.throws(() => resolveScript(script, catalog), /Source lock changed/);
});

test('Flite changes duration stretch only and 1x retains both speaker baselines', () => {
  assert.equal(fliteDurationStretch('reader', 1), 1.12);
  assert.equal(fliteDurationStretch('friend', 1), 1);
  for (const rate of [.5, 1, 1.15, 1.5, 2]) {
    close(fliteDurationStretch('reader', rate), 1.12 / rate);
    close(fliteDurationStretch('friend', rate), 1 / rate);
  }
  close(fliteDurationStretch('reader'), 1.12 / DEFAULT_SPEECH_RATE);
  for (const value of [0, 3, null, '1.2', NaN, Infinity]) assert.throws(() => resolveSpeechRate(value), /speechRate/);
});

test('shorter takes shorten only speech; actions, pauses, reactions, fps and end card retain their timing', () => {
  const input = { ...raw(), endCard: { enabled: true, seconds: 2.5 }, lines: [
    { action: 'open', seconds: 1.2 },
    { ...raw().lines[0], pause: .4, gesture: 'arm_flail', shot: 'speaker',
      reaction: { actor: 'friend', emotion: 'curious', at: 'line_end', duration: .8 } },
    { action: 'read', seconds: 1.1 },
    { speaker: 'friend', text: 'And a second line of dialogue.', pause: .5 },
    { action: 'close', seconds: .9 },
  ] };
  const normal = resolveScript({ ...input, speechRate: 1 }, catalog);
  const fast = resolveScript({ ...input, speechRate: 2 }, catalog);
  assert.deepEqual(fast.lines, normal.lines);
  const takes = duration => Object.fromEntries(normal.lines.filter(line => line.text).map(line => [line.id,
    { duration, mouth: [{ t: 0, value: 0 }, { t: .02, value: .5 }, { t: duration, value: 0 }] }]));
  const a = compileTimeline(normal, takes(4)), b = compileTimeline(fast, takes(2));
  close(a.duration - b.duration, 4);
  assert.equal(a.fps, b.fps);
  assert.equal(b.speechRate, undefined, 'no global animation time multiplier');
  for (const e of a.events.filter(e => ['action', 'hold', 'endcard'].includes(e.type))) {
    const other = b.events.find(row => row.id === e.id);
    close(e.end - e.start, other.end - other.start);
    assert.deepEqual(e.reaction, other.reaction);
  }
  for (const e of b.events.filter(e => e.type === 'line')) {
    close(e.captions.at(-1).end, 2);
    close(e.mouth.at(-1).t, 2);
    close(e.end - e.start, 2);
  }
  assert.deepEqual(sampleGesture({ gesture: 'arm_flail', time: 1, duration: 4, seed: 17 }),
    sampleGesture({ gesture: 'arm_flail', time: 1, duration: 2, seed: 17 }), 'same movement per real second');
});

test('browser speech forwards each script rate and measures the returned PCM, not a scaled animation clock', async t => {
  const messages = [], workers = [];
  class Worker {
    constructor() { workers.push(this); }
    terminate() { this.terminated = true; }
    postMessage(message) {
      messages.push(message);
      queueMicrotask(() => {
        for (const [index, line] of message.lines.entries()) {
          const sampleRate = 8000, samples = new Float32Array(Math.round(sampleRate * 2 / message.speechRate));
          for (let i = 0; i < samples.length; i++) samples[i] = .2 * Math.sin(2 * Math.PI * 200 * i / sampleRate);
          this.onmessage({ data: { id: line.id, index, take: { samples, sampleRate } } });
        }
        this.onmessage({ data: { done: true } });
      });
    }
  }
  const oldWorker = globalThis.Worker, oldDocument = globalThis.document;
  globalThis.Worker = Worker; globalThis.document = { baseURI: 'http://localhost/' };
  t.after(() => { if (oldWorker === undefined) delete globalThis.Worker; else globalThis.Worker = oldWorker;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; });
  for (const rate of [.5, 1, 1.15, 2]) {
    const script = resolveScript({ ...raw(), speechRate: rate }, catalog), takes = await prepareSpeech(script);
    assert.equal(messages.at(-1).speechRate, rate);
    const take = takes['beat-0']; close(take.duration, 2 / rate, 1 / 8000);
    close(take.mouth.at(-1).t, take.duration);
    close(captionCues(script.lines[0].text, take).at(-1).end, take.duration);
    assert.equal(workers.at(-1).terminated, true);
  }
  const implicit = resolveScript(raw(), catalog); delete implicit.speechRate;
  await prepareSpeech(implicit); assert.equal(messages.at(-1).speechRate, DEFAULT_SPEECH_RATE);
  await assert.rejects(prepareSpeech({ ...implicit, speechRate: 0 }), /speechRate/);
});

test('recorded audio tempo preserves pitch, uses distinct cache entries and remeasures mouth timing', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'theatre-rate-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'tone.wav'), cacheRoot = path.join(dir, 'cache');
  await run(process.env.FFMPEG ?? 'ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=48000:duration=3', '-c:a', 'pcm_s16le', file]);
  const input = raw(); input.lines[0].audio = 'tone.wav';
  const results = new Map();
  for (const speechRate of [1, 1.15, 1.5, .5, 2]) {
    const script = resolveScript({ ...input, speechRate }, catalog);
    const takes = await prepareAudio(script, { mode: 'recorded', inputRoot: dir, cacheRoot });
    const take = takes['beat-0']; results.set(speechRate, take);
    close(take.duration, 3 / speechRate, .09);
    close(take.mouth.at(-1).t, take.duration);
    const pcm = await fs.readFile(take.path);
    let crossings = 0;
    const from = 12000, to = 36000;
    for (let i = from + 1; i < to; i++) if (pcm.readInt16LE((i - 1) * 2) <= 0 && pcm.readInt16LE(i * 2) > 0) crossings++;
    close(crossings / ((to - from) / 48000), 440, 4);
    const cached = await prepareAudio(script, { mode: 'recorded', inputRoot: dir, cacheRoot });
    assert.deepEqual(cached['beat-0'], take);
    const receipt = JSON.parse(await fs.readFile(take.path.replace(/\.pcm$/, '.json')));
    assert.equal(receipt.speechRate, speechRate);
  }
  assert.equal(new Set([...results.values()].map(take => take.path)).size, 5);
  // A line with its own recording follows the same setting even with Flite selected.
  const mixed = await prepareAudio(resolveScript({ ...input, speechRate: 1.5 }, catalog), { mode: 'flite', inputRoot: dir, cacheRoot });
  assert.deepEqual(mixed['beat-0'], results.get(1.5));
});

test('Kokoro request validation matches JS defaults and bounds without loading a model', async () => {
  const worker = new URL('../voices/kokoro_worker.py', import.meta.url);
  const code = `import importlib.util, json, math, sys\nspec=importlib.util.spec_from_file_location('speech_worker',sys.argv[1])\nw=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)\nassert w.speech_speed({}) == 1.15\nfor x in [.5,1,1.15,2]: assert w.speech_speed({'speed':x}) == x\nfor x in [0,3,None,True,'1.2',float('nan'),float('inf')]:\n try: w.speech_speed({'speed':x})\n except ValueError: pass\n else: raise AssertionError(repr(x))\nprint('ok')`;
  const { fileURLToPath } = await import('node:url');
  assert.equal((await run(await pythonCommand(), ['-c', code, fileURLToPath(worker)])).toString().trim(), 'ok');
});
