// Prefer H.264/AAC for phone sharing and editors. Never relabel WebM as MP4.
// Generic video/mp4 can mean VP9/Opus on Chromium, which defeats the purpose
// of choosing MP4 for conventional phone players. Require H.264 plus AAC.
const MIME_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2',
  'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];

export function supportedRecordingTypes(Recorder = globalThis.MediaRecorder) {
  return MIME_TYPES.filter(type => Recorder?.isTypeSupported(type));
}

export function createRecorder(stream, Recorder = globalThis.MediaRecorder, types = supportedRecordingTypes(Recorder)) {
  const failures = [];
  for (const mimeType of types) {
    try { return new Recorder(stream, { mimeType, videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 }); }
    catch (error) { failures.push(`${mimeType}: ${error.message}`); }
  }
  throw new Error(`No supported audio/video recording codec could start. Try a current browser or desktop export.${failures.length ? ' ' + failures.join('; ') : ''}`);
}
