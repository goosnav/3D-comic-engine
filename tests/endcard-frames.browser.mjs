import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { startServer } from '../src/server.mjs';
import { loadCatalog } from '../src/library.mjs';
const engine = process.env.THEATRE_TEST_ENGINE === 'webkit' ? webkit : chromium;

test('real JPEG endcard animates, wraps and reverse-seeks without a video element or playback permission', { timeout: 30000 }, async t => {
  const server = await startServer(); t.after(() => server.close());
  const browser = await engine.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage(); await page.goto(server.url);
  await page.addScriptTag({ type: 'importmap', content: '{"imports":{"three":"/node_modules/three/build/three.module.js"}}' });
  const catalog = await loadCatalog();
  const result = await page.evaluate(async path => {
    const { loadEndcardFrames } = await import('/src/endcard-frames.mjs');
    const { createEndcard } = await import('/src/endcard.mjs');
    let videoElements = 0, playCalls = 0;
    const create = document.createElement.bind(document);
    document.createElement = (tag, ...args) => { if (tag.toLowerCase() === 'video') { videoElements++; throw Error('No video decoder allowed'); } return create(tag, ...args); };
    HTMLVideoElement.prototype.play = () => { playCalls++; return Promise.reject(new DOMException('Denied', 'NotAllowedError')); };
    const source = await loadEndcardFrames(path);
    const card = createEndcard({ width: 432, height: 540, card: { title: 'Keep reading', text: 'A book of comics.', url: 'www.goosnav.shop' }, frameSource: source });
    const canvas = card.scene.children[0].material.map.image;
    const images = [], times = [];
    for (const time of [0, 5, 0, 0, 15, -15]) { await card.renderAt(time); images.push(canvas.toDataURL()); times.push(card.diagnostics().sourceTime); }
    const dimensions = [source.width, source.height, source.duration];
    const typography = card.diagnostics().typography;
    source.dispose(); source.dispose();
    let disposedError; try { await card.renderAt(1); } catch (error) { disposedError = error.message; }
    return { images, times, dimensions, typography, disposedError, videoElements, playCalls };
  }, '/' + catalog.assets.endCardFrames.path);
  assert.deepEqual(result.dimensions, [432, 540, 15]);
  assert.deepEqual(result.times, [2, 7, 2, 2, 2, 2]);
  assert.notEqual(result.images[0], result.images[1], 'book actually rotates, not a frozen fallback');
  for (const index of [2, 3, 4, 5]) assert.equal(result.images[index], result.images[0]);
  assert.equal(result.typography.url.color, '#0000ee'); assert.equal(result.typography.url.underline, true);
  assert.match(result.disposedError, /disposed/);
  assert.equal(result.playCalls, 0); assert.equal(result.videoElements, 0);
});

test('frame loading bounds corrupt/dead decoders, releases temporary URLs, and honors cancellation', { timeout: 30000 }, async t => {
  const server = await startServer(); t.after(() => server.close());
  const browser = await engine.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage(); await page.goto(server.url);
  const catalog = await loadCatalog();
  const result = await page.evaluate(async path => {
    const { loadEndcardFrames } = await import('/src/endcard-frames.mjs');
    const blob = await (await fetch(path)).blob(), url = URL.createObjectURL(blob);
    const failures = [], controller = new AbortController();
    const source = await loadEndcardFrames(url, { signal: controller.signal });
    controller.abort(Error('Cancelled after load'));
    try { await source.getFrame(1); } catch (error) { failures.push(error.message); }
    source.dispose();
    const NativeImage = window.Image, create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    let created = 0, revoked = 0, release;
    // Only the image decoder boundary stalls. Real pack fetching/parsing and
    // timeout/abort ownership still run, including release of all temporary URLs.
    window.Image = class {
      removeAttribute() {}
      set src(value) { release?.(); }
    };
    URL.createObjectURL = value => { created++; return create(value); };
    URL.revokeObjectURL = value => { revoked++; return revoke(value); };
    try {
      try { await loadEndcardFrames(url, { timeoutMs: 100 }); } catch (error) { failures.push(error.message); }
      const cancellation = new AbortController();
      release = () => cancellation.abort(Error('Cancelled during decode'));
      try { await loadEndcardFrames(url, { signal: cancellation.signal }); } catch (error) { failures.push(error.message); }
    } finally { window.Image = NativeImage; URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
    // A structurally valid pack with corrupt compressed pixels must fail loudly.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const offset = 8 + new DataView(bytes.buffer).getUint32(4, true);
    bytes[offset + 2] = 0; bytes[offset + 3] = 0;
    const broken = URL.createObjectURL(new Blob([bytes]));
    try { await loadEndcardFrames(broken); } catch (error) { failures.push(error.message); }
    URL.revokeObjectURL(broken);
    const callerURLSurvives = (await fetch(url)).ok; URL.revokeObjectURL(url);
    return { failures, created, revoked, callerURLSurvives };
  }, '/' + catalog.assets.endCardFrames.path);
  assert.match(result.failures[0], /Cancelled after load/);
  assert.match(result.failures[1], /decode timed out/);
  assert.match(result.failures[2], /Cancelled during decode/);
  assert.match(result.failures[3], /could not be decoded/);
  assert.equal(result.created, 2); assert.equal(result.revoked, result.created);
  assert.equal(result.callerURLSurvives, true);
});
