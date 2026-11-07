# General scene verification — 2026-11-07

Fresh projects use Conversation, v12 beady/regular eyes, studio, no book and no
endcard. Greeting and Button demo are additional ready-to-render presets.

## Automated checks

- `npm test`: 209 tests, 208 passed, one existing integration skip, zero failures.
- `THEATRE_GPU=0 node --test --test-concurrency=1 tests/general-scenes.browser.mjs tests/gui.browser.mjs tests/polish-gui.browser.mjs tests/redesign-gui.browser.mjs`: 57 tests, 55 passed, two opt-in integration skips, zero failures.
- `THEATRE_GPU=0 node --test --test-concurrency=1 tests/batch-gui.browser.mjs tests/static.browser.mjs tests/workspace.browser.mjs`: all 12 passed. Includes a real legacy book export with speech, music and endcard, plus batch recovery/selection checks.
- `npm run build`, `node bin/theatre.mjs assets --json`, `git diff --check`: passed.
- Independent code review: fixes verified for silent reaction boundaries, preservation of authored pages, short-character reach and both actors' button framing.

Focused tests cover empty/omitted/whitespace text, no rows, mixed speech/silence,
recording-only timing, explicit pauses and listener reactions, real v12 jaw motion,
book-free asset loading, deterministic button motion, wrist contact and portrait
framing for either actor, including Little Billy on a support.

## Actual outputs

A fresh static GUI session clicked Next, Next, Render without entering anything.
It downloaded a playable 1080×1920 WebM with an audio stream and no book GLB fetch.
The authored timeline is four seconds (two seconds per actor); native browser
recording adds wall-clock padding. The acceptance check allows 4–5.5 seconds.

A spoken conversation was rendered through Chromium software WebGL and Blender
CPU. Both MP4s have H.264 video, AAC audio, 40 frames, 240×320 pixels at 12 fps,
and 3.333 seconds duration. Frames show the authored v12 jaw and visible captions.
The WebGL audio peak was 25520/32768. Audio/video stream durations differ by less
than 1 ms. FFmpeg decoded each entire file without errors.

All CPU runs explicitly set `THEATRE_BROWSER=/unavailable-chromium`,
`THEATRE_CPU_SAMPLES=4` and `--backend blender-cpu`. These are low-resolution
acceptance samples, not full-resolution quality or speed benchmarks. Four Cycles
samples produce visible grain; CPU lighting/material differences remain as
documented in [CPU_RENDERING.md](CPU_RENDERING.md).

| CPU scene | Frames | Video duration | Job wall time |
| --- | ---: | ---: | ---: |
| Conversation, speech/captions | 40 | 3.333 s | 26.6 s |
| Button interaction | 53 | 4.417 s | 43.8 s |
| Greeting/high five | 53 | 4.417 s | 24.4 s |

Times include evaluation and encoding; some runs overlapped other tests. The
button and greeting files have silent AAC tracks, as intended. Their audio/video
durations differ by less than 1 ms. Full-file decoding and frame inspection passed.

Local proof files (ignored output artifacts):

- `output/general-scenes/untouched-default.webm`
- `output/general-scenes/conversation-webgl.mp4`
- `output/general-scenes/conversation-cpu.mp4`
- `output/general-scenes/button-cpu.mp4`
- `output/general-scenes/greeting-cpu.mp4`

## Use

```sh
npm start
node bin/theatre.mjs render templates/conversation.example.json --preview
node bin/theatre.mjs render templates/button-demo.example.json --backend blender-cpu --preview
```

Existing drafts are restored. Use New and select Conversation to see the new
startup defaults. Existing book scripts keep their prior model/source behavior.
Book-free presets currently offer studio, library and fireside. The button prop
is staged beside the acting character at cuts; actions remain deterministic
cartoon choreography, not physics simulation. v12 has no visible authored brows,
so brow channels do not add replacement eyebrow artwork. Other face/mouth, gaze
and gesture controls continue to use the existing evaluator.

No asset-library files were modified. Existing local audio-security changes were
preserved. At the time of these checks, this work had not been pushed or deployed.
