import test from 'node:test';
import assert from 'node:assert/strict';

// These real-WASM checks catch both text-prefix and fixed-duration truncation.
test('Flite synthesizes complete long contract text into finite audible PCM', async () => {
  const { synthesizeSpeech } = await import('../src/flite.mjs');
  const { loadNodeFlite } = await import('../src/flite-node.mjs');
  const module = await loadNodeFlite();
  assert.ok(module instanceof WebAssembly.Module);
  const phrase = 'The little book has a very surprising story. ';
  const short = await synthesizeSpeech(module, phrase, { speaker: 'reader' });
  const long = await synthesizeSpeech(module, phrase.repeat(18), { speaker: 'reader' });
  assert.ok(long.samples instanceof Float32Array);
  assert.ok(long.sampleRate >= 8000);
  assert.ok(long.samples.length / long.sampleRate > 20, 'do not cap audio at twenty seconds');
  assert.ok(long.samples.length > short.samples.length * 12, 'do not cap text at 240 characters');
  assert.ok(long.samples.every(v => Number.isFinite(v) && Math.abs(v) <= 1));
  assert.ok(long.samples.some(v => Math.abs(v) > .01));
  assert.ok(long.samples.slice(-long.sampleRate * 3).some(v => Math.abs(v) > .01), 'the last phrase is audible');
});

test('Flite profiles are deterministic, distinct, and reject invalid text', async () => {
  const { synthesizeSpeech } = await import('../src/flite.mjs');
  const { loadNodeFlite } = await import('../src/flite-node.mjs');
  const module = await loadNodeFlite();
  const text = 'You should read this book.';
  const a = await synthesizeSpeech(module, text, { speaker: 'reader' });
  const b = await synthesizeSpeech(module, text, { speaker: 'friend' });
  const again = await synthesizeSpeech(module, text, { speaker: 'reader' });
  assert.deepEqual(a, again);
  assert.notDeepEqual(a.samples, b.samples);
  for (const text of ['', '   ', null, 'hello\0hidden', 'x'.repeat(1001)]) {
    await assert.rejects(() => synthesizeSpeech(module, text), /text/i);
  }
});

test('Flite accepts full-length UTF-8 dialogue without corrupting WASI argument storage', async () => {
  const { synthesizeSpeech } = await import('../src/flite.mjs');
  const { loadNodeFlite } = await import('../src/flite-node.mjs');
  const take = await synthesizeSpeech(await loadNodeFlite(), '“Hello.” '.repeat(110));
  assert.ok(take.samples.length / take.sampleRate > 20);
  assert.ok(take.samples.every(Number.isFinite));
});
