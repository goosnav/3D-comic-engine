import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');

test('player reports each loading stage before a failed endcard load, without starting the GPU', { timeout: 30000 }, async t => {
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end('<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>');
      }
      const path = resolve(root, '.' + req.url);
      if (!path.startsWith(root + sep)) throw Error('outside fixture');
      res.setHeader('Content-Type', ({ '.mjs': 'text/javascript', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' })[extname(path)] ?? 'application/octet-stream');
      res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const catalog = JSON.parse(await readFile(resolve(root, 'assets/catalog.json'), 'utf8'));
  catalog.assets.endCardVideo.path = 'assets/missing-endcard.mp4';
  const result = await page.evaluate(async catalog => {
    const { createPlayer } = await import('/src/player.mjs');
    const timeline = { version: 1, fps: 12, width: 432, height: 540, frames: 144, duration: 12, seed: 21,
      scene: 'library', template: 'book-duet', cast: ['reader', 'friend'], sources: ['book2-020'],
      events: [{ id: 'closing', type: 'endcard', start: 9, end: 12, title: 'Keep reading', text: 'Comics for your shelf.', url: 'www.goosnav.shop' }] };
    const progress = [], makeContext = HTMLCanvasElement.prototype.getContext;
    let gpu = false, atVideoFetch;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type.startsWith('webgl')) { gpu = true; throw Error('GPU must not start in this loading test'); }
      return makeContext.call(this, type, ...args);
    };
    const originalFetch = window.fetch;
    window.fetch = (...args) => {
      if (String(args[0]).includes('missing-endcard.mp4')) atVideoFetch = progress.at(-1);
      return originalFetch(...args);
    };
    try {
      await createPlayer(document.createElement('canvas'), { timeline, catalog,
        onProgress: (message, detail) => progress.push({ message, detail }) });
      return { error: 'unexpected success' };
    } catch (error) { return { error: error.message, progress, atVideoFetch, gpu }; }
    finally { window.fetch = originalFetch; HTMLCanvasElement.prototype.getContext = makeContext; }
  }, catalog);
  assert.match(result.error, /Endcard video load failed.*404/);
  assert.equal(result.gpu, false);
  assert.ok(result.progress.length >= 6, 'loading progress reaches actors, book, page, fonts and video');
  for (const { message, detail } of result.progress) assert.deepEqual(detail, { phase: 'loading', progress: null, message });
  const messages = result.progress.map(p => p.message).join('\n');
  assert.match(messages, /actor[\s\S]*book[\s\S]*page[\s\S]*font[\s\S]*video/i);
  assert.match(result.atVideoFetch.message, /endcard video/i, 'report the video stage before its request begins');
});
