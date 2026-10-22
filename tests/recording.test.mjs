import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder } from '../browser/recording.mjs';

test('export chooses compatible MP4 ahead of WebM and keeps the stream and encoding options', () => {
  class Recorder {
    static isTypeSupported(type) { return type.includes('avc1') || type.includes('vp8'); }
    constructor(stream, options) { this.stream = stream; this.options = options; }
  }
  const stream = {};
  const recorder = createRecorder(stream, Recorder);
  assert.equal(recorder.stream, stream);
  assert.equal(recorder.options.mimeType, 'video/mp4;codecs=avc1.42E01E,mp4a.40.2');
  assert.equal(recorder.options.audioBitsPerSecond, 128000);
});

test('a claimed MP4 encoder that cannot be allocated falls back before recording begins', () => {
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(stream, options) {
      if (options.mimeType.startsWith('video/mp4')) throw new DOMException('No encoder', 'NotSupportedError');
      this.mimeType = options.mimeType;
    }
  }
  assert.equal(createRecorder({}, Recorder).mimeType, 'video/webm;codecs=vp8,opus');
});

test('unsupported capture produces an actionable failure, not a falsely named MP4', () => {
  class Recorder { static isTypeSupported() { return false; } }
  assert.throws(() => createRecorder({}, Recorder), /supported.*codec/i);
});

test('generic MP4 support alone cannot select an incompatible VP9/Opus MP4', () => {
  class Recorder {
    static isTypeSupported(type) { return type === 'video/mp4' || type.includes('vp8'); }
    constructor(stream, options) { this.mimeType = options.mimeType; }
  }
  assert.equal(createRecorder({}, Recorder).mimeType, 'video/webm;codecs=vp8,opus');
});
