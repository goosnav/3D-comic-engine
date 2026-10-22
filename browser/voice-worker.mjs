import { synthesizeSpeech } from '../src/flite.mjs';

self.onmessage = async ({ data: { lines } }) => {
  try {
    const response = await fetch(new URL('../vendor/flite.wasm', import.meta.url));
    if (!response.ok) throw new Error(`Cannot load local voice (${response.status})`);
    const module = await WebAssembly.compile(await response.arrayBuffer());
    let duration = 0;
    for (const [index, line] of lines.entries()) {
      const take = await synthesizeSpeech(module, line.text, { speaker: line.speaker });
      duration += take.samples.length / take.sampleRate;
      if (duration > 600) throw new Error('Episode exceeds the 600-second resource safety bound; split into episodes');
      self.postMessage({ id: line.id, index, take }, [take.samples.buffer]);
    }
    self.postMessage({ done: true });
  } catch (error) { self.postMessage({ error: error.message }); }
};
