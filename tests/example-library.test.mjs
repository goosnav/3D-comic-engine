import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {getExampleLibrary} from '../src/example-library.mjs';
import {loadCatalog, ROOT} from '../src/library.mjs';

test('public example library exposes complete scripts verbatim, excluding manifests and non-script files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-example-library-'));
  const directory = path.join(root, 'examples');
  await fs.mkdir(directory);
  try {
    const catalog = await loadCatalog();
    const script = await fs.readFile(path.join(ROOT, 'examples/parasite.json'), 'utf8');
    const exact = '\uFEFF' + script + '\n';
    for (const name of ['page-002-second.json', 'page-001-first.json', 'tour-several.json', 'standalone.json']) {
      await fs.writeFile(path.join(directory, name), exact);
    }
    await fs.writeFile(path.join(directory, 'batch.json'), '[{"input":"standalone.json"}]');
    await fs.writeFile(path.join(directory, 'notes.json'), '{"private":"not an example"}');
    await fs.writeFile(path.join(directory, 'invalid.json'), '{broken');
    await fs.writeFile(path.join(directory, 'oversized.json'), script + ' '.repeat(256 * 1024));
    await fs.symlink(path.join(directory, 'standalone.json'), path.join(directory, 'linked.json'));
    const {index, files} = await getExampleLibrary({root, catalog});
    assert.equal(index.version, 1);
    assert.deepEqual(index.examples.map(({name, group}) => [name, group]), [
      ['page-001-first.json', 'pages'], ['page-002-second.json', 'pages'],
      ['tour-several.json', 'tours'], ['standalone.json', 'other']
    ]);
    for (const example of index.examples) {
      assert.equal(example.path, 'examples/' + example.name);
      assert.equal(example.title, JSON.parse(script).title);
      assert.equal(files.get(example.name).toString('utf8'), exact);
    }
    assert.equal(files.size, 4);
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});

test('the shipped page set is available through the same desktop and static index', async () => {
  const {index, files} = await getExampleLibrary();
  const pages = index.examples.filter(example => example.group === 'pages');
  assert.ok(pages.length >= 25);
  for (let i = 0; i < pages.length; i++) {
    assert.match(pages[i].name,/^page-\d{3}-/);
    assert.deepEqual(files.get(pages[i].name), await fs.readFile(path.join(ROOT, pages[i].path)));
  }
  for(let i=1;i<=25;i++) assert.ok(pages.some(p=>p.name.startsWith(`page-${String(i).padStart(3,'0')}-`)));
  assert.ok(!files.has('pages-001-025.batch.json'));
});
