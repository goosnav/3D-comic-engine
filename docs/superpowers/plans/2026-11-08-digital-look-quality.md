# Digital cartoon and rendering quality

User approved trying the reference-inspired digital look as a toggle and wants a much slower, better-quality rendering option, with controls in the app. Preserve Standard and cartoon Off as exact existing defaults; preserve unrelated local audio-security edits. No new deployment requested.

Design: independent top-level `cartoon:{enabled,pixelSize,outline,shades}` and `renderQuality:standard|high|ultra`. Cartoon is a deliberately pixelated, outlined, limited-shading screen-space treatment of the 3D stage. Pixel size is measured at a 1080px short edge and scales down to a minimum 1 pixel for previews; default 4, range 1–12. Outline 0–2, default1; shades 2–12, default5. Process before captions; source inserts/endcards remain intact. Existing models/timing reused; no new faces or motion stepping in this iteration.

Quality: Standard retains rendering. High/Ultra WebGL use 1.5x/2x offscreen scene sampling, 2048/4096 shadow maps and higher recording/encoding bitrate, bounded by actual GPU limits. No silent degradation: report failures/actionable lower quality. Blender CPU uses 8/64/256 samples, 12 bounces (preserving the actual existing Blender default), stronger encoding; no unavailable denoiser dependency. Explicit THEATRE_CPU_SAMPLES remains an override reported in diagnostics. High/Ultra spend real extra work but cannot manufacture new geometry. Browser recording remains real-time; the GUI explains local Blender CPU for long offline rendering. Saved JSON and portable jobs retain settings.

Independent domains: main owns contracts/timeline, pure rendering settings and image treatment, WebGL quality/style, UI/browser tests. CPU agent owns Blender Python, cpu-job/cpu-capture, CPU-specific tests. Both integrate through `src/render-settings.mjs` (`renderSettings(timeline)` returning `{quality,cpuSamples,bounces,scale,shadowSize,crf,preset,bitrateScale}`) and `src/digital-look.mjs` (`applyDigitalCartoon(ctx, options)` processing current canvas in-place only if enabled).

1. Baseline; failing schema/settings/pixel tests; implement shared settings and stage look.
2. CPU quality and postprocess with independent tests; preserve cancellation/resume identity.
3. WebGL internal supersampling and postprocessing; clear app controls/help and round-trip tests.
4. Real CPU Standard/High/Ultra and cartoon comparisons; real sandboxed browser renders/GUI/export; check unchanged framing, timing, captions, audio and dimensions. Document measured quality/cost.
5. Independent review and full regression/build. Preserve unrelated local edits. Do not claim untested fidelity or full-resolution performance.
