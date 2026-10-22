# On-device standalone implementation

Goal: clone, author and render locally or on a static website, without paid
services or required AI. Architecture: shared Three.js scene and JSON contract,
desktop FFmpeg adapter and browser MediaRecorder adapter. Spec: DESIGN.md.
Stack: Node 22+, Three.js, Playwright, FFmpeg, Flite WASM; optional Kokoro.

## Global constraints

No cloud execution, paid APIs, hardcoded machine paths, archived models or private
files. Preserve source locks, canonical art, renderer improvements and checkpoints.
Ad Studio stays unchanged. Assets are bundled in this repo. New behavior is tested
first; shared interfaces below define disjoint implementation work.

## Task 1 — shared core and static build

Copy tracked source snapshot and tests. Make contracts use Web Crypto instead of
node:crypto. Test browser import/resolution and build asset integrity. Implement
tools/build-web.mjs with explicit allowlist and bundled imports, no CDN. Pin
Flite/WASI/bundler dependencies. Static-only wrangler.jsonc. Run unit/asset checks.

## Task 2 — device speech and browser recording

Files: browser/voice*.mjs, browser/export.mjs, src/flite.mjs, related new tests.
API synthesizeSpeech(module,text,{speaker}) -> {samples:Float32Array,sampleRate}.
API exportFilm({canvas,script,catalog,assetBase,onProgress,signal,audioContext})
-> {blob,mimeType,extension,timeline}. Full valid contract text, no truncation.
Use measured speech/mouth, shared timeline/player, Web Audio and MediaRecorder.
Negotiate codecs; reject unsupported, hidden or cancelled exports. Clean up all
resources on failure. Test real speech and browser exports without external calls.

## Task 3 — desktop CLI and launchers

Files: bin/, launchers/, tools/setup.mjs, src/audio.mjs, src/jobs.mjs, CLI tests.
Flite default, retaining recorded/Kokoro. Consume src/flite.mjs from Task 2.
Add --json, batch manifest, sequential bounded runs, per-input failures and
--output-dir. Correct exit codes, diagnostics on stderr. GUI launcher opens browser
and checks prerequisites; Linux shell, macOS command and Windows PowerShell/cmd.
Test invalid inputs, JSON output and mixed batches using real job functions.

## Task 4 — shared GUI, static backend, local writer

Files: web/, browser/backend.mjs, src/contracts.mjs, src/writer.mjs, src/server.mjs.
Transport preserves desktop APIs; static backend implements catalog/select/validate/
render/jobs locally. Save editor JSON; truthful progress/errors/downloads and phone
limitations. Explicit static runtime (no probing remote /api). Lower browser preset.
Reject remote writer endpoints. Test source mismatch, manual input and persistence.

## Task 5 — integration, docs, review, push

Full unit suite, asset verification, real static export with decoded audio/video,
desktop smoke render and clean build. Fresh whole-branch review and regression
fixes. README, CLI.txt, TUTORIAL, DEV evidence and Cloudflare static setup. Document
actual native platform test coverage and browser foreground limits. Verify assets
already published then commit/push target main (no deployment).

## Review focus

Full film/audio, not end-card-only; tampered sources; background interruptions;
codec/device failure; no paid calls; editing during renders; batch partial failures;
clean stdout; static portability, licenses and secret exclusion.
