// Maintainer-only conversion. No FFmpeg, video decoder, or paid service is
// needed to use the resulting asset in a browser.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { run } from '../src/process.mjs';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length) throw Error('Usage: node tools/build-endcard-frames.mjs INPUT_VIDEO OUTPUT.frames');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-endcard-frames-'));
try {
  await run(process.env.FFMPEG ?? 'ffmpeg', ['-nostdin', '-v', 'error', '-i', input, '-an',
    '-vf', 'fps=12,scale=432:540:flags=lanczos', '-q:v', '2', '-frames:v', '601', path.join(temp, '%04d.jpg')]);
  const names = (await fs.readdir(temp)).filter(name => name.endsWith('.jpg')).sort();
  if (!names.length || names.length > 600) throw Error('Endcard must contain 1–600 frames at 12 fps');
  const frames = await Promise.all(names.map(name => fs.readFile(path.join(temp, name))));
  const header = Buffer.from(JSON.stringify({ version: 1, width: 432, height: 540, fps: 12, lengths: frames.map(frame => frame.length) }));
  const prefix = Buffer.alloc(8); prefix.write('GCEF'); prefix.writeUInt32LE(header.length, 4);
  const bytes = Buffer.concat([prefix, header, ...frames]);
  if (bytes.length > 25 * 1024 * 1024) throw Error('Frame pack exceeds static hosting size limit');
  await fs.writeFile(output, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ path: output, frames: frames.length, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sourceSha256: createHash('sha256').update(await fs.readFile(input)).digest('hex') }, null, 2));
} finally { await fs.rm(temp, { recursive: true, force: true }); }
