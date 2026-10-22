# Standalone on-device verification

Migration date: 2026-10-21 Pacific / 2026-10-22 UTC. This document reports
execution evidence, not creative approval or native-platform certification.

## Browser production follow-up — 2026-10-22 UTC

- Fresh Node suite: **85 passed**, zero failures/skips, including the optional
  Python identity fixture. Default rendering still requires no Python or AI.
- Full serial browser run with real local-server tests enabled: **77 of 78
  passed**, zero skips/cancellations. The remaining test assumed the catalog's
  second entry was one of the original three comics. The expanded ordered
  catalog correctly invalidated that fixture. Changed the fixture to explicit
  stable comic IDs, then reran all three cinematography cases: **3 passed**,
  zero failures/skips/cancellations. This is full-suite coverage plus a focused
  rerun, not a claim that the original 78-case invocation was wholly green.
- Actual static `/studio/` GUI export: 4.38 seconds decoded for a 4.238-second
  script, both dialogue voices, spinning-book ending, and an attached 220 Hz
  music tone measured during the end card. No external/API requests. The main
  agent inspected the static GUI, desktop/mobile layouts and encoded end frame;
  audio was machine-checked, not personally auditioned.
- Real recorder-startup regression passed after synchronous and asynchronous
  pre-start MP4 failures fell back to an actual complete WebM recording.
- Metadata-only endcard startup regression failed before playback priming and
  passed afterward. Separate real-video/player-loading tests passed (6 cases).
- Full bundled asset audit: **158 verified entries**. All 144 book interiors
  match their canonical page manifest and embedded book images. Only the original
  three have curated transcripts; no other transcripts were invented.
- Static build succeeded. Browser endcard derivative fully decoded through
  FFmpeg; original desktop endcard remains byte-for-byte unchanged.
- Independent final code review found no remaining actionable blockers after
  encoder-start fallback repair. The static integration also exercises selected
  previews, source locks, restored JSON, music attachment and real final frames.

Commands: `npm test` (with the existing optional `THEATRE_PYTHON` fixture),
`THEATRE_GUI_REAL_SERVER=1 npm run test:browser`,
`node --test tests/cinematography.browser.mjs`, `npm run build`, and
`node bin/theatre.mjs assets --json`.

**Remaining platform check:** the user's physical iPhone Chrome has not been
tested here. Linux WebKit's GStreamer decoder failed independently and cannot
certify iOS. The mobile loading defenses need a real iPhone retry after the
Cloudflare deployment. Live deployment was not verified from this environment.
See [implementation notes](2026-10-22-browser-production.md) for diagnostics,
format fallback and bounded music behavior.

## Initial migration checks (historical)

- Full Node suite after review and shutdown fixes, with optional Python fixture: 68 passed,
  zero failures/skips.
- Existing GUI suites with real local-server cases enabled: 27 passed, zero skips.
- Final full browser suite: 45 passed, zero failures/skips/cancellations, including
  real export, all GUI cases, source/page/rig checks, 12/24/30fps reverse seeking,
  checkpoint recovery, cancellation, visibility, audio suspension and CPU stalls.
- `node tools/setup.mjs --check`: Node/npm, FFmpeg/ffprobe, Chromium and Flite ready.
- `node bin/theatre.mjs doctor --json`: successful machine-readable result.
- `node bin/theatre.mjs assets --json`: all 16 bundled assets verified.
- `npm run build`: static build succeeds, individual files within 25 MiB limit.
- Six character variants byte-match canonical active exports. Canonical origin/main
  is `65f9ae1f791b86b5e2ce2b235ee0d2f00908557a`, already published.
- Ad Studio remains unchanged except its pre-existing untracked nested asset work.

## Actual desktop film

Command: `node bin/theatre.mjs render examples/parasite.json --preview --json`

Flite, no Python/model or paid call: four measured dialogue lines, selected page
book2-036, 166 frames, 432×540, 12 fps, 13.833333 seconds. Complete MP4 decoded and
verified by the existing capture verifier. About 78 seconds wall time with other
tests running concurrently. This is one observation, not a performance guarantee.

SHA-256: `74423d5d7dedbadeeef16f901c734759b22ddc841eb02ff27ca73b1943b48cde`.
Main agent visually inspected extracted frames from beginning, conversation and
spinning end card. Audio was machine-checked; this is not a claim of listening
to or approving the voice performance.

## Browser integration

Static GUI integration passed from a /studio/ mount, including real thumbnails,
JSON restoration, validated source selection, both voices, final spinning-book
frame, actual audio/video decoding and zero external API requests. Further timing
inspection found excess silence from delayed recorder callbacks and queued GPU
work. Scheduling speech from start(), warming scene materials and waiting for each
submitted draw fixed the scoped timing regression: a 4.238-second script encoded
4.800 seconds of audio with first speech at 0.320 seconds. The strengthened test
also checks both voices and the actual final encoded frame against an independent
render. The final whole-browser run passed all 45 cases; its full static GUI
export decoded 4.86 seconds of audio and video from the same 4.238-second script.

Commands used for final suites:

```sh
npm test
THEATRE_GUI_REAL_SERVER=1 npm run test:browser
```

The unit run additionally set THEATRE_PYTHON to an existing compatible local Python
for the optional Kokoro identity fixture, so that test was exercised rather than
skipped. Default Flite rendering did not use that override or need Python.

Review found audio-startup cancellation and stale build output risks. Both were
reproduced with failing tests, fixed, and passed. Subdirectory thumbnails were
also reproduced/fixed/tested. A separate clean Git-only snapshot installed pinned
packages from npm's offline cache, built the static app, verified all 16 assets
and validated an example without any Ad Studio checkout dependency.

A legacy speculative-TCP shutdown hang was reproduced/fixed with a server test.
The initial whole-browser run was deliberately interrupted after that diagnosis;
its cancelled cases are not counted as passes. The restarted suite used the fix
and completed successfully. No unresolved review findings remain.

## Platform limits

Native host exercised: Linux, Node 24, Playwright Chromium, FFmpeg 6. macOS and
Windows launch scripts are provided, with POSIX path/first-run tests on Linux;
neither is claimed to have been run natively. Physical iPhone/Android and Safari
have not been tested here. Browser support depends on WebGL2, WASM, Web Audio,
canvas capture and supported MediaRecorder codecs. No Cloudflare deployment was
made, and no paid resource was created.
