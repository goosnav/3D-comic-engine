import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createZip} from '../src/zip.mjs';

test('stored ZIP preserves file bytes, known CRC32 and UTF-8 names', async () => {
  const progress = [];
  const zip = await createZip([
    {name: '001-test.mp4', blob: new Blob(['123456789'])},
    {name: '002-caf\u00e9.mp4', blob: new Blob([new Uint8Array([0, 255, 1, 2])])},
    {name: '003-empty.mp4', blob: new Blob([])}
  ], {onProgress: value => progress.push(value)});
  assert.equal(zip.type, 'application/zip');
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0xcbf43926); // Published CRC32 check vector.
  assert.equal(view.getUint16(6, true), 0x0800);
  assert.equal(view.getUint16(8, true), 0); // Stored, not recompressed.
  assert.equal(view.getUint16(bytes.length - 12, true), 3);
  assert.deepEqual(progress.map(value => [value.completed, value.total]), [[1, 3], [2, 3], [3, 3]]);
});

test('ZIP interoperates with an independent standard reader when Python is available', t => {
  const probe = spawnSync('python3', ['--version'], {timeout: 5000});
  if (probe.error?.code === 'ENOENT') return t.skip('Optional independent-reader check needs Python 3');
  return (async () => {
    const large = new Uint8Array(2 * 1024 * 1024 + 1).fill(91);
    const zip = await createZip([
      {name: '001-caf\u00e9.mp4', blob: new Blob(['123456789'])},
      {name: '002-large.mp4', blob: new Blob([large])},
      {name: '003-empty.mp4', blob: new Blob()}
    ]);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-zip-test-'));
    try {
    const filename = path.join(directory, 'videos.zip');
    await fs.writeFile(filename, Buffer.from(await zip.arrayBuffer()));
    const result = spawnSync('python3', ['-c', [
      'import sys, zipfile',
      'z = zipfile.ZipFile(sys.argv[1])',
      'assert z.testzip() is None',
      'assert z.namelist() == ["001-caf\u00e9.mp4", "002-large.mp4", "003-empty.mp4"]',
      'assert z.read(z.namelist()[0]) == b"123456789"',
      'assert z.read(z.namelist()[1]) == bytes([91]) * (2 * 1024 * 1024 + 1)',
      'assert z.read(z.namelist()[2]) == b""',
      'assert all(i.compress_type == zipfile.ZIP_STORED for i in z.infolist())'
    ].join('\n'), filename], {maxBuffer: 1024 * 1024, timeout: 10000});
    assert.equal(result.status, 0, result.stderr?.toString() || result.error?.message);
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
  })();
});

test('ZIP rejects ambiguous filenames, duplicates and ZIP32 overflow before reading files', async () => {
  for (const name of ['', '..', '../film.mp4', '/film.mp4', 'folder/film.mp4', 'C:\\film.mp4', 'bad\nname.mp4']) {
    await assert.rejects(createZip([{name, blob: new Blob()}]), /filenames/);
  }
  await assert.rejects(createZip([{name: 'a.mp4', blob: new Blob()}, {name: 'a.mp4', blob: new Blob()}]), /Duplicate/);
  class TooLarge extends Blob { get size() { return 0xffffffff; } }
  await assert.rejects(createZip([{name: 'large.mp4', blob: new TooLarge()}]), /4 GiB/);
  await assert.rejects(createZip([{name: 'missing.mp4'}]), /Missing file data/);
});

test('ZIP cancellation stops work, and an empty archive is valid', async () => {
  const controller = new AbortController();
  const progress = [];
  await assert.rejects(createZip([
    {name: 'one.mp4', blob: new Blob(['one'])}, {name: 'two.mp4', blob: new Blob(['two'])}
  ], {signal: controller.signal, onProgress: value => { progress.push(value); controller.abort(); }}), {name: 'AbortError'});
  assert.equal(progress.length, 1);
  const zip = await createZip([]);
  assert.equal(zip.size, 22);
  assert.equal(new DataView(await zip.arrayBuffer()).getUint32(0, true), 0x06054b50);
});
