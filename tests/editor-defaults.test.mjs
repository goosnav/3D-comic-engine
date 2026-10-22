import test from 'node:test';
import assert from 'node:assert/strict';
import { editorDefaults } from '../src/editor-defaults.mjs';

test('reset returns blank defaults, never existing authored settings', () => {
  const catalog = { templates: [{ id: 'solo' }, { id: 'book-duet' }] };
  const before = structuredClone(catalog);
  assert.deepEqual(editorDefaults(catalog), {
    script: { version: 1, template: 'book-duet', title: 'Untitled reading', comics: [], lines: [] },
    voice: 'flite', clearAttachments: true,
  });
  assert.deepEqual(catalog, before);
  const first = editorDefaults(catalog); first.script.comics.push('old');
  assert.deepEqual(editorDefaults(catalog).script.comics, []);
});
test('alternate catalogs use their first template and malformed catalogs fail explicitly', () => {
  assert.equal(editorDefaults({ templates: [{ id: 'custom' }] }).script.template, 'custom');
  for (const catalog of [null, {}, { templates: [] }, { templates: [null] }, { templates: [{ id: '' }] }]) {
    assert.throws(() => editorDefaults(catalog), TypeError);
  }
});
