# Browser production follow-up

## Requested outcome

Keep the shared, free, on-device engine. Repair the phone end-card startup failure; make the editor a simple **3D Comic Engine** interface based on Goosnav Labs HQ; expose the complete supplied Book Two interior with selected-page previews; retain deterministic JSON and provenance. No paid service, server rendering, replacement artwork, or mandatory AI.

## Implementation plan

- [x] Investigate end-card loading with WebKit and reproduce metadata-only decoder startup at the media boundary. Add regression tests before changing the owned video loader; preserve absolute seeks, disposal and bounded failures. Give scene loading named progress stages. Physical iPhone confirmation remains outstanding as explained below.
- [x] Import exact supplied-edition page JPEGs with hashes and page identities. Preserve the three existing IDs/transcripts. Do not manufacture transcripts for other pages. Test every page against the book GLB. Verify only selected assets for browser jobs while retaining full audit mode.
- [x] Replace the thumbnail wall with ordered native page selectors, add/remove rows within template limits, and selected-only non-navigating previews. Use emotion/gesture enums as dropdowns. Preserve imported JSON, stale-lock rejection and editor revision guards.
- [x] Apply the existing HQ white/black, Helvetica/Times, squared-rule layout with small red/blue/green/yellow accents. Keep native accessible controls, mobile touch targets, and plus-and-text add buttons.
- [x] Carry structured progress through the backend to the GUI. Show measured stage percentages and indeterminate bars for unknown-duration work, not invented total-time percentages.
- [x] Prefer browser-supported MP4, fall back honestly to WebM if an encoder cannot start. Preserve actual file MIME/extension, dialogue timing and complete final frames. Desktop remains MP4.
- [x] Add optional local background music after core stability. Bound file/decode memory, trim to film length, and mix quietly beneath speech without uploading it.
- [x] Run unit, GUI, full capture and static-build tests; inspect a narrow viewport and rendered frames. Document what is and is not tested on actual phones. Review before publishing code. See VERIFICATION.md for the full-suite result and corrected-fixture rerun.

## Interfaces and ownership

`verifyAssetCatalog(catalog, {script, onProgress, signal, ...})` uses a resolved script to select render assets. Omit `script` for a full audit. The returned catalog retains metadata and owns verified blob URLs until disposed.

Progress callbacks retain `(message, {phase, progress, message})`, with `progress` in 0–1 or null for indeterminate work. Jobs carry `progressDetail` plus a legacy text `progress`. Percentages describe the current stage, not a misleading overall ETA.

The GUI uses the shared `EMOTIONS` and `GESTURES` contracts. Browser-only attachments must not introduce machine-specific paths into portable JSON.

## Review focus

Mobile metadata-only video loading; cancelled pending loads; full catalog without downloading every preview; multi-page source-lock preservation; a claimed MP4 encoder that cannot allocate; readable controls at phone widths; actual final-frame/audio integrity, not just successful file creation.

## Mobile investigation and implemented defenses

The user reported iPhone Chrome. The original loader gave download and paused
decoder startup one combined eight-second deadline. It never requested playback,
and copied the already verified browser video blob into another blob. A controlled
media-boundary regression reproduces the exact timeout when preload stops at
metadata; it now passes with muted, inline playback priming, followed by pausing
for deterministic seeks. Download and first-frame decode now have separate,
cancellable 30-second bounds. Seek waits remain bounded at eight seconds. Errors
include readyState, networkState, duration and media-error code.

This is **not a confirmed physical-iPhone reproduction**. Installed Linux WebKit
loads but fails seeking through its GStreamer stack (missing h264parse / invalid
packet errors), and lacks MediaRecorder in this environment. That result cannot
certify iOS. Reference: [WebKit's documented muted inline video policy](https://webkit.org/blog/6784/new-video-policies-for-ios/).

Browser jobs use a baseline-H.264 432×540 derivative of the same spinning-book
video, matching the already-existing browser export preset. It is about 3.2 MiB
instead of 9.5 MiB, with shorter keyframe spacing; desktop keeps the unchanged
1080×1350 original. Source/derivative hashes are in the catalog. Reproduction:

```sh
ffmpeg -nostdin -i assets/book2-item.mp4 -an -vf scale=432:540:flags=lanczos \
  -c:v libx264 -profile:v baseline -level:v 3.1 -pix_fmt yuv420p -crf 18 \
  -preset medium -g 12 -movflags +faststart assets/book2-item-browser.mp4
```

After regeneration, inspect and update its catalog hash explicitly; encoder
version differences may change bytes. Do not overwrite the canonical original.

## Export format and review repair

Prefer explicit H.264/AAC MP4. A real test showed that generic `video/mp4` can
select VP9/Opus, which is not the intended conventional-player compatibility;
that candidate was removed. Unsupported browsers honestly fall back to WebM.
Encoder construction, synchronous start failures and asynchronous errors before
the start event advance to the next supported codec. Each failed attempt releases
tracks/resources and restarts the entire script with a new recording clock.
It never appends the tail of a failed attempt or drops the first dialogue lines.
Post-start device/recording errors remain visible failures rather than unbounded
retry loops. [Capability probing is advisory, not an allocation guarantee](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static).

## Music attachment

Website attachments are File/Blob objects outside portable JSON. Metadata bounds
precede decode; the source must be at most 15 MiB, 180 seconds, stereo and 64 MiB
decoded PCM. The first portion is copied up to the film's length, without looping
or padding. Peaks are attenuated to at most .08 and never amplified. Native audio
decoding cannot be forcibly cancelled; aborted work is detached and late results
cannot continue the export. A real static-GUI export test measures an attached
tone during the end card to detect an attachment silently ignored by the mixer.
