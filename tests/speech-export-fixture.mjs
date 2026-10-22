import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
export async function browserFixture(t, entries) {
  const bundled = await build({ absWorkingDir: root, entryPoints: entries, outdir: 'test-bundle',
    outbase: '.', bundle: true, format: 'esm', platform: 'browser', write: false });
  const files = new Map(bundled.outputFiles.map(f => ['/' + f.path.split('/test-bundle/')[1].replace(/\.js$/, '.mjs'), f.contents]));
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<canvas></canvas>'); }
      const path = resolve(root, '.' + pathname);
      if (!path.startsWith(root + sep)) throw new Error('outside fixture');
      const bytes = files.get(pathname) ?? await readFile(pathname === '/vendor/flite.wasm'
        ? resolve(root, 'node_modules/@echogarden/flite-wasi/flite.wasm') : path);
      res.setHeader('Content-Type', ({ '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm',
        '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.ttf': 'font/ttf' })[extname(path)] ?? 'application/octet-stream');
      res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  const origin = `http://127.0.0.1:${server.address().port}`, external = [], errors = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => { if (external.length || errors.length) throw new Error(JSON.stringify({ external, errors })); });
  await page.goto(origin);
  const catalog = JSON.parse(await readFile(resolve(root, 'assets/catalog.json'), 'utf8'));
  return { page, catalog };
}

export const shortScript = {
  template: 'book-duet', title: 'Export integration', comics: ['book2-036'], seed: 21,
  output: { width: 256, height: 192, fps: 12 }, endCard: { enabled: false },
  lines: [
    { speaker: 'reader', text: 'Look at this book.', pause: .1, shot: 'speaker' },
    { speaker: 'friend', text: 'I want to read it.', pause: .2, shot: 'speaker' },
  ],
};
