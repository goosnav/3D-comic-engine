# 3D Comic Engine — on-device design

Owner-approved direction. Supersedes the earlier Cloudflare Containers proposal.

## Contract

One repository. JSON or GUI input is sufficient. Animation is deterministic code.
No paid API, cloud container, account or AI model is required. Static hosting
distributes files; films are rendered on the device. Optional writing uses only
an explicitly configured local model.

## Architecture and directory map

Keep the existing Three.js absolute-time renderer, source locks, seeded shots,
book actions, expressions and spinning-book end card. Python is optional speech,
not a second animation engine.

- src/: shared contracts/timeline/renderer; named desktop adapters audio, capture,
  jobs, library, server, process and writer.
- browser/: speech, recording and persistence adapters.
- web/: one GUI with a transport selecting browser or desktop services.
- bin/: automation CLI; launchers/: OS scripts.
- tools/: static build/setup; voices/: optional local Kokoro.
- assets/: reviewed hash-locked snapshots, no sibling repo or archived models.
- examples/, tests/, DEV/: inputs, executable checks, design and evidence.

## Desktop

Node jobs and disk checkpoints; Chromium frames; FFmpeg MP4 encoding/validation.
Bundled Flite WASM is baseline speech, requiring no Python/model download.
Optional Kokoro improves speech after a free one-time install; recordings work too.
Batch execution is bounded and reports each input independently. Preserve completed
outputs and resumable stages. JSON stdout, progress stderr, documented exit codes.
Launchers locate their checkout, check/setup prerequisites and open the GUI.
Setup needs downloads; ordinary rendering does not. These are source launchers,
not a promise of universal native binaries. Record actual OS testing separately.

## Browser and static Cloudflare hosting

Static build bundles GUI, renderer, assets and Flite WASM. No Python, Node server,
FFmpeg executable or Worker compute is required on the phone. Flite produces PCM,
not uncapturable OS speechSynthesis output. Same measured durations and shared
timeline as desktop.

Use Web Audio, canvas capture and MediaRecorder with supported MIME negotiation.
WebM stays WebM; MP4 only when actually encoded as MP4. Browser export is real-time
and lower resolution by default. Desktop remains preferred for frame-exact bulk
work. Keep the phone awake and the tab visible. If visibility/audio continuity is
lost, stop visibly rather than returning an incomplete success. Preserve script
input for retry; do not promise background rendering or resumable encoded frames.
Browser storage can be evicted, so JSON/video downloads are durable backups.

## Trust and security

Preserve exact comic/edition hashes, embedded-book page checks, original art and
approved characters. Verify browser assets before rendering. No third-party CDN
runtime dependencies. Keep local server loopback-only with CSRF and path confinement.
Optional writing is explicit and loopback-only. Static builds exclude private
config, output, caches and development material. No deployment/account changes
are required to prepare the code.

## Tradeoffs and evolution

Flite is less natural than Kokoro but free and predictable. Real-time browser
recording can drop frames on slow phones. A future WebCodecs backend can replace
the recording adapter without changing scripts or animation; avoid that complexity
until needed. Do not duplicate renderer logic in a separate Python/browser engine.

## Verification

Keep migrated tests; add speech, static build, actual exported audio/video,
no-external-request, invalid input, interruption, CLI JSON and batch tests. Record
commands and limits in DEV/VERIFICATION.md. Verify canonical variants are published.
Push standalone code after review; do not change Ad Studio.

## Primary references

- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
- https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- https://developers.cloudflare.com/workers/static-assets/
