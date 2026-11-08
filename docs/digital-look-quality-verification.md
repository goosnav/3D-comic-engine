# Digital cartoon and rendering quality verification

Tested locally on 2026-11-08. Controls live in **Export → Picture & sound**, immediately after Format. Standard and cartoon Off remain the defaults. Saved scripts, batch snapshots and portable local jobs carry the settings.

## Actual CPU comparison

Blender Cycles CPU rendered the existing v12 beady/regular-eye cast in the studio, with animated dialogue, Flite speech, captions and room ambience during a silent hold. Chromium was explicitly unavailable. `THEATRE_CPU_SAMPLES` was unset; each preset used its real sample budget. No denoising was enabled.

All three videos are **192 × 320, 12 fps, 13 frames, 1.083333 seconds**, H.264 with AAC audio. FFprobe checked dimensions, streams and frame counts; FFmpeg decoded each complete file. Audio mixes, caption overlays and evaluated animation matched across presets. Representative frame 3 visibly shows reduced noise at higher settings.

| Preset | Actual samples | Blender rendering | Whole export |
| --- | ---: | ---: | ---: |
| Standard | 8 | 6.79 s | 11.87 s |
| High | 64 | 50.68 s | 54.07 s |
| Ultra | 256 | 222.18 s | 225.79 s |

A fresh High + cartoon render also passed the same stream/frame/decode checks, using 64 samples and taking 85.46 seconds total while browser regression tests ran. Its caption overlay and audio mix matched the other variants. An earlier attempt received SIGTERM and retained its checkpoints; that interrupted attempt was not counted as a completed video.

These are small portrait acceptance renders, not full-resolution benchmarks. Other browser tests ran concurrently for part of the comparison, so timings include contention. Full-resolution exports can take substantially longer. Increased samples reduce noise; they do not add geometry or remove the documented CPU material/lighting approximations. Browser exports remain real-time and can drop frames under load; use local Blender CPU for deliberate offline rendering.

Local evidence (ignored generated output):

- `output/digital-quality-acceptance/cpu-comparison-report.json`
- `output/digital-quality-acceptance/{standard,high,ultra}-frame-000003.png`
- `output/digital-look/cartoon.png` — actual WebGL cartoon frame
- `output/digital-look/high-cartoon.webm` — hosted High cartoon export with video/audio

## Regression coverage

- Schema/default preservation, timeline round trips, deterministic CPU image treatment, caption/insert protection, encoding budgets, actual Blender settings and resume receipts.
- Sandboxed real WebGL renders for Standard, explicit Off, High, Ultra and cartoon. Deterministic seeking, unchanged framing and actionable GPU allocation failures.
- Controls in the local GUI and production website; settings survive JSON import/export and portable job download. Hosted High cartoon export is decoded and probed.
- Existing grade/dither, source inserts, cameo/ambience, missing/lost WebGL and loading-cleanup checks.

The optional shader is compiled out when cartoon is Off, retaining the original fragment workload. High and Ultra preserve supported multisample antialiasing while increasing scene buffers and shadow resolution.

GPU allocation checks clear stale error flags before testing a new renderer on a reused canvas. Existing encoder-start failure tests caught this edge case; both strict MP4 failure and MP4-to-WebM recovery now pass. A deliberately incomplete framebuffer still fails explicitly.

Full-size software-browser acceptance exposed an avoidable extra draw after the audio deadline. Recording now refreshes its audio-clock measurement after readback. The unchanged 1080 × 1920 default export then passed its existing duration bound (5.34 s decoded); a dedicated delayed-readback test guards against scheduling another expensive draw after the deadline. Real-time capture still has scheduling/encoding overhead, so frame-exact offline delivery belongs to local rendering.

Focused checks can be repeated with:

```sh
node --test tests/render-look.test.mjs tests/cpu-quality.test.mjs
node --test --test-concurrency=1 tests/digital-look.browser.mjs tests/digital-controls.browser.mjs
npm run build
```

The full Node suite passed with Chromium deliberately unavailable (233 passed, one skipped): `THEATRE_BROWSER=/unavailable-chromium THEATRE_CPU_SAMPLES=4 npm test`. That reduced sample override applies only to the regression suite; it was **unset** for the measurements above. Browser acceptance used Chromium's sandbox.

The reference-inspired effect uses image-based outlines, pixelation and limited shading. It does not reproduce separately drawn faces or change animation cadence. WebGL and CPU treatments are visually related, not pixel-identical. Captions are applied after the treatment; source inserts and endcards bypass it.
