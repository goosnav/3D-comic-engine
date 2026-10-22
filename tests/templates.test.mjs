import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolveScript } from '../src/contracts.mjs';
import { loadCatalog } from '../src/library.mjs';

test('every worked template resolves through the production contract, including round-trip imports', async () => {
  const catalog = await loadCatalog();
  const files = (await fs.readdir(new URL('../templates/', import.meta.url))).filter(name => name.endsWith('.example.json'));
  assert.equal(files.length, 4);
  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(new URL(`../templates/${file}`, import.meta.url), 'utf8'));
    const resolved = resolveScript(raw, catalog);
    assert.deepEqual(resolveScript(JSON.parse(JSON.stringify(resolved)), catalog), resolved, file);
  }
});

test('blank template imports as a draft but requires authored dialogue before rendering', async () => {
  const catalog = await loadCatalog();
  const blank = JSON.parse(await fs.readFile(new URL('../templates/blank-book-duet.json', import.meta.url), 'utf8'));
  assert.equal(blank.lines.filter(line => !line.action).length, 2);
  assert.throws(() => resolveScript(blank, catalog), /text needs/);
  for (const line of blank.lines) if (!line.action) line.text = 'Written by the author.';
  assert.doesNotThrow(() => resolveScript(blank, catalog));
});
