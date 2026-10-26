import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { resolveScript } from '../src/contracts.mjs';

// Real editor markup and events with in-memory module imports/API/storage.
// No network, model files or MP4 encoding are needed for this UI regression.
test('speech speed control survives JSON import/edit/download/draft restoration and reaches render/batch snapshots', async t => {
  const catalog = { edition: { title: 'Fixture', pdfSha256: 'a'.repeat(64) },
    templates: [{ id: 'book-duet', label: 'Duet', minComics: 1, maxComics: 1, speakers: ['reader', 'friend'], scenes: ['library'] }],
    scenes: [{ id: 'library', label: 'Library' }], variants: [{ id: 'blue', label: 'Blue' }, { id: 'rust', label: 'Rust' }],
    comics: [{ id: 'p1', title: 'Page 1', verified: true, pdfPage: 5, sha256: 'b'.repeat(64), path: 'assets/p1.jpg' }] };
  const submitted = [];
  const modules = {
    '/batch.mjs': `export function createBatchUI({getEditorScript,isReady}) {
      window.batchCopies=[];
      document.getElementById('batch-add-editor').onclick=()=>window.batchCopies.push(getEditorScript());
      return {controls(){document.getElementById('batch-add-editor').disabled=!isReady();},
        register(script){window.batchCopies.push(structuredClone(script));},setCatalog(){},async refresh(){}};
    }`,
    '/src/editor-selection.mjs': 'export const comicReplacements=()=>[]; export const replaceComic=()=>{}; export const randomComic=()=>{};',
    '/generator-notes.mjs': 'export function appendGeneratorNotes() {}',
  };
  const encoded = new Map();
  async function moduleURL(file) {
    if (encoded.has(file)) return encoded.get(file);
    const route = file === 'web/batch.mjs' ? '/batch.mjs' : file === 'web/generator-notes.mjs' ? '/generator-notes.mjs' : '/' + file;
    let source = modules[route] ?? await fs.readFile(new URL('../' + file, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from\s+(['"])(\.[^'"]+)\1/g)];
    for (const match of imports) {
      const resolved = new URL(match[2], 'https://fixture.invalid/' + file).pathname.slice(1);
      source = source.replace(match[0], `from ${JSON.stringify(await moduleURL(resolved))}`);
    }
    const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
    encoded.set(file, url); return url;
  }
  const appURL = await moduleURL('web/app.mjs');
  const html = (await fs.readFile(new URL('../web/index.html', import.meta.url), 'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.THEATRE_CHROMIUM || undefined,
    args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => void dialog.accept());
  const readJSON = async () => JSON.parse(await page.locator('#script-json').inputValue());
  await page.exposeFunction('validateFixture', script => resolveScript(script, catalog));
  await page.exposeFunction('renderFixture', body => { submitted.push(body); return { id: 'speed-test', status: 'queued' }; });
  let revision = 0;
  async function boot() {
    await page.setContent(html);
    await page.evaluate(async ({ appURL, catalog, revision }) => {
      const store = window.fixtureStorage ??= new Map();
      Object.defineProperty(window, 'localStorage', { configurable: true, value: {
        getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key),
      } });
      window.setInterval = () => 0;
      window.fetch = async (route, options = {}) => {
        let body;
        if (route === '/api/catalog') body = catalog;
        else if (route === '/api/session') body = { token: 'fixture' };
        else if (route === '/api/jobs') body = { jobs: [] };
        else if (route === '/api/validate') body = { script: await window.validateFixture(JSON.parse(options.body).script) };
        else if (route === '/api/render') body = await window.renderFixture(JSON.parse(options.body));
        else throw new Error('Unexpected fixture request: ' + route);
        return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      };
      await import(appURL + '#' + revision);
    }, { appURL, catalog, revision: revision++ });
  }
  await boot();
  await page.waitForFunction(() => document.getElementById('editor-status').textContent.startsWith('Ready.'));
  assert.equal(await page.locator('#speech-rate').inputValue(), '1.15');
  assert.equal(await page.locator('#speech-rate').getAttribute('min'), '0.5');
  assert.equal(await page.locator('#speech-rate').getAttribute('max'), '2');
  const input = { title: 'Speed fixture', template: 'book-duet', comics: ['p1'], seed: 17, speechRate: 1.4,
    lines: [{ speaker: 'reader', text: 'Hello from the speed test.', pause: .8 }] };
  await page.locator('#upload-json-top').setInputFiles({ name: 'speed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await page.waitForFunction(() => document.getElementById('speech-rate').value === '1.4');
  await page.locator('#speech-rate').fill('1.35');
  assert.equal((await readJSON()).speechRate, 1.35);
  assert.deepEqual((await readJSON()).lines, input.lines);
  await page.locator('#batch-add-editor').click();
  assert.equal(await page.evaluate(() => window.batchCopies.at(-1).speechRate), 1.35);
  const downloaded = page.waitForEvent('download'); await page.locator('#download-json').click();
  const download = await downloaded;
  assert.equal(JSON.parse(await fs.readFile(await download.path(), 'utf8')).speechRate, 1.35);
  await page.locator('#generate').click();
  await page.waitForFunction(() => document.getElementById('editor-status').textContent.startsWith('Submitted'));
  assert.equal(submitted.length, 1); assert.equal(submitted[0].script.speechRate, 1.35);
  assert.deepEqual(submitted[0].script.lines, input.lines);
  await boot();
  await page.waitForFunction(() => document.getElementById('editor-status').textContent.startsWith('Restored'));
  assert.equal(await page.locator('#speech-rate').inputValue(), '1.35');
  const imported = await readJSON(); imported.speechRate = 1.8;
  await page.locator('#script-json').fill(JSON.stringify(imported));
  assert.equal(await page.locator('#speech-rate').isDisabled(), true);
  await page.locator('#apply-json').click(); assert.equal(await page.locator('#speech-rate').inputValue(), '1.8');
  imported.speechRate = 'fast';
  await page.locator('#script-json').fill(JSON.stringify(imported)); await page.locator('#apply-json').click();
  assert.equal(await page.locator('#speech-rate').inputValue(), '1.15');
  assert.match((await readJSON()).warnings[0], /^speechRate:/);
  await page.locator('#validate').click();
  await page.waitForFunction(() => document.getElementById('editor-status').textContent.startsWith('Server validation passed'));
  assert.equal((await readJSON()).warnings.length, 1);
  await page.locator('#new-video').click(); assert.equal(await page.locator('#speech-rate').inputValue(), '1.15');
  assert.equal((await readJSON()).speechRate, undefined);
  assert.deepEqual(errors, []);
});
