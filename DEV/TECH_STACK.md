# Current stack and implementation methodology

## One scene engine, two delivery adapters

The animation model is not a series of AI-generated Blender programs. It is a
small deterministic game-like engine. JSON declares source pages, cast variants,
dialogue, facial controls, reactions, shots and book actions. A validator resolves
defaults, records a random seed when omitted, and binds exact source hashes.
Measured speech produces a timeline; the renderer evaluates an absolute frame
index. Seeking backward does not accumulate state from the previous frame.

The browser and desktop do not need two independent renderers. Shared source
modules implement character poses, book state, expressions, framing and the
end card. Only speech I/O, job storage and encoding differ between environments.

## Runtime dependencies

Pinned versions live in package.json/package-lock.json, not this document.

| Component | Purpose | Runs where |
| --- | --- | --- |
| Node 22.12+ | CLI, local GUI server, disk jobs | Desktop/build machine |
| Three.js | WebGL scene, GLB loader, animation rendering | Device browser |
| Playwright Chromium | Controlled frame capture | Desktop |
| FFmpeg + ffprobe | MP4 encode, audio normalization, final verification | Desktop |
| Flite WASM + WASI shim | Free PCM speech, reader/friend profiles | Browser and desktop |
| proper-lockfile | Cross-process per-run/output queue locks | Desktop |
| esbuild | Self-contained static JS modules, no CDN imports | Build machine |
| Kokoro/Python | Optional higher-quality local voice | Desktop, opt-in |

No Cloudflare Containers, R2, Durable Objects, hosted model API, billing system or
remote rendering worker is part of the application. Static hosting is interchangeable.

## Contracts

- `resolveScript(raw,catalog)` returns normalized version-1 JSON or helpful errors.
- `synthesizeSpeech(module,text,{speaker})` returns mono Float32 PCM and sample rate.
- `compileTimeline(script,takes)` uses measured take durations and mouth envelopes.
- `createPlayer(canvas,{timeline,catalog,assetBase})` returns `renderAt(frame)`,
  diagnostics and disposal. Callers await renderAt, including async video seeks.
- `exportFilm(...)` returns a real encoded Blob, MIME type, extension and timeline.
  The caller owns its supplied AudioContext and immutable asset snapshot URLs.

The GUI's API-shaped transport preserves authoring behavior without pretending a
hosted server exists. Local mode calls the loopback API. Static mode calls browser
functions in-process. Static builds explicitly mark that mode; there is no remote
API probing or fallback to a paid service.

## Recording decisions

Desktop renders all frames offline, caches verified segments and uses FFmpeg for
frame-count/duration/decode checks. Browser recording is real-time MediaRecorder.
Speech is PCM mixed into Web Audio, not a system voice that cannot be exported.
The recorder uses a supported actual container, never a renamed extension.

Browser GPU materials/shots are warmed before recording. Each submitted frame
is flushed before another is queued, allowing slow devices to skip frames rather
than accumulate seconds of queued drawing and trailing silence. Speech schedules
from the recorder start call, not its potentially delayed callback. Visibility,
audio suspension, cancellation, graphics loss and recording errors are explicit.
Progress callbacks are throttled so rebuilding GUI status does not flood the
render loop. Native phone behavior still needs device testing.

## Persistence and failure semantics

Desktop: separate job directories, atomic status receipts, source/code/audio cache
keys, bounded subprocess operations, verified final files. A completed receipt
does not override a missing or changed output. Batch failures do not erase earlier
successes or prevent later inputs from being attempted.

Browser: author JSON is saved locally when storage works; downloads are the durable
backup. Encoded videos live in this page's memory until downloaded. Leaving the tab
or losing audio interrupts the job; retry starts a new recording from the saved
script. Do not describe that as resumable background rendering.

## Development process

Keep contracts and regression tests ahead of behavior changes. Test actual media
with decoders, not only mocked success messages. Separate technical validity from
creative approval. Review exact source hashes and original artwork; never generate
replacement canonical comics. Freeze portable snapshots and fail on source-lock
changes. Keep platform claims tied to evidence, not launch-script existence.

For a new encoder, preserve the timeline/player interfaces. For new product rails,
add explicit schema, assets, choreography and tests. The future card-hand format
is documented in history/V2_CARD_GAME.md, not silently approximated in book code.
