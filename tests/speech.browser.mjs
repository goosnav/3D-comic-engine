import test from 'node:test';
import assert from 'node:assert/strict';
import { browserFixture } from './speech-export-fixture.mjs';

test('worker produces complete measured speech and mouth curves, and supports cancellation', { timeout: 60000 }, async t => {
  const { page } = await browserFixture(t, ['browser/voice.mjs', 'browser/voice-worker.mjs']);
  const result = await page.evaluate(async () => {
    const { prepareSpeech } = await import('/browser/voice.mjs');
    const text = 'The little book has a very surprising story. '.repeat(18);
    const takes = await prepareSpeech({ lines: [{ id: 'long', speaker: 'reader', text }] });
    const take = takes.long;
    const controller = new AbortController();
    const pending = prepareSpeech({ lines: [{ id: 'cancel', speaker: 'reader', text }] }, { signal: controller.signal });
    controller.abort();
    let cancelled;
    try { await pending; } catch (e) { cancelled = e.name; }
    return { duration: take.duration, pcmDuration: take.samples.length / take.sampleRate,
      audible: take.samples.some(v => Math.abs(v) > .01), mouth: take.mouth, cancelled };
  });
  assert.ok(result.duration > 20);
  assert.equal(result.duration, result.pcmDuration);
  assert.ok(result.audible);
  assert.equal(result.mouth[0].value, 0);
  assert.ok(result.mouth.some(p => p.value > .1));
  assert.deepEqual(result.mouth.at(-1), { t: result.duration, value: 0 });
  assert.ok(result.mouth.every((p, i, all) => p.value >= 0 && p.value <= 1 && (!i || p.t > all[i - 1].t)));
  assert.equal(result.cancelled, 'AbortError');
});
