import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { EMOTIONS, GESTURES } from '../src/contracts.mjs';

const root = new URL('../', import.meta.url);
const catalog = {
  edition: { title: 'GUI fixture' },
  templates: [
    { id: 'book-duet', label: 'Duet', minComics: 1, maxComics: 2, speakers: ['reader', 'friend'], scenes: ['library'] },
    { id: 'solo', label: 'Solo', minComics: 1, maxComics: 1, speakers: ['reader'], scenes: ['library'] },
  ], scenes: [{ id: 'library', label: 'Library' }],
  // Deliberately unordered, with more pages than any template accepts.
  comics: [30, 2, 11, 4, 50].map(n => ({ id: `p${n}`, title: `Page ${n}`, pdfPage: n, printedPage: n - 1, verified: n !== 4, path: `assets/comics/p${n}.png`, transcript: n === 11 ? [] : `Transcript ${n}` })),
};
const script = { template: 'book-duet', title: 'Keep my script', comics: ['p30', 'p2'], sourceLock: [{ id: 'p30', sha256: 'stale' }, { id: 'p2', sha256: 'stale' }], lines: [{ speaker: 'reader', text: 'Keep these words.', comic: 'p30', face: { eye_open: .7 } }] };
let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.THEATRE_TEST_CHROMIUM ? { executablePath: process.env.THEATRE_TEST_CHROMIUM } : {}) }); });
after(async () => { await browser?.close(); });

async function fixture(t, { staticMode = false } = {}) {
  const state = { jobs: [], assets: [], requests: [] };
  const prefix = staticMode ? '/nested/studio/' : '/';
  const server = http.createServer(async (req, res) => {
    try {
      state.requests.push(req.url);
      const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
      if (req.url === '/api/session') return json({ token: 'fixture' });
      if (req.url === '/api/catalog' || req.url === `${prefix}assets/catalog.json`) return json(catalog);
      if (req.url === '/api/jobs') return json({ jobs: state.jobs });
      if (/^\/(?:nested\/)?src\/(contracts|book-pages)\.mjs$/.test(req.url)) {
        res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile(new URL(`src/${req.url.split('/').at(-1)}`, root)));
      }
      // Stub only the on-device runtime boundary: no GPU, speech, or export work.
      // Real GUI module, inputs, URLs and onChange handling run in Chromium.
      if (staticMode && req.url === `${prefix}browser/backend.mjs`) {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(`export function createBrowserBackend({catalog,onChange}) {
          let jobs=[]; window.publishJobs=value=>{jobs=value;onChange();};
          const api=async (path,body)=>{
            if(path==='/api/render'){window.submittedRender=body;return {id:'music-job',status:'queued'};}
            return path==='/api/catalog'?{...catalog}:path==='/api/session'?{token:'device'}:{jobs};
          };
          api.ownsURL=url=>url==='blob:fixture-video'; return api;
        }`);
      }
      if (req.url.startsWith(`${prefix}assets/comics/`)) {
        state.assets.push(req.url); res.setHeader('Content-Type', 'image/png');
        return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfRcAAAAASUVORK5CYII=', 'base64'));
      }
      const files = { [prefix]: 'index.html', [`${prefix}app.mjs`]: 'app.mjs', [`${prefix}style.css`]: 'style.css' };
      if (files[req.url]) {
        const name = files[req.url]; let text = await readFile(new URL(`web/${name}`, root), 'utf8');
        if (staticMode && name === 'index.html') text = text.replace('content="desktop"', 'content="browser"');
        res.setHeader('Content-Type', name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); return res.end(text);
      }
      res.writeHead(404); res.end();
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(3000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); await new Promise(resolve => server.close(resolve)); assert.deepEqual(errors, []); });
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.waitForFunction(() => document.querySelector('#editor-status').textContent.startsWith('Ready.'));
  return { page, state };
}
const current = async page => JSON.parse(await page.locator('#script-json').inputValue());
async function load(page, value = script) {
  await page.locator('#script-json').fill(JSON.stringify(value)); await page.locator('#apply-json').click();
  await page.waitForFunction(() => document.querySelector('#editor-status').textContent.startsWith('JSON applied.'));
}

// Catches eager image loads, catalog order leaking into menus, and accidental initial selection.
test('page menus start empty, sort by PDF page and fetch only the selected preview', async t => {
  const { page, state } = await fixture(t);
  assert.equal(await page.locator('#page-selectors select').count(), 1);
  assert.equal(await page.getByLabel('Page 1', { exact: true }).inputValue(), '');
  assert.deepEqual(await current(page).then(s => s.comics), []);
  assert.equal(await page.locator('#page-previews img').count(), 0); assert.deepEqual(state.assets, []);
  assert.deepEqual(await page.locator('#page-selectors select option').evaluateAll(nodes => nodes.map(n => n.value)), ['', 'p2', 'p4', 'p11', 'p30', 'p50']);
  assert.equal(await page.locator('option[value="p4"]').isDisabled(), true);
  await page.getByLabel('Page 1', { exact: true }).selectOption('p30');
  await page.waitForFunction(() => document.querySelector('#page-previews img')?.naturalWidth > 0);
  assert.deepEqual(state.assets, ['/assets/comics/p30.png']);
  assert.equal(await page.locator('#page-previews a, #page-previews button, #page-selectors input[type="checkbox"]').count(), 0);
  assert.match(await page.locator('#page-previews').textContent(), /Transcript 30/);
});

test('pages without transcripts show an honest empty state and never supply dialogue', async t => {
  const { page } = await fixture(t);
  await page.getByLabel('Page 1', { exact: true }).selectOption('p11');
  assert.equal(await page.locator('#page-previews .transcript').textContent(), 'No transcript supplied.');
  assert.match(await page.locator('#page-previews').textContent(), /Catalog-verified source identity/);
  assert.doesNotMatch(await page.locator('#page-previews').textContent(), /reviewed/i);
  assert.deepEqual((await current(page)).lines, []);
});

// Catches source reordering, lost imports/locks and silent dialogue repair on reselection.
test('ordered rows enforce template capacity without truncating imports or rewriting dialogue', async t => {
  const { page } = await fixture(t); await load(page);
  assert.deepEqual(await current(page), script);
  assert.deepEqual(await page.locator('#page-selectors select').evaluateAll(nodes => nodes.map(n => n.value)), ['p30', 'p2']);
  assert.equal(await page.getByRole('button', { name: '+ Add page', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('#page-selectors select').nth(1).locator('option[value="p30"]').isDisabled(), true);
  await page.getByLabel('Page 1', { exact: true }).selectOption('p11');
  assert.equal((await current(page)).sourceLock, undefined); assert.deepEqual((await current(page)).lines, script.lines);
  await page.locator('#template').selectOption('solo');
  assert.deepEqual((await current(page)).comics, ['p11', 'p2']);
  assert.equal(await page.locator('#add-page').isVisible(), false);
  await page.getByRole('button', { name: 'Remove page 1', exact: true }).click();
  assert.deepEqual((await current(page)).comics, ['p2']); assert.deepEqual((await current(page)).lines, script.lines);
  await page.getByRole('button', { name: 'Remove page 1', exact: true }).click();
  assert.equal(await page.getByLabel('Page 1', { exact: true }).inputValue(), '');
  await page.locator('#template').selectOption('book-duet');
  await page.getByLabel('Page 1', { exact: true }).selectOption('p30');
  await page.locator('#add-page').click();
  assert.equal(await page.getByLabel('Page 2', { exact: true }).inputValue(), '');
  await page.getByLabel('Page 2', { exact: true }).selectOption('p2');
  assert.deepEqual((await current(page)).comics, ['p30', 'p2']);
});

// Catches free-text/unsupported choices and unintended default writes to imported scripts.
test('performance dropdowns use contract enums and preserve omitted defaults and advanced fields', async t => {
  const { page } = await fixture(t); await load(page);
  for (const [key, values] of [['emotion', EMOTIONS], ['gesture', GESTURES]]) {
    assert.equal(await page.getByLabel(`Line 1 ${key}`, { exact: true }).evaluate(n => n.tagName), 'SELECT');
    assert.deepEqual(await page.locator(`#line-0-${key} option`).evaluateAll(nodes => nodes.map(n => n.value).filter(Boolean)), values);
    for (const value of values) {
      await page.getByLabel(`Line 1 ${key}`, { exact: true }).selectOption(value);
      assert.equal((await current(page)).lines[0][key], value);
    }
    await page.getByLabel(`Line 1 ${key}`, { exact: true }).selectOption('');
  }
  assert.deepEqual(await current(page), script);
  await page.getByRole('button', { name: '+ Add dialogue', exact: true }).click();
  assert.equal((await current(page)).lines.length, 2);
  assert.equal(await page.getByLabel('Line 2 text', { exact: true }).evaluate(n => n === document.activeElement), true);
});

// Catches fabricated percentages, dropped phase detail, and job refresh overwrites.
test('structured progress shows stage percentage or indeterminate state and elapsed time, preserving dirty JSON', async t => {
  const { page, state } = await fixture(t); await load(page);
  const dirty = '{ "unfinished":'; await page.locator('#script-json').fill(dirty);
  async function show(job) {
    state.jobs = [{ id: 'job', status: 'running', ...job }];
    await page.locator('#refresh-jobs').click();
    await page.waitForFunction(message => document.querySelector('#jobs').textContent.includes(message), job.progressDetail?.message ?? job.progress);
  }
  await show({ startedAt: new Date(Date.now() - 65000).toISOString(), progress: 'legacy text', progressDetail: { phase: 'speech', progress: .25, message: 'Speaking line 1 of 4' } });
  assert.equal(await page.locator('#jobs progress').getAttribute('value'), '25');
  assert.match(await page.locator('#jobs').textContent(), /Speech.*25% of stage/);
  assert.match(await page.locator('#jobs').textContent(), /Elapsed.*1m/);
  await show({ startedAt: Date.now() - 65000, progressDetail: { phase: 'render', progress: 0, message: 'Starting frames' } });
  assert.equal(await page.locator('#jobs progress').getAttribute('value'), '0');
  assert.match(await page.locator('#jobs').textContent(), /Elapsed.*1m/);
  await show({ progressDetail: { phase: 'assets', progress: null, message: 'Checking source assets' } });
  assert.equal(await page.locator('#jobs progress').getAttribute('value'), null);
  assert.doesNotMatch(await page.locator('#jobs').textContent(), /%|Elapsed/);
  await show({ progress: 'Rendering old-style frames' });
  assert.equal(await page.locator('#jobs progress').getAttribute('value'), null);
  await show({ status: 'failed', error: 'Decoder stopped', progressDetail: { phase: 'loading', progress: null, message: 'Loading ended' } });
  assert.equal(await page.locator('#jobs progress').count(), 0, 'failed jobs must not keep an indeterminate progress bar moving');
  assert.equal(await page.locator('#script-json').inputValue(), dirty);
});

test('completed jobs retain their actual elapsed duration from numeric or ISO timestamps', async t => {
  const { page, state } = await fixture(t);
  for (const iso of [false, true]) {
    const start = Date.now() - 120000, end = start + 65000;
    state.jobs = [{ id: `finished-${iso}`, status: 'complete', startedAt: iso ? new Date(start).toISOString() : start, updatedAt: iso ? new Date(end).toISOString() : end, progressDetail: { phase: 'complete', progress: 1, message: `Finished ${iso}` } }];
    await page.locator('#refresh-jobs').click();
    await page.waitForFunction(message => document.querySelector('#jobs').textContent.includes(message), `Finished ${iso}`);
    assert.match(await page.locator('#jobs').textContent(), /Elapsed · 1m 5s/);
  }
});

// Catches absolute asset paths and browser callback code that installs a job's script.
test('static subdirectory previews and runtime onChange preserve the author script', async t => {
  const { page, state } = await fixture(t, { staticMode: true }); await load(page, { ...script, comics: ['p30'] });
  await page.waitForFunction(() => document.querySelector('#page-previews img')?.naturalWidth > 0);
  assert.deepEqual(state.assets, ['/nested/studio/assets/comics/p30.png']);
  const before = await page.locator('#script-json').inputValue();
  await page.evaluate(() => window.publishJobs([{ id: 'callback', status: 'running', script: { title: 'Do not install' }, progressDetail: { phase: 'render', progress: .5, message: 'Callback progress' } }]));
  await page.waitForFunction(() => document.querySelector('#jobs').textContent.includes('50% of stage'));
  assert.equal(await page.locator('#script-json').inputValue(), before);
  assert.equal(state.requests.some(url => url.startsWith('/api/')), false);
  for (const extension of ['mp4', 'webm']) {
    await page.evaluate(extension => window.publishJobs([{ id: 'callback', status: 'complete', video: 'blob:fixture-video', filename: `my-film.${extension}`, progress: 'Ready' }]), extension);
    await page.waitForFunction(extension => document.querySelector('#jobs a[download]')?.download === `my-film.${extension}`, extension);
    assert.match(await page.locator('#jobs a[download]').textContent(), new RegExp(extension, 'i'));
    if (extension === 'webm') assert.match(await page.locator('#jobs').textContent(), /WebM.*fallback/i);
    else assert.doesNotMatch(await page.locator('#jobs').textContent(), /fallback/i);
  }
});

// Catches mobile clipping, small action targets, invisible keyboard focus and old palette.
test('Labs HQ styling keeps mobile controls usable with visible keyboard focus', async t => {
  const { page } = await fixture(t); await load(page);
  assert.equal(await page.title(), '3D Comic Engine');
  assert.equal(await page.getByRole('heading', { name: '3D Comic Engine', exact: true }).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const styles = await page.evaluate(() => ({ body: getComputedStyle(document.body).fontFamily, heading: getComputedStyle(document.querySelector('h1')).fontFamily, paper: getComputedStyle(document.documentElement).backgroundColor, radius: getComputedStyle(document.querySelector('.panel')).borderRadius }));
  assert.match(styles.body, /Times/); assert.match(styles.heading, /Helvetica/); assert.equal(styles.paper, 'rgb(255, 255, 255)'); assert.equal(styles.radius, '0px');
  for (const control of await page.locator('button:visible, select:visible, summary:visible, .check-label, .file-label').all()) {
    const box = await control.boundingBox(); assert.ok(box.height >= 44 && box.width >= 44, `Touch target: ${await control.textContent()}`);
  }
  await page.getByLabel('Page 1', { exact: true }).focus(); await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 2));
});

test('the heading font renders readable glyphs on the local browser platform', async t => {
  const { page } = await fixture(t);
  const ink = await page.locator('h1').evaluate(heading => {
    const style = getComputedStyle(heading), canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 100;
    const ctx = canvas.getContext('2d'); ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillText(heading.textContent, 0, 60);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data.filter((value, i) => i % 4 === 3 && value > 0).length;
  });
  assert.ok(ink > 100, `Heading must paint visible glyphs, got ${ink} pixels`);
});

// Catches music leaking into saved scripts, stale clear behavior, or replacing a submitted File.
test('browser music attaches a File snapshot to rendering only and clears without changing script JSON', async t => {
  const { page } = await fixture(t, { staticMode: true });
  await load(page, { ...script, comics: ['p30'] });
  const before = await page.locator('#script-json').inputValue();
  const music = page.getByLabel('Background music (optional)', { exact: true });
  assert.equal(await music.count(), 1);
  await music.setInputFiles({ name: 'quiet.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fixture music bytes') });
  await page.locator('#generate').click();
  await page.waitForFunction(() => !!window.submittedRender);
  assert.deepEqual(await page.evaluate(async () => ({ name: window.submittedRender.music.name, bytes: await window.submittedRender.music.text(), file: window.submittedRender.music instanceof File, inScript: 'music' in window.submittedRender.script })), { name: 'quiet.mp3', bytes: 'fixture music bytes', file: true, inScript: false });
  await music.setInputFiles({ name: 'other.wav', mimeType: 'audio/wav', buffer: Buffer.from('different bytes') });
  assert.equal(await page.evaluate(() => window.submittedRender.music.name), 'quiet.mp3');
  await page.getByRole('button', { name: 'Clear music', exact: true }).click();
  assert.equal(await music.evaluate(n => n.files.length), 0);
  assert.equal(await page.locator('#script-json').inputValue(), before);
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /quiet\.mp3|fixture music bytes|other\.wav/);
  await page.locator('#generate').click();
  await page.waitForFunction(() => window.submittedRender.music === undefined);
  await music.setInputFiles({ name: 'quiet.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fixture music bytes') });
  await page.reload(); await music.waitFor();
  assert.equal(await music.evaluate(n => n.files.length), 0);
});

test('desktop does not offer browser-only background music', async t => {
  const { page } = await fixture(t);
  assert.equal(await page.locator('#background-music').count(), 1);
  assert.equal(await page.locator('#background-music').isVisible(), false);
});

test('Generate brings phone progress into view before the live canvas', async t => {
  const { page } = await fixture(t, { staticMode: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page, { ...script, comics: ['p30'] });
  await page.locator('#generate').click();
  await page.waitForFunction(() => document.querySelector('#editor-status').textContent.startsWith('Submitted'));
  const position = await page.evaluate(() => ({
    heading: document.querySelector('#jobs-heading').getBoundingClientRect().top,
    progress: document.querySelector('#jobs').getBoundingClientRect().top,
    canvas: document.querySelector('#device-canvas').getBoundingClientRect().top,
  }));
  assert.ok(position.heading >= 0 && position.heading < 400 && position.progress < 744, JSON.stringify(position));
  assert.ok(position.progress < position.canvas, 'progress must not sit below a tall live canvas');
});
