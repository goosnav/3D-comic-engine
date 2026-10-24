// Keep a short consonant margin while removing generated or recorded edge silence.
export function speechBounds(samples, sampleRate) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (!peak) return [0, samples.length];
  const threshold = peak * .008, margin = Math.round(sampleRate * .025);
  let first = 0, last = samples.length - 1;
  while (first < last && Math.abs(samples[first]) < threshold) first++;
  while (last > first && Math.abs(samples[last]) < threshold) last--;
  return [Math.max(0, first - margin), Math.min(samples.length, last + margin + 1)];
}

export function captionCues(text, take) {
  const words = text.trim().split(/\s+/), count = Math.ceil(words.length / 5), cues = [];
  const weights = words.map(w => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length));
  const total = weights.reduce((a, b) => a + b, 0);
  // shortcut: speech-energy timing, not forced word alignment; add aligner when exact word timestamps are available.
  const points = (take.mouth || []).filter(p => p.t >= 0 && p.t < take.duration);
  const spans = points.map((p, i) => ({ start:p.t, end:points[i + 1]?.t ?? take.duration, energy:Math.max(.025, p.value) }));
  const energy = spans.reduce((n, p) => n + (p.end - p.start) * p.energy, 0);
  const at = fraction => {
    if (!energy) return fraction * take.duration;
    let remaining = energy * fraction;
    for (const p of spans) {
      const mass = (p.end - p.start) * p.energy;
      if (remaining <= mass) return p.start + remaining / p.energy;
      remaining -= mass;
    }
    return take.duration;
  };
  let offset = 0, consumed = 0;
  for (let i = 0; i < count; i++) {
    const length = Math.ceil((words.length - offset) / (count - i));
    const start = i ? at(consumed / total) : 0;
    consumed += weights.slice(offset, offset + length).reduce((a,b) => a+b, 0);
    cues.push({ text:words.slice(offset, offset + length).join(' '), start, end:i === count - 1 ? take.duration : at(consumed / total) });
    offset += length;
  }
  return cues;
}
