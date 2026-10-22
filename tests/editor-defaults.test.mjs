import test from 'node:test';
import assert from 'node:assert/strict';
import { editorDefaults } from '../src/editor-defaults.mjs';

test('reset returns blank defaults, never existing authored settings', () => {
  const catalog = { templates: [{ id: 'solo', speakers: ['reader'] }, { id: 'book-duet', speakers: ['reader', 'friend'] }] };
  const before = structuredClone(catalog);
  assert.deepEqual(editorDefaults(catalog), {
    script: { version: 1, template: 'book-duet', title: 'Untitled reading', comics: [], lines: [{ speaker: 'reader', text: '' }, { speaker: 'friend', text: '' }] },
    voice: 'flite', clearAttachments: true,
  });
  assert.deepEqual(catalog, before);
  const first = editorDefaults(catalog); first.script.comics.push('old'); first.script.lines[0].text = 'Old words';
  assert.deepEqual(editorDefaults(catalog).script.comics, []);
  assert.equal(editorDefaults(catalog).script.lines[0].text, '');
  assert.deepEqual(editorDefaults(catalog, 'solo').script.lines, [{ speaker: 'reader', text: '' }]);
  assert.throws(() => editorDefaults(catalog, 'unknown'), /Unknown template/);
});
test('alternate catalogs use their first template and malformed catalogs fail explicitly', () => {
  assert.equal(editorDefaults({ templates: [{ id: 'custom' }] }).script.template, 'custom');
  for (const catalog of [null, {}, { templates: [] }, { templates: [null] }, { templates: [{ id: '' }] }]) {
    assert.throws(() => editorDefaults(catalog), TypeError);
  }
});
