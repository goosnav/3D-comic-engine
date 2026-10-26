# Speech-only speed control

## Use

The editor now has **Speech speed (×)** beside the Voice selector. The default is
**1.15×**, approximately 15% faster than the previous voice pacing. Choose any
number from **0.5 to 2.0**. **1.0×** restores the previous pacing.

For scripts, set the optional top-level field:

```json
"speechRate": 1.25
```

Omitting the field uses 1.15. The field is saved in downloaded JSON, restored
with the editor draft, and retained by validation and the optional writer.
Each queued batch script uses its own value; changing the editor does not
change scripts already copied into the batch library or render queue.

## Timing and audio

This is not a video playback-rate control. Only spoken audio changes speed.

- Browser and desktop Flite use their native `duration_stretch` control. The
  original speaker-specific stretch is divided by `speechRate`; pitch targets
  and sample rates are unchanged.
- Local Kokoro receives the value through its native `speed` parameter.
- Desktop recordings use FFmpeg `atempo`, preserving pitch. Original recording
  files are not modified. Set 1.0 to retain their original tempo.
- The final voice samples are measured after synthesis/tempo processing, so
  mouth motion and caption timing follow the actual audio rather than guessed
  durations. Speed is approximate for synthesized speech.
- Gestures and the animation clock are not accelerated. Explicit action
  durations, pauses, reaction durations, end cards, frame rate, and background
  music are not scaled. The film can finish sooner because dialogue is shorter;
  actions later in the script then begin sooner but run at their normal speed.

Audio cache keys and receipts include the selected rate. Changing it cannot
silently reuse a take generated at another rate.

## Invalid inputs

The existing automatic JSON correction pass also handles `speechRate`: numeric
strings are converted, finite values are clamped to 0.5–2.0, and invalid values
fall back to 1.15. Every correction is recorded in Generator notes / `warnings`.
Repeated validation retains the correction history without duplicates.
Strict resolution (`{repair:false}`) rejects invalid rates instead.

## Verification

Run from the repository root:

```sh
node --test tests/speech-rate.test.mjs
node --test tests/speech-rate.browser.mjs
```

The browser test uses Chromium via Playwright. Set `THEATRE_CHROMIUM` to an
existing Chromium executable when not using Playwright's installed browser.
It loads the real editor markup and modules with isolated in-memory API/storage
fixtures; no local server, model download, or video export is required.

Verified for this change: eight Node tests and one Chromium editor test. Coverage
includes defaults/bounds, strict and repaired input, source-lock protection,
Flite duration parameters, Kokoro request validation, browser worker forwarding
and measured timings, unchanged action/gesture timing, actual FFmpeg recording
tempo/pitch and cache separation, and GUI import/edit/download/draft restoration.

Full repository tests, native Flite/Kokoro voice synthesis, and a complete MP4
render were not run in this environment. The browser worker test substitutes
known samples; the recording test runs actual FFmpeg on a generated test tone.
