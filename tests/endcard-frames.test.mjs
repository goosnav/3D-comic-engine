import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseFramePack } from '../src/endcard-frames.mjs';
import { loadCatalog, ROOT, digest } from '../src/library.mjs';
import { run } from '../src/process.mjs';

test('bundled pack preserves the complete original spin at browser cadence with independently decoded source pixels', async () => {
  const catalog = await loadCatalog();
  const asset = catalog.assets.endCardFrames;
  const bytes = await fs.readFile(`${ROOT}/${asset.path}`);
  assert.equal(digest(bytes), asset.sha256);
  assert.equal(asset.sourceSha256, catalog.assets.endCardVideo.sha256);
  const pack = parseFramePack(bytes);
  assert.deepEqual([pack.width, pack.height, pack.fps, pack.frames.length, pack.duration], [432, 540, 12, 180, 15]);
  const first = await run(process.env.FFMPEG ?? 'ffmpeg', ['-nostdin', '-v', 'error', '-i', `${ROOT}/${catalog.assets.endCardVideo.path}`,
    '-vf', 'fps=12,scale=432:540:flags=lanczos', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const decoded = await run(process.env.FFMPEG ?? 'ffmpeg', ['-nostdin', '-v', 'error', '-i', 'pipe:0',
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: Buffer.from(pack.frames[0]) });
  assert.equal(decoded.length, first.length);
  const error = decoded.reduce((sum, value, i) => sum + Math.abs(value - first[i]), 0) / decoded.length;
  assert.ok(error < 5, `derived pixels match canonical film (JPEG mean error ${error}); do not require identical encoder versions`);
});

test('frame parser rejects truncated, inconsistent and oversized metadata before decoding images', () => {
  const make = (header, body = [255, 216, 255, 217]) => {
    const json = Buffer.from(JSON.stringify(header)), prefix = Buffer.alloc(8);
    prefix.write('GCEF'); prefix.writeUInt32LE(json.length, 4);
    return Buffer.concat([prefix, json, Buffer.from(body)]);
  };
  const good = { version: 1, width: 432, height: 540, fps: 12, lengths: [4] };
  assert.equal(parseFramePack(make(good)).frames.length, 1);
  for (const bad of [Buffer.alloc(4), make({ ...good, fps: 0 }), make({ ...good, width: 50000 }),
    make({ ...good, lengths: [999] }), make({ ...good, lengths: [-1] }), make({ ...good, version: 2 }),
    make(good, [255, 216, 255, 217, 0]), make(good, [0, 0, 0, 0])]) assert.throws(() => parseFramePack(bad));
});
