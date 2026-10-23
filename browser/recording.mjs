// Prefer H.264/AAC for phone sharing and editors. Never relabel WebM as MP4.
// Generic video/mp4 can mean VP9/Opus on Chromium, which defeats the purpose
// of choosing MP4 for conventional phone players. Require H.264 plus AAC.
const MIME_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2',
  'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];

export function supportedRecordingTypes(Recorder = globalThis.MediaRecorder) {
  return MIME_TYPES.filter(type => Recorder?.isTypeSupported?.(type));
}

/** Batch exports promise conventional H.264/AAC MP4 files, with no WebM fallback. */
export function supportedMP4RecordingTypes(Recorder = globalThis.MediaRecorder) {
  return supportedRecordingTypes(Recorder).filter(type => type.startsWith('video/mp4;'));
}

export function isCompatibleMP4Type(type) {
  if (typeof type !== 'string' || !/^video\/mp4(?:\s*;|$)/i.test(type)) return false;
  const codecs = /(?:^|;)\s*codecs\s*=\s*"?([^";]+)/i.exec(type);
  // Some browsers report only the container after accepting an explicit
  // H.264/AAC request. If codecs are reported, both must match that request.
  if (!codecs) return true;
  const values = codecs[1].split(',').map(codec => codec.trim().toLowerCase());
  return values.length === 2 && values.some(codec => /^avc1(?:\.[a-f0-9]+)?$/.test(codec)) && values.includes('mp4a.40.2');
}

export function createRecorder(stream, Recorder = globalThis.MediaRecorder, types = supportedRecordingTypes(Recorder)) {
  const failures = [];
  for (const mimeType of types) {
    try { return new Recorder(stream, { mimeType, videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 }); }
    catch (error) { failures.push(`${mimeType}: ${error.message}`); }
  }
  throw new Error(`No supported audio/video recording codec could start. Try a current browser or desktop export.${failures.length ? ' ' + failures.join('; ') : ''}`);
}
