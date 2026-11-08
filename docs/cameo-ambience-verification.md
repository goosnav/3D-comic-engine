# Cameo focus and ambience verification — 2026-11-07

The same timestamp evaluator supplies WebGL and Blender CPU. Focus rows select `stand`/`walk`, `static`/`follow`, and 0.3–30 seconds. The four existing cameo models are reused. Focus asset loading is separate from the background selection; actor/book/interaction-prop visibility restores on every evaluation, including out-of-order seeks.

Ambience is original procedural room/motor/ventilation audio, generated locally. Omitted configuration means Auto room tone at 0.35; Auto yields to attached music. Explicit Room/Laundromat can accompany music. Speech ducking reduces the bed by about 13.2 dB with smooth transitions. Off adds no samples and preserves the original voice mix. Maximum generated buffer is 110 MiB; browser synthesis is synchronous before recording, so a cancellation click during synthesis is handled when synthesis returns (about 0.6 seconds per minute of audio on this host).

## Real media acceptance

`examples/awkward-cameo.json` was rendered with two v12 rigged characters, Flite dialogue, captions, a stationary goose cutaway, a two-second silent reaction and a walking/following walker cutaway. The acceptance copy used 192×320 at 12 fps. Production defaults remain unchanged.

| Path | Verified result |
| --- | --- |
| Blender CPU, Chromium path set to unavailable | H.264/AAC MP4, 104 frames, 192×320, 8.666667 seconds, full FFmpeg decode without errors |
| Hosted production build, sandboxed Chromium | VP8/Opus WebM, 104 frames, 192×320, decoded audio 8.76 seconds, full FFmpeg decode without errors |
| CPU performance | About 38.1 seconds including speech/evaluation/render/encoding, Cycles CPU at 4 samples; not a full-resolution benchmark |
| Browser silence audio | RMS 0.0101 during the cameo, with Laundromat volume 0.4; speech and captions retained |

Inspected contact sheets from both videos: matching cuts and framing, complete goose/walker silhouettes, restored dialogue characters and captions. CPU at four samples is visibly noisy and has its already documented lighting/material differences; no pixel-identical or full-resolution performance claim. Outputs are retained in ignored `output/cameo-acceptance/`, not committed.

The GUI acceptance test edits character, motion, camera, duration, ambience mode/level and Off, removes/re-adds cameo rows, and round-trips JSON on both the local server and static build. It exports and decodes the hosted movie with Chromium's sandbox enabled.

## Automated coverage

- Full Node regression suite with Chromium unavailable and CPU samples set to 4: **221 passed, 1 skipped**.
- All four cameos, portrait/landscape, standing/walking, static/following: framing, precise camera motion, visibility restoration and deterministic seeking.
- Physical held-book state survives a focused cameo; independent background toggles and focus-only asset hash verification.
- Strict invalid settings/mixed row rejection, exact silent duration, portable-job integrity/round-trip.
- Deterministic ambience, quiet levels, ducking, fades, clipping headroom, music precedence, cancellation bounds and exact decoded voice sample placement/Off behavior.
- Production Cloudflare static build; no Node/Blender dependencies enter the client bundle.
- Existing single/batch recording, MP4→WebM fallback, untouched 1080×1920 export, GUI and music browser regressions with the Chromium sandbox forced on: **50 passed, 1 opt-in test skipped**. New local/hosted cameo GUI and actual export acceptance: **1 passed**.

Reproduce the new GUI/export acceptance:

```sh
node --test tests/cameo-ambience.browser.mjs
THEATRE_BROWSER=/unavailable-chromium THEATRE_CPU_SAMPLES=4 npm test
node bin/theatre.mjs render examples/awkward-cameo.json --backend blender-cpu --voice flite --preview
```

The CLI command uses the normal preview resolution, not the smaller measured acceptance resolution. Independent review identified a first-use walking-bounds computation during recording; the warm-up key now includes cameo behaviour so both standing and walking envelopes are prepared before the recording clock starts.
