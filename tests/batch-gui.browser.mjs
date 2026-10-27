import { inWorkspace } from './workspace-controls.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const catalog = {
  edition: { title: 'Batch fixture', pdfSha256: 'fixture-edition' },
  templates: [{ id: 'book-duet', label: 'Duet', minComics: 1, maxComics: 2, speakers: ['reader', 'friend'], scenes: ['library'] }],
  scenes: [{ id: 'library', label: 'Library' }],
  variants: [{ id: 'blue', label: 'Blue' }, { id: 'rust', label: 'Rust' }],
  comics: [1, 2].map(n => ({ id: `p${n}`, title: `Page ${n}`, pdfPage: n + 2, verified: true, sha256: `page-${n}`, path: `assets/comics/p${n}.png` })),
};
const makeScript = (title = 'First exact script', overrides = {}) => ({
  version: 1, template: 'book-duet', title, comics: ['p1'], scene: 'library', seed: 117,
  characters: { reader: 'blue', friend: 'rust' },
  output: { width: 640, height: 800, fps: 30 },
  endCard: { enabled: false, title: 'Authored card', text: 'Keep this.', url: '', seconds: 2 },
  lines: [{ speaker: 'reader', text: 'A library fine is just a late plot twist.', comic: 'p1', emotion: 'curious', gesture: 'nod', face: { eye_open: .7 }, reaction: { actor: 'friend', emotion: 'neutral', gesture: 'head_tilt', at: 'line_start', duration: .4 }, pause: .75, shot: 'source' }],
  ...overrides,
});
const file = (name, value) => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value, null, 2)) });
const mp4 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 2, 0, 105, 115, 111, 109, 109, 112, 52, 50]);
let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.THEATRE_TEST_CHROMIUM ? { executablePath: process.env.THEATRE_TEST_CHROMIUM } : {}) }); });
after(async () => { await browser?.close(); });

function publicBatch(body, id) {
  return { id, status: 'running', createdAt: new Date().toISOString(), total: body.entries.length, completed: 0, failed: 0, cancelled: 0, items: body.entries.map((entry, index) => ({ index, name: entry.name, status: index ? 'queued' : 'running', jobId: `${id}-${index}` })) };
}
async function fixture(t, { staticMode = false, storageBlocked = false } = {}) {
  const state = { requests: [], submissions: [], batches: [], jobs: [] };
  const prefix = staticMode ? '/nested/studio/' : '/';
  const server = http.createServer(async (req, res) => {
    try {
      state.requests.push(req.url);
      const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
      if (req.url === '/api/session') return json({ token: 'fixture' });
      if (req.url === '/api/catalog' || req.url === `${prefix}assets/catalog.json`) return json(catalog);
      if (req.url === '/api/jobs') return json({ jobs: state.jobs });
      if (req.url === '/api/batches') return json({ batches: state.batches });
      if (req.url === '/api/batch' && req.method === 'POST') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks)); state.submissions.push(body);
        const batch = publicBatch(body, `batch-${state.submissions.length}`); state.batches.push(batch);
        return json({ batch });
      }
      if (req.url === '/api/batch/cancel' && req.method === 'POST') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const { id } = JSON.parse(Buffer.concat(chunks));
        const batch = state.batches.find(value => value.id === id);
        batch.items = batch.items.map(item => item.status === 'queued' ? { ...item, status: 'cancelled' } : item);
        batch.cancelled = batch.items.filter(item => item.status === 'cancelled').length;
        return json({ batch });
      }
      if (req.url.startsWith('/output/') && req.url.endsWith('.mp4')) { res.setHeader('Content-Type', 'video/mp4'); return res.end(mp4); }
      if (req.url === `${prefix}examples/index.json`) return json({ examples: [
        ...Array.from({ length: 25 }, (_, index) => ({ name: `page-${String(index + 1).padStart(2, '0')}-joke.json`, path: `examples/page-${String(index + 1).padStart(2, '0')}-joke.json`, title: `Joke ${index + 1}`, group: 'pages' })),
        { name: 'tour.json', path: 'examples/tour.json', title: 'Tour', group: 'tours' },
      ] });
      if (req.url.startsWith(`${prefix}examples/page-`)) return json(makeScript(`Page ${req.url.match(/page-(\d+)/)[1]} joke`));
      if (req.url.startsWith(`${prefix}templates/`)) return json(makeScript('Worked example'));
      if (/^\/(?:nested\/)?src\/(script-normalization|caption-defaults|speech-timing|contracts|book-pages|editor-defaults|editor-selection|gesture-performance|facial-performance|zip)\.mjs$/.test(req.url)) {
        res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile(new URL(`src/${req.url.split('/').at(-1)}`, root)));
      }
      if (staticMode && req.url === `${prefix}browser/backend.mjs`) {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(`export function createBrowserBackend({catalog,onChange}) {
          let batches=[]; const owned=new Set(); window.batchSubmissions=[];
          const api=async (route,body)=>{
            if(route==='/api/session')return {token:'device'};
            if(route==='/api/catalog')return catalog;
            if(route==='/api/jobs')return {jobs:[]};
            if(route==='/api/batches')return {batches};
            if(route==='/api/batch') {
              window.batchRequestInClick=window.batchClickInProgress;
              window.batchSubmissions.push(structuredClone(body));
              const batch=(${publicBatch.toString()})(body,'device-'+window.batchSubmissions.length);batches.push(batch);return {batch};
            }
            throw Error('Unexpected route '+route);
          };
          api.ownsURL=url=>owned.has(url);
          window.completeDeviceBatch=()=>{
            const batch=batches.at(-1);batch.status='complete';batch.completed=batch.total;
            batch.items=batch.items.map((item,index)=>{const video=URL.createObjectURL(new Blob([new Uint8Array(${JSON.stringify([...mp4])})],{type:'video/mp4'}));owned.add(video);return {...item,status:'complete',video,filename:String(index+1).padStart(3,'0')+'-device.mp4'};});onChange();
          };return api;
        }`);
      }
      if (req.url.startsWith(`${prefix}assets/comics/`)) { res.setHeader('Content-Type', 'image/png'); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfRcAAAAASUVORK5CYII=', 'base64')); }
      const files = { [`${prefix}generator-notes.mjs`]: 'generator-notes.mjs', [prefix]: 'index.html', [`${prefix}app.mjs`]: 'app.mjs', [`${prefix}batch.mjs`]: 'batch.mjs', [`${prefix}style.css`]: 'style.css' };
      if (files[req.url]) {
        const name = files[req.url]; let source = await readFile(new URL(`web/${name}`, root), 'utf8');
        if (staticMode && name === 'index.html') source = source.replace('content="desktop"', 'content="browser"');
        res.setHeader('Content-Type', name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); return res.end(source);
      }
      res.writeHead(404); res.end();
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext({ acceptDownloads: true });
  if (storageBlocked) await context.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === 'comic-theatre-batch-library-v1') throw new DOMException('Full', 'QuotaExceededError'); return original.call(this, key, value); };
  });
  await context.addInitScript(() => {
    document.addEventListener('click', event => { if (event.target.id === 'batch-render') window.batchClickInProgress = true; }, true);
    document.addEventListener('click', event => { if (event.target.id === 'batch-render') window.batchClickInProgress = false; });
  });
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); await new Promise(resolve => server.close(resolve)); assert.deepEqual(errors, []); });
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.waitForFunction(() => document.querySelector('#batch-files')?.disabled === false);
  return { page, state, context };
}
const current = async page => JSON.parse(await page.locator('#script-json').inputValue());
async function upload(page, values) {
  await page.locator('#batch-files').setInputFiles(values);
  await page.waitForFunction(() => !document.querySelector('#batch-files').disabled);
}
async function started(page) { await page.waitForFunction(() => document.querySelector('#batch-runs .batch-run')); }
function zipEntries(buffer) {
  const result = new Map(); let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18), nameSize = buffer.readUInt16LE(offset + 26), extra = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameSize).toString('utf8');
    const start = offset + 30 + nameSize + extra;
    result.set(name, buffer.subarray(start, start + size)); offset = start + size;
  }
  return result;
}

test('multiple JSON selection sends exact originals, honors subset and leaves editor edits independent', async t => {
  const { page, state } = await fixture(t);
  const blank = await current(page);
  const first = makeScript(), second = makeScript('Second script', { output: { width: 384, height: 480, fps: 12 } });
  await upload(page, [file('first.json', first), file('second.json', second), file('broken.json', '{bad'), file('manifest.json', [{ script: 'first.json' }])]);
  assert.equal(await page.locator('#batch-library .batch-script').count(), 3);
  assert.equal(await page.getByRole('checkbox', { includeHidden: true,  name: 'Select broken.json', exact: true }).isDisabled(), true);
  assert.match(await page.locator('#batch-import-status').textContent(), /batch manifest skipped/);
  assert.deepEqual(await current(page), blank);
  assert.match(await page.locator('#batch-library').textContent(), /640 × 800 · 30 fps/);
  await (await inWorkspace(page.getByRole('checkbox', { includeHidden: true,  name: 'Select first.json', exact: true }))).uncheck();
  const dirty = '{"my unapplied edit":';
  await (await inWorkspace(page.locator('#script-json'))).fill(dirty);
  await (await inWorkspace(page.locator('#batch-voice'))).selectOption('kokoro');
  await (await inWorkspace(page.locator('#batch-render'))).click(); await started(page);
  assert.deepEqual(state.submissions, [{ entries: [{ name: 'second.json', script: second }], voice: 'kokoro' }]);
  assert.equal(await page.locator('#script-json').inputValue(), dirty);
  assert.equal(await page.locator('#batch-render').isDisabled(), true);
});

test('folder imports skip manifests and non-JSONs, preserve duplicate basenames, and restore selected library', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'comic-batch-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'nested'));
  await Promise.all([
    writeFile(path.join(directory, 'same.json'), JSON.stringify(makeScript('First same name'))),
    writeFile(path.join(directory, 'nested', 'same.json'), JSON.stringify(makeScript('Second same name'))),
    writeFile(path.join(directory, 'manifest.json'), '[{"script":"same.json"}]'),
    writeFile(path.join(directory, 'readme.txt'), 'Ignore me'),
    writeFile(path.join(directory, 'invalid.json'), JSON.stringify({ title: 'Incomplete' })),
    writeFile(path.join(directory, 'oversized.json'), ' '.repeat(2 * 1024 * 1024 + 1)),
  ]);
  const { page } = await fixture(t);
  const blank = await current(page);
  await page.locator('#batch-folder').setInputFiles(directory);
  await page.waitForFunction(() => !document.querySelector('#batch-folder').disabled);
  assert.equal(await page.locator('#batch-library .batch-script').count(), 4);
  assert.equal(await page.locator('#batch-library input:checked').count(), 2);
  assert.match(await page.locator('#batch-import-status').textContent(), /non-JSON file skipped/);
  assert.match(await page.locator('#batch-library').textContent(), /2 MiB per-script limit/);
  assert.deepEqual(await current(page), blank);
  await (await inWorkspace(page.locator('#batch-clear-selection'))).click();
  assert.equal(await page.locator('#batch-library input:checked').count(), 0);
  await (await inWorkspace(page.locator('#batch-select-all'))).click();
  await (await inWorkspace(page.locator('#batch-library input:not(:disabled)').first())).uncheck();
  const selectedName = await page.locator('#batch-library input:checked').getAttribute('aria-label');
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#batch-files').disabled);
  assert.equal(await page.locator('#batch-library .batch-script').count(), 4);
  assert.equal(await page.locator('#batch-library input:checked').count(), 1);
  assert.equal(await page.locator('#batch-library input:checked').getAttribute('aria-label'), selectedName);
  await (await inWorkspace(page.locator('#batch-remove-selected'))).click();
  assert.equal(await page.locator('#batch-library .batch-script').count(), 3);
});

test('completed and failed items remain visible, one ZIP contains all successful MP4s, previous batches stay available', async t => {
  const { page, state } = await fixture(t);
  await upload(page, [file('same.json', makeScript('One')), file('same.json', makeScript('Two')), file('third.json', makeScript('Three'))]);
  assert.equal(await page.locator('#batch-library .batch-script').count(), 3);
  await (await inWorkspace(page.locator('#batch-render'))).click(); await started(page);
  const batch = state.batches[0];
  batch.status = 'partial'; batch.completed = 2; batch.failed = 1;
  batch.items = batch.items.map((item, index) => index === 1 ? { ...item, status: 'failed', error: 'Speech failed for this script; the queue continued.' } : { ...item, status: 'complete', video: `/output/job-${index}/video.mp4`, filename: `${String(index + 1).padStart(3, '0')}-${index ? 'third' : 'same'}.mp4` });
  await (await inWorkspace(page.locator('#batch-refresh'))).click();
  await page.waitForFunction(() => document.querySelector('#batch-runs').textContent.includes('2 completed · 1 failed'));
  assert.equal(await page.locator('#batch-runs a[download]').count(), 2);
  assert.match(await page.locator('#batch-runs').textContent(), /queue continued/);
  const downloadPromise = page.waitForEvent('download');
  await (await inWorkspace(page.getByRole('button', { includeHidden: true,  name: 'Download 2 completed MP4s (.zip)', exact: true }))).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'comic-batch-batch-1.zip');
  const files = zipEntries(await readFile(await download.path()));
  assert.deepEqual([...files.keys()], ['001-same.mp4', '003-third.mp4']);
  for (const data of files.values()) assert.deepEqual(data, mp4);
  await (await inWorkspace(page.locator('#batch-render'))).click();
  await page.waitForFunction(() => document.querySelectorAll('#batch-runs .batch-run').length === 2);
  assert.equal(await page.locator('#batch-runs a[download]').count(), 2);
  if (process.env.THEATRE_BATCH_SCREENSHOT) await page.locator('.batch-panel').screenshot({ path: process.env.THEATRE_BATCH_SCREENSHOT });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('nested browser installation imports chosen scripts and starts from the original click before downloading owned videos', async t => {
  const { page, state } = await fixture(t, { staticMode: true });
  const blank = await current(page);
  assert.equal(await page.locator('#batch-load-pages').count(),0);
  await upload(page,[file('page-01-joke.json',makeScript('Page 01 joke')),file('page-02-joke.json',makeScript('Page 02 joke'))]);
  assert.deepEqual(await current(page), blank);
  assert.equal(await page.locator('#batch-voice option').count(), 1);
  await (await inWorkspace(page.locator('#batch-clear-selection'))).click();
  await (await inWorkspace(page.getByRole('checkbox', { includeHidden: true,  name: 'Select page-01-joke.json', exact: true }))).check();
  await (await inWorkspace(page.getByRole('checkbox', { includeHidden: true,  name: 'Select page-02-joke.json', exact: true }))).check();
  await (await inWorkspace(page.locator('#batch-render'))).click(); await started(page);
  assert.equal(await page.evaluate(() => window.batchRequestInClick), true);
  const submissions = await page.evaluate(() => window.batchSubmissions);
  assert.deepEqual(submissions[0], { entries: [
    { name: 'page-01-joke.json', script: makeScript('Page 01 joke') },
    { name: 'page-02-joke.json', script: makeScript('Page 02 joke') },
  ], voice: 'flite' });
  assert.equal(await page.locator('#batch-device-note').isVisible(), true);
  await page.evaluate(() => window.completeDeviceBatch());
  await page.waitForFunction(() => document.querySelectorAll('#batch-runs a[download]').length === 2);
  const downloadPromise = page.waitForEvent('download');
  await (await inWorkspace(page.getByRole('button', { includeHidden: true,  name: 'Download 2 completed MP4s (.zip)', exact: true }))).click();
  const download = await downloadPromise;
  const files = zipEntries(await readFile(await download.path()));
  assert.deepEqual([...files.keys()], ['001-device.mp4', '002-device.mp4']);
  for (const data of files.values()) assert.deepEqual(data, mp4);
});

test('single upload registers its original fields and editor snapshots do not change existing library scripts', async t => {
  const { page, state } = await fixture(t);
  const original = makeScript('Engine-authored original');
  original.cast = [{ id: 'reader', voice: 'am_onyx' }, { id: 'friend', voice: 'am_puck' }];
  original.lines[0].id = 'authored-beat'; original.lines[0].bookState = 'table-open';
  await page.locator('#upload-json-top').setInputFiles(file('original.json', original));
  await page.waitForFunction(() => document.querySelector('#batch-library .batch-script'));
  assert.equal((await current(page)).cast, undefined);
  await (await inWorkspace(page.locator('#title'))).fill('Changed in the editor');
  await (await inWorkspace(page.locator('#batch-add-editor'))).click();
  assert.equal(await page.locator('#batch-library .batch-script').count(), 2);
  await (await inWorkspace(page.getByRole('checkbox', { includeHidden: true,  name: 'Select Changed-in-the-editor.json', exact: true }))).uncheck();
  await (await inWorkspace(page.locator('#batch-render'))).click(); await started(page);
  assert.deepEqual(state.submissions[0].entries, [{ name: 'original.json', script: original }]);
});

test('storage quota warnings leave imported scripts renderable and stop-after-current cancels queued work', async t => {
  const { page, state } = await fixture(t, { storageBlocked: true });
  await upload(page, [file('one.json', makeScript('One')), file('two.json', makeScript('Two'))]);
  assert.match(await page.locator('#batch-storage-status').textContent(), /could not be saved/);
  assert.equal(await page.locator('#batch-render').isDisabled(), false);
  await (await inWorkspace(page.locator('#batch-render'))).click(); await started(page);
  await (await inWorkspace(page.getByRole('button', { includeHidden: true,  name: 'Stop after current', exact: true }))).click();
  await page.waitForFunction(() => document.querySelector('#batch-runs').textContent.includes('1 cancelled'));
  assert.equal(state.batches[0].items[0].status, 'running');
  assert.equal(state.batches[0].items[1].status, 'cancelled');
  assert.equal(await page.locator('#batch-library .batch-script').count(), 2);
});

test('selection is bounded to 100 and an author can choose a different subset without changing scripts', async t => {
  const { page, state } = await fixture(t);
  await upload(page, Array.from({ length: 101 }, (_, index) => file(`script-${index + 1}.json`, makeScript(`Script ${index + 1}`))));
  assert.equal(await page.locator('#batch-library .batch-script').count(), 101);
  assert.equal(await page.locator('#batch-library input:checked').count(), 100);
  await (await inWorkspace(page.getByRole('checkbox', { includeHidden: true,  name: 'Select script-101.json', exact: true }))).click();
  assert.equal(await page.locator('#batch-library input:checked').count(), 100);
  assert.match(await page.locator('#batch-import-status').textContent(), /Choose up to 100/);
  await (await inWorkspace(page.getByRole('checkbox', { includeHidden: true,  name: 'Select script-1.json', exact: true }))).uncheck();
  await (await inWorkspace(page.getByRole('checkbox', { includeHidden: true,  name: 'Select script-101.json', exact: true }))).check();
  await (await inWorkspace(page.locator('#batch-render'))).click(); await started(page);
  assert.equal(state.submissions[0].entries.length, 100);
  assert.equal(state.submissions[0].entries[0].name, 'script-2.json');
  assert.deepEqual(state.submissions[0].entries.at(-1), { name: 'script-101.json', script: makeScript('Script 101') });
});

test('batch outputs reject external URLs and WebM results instead of presenting them as downloadable MP4s', async t => {
  const { page, state } = await fixture(t);
  const batch = publicBatch({ entries: [{ name: 'external.json' }, { name: 'webm.json' }] }, 'invalid-output');
  batch.status = 'complete'; batch.completed = 2;
  batch.items = [
    { index: 0, name: 'external.json', status: 'complete', video: 'https://outside.invalid/video.mp4', filename: 'external.mp4' },
    { index: 1, name: 'webm.json', status: 'complete', video: '/output/job/video.webm', filename: 'renamed.mp4' },
  ];
  state.batches.push(batch);
  await (await inWorkspace(page.locator('#batch-refresh'))).click();
  await page.waitForFunction(() => document.querySelector('#batch-runs .batch-run'));
  assert.equal(await page.locator('#batch-runs a[download]').count(), 0);
  assert.equal(await page.getByRole('button', { includeHidden: true,  name: 'Download 2 completed MP4s (.zip)', exact: true }).isDisabled(), true);
  assert.match(await page.locator('#batch-runs').textContent(), /no longer available/);
});
