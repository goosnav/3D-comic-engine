# Rendering capabilities and offline CPU workflow

Install Node 22.12+, FFmpeg (including `libx264` and `aac`) and ffprobe. For CPU rendering install Blender 4.x with Cycles CPU support. Denoising is disabled, so OpenImageDenoise is not required. The tested native platform is Linux x64; other native canvas/Blender platforms need their own acceptance run.

```sh
npm ci --no-audit --no-fund
# Optional accelerated/software browser renderer:
npm run setup:browser
# One-command local browser GUI after dependency installation:
npm start
# Offline CLI; no Chromium, WebGL, display or HTTP server is needed:
node bin/theatre.mjs render examples/parasite.json --backend blender-cpu --json
node bin/theatre.mjs doctor --json
```

`npm start` serves the GUI on loopback and opens a browser. Opening an HTML file directly is unsupported and displays launcher instructions. The GUI needs a browser for editing, but its local rendering worker can use Blender. The CLI can run without any browser. The legacy OS bootstrap launchers still install Chromium; use `npm ci` and `npm start` for an installation without it.

| Environment | Renderer | Encoder | Fallback |
| --- | --- | --- | --- |
| Cloudflare static website | WebGL2 in visitor browser | MediaRecorder H.264/AAC, then WebM VP8/Opus or VP9/Opus | Editing/validation and portable job download remain available |
| Local GUI | Chromium GPU, Chromium software, Blender CPU | FFmpeg H.264/AAC | Automatic capability selection; explicit renderer dropdown |
| Local CLI | Same local renderer selection | FFmpeg H.264/AAC | Explicit `--backend blender-cpu` needs no browser/server |
| Missing FFmpeg or all renderers | None | None | Job/script/audio intermediates remain on disk; failure is reported |

No hosted page launches Blender, and no Cloudflare Worker or paid rendering service is required. `npm run build` produces the existing static `dist/` application. Node, native canvas, Python and subprocess modules remain outside that browser bundle.

## Selection and errors

Renderer and encoder checks are independent. `auto` probes GPU Chromium, software Chromium, then an actual tiny Cycles CPU render. Missing Chromium or permission denial skips the redundant software launch. Probes are cached for the process/session. Actual renderer startup or frame failures invalidate that renderer; automatic mode can fall back to CPU. Invalid scripts, asset verification failures, speech errors and encoding failures do not cycle renderers. Explicit overrides fail if that renderer cannot execute.

Use `--backend auto|chromium-gpu|chromium-software|blender-cpu` on render, batch or resume. `THEATRE_GPU=0` skips the GPU preference. `THEATRE_BROWSER`, `BLENDER`, `FFMPEG` and `FFPROBE` select executable paths. CPU tuning: `THEATRE_CPU_SAMPLES=8` and `THEATRE_CPU_THREADS=4` are defaults. Increased samples reduce noise at increased render time. Capability failures are not repaired by permission bypasses or repeated browser launches.

Structured job output identifies the actual backend, MP4 format, capability attempts and reduced-fidelity warnings. Errors record input/assets/speech/renderer startup/permissions/frame rendering/encoding/output stages where identifiable. Browser context loss aborts recording; it cannot manufacture a local renderer. Download a render job and run the CLI instead.

## Shared evaluation and versioned files

`src/scene-evaluator.mjs` is shared by the WebGL player and Node CPU adapter. It uses the original actor, facial, gesture, book, stunt and cameo modules. Each frame is evaluated at `frame / fps`; total frames remain `ceil(duration * fps)`. Dialogue, pauses, cuts, seed, mouth samples and caption cues come from the existing normalizer, speech preparation and timeline compiler.

The Node adapter loads the **existing GLBs** with Three.js without constructing a renderer. It retains bone poses and morph weights for inspection and bakes their evaluated mesh deformation. `cpu-job/scene.json` is version 1 (`goosnav-evaluated-scene`): topology, material descriptions, textures, per-frame world matrices, camera projection, rig state and SHA-256-checked little-endian float32 mesh samples. Blender consumes these evaluated assets; it does not duplicate JavaScript choreography or invent performance clips. It currently rebuilds meshes from evaluated GLB data rather than importing an editable Blender armature.

Coordinates remain right-handed Y-up meters in Blender world. Matrices are column-major in JSON and transposed into Blender matrices. Both cameras face local -Z with +Y up; the Blender camera uses explicit vertical FOV and sensor fit. glTF texture coordinates are converted to Blender UV orientation. Bone skinning and morph deformation happen in the shared JavaScript evaluator, avoiding Blender bone-rest-axis differences.

Each successful Cycles frame has a hash receipt bound to the render input, source code, renderer script, CPU sampling setting and audio. Intermediates are deliberately retained for recovery and inspection. They can consume substantial disk space; this backend is intended for correctness and offline capability, not high-resolution real-time performance. Final publication uses a partial MP4, verifies H.264/AAC, frame count, dimensions, duration and full FFmpeg decode, then renames it. Partial files are never offered as completed videos.

## Feature inventory and fidelity

| Feature | CPU behavior |
| --- | --- |
| Rigged cast, face morphs, gaze, gestures, wrist/book grip | Existing JS evaluation baked at exact timestamps |
| Camera shots, cuts and selected pages | Shared camera evaluator; source inserts preserve captions |
| Book hinges/page turns, throws | Existing geometry/UVs and shared animation |
| Procedural set, face props, explosion pieces, tears, goose | Evaluated geometry, transforms and visibility |
| Stunts and cameo animation clips | Shared stunt/cameo evaluation, including skeleton deformation |
| Speech, pauses, sound-effect mix | Existing measured 48 kHz mix, muxed with AAC |
| Captions | Existing layout/font code rendered with native Canvas2D |
| Endcards | Existing typography/layout with bundled 540px spinning-book frame pack |
| Materials/lights | Base color/texture, opacity, roughness and metalness; approximate area/ambient lighting |
| Three.js grade, stage dither/grain | Not reproduced; explicitly reported reduced fidelity |
| Normal/occlusion/emissive textures, transmission, clearcoat, custom shaders | Not reproduced; explicitly reported reduced fidelity |
| Multiple-material mesh groups | Reject with the mesh name rather than silently omit |

Cycles uses AgX tone mapping and recomputes smooth mesh normals rather than retaining authored glTF normals. Visual differences in lighting, shadows, noise, glass and text rasterization are expected. No pixel equivalence is claimed. An action is not replaced by a still or cutout. Original models and animation functions remain authoritative.

## Portable jobs and recordings

The editor's **Download local render job** writes a versioned, SHA-256-checked intent document containing a normalized script, bundled asset hashes and optional music bytes. Copy it to a matching checkout and run:

```sh
node bin/theatre.mjs render comic.render-job.json --backend auto --json
```

Bundled assets resolve locally and must match the job's hashes. Flite speech is regenerated offline with the pinned dependency; music is embedded and mixed at the same quiet 0.12 level. The file is an integrity-checked package, not a signature from a trusted publisher. Ordinary JSON and local recorded-audio paths continue to work as before; keep those recordings beside the original script. Browser jobs do not upload recordings or resolve arbitrary filesystem paths.

Browser single and batch exports use the same codec preference. WebM retains a `.webm` suffix and MIME type. Local rendering always encodes actual H.264/AAC; to convert an existing browser WebM separately:

```sh
ffmpeg -i recording.webm -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart recording.mp4
```

## Cancellation and recovery

Ctrl+C aborts queued waits and running local render/encode subprocesses. Browser cancellation releases tracks, canvases and audio. GUI batch **Stop after current** retains its established behavior. Resume a saved job or a CLI manifest without rerendering completed files:

```sh
node bin/theatre.mjs resume RUN_ID --output-dir ./output --backend auto --json
node bin/theatre.mjs batch manifest.json --output-dir ./output --resume --json
```

CLI batch reports are saved in the output directory. Resume checks input identities and completed-video hashes; corrupt/missing deliveries rebuild from valid checkpoints. Changed scripts create new jobs. A failure in one entry preserves other successes. The GUI's batch summary remains session-scoped; its individual on-disk jobs can be resumed with the CLI.

## Reproduce acceptance

```sh
npm test
npm run test:browser
npm run build
THEATRE_CPU_SAMPLES=16 node tools/acceptance-cpu.mjs /tmp/goosnav-seven-cpu
```

The explicit CPU suite derives seven short scenes from the existing `examples/parasite.json` setup, uses actual rigged GLBs, real Flite speech, ordinary gestures, several cameras, a head-spin action, captions and endcards. It deliberately points Chromium at a nonexistent executable, renders 320×480 at 12 fps, verifies every MP4 and writes `acceptance.json` with streams and elapsed time. It is not a full-resolution benchmark or exhaustive visual certification of every catalog scene.

### Measured CPU acceptance (Linux, Blender 4.0.2)

The final seven-scene run at 320×480, 12 fps and 16 Cycles samples completed in 638.13 seconds with Chromium deliberately unavailable. It produced 169 frames (14.083 seconds of video). Individual frame counts were 23, 22, 24, 24, 21, 21 and 34. All seven outputs passed H.264/AAC stream, dimensions, duration, frame-count and complete FFmpeg decode checks. This elapsed time includes speech, evaluation, rendering and encoding, with other regression tests running concurrently; it is not an isolated benchmark. No full-resolution performance claim is made.

A separate real CPU cancellation test interrupted after the first rendered frame, resumed, confirmed that frame's modification time was unchanged, and verified the completed video. Source changes intentionally invalidate frame receipts, so recovery checks must run against stable code.

Final regression evidence: `npm test` passed 198 tests with one optional voice-installation skip; the production build passed. The full browser run passed 114 tests with two skips and exposed two test-maintenance issues: the large animation fixture exceeded its old 180-second software-rendering timeout, and a legacy batch assertion still required MP4-only rejection. The unchanged animation assertions passed on rerun in 140 seconds with a larger bounded timeout; the replacement batch test passed both normal and forced WebM-only real two-video exports, including codec/dimension checks and full decoding. All remaining browser cases, including production static export with speech/music/endcard, passed in the full run. A separate explicit accelerated Chromium render also produced a verified H.264/AAC video.
