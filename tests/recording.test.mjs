import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder, supportedMP4RecordingTypes, isCompatibleMP4Type } from '../browser/recording.mjs';

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

test('strict MP4 choices never contain WebM or generic MP4 and cannot fall back to either', () => {
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { throw new Error('H.264 encoder unavailable'); }
  }
  const types = supportedMP4RecordingTypes(Recorder);
  assert.equal(types.length, 2);
  assert.ok(types.every(type => type.startsWith('video/mp4;codecs=avc1') && type.endsWith('mp4a.40.2')));
  assert.throws(() => createRecorder({}, Recorder, types), /H\.264 encoder unavailable/);
  assert.deepEqual(supportedMP4RecordingTypes(class { static isTypeSupported(type) { return type.startsWith('video/webm'); } }), []);
});

test('actual MP4 MIME types reject incompatible declared codecs and WebM containers', () => {
  assert.equal(isCompatibleMP4Type('video/mp4;codecs="avc1.42001e, mp4a.40.2"'), true);
  assert.equal(isCompatibleMP4Type('video/mp4'), true);
  for (const type of ['video/webm', 'video/mp4;codecs=vp9,opus', 'video/mp4;codecs=avc1,opus', 'video/mp4;codecs=avc1', undefined]) {
    assert.equal(isCompatibleMP4Type(type), false);
  }
});
