import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolveScript } from '../src/contracts.mjs';
import { loadCatalog } from '../src/library.mjs';

test('every worked template resolves through the production contract, including round-trip imports', async () => {
  const catalog = await loadCatalog();
  const files = (await fs.readdir(new URL('../templates/', import.meta.url))).filter(name => name.endsWith('.example.json'));
  assert.equal(files.length, 7);
  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(new URL(`../templates/${file}`, import.meta.url), 'utf8'));
    const resolved = resolveScript(raw, catalog);
    assert.deepEqual(resolveScript(JSON.parse(JSON.stringify(resolved)), catalog), resolved, file);
  }
});

test('blank template is renderable as silent shots and remains editable', async () => {
  const catalog = await loadCatalog();
  const blank = JSON.parse(await fs.readFile(new URL('../templates/blank-book-duet.json', import.meta.url), 'utf8'));
  assert.equal(blank.lines.filter(line => !line.action).length, 2);
  assert.doesNotThrow(() => resolveScript(blank, catalog));
  for (const line of blank.lines) if (!line.action) line.text = 'Written by the author.';
  assert.doesNotThrow(() => resolveScript(blank, catalog));
});
