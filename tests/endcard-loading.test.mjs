import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEndcardVideo } from '../src/endcard-video.mjs';

function mediaBoundary(t, { blocked = false, stalled = false } = {}) {
  const previous = globalThis.document;
  class MetadataOnlyVideo extends EventTarget {
    readyState = 0; networkState = 1; duration = NaN; seeking = false; paused = true; currentTime = 0;
    playCalls = 0;
    set src(value) { this.url = value; queueMicrotask(() => { this.readyState = 1; this.duration = 15; this.dispatchEvent(new Event('loadedmetadata')); }); }
    get src() { return this.url; }
    getAttribute(name) { return name === 'src' ? this.url : null; }
    removeAttribute() { this.url = undefined; }
    setAttribute() {}
    load() { this.dispatchEvent(new Event('emptied')); }
    pause() { this.paused = true; }
    play() {
      this.playCalls++;
      if (blocked) return Promise.reject(new DOMException('User activation needed', 'NotAllowedError'));
      if (stalled) return new Promise(() => {});
      return new Promise(resolve => queueMicrotask(() => {
        this.paused = false; this.readyState = 2; this.duration = 15;
        this.dispatchEvent(new Event('loadeddata')); resolve();
      }));
    }
  }
  const video = new MetadataOnlyVideo();
  globalThis.document = { createElement: () => video };
  t.after(() => { globalThis.document = previous; });
  return video;
}

test('metadata-only preload is primed muted and leaves the decoded video paused', async t => {
  const video = mediaBoundary(t);
  const url = URL.createObjectURL(new Blob(['owned verified bytes'], { type: 'video/mp4' }));
  t.after(() => URL.revokeObjectURL(url));
  const result = await loadEndcardVideo(url, { timeoutMs: 100 });
  assert.equal(video.playCalls, 1);
  assert.equal(video.muted, true); assert.equal(video.playsInline, true);
  assert.equal(video.paused, true); assert.equal(video.readyState, 2);
  assert.equal(video.src, url, 'already verified blob is reused without fetching/copying it');
  result.dispose(); result.dispose();
  assert.ok((await fetch(url)).ok, 'caller-owned blob survives disposal');
});

test('cancel releases a decoder that never produces its first frame', async t => {
  const video = mediaBoundary(t, { stalled: true });
  const controller = new AbortController();
  const pending = loadEndcardVideo('blob:test-owned', { signal: controller.signal, timeoutMs: 100 });
  controller.abort(new Error('Cancelled by user'));
  await assert.rejects(pending, /Cancelled by user/);
  assert.equal(video.getAttribute('src'), undefined);
});

test('stalled decoder reports its state and a blocked play reports a useful action', async t => {
  const video = mediaBoundary(t, { stalled: true });
  await assert.rejects(loadEndcardVideo('blob:test-owned', { timeoutMs: 20 }), /readyState=1.*networkState=1/);
  video.play = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
  await assert.rejects(loadEndcardVideo('blob:test-owned', { timeoutMs: 100 }), /blocked.*Generate|Generate.*blocked/i);
});
