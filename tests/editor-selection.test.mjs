import test from 'node:test';
import assert from 'node:assert/strict';
import { comicReplacements, randomComic, replaceComic } from '../src/editor-selection.mjs';
import { resolveScript } from '../src/contracts.mjs';

const catalog = {
  edition: { pdfSha256: 'edition' },
  templates: [{ id: 'page-tour', minComics: 1, maxComics: 3, speakers: ['reader', 'friend'], scenes: ['library'] }],
  comics: [4, 5, 6, 7, 8, 10].map(page => ({ id: `p${page}`, pdfPage: page, verified: true, kind: 'comic', sha256: `hash-${page}` })),
};
catalog.comics.push({ id: 'title', pdfPage: 3, verified: true, kind: 'frontmatter' }, { id: 'bad', pdfPage: 9, verified: false, kind: 'comic' });
const input = () => ({
  version: 1, template: 'page-tour', title: 'Keep my words', seed: 17, scene: 'library', comics: ['p4', 'p10'],
  characters: { reader: 'blue', friend: 'rust' }, output: { width: 432, height: 540, fps: 12 }, endCard: { enabled: false },
  sourceLock: [{ id: 'p4', sha256: 'old' }],
  lines: [{ action: 'open', comic: 'p4' }, { speaker: 'reader', comic: 'p4', text: 'Keep this.', audio: 'take.wav', face: { eye_open: .7 } }, { speaker: 'friend', text: 'And this.', comic: 'p10', reaction: { actor: 'reader', emotion: 'dry' } }],
});

test('each shuffle changes only its row and references, preserves authored data and uses fresh selection randomness', () => {
  const original = input(), snapshot = structuredClone(original);
  let script = original, rows = [...original.comics];
  for (let i = 0; i < 8; i++) {
    const oldId = rows[0];
    ({ script, pageRows: rows } = randomComic(script, catalog, rows, 0, () => .5));
    assert.notEqual(rows[0], oldId);
    assert.equal(rows[1], 'p10');
    assert.equal(new Set(rows).size, rows.length);
    assert.ok(!rows.includes('title') && !rows.includes('bad'));
    assert.equal(script.lines[0].comic, rows[0]);
    assert.equal(script.lines[1].comic, rows[0]);
    assert.equal(script.sourceLock, undefined);
    for (const field of ['seed', 'scene', 'characters', 'output', 'endCard', 'title']) assert.deepEqual(script[field], original[field]);
    assert.deepEqual({ ...script.lines[1], comic: 'p4' }, original.lines[1]);
    assert.deepEqual(script.lines[2], original.lines[2]);
    assert.doesNotThrow(() => resolveScript(script, catalog));
  }
  assert.deepEqual(original, snapshot);
});

test('manual changes remap sources, keep empty-row order, and reject duplicates without mutation', () => {
  const script = input();
  const next = replaceComic(script, catalog, script.comics, 0, 'p5');
  assert.equal(next.script.lines[1].comic, 'p5');
  assert.throws(() => replaceComic(script, catalog, script.comics, 0, 'p10'), /already selected/);
  assert.throws(() => replaceComic(script, catalog, script.comics, 0, 'bad'), /verified/);
  const rows = ['', 'p10'];
  const empty = { ...script, comics: ['p10'], lines: [{ speaker: 'reader', text: '' }] };
  assert.deepEqual(replaceComic(empty, catalog, rows, 0, 'p4').script.comics, ['p4', 'p10']);
  const same = replaceComic(script, catalog, script.comics, 0, 'p4');
  assert.deepEqual(same.script.sourceLock, script.sourceLock);
  same.script.lines[1].face.eye_open = .2;
  assert.equal(script.lines[1].face.eye_open, .7);
});

test('random and manual replacements preserve adjacent physical turns instead of rewriting actions', () => {
  const script = { ...input(), comics: ['p4', 'p6', 'p8'], lines: [
    { speaker: 'reader', comic: 'p4', text: 'First.' }, { action: 'turn', comic: 'p6' },
    { speaker: 'reader', comic: 'p6', text: 'Middle.' }, { action: 'turn', comic: 'p8' },
    { speaker: 'friend', comic: 'p8', text: 'Last.' },
  ] };
  delete script.sourceLock;
  assert.doesNotThrow(() => resolveScript(script, catalog));
  assert.deepEqual(comicReplacements(script, catalog, script.comics, 1).map(c => c.id), ['p7']);
  const next = randomComic(script, catalog, script.comics, 1, () => 0);
  assert.equal(next.script.lines[1].action, 'turn');
  assert.equal(next.script.lines[1].comic, 'p7');
  assert.doesNotThrow(() => resolveScript(next.script, catalog));
  assert.throws(() => replaceComic(script, catalog, script.comics, 1, 'p10'), /physical page turn/);
});

test('a full or incompatible pool fails explicitly and never repeats the current comic', () => {
  const script = input(), small = { ...catalog, comics: catalog.comics.filter(c => ['p4', 'p10', 'title', 'bad'].includes(c.id)) };
  assert.deepEqual(comicReplacements(script, small, script.comics, 0), []);
  assert.throws(() => randomComic(script, small, script.comics, 0), /No other compatible/);
  assert.throws(() => randomComic(script, catalog, script.comics, 0, () => 1), /Random selection/);
});
