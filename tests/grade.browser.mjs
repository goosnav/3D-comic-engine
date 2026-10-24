import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));
test('muted and film grades calm the 3D stage; source inserts stay exact', { timeout: 180000 }, async t => {
  const catalog = JSON.parse(await readFile(resolve(root, 'assets/catalog.json')));
  const server = createServer(async (req, res) => { try {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><canvas></canvas>'); }
    const path = resolve(root, '.' + req.url); if (!path.startsWith(root)) throw Error('path');
    res.setHeader('Content-Type', /\.m?js$/.test(path) ? 'text/javascript' : 'application/octet-stream'); res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => { server.closeAllConnections(); server.close(); });
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); t.after(() => browser.close());
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = {};
  for (const grade of ['vivid', 'muted', 'film']) {
    const timeline = { version: 1, width: 216, height: 384, fps: 12, duration: 4, frames: 48, seed: 2, scene: 'library', cast: ['reader', 'friend'], characters: { reader: 'billy', friend: 'gooby' }, grade, sources: ['book2-020'], endCard: { enabled: false }, events: [
      { id: 'a', type: 'line', speaker: 'reader', comic: 'book2-020', shot: 'two-shot', start: 0, end: 2, mouth: [] },
      { id: 'b', type: 'line', speaker: 'reader', comic: 'book2-020', shot: 'source', start: 2, end: 4, mouth: [] }] };
    results[grade] = await page.evaluate(async ({ timeline, catalog }) => {
      const { createPlayer } = await import('/src/player.mjs');
      const canvas = document.querySelector('canvas'), player = await createPlayer(canvas, { timeline, catalog });
      const measure = async frame => {
        await player.renderAt(frame);
        const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
        const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data; let sat = 0, sum = 0;
        for (let i = 0; i < d.length; i += 4) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); sat += mx ? (mx - mn) / mx : 0; sum += d[i] + d[i + 1] + d[i + 2]; }
        return { sat: sat / (d.length / 4), sum };
      };
      const stage = await measure(6), source = await measure(30), first = player.diagnostics().grade;
      const again = await measure(6);
      player.dispose();
      return { stage, source, again, grade: first };
    }, { timeline, catalog });
  }
  assert.deepEqual(errors, []);
  t.diagnostic(JSON.stringify(results));
  assert.equal(results.muted.grade, 'muted');
  assert.ok(results.muted.stage.sat < results.vivid.stage.sat * .85, 'muted pulls colour back');
  assert.ok(results.film.stage.sat < results.muted.stage.sat, 'film is dustier still');
  for (const grade of ['muted', 'film']) assert.deepEqual(results[grade].again, results[grade].stage, 'grain is deterministic per frame');
  assert.deepEqual(results.muted.source, results.vivid.source, 'comic page inserts are never graded');
});
