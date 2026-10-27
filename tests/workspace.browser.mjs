import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server.mjs';
let browser, server, outputRoot;
before(async () => {
  outputRoot = await mkdtemp(join(tmpdir(), 'theatre-workspace-'));
  server = await startServer({ port: 0, outputRoot });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await server?.close(); await rm(outputRoot, { recursive: true, force: true }); });
async function fixture(t, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport }); const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.goto(server.url);
  await page.waitForFunction(() => document.querySelector('#editor-status').textContent.startsWith('Ready.'));
  return page;
}
const current = page => page.locator('#script-json').inputValue().then(JSON.parse);

test('steps keep edits, JSON pauses forms, New and Recent recover drafts across reload', async t => {
  const page = await fixture(t);
  assert.equal(await page.locator('[data-view]:visible').count(), 1);
  assert.equal((await page.locator('#new-video').textContent()).trim(), '＋ New');
  await page.locator('#title').fill('Recover this reading');
  await page.locator('#random-page-0').click();
  await page.locator('#next-step').click();
  assert.equal(await page.locator('#editor-heading').evaluate(n => n === document.activeElement), true);
  await page.locator('#line-0-text').fill('Keep these words.');
  await page.locator('#line-1-text').fill('And these words too.');
  await page.locator('#next-step').click();
  await page.locator('#output-preset').selectOption('landscape');
  await page.locator('#captions-position').selectOption('bottom');
  await page.locator('#speech-rate').fill('1.3');
  const original = await current(page);
  await page.locator('#previous-step').click();
  assert.equal(await page.locator('#line-0-text').inputValue(), 'Keep these words.');
  await page.locator('#nav-json').click();
  const unfinished = '{ "title": "not finished"';
  await page.locator('#script-json').fill(unfinished);
  await page.locator('#nav-editor').click();
  assert.equal(await page.locator('#author-fields').evaluate(n => n.disabled), true);
  await page.locator('#new-video').click();
  assert.equal(await page.locator('#title').inputValue(), 'Untitled reading');
  await page.locator('#nav-recent').click();
  assert.match(await page.locator('#recent-list').innerText(), /Unapplied JSON/);
  await page.locator('#recent-list li').filter({ hasText: 'Unapplied JSON' }).first().getByRole('button').click();
  assert.equal(await page.locator('#view-json').isVisible(), true);
  assert.equal(await page.locator('#script-json').inputValue(), unfinished);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#script-json').value.includes('not finished'));
  assert.equal(await page.locator('#view-json').isVisible(), true);
  await page.locator('#nav-recent').click();
  const saved = page.locator('#recent-list li').filter({ hasText: 'Recover this reading' }).filter({ hasNotText: 'Unapplied JSON' }).first();
  await saved.getByRole('button').click();
  assert.deepEqual(await current(page), original);
  await page.locator('[data-step-target="export"]').click();
  await page.locator('#validate').click();
  await page.waitForFunction(() => document.querySelector('#editor-status').textContent.includes('validation passed'));
  const downloadPromise = page.waitForEvent('download'); await page.locator('#download-json').click();
  assert.equal((await downloadPromise).suggestedFilename(), 'comic-theatre-script.json');
});

test('render hands off to Videos and batch stays separate; responsive keyboard navigation', async t => {
  const page = await fixture(t);
  await page.locator('#random-page-0').click();
  await page.locator('#next-step').click();
  await page.locator('#line-0-text').fill('A short clip.'); await page.locator('#line-1-text').fill('A reply.');
  await page.locator('#next-step').click();
  let submitted;
  await page.route('**/api/render', async route => { submitted = route.request().postDataJSON(); await route.fulfill({ json: { id: 'fixture-job', status: 'queued' } }); });
  await page.locator('#generate').click();
  await page.locator('#view-videos').waitFor({ state: 'visible' });
  assert.equal(submitted.script.lines[0].text, 'A short clip.');
  await page.locator('#nav-batch').click(); await page.locator('#batch-add-editor').click();
  assert.match(await page.locator('#batch-library').innerText(), /Untitled reading/);
  await page.locator('#nav-editor').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#view-editor').isVisible(), true);
  await mkdir('.local/ui-review', { recursive: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    for (const step of ['scene', 'script', 'export']) {
      await page.locator(`[data-step-target="${step}"]`).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${step} fits ${width}px`);
      await page.screenshot({ path: `.local/ui-review/${step}-${width}.png`, fullPage: true });
    }
  }
});

test('history is bounded, renders hostile titles as text, and storage failures are visible', async t => {
  const page = await fixture(t);
  for (let i = 0; i < 24; i++) {
    await page.locator('#title').fill(`Version ${i}`);
    await page.locator('[data-step-target="script"]').click();
  }
  await page.locator('#title').fill('<img src=x onerror=alert(1)>');
  await page.locator('#nav-recent').click();
  assert.equal(await page.locator('#recent-list li').count(), 20);
  assert.equal(await page.locator('#recent-list img').count(), 0);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw Error('Quota exceeded'); }; });
  await page.locator('#nav-editor').click(); await page.locator('#title').fill('Unsaved');
  assert.match(await page.locator('#storage-status').innerText(), /Download JSON/);
  assert.match(await page.locator('#draft-status').innerText(), /not saved/);
});
