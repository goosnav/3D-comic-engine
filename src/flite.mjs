import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } from '@bjorn3/browser_wasi_shim';
import { fliteDurationStretch } from './speech-timing.mjs';

// A new WASI instance owns each take. No host filesystem, network, or shared heap.
export async function synthesizeSpeech(module, text, { speaker = 'reader', speechRate } = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1000 || text.includes('\0')) {
    throw new Error('Speech text must contain 1–1000 characters without NUL bytes');
  }
  const durationStretch = fliteDurationStretch(speaker, speechRate);
  const output = new PreopenDirectory('/out', []), messages = [];
  const log = ConsoleStdout.lineBuffered(line => { if (messages.length < 8) messages.push(line); });
  const friend = speaker === 'friend';
  const wasi = new WASI(['flite', '-voice', 'kal', '--setf', `int_f0_target_mean=${friend ? 125 : 95}`,
    '--setf', `duration_stretch=${durationStretch}`, '-t', text, '-o', '/out/voice.wav'], [],
  [new OpenFile(new File([])), log, log, output], { debug: false });
  // Shim 0.4.2 counts UTF-16 characters here, but args_get writes UTF-8 bytes.
  // Correct the allocation size so curly quotes and other valid text cannot
  // overwrite adjacent WASI argv storage. Preserve the original text verbatim.
  wasi.wasiImport.args_sizes_get = (argc, argvSize) => {
    const memory = new DataView(wasi.inst.exports.memory.buffer);
    memory.setUint32(argc, wasi.args.length, true);
    memory.setUint32(argvSize, wasi.args.reduce((n, arg) => n + new TextEncoder().encode(arg).length + 1, 0), true);
    return 0;
  };
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
  const code = wasi.start(instance), bytes = output.dir.contents.get('voice.wav')?.data;
  if (code !== 0 || !bytes) throw new Error(`Voice synthesis failed: ${messages.join(' ').slice(0, 300)}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = offset => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Invalid voice WAV');
  let sampleRate, dataOffset, dataSize;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > bytes.length) throw new Error('Truncated voice WAV');
    if (tag(offset) === 'fmt ') {
      if (size < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1 ||
          view.getUint16(start + 14, true) !== 16) throw new Error('Unsupported voice audio format');
      sampleRate = view.getUint32(start + 4, true);
    }
    if (tag(offset) === 'data') { dataOffset = start; dataSize = size; }
    offset = start + size + size % 2;
  }
  if (!sampleRate || !dataOffset || !dataSize || dataSize % 2) throw new Error('The voice produced no valid audio');
  const samples = new Float32Array(dataSize / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
  return { samples, sampleRate };
}
