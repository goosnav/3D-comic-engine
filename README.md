# 3D Comic Engine

**JSON → performed comic conversation → video, entirely on your device.**

An independent application, extracted from Comic Theatre. No Ad Studio checkout,
cloud container, paid API, account or AI writer is required. Write the dialogue
yourself in JSON or the GUI. Code controls faces, gestures, book actions, camera
shots and timing. The desktop and browser share the same animation engine.

## Choose how to run

| Mode | Requirements | Speech and export |
| --- | --- | --- |
| Desktop GUI / CLI | Node 22.12+, FFmpeg + ffprobe, Chromium and/or Blender | Free Flite by default; optional Kokoro or recordings; verified MP4 |
| Static website | Modern browser with WebGL2, WASM, Web Audio and MediaRecorder | Free Flite on device; single and batch exports prefer H.264/AAC MP4 and support WebM fallback |

Browser mode needs **no local server installation**. Hosting only serves static
files. Keep the tab visible and phone unlocked during recording; interruptions
fail visibly and your JSON remains available for retry. Download videos before
closing the page. Slow devices can drop frames. Use desktop for long/bulk or
frame-exact high-resolution rendering.

The browser's spinning-book end card uses frames extracted from the original
video, not autoplay. It needs no video playback permission or extra tap. Desktop
exports retain the full-resolution original video.

## Offline CPU fallback

```sh
npm ci --no-audit --no-fund
# Install Blender 4.x, FFmpeg and ffprobe on PATH, then:
node bin/theatre.mjs render examples/parasite.json --backend blender-cpu --json
npm start
```

The CPU CLI needs no Chromium, WebGL, display or loopback server. `npm start`
launches the local browser GUI, which can also select Blender CPU. Hosted pages
cannot launch Blender; download a portable render job for a matching local clone.
[Capability matrix, setup, format, recovery and fidelity limits](DEV/CPU_RENDERING.md).
No pixel-identical output or full-resolution performance is promised.

## Desktop quick start

Clone this repository, install Node and FFmpeg, then run:

```sh
npm ci --no-audit --no-fund
npm run setup:browser
node bin/theatre.mjs doctor
npm start
```

Or use the OS script in **launchers/**: Linux shell, macOS command, Windows
PowerShell/cmd. First launch sets up pinned Node packages and Chromium if needed,
checks tools, then opens the loopback GUI. Keep the terminal open.

Flite works immediately after setup, with no Python or voice model download.
Optional higher-quality local voice: Python 3.10–3.12,
`python tools/setup_voice.py`, then select Kokoro. No voice service charges.

## Batch JSON → MP4 in the app

Use **Batch render JSON scripts** near the top of the app:

1. Choose **Add JSON files** to select several files, **Add folder** to include the
   JSONs in a folder and its subfolders.
2. Select scripts from the **Script library**, or use **Select all**. Scripts
   uploaded into the editor are also kept in this library. **Add current editor
   script** saves a separate copy of your current draft for batch selection.
3. Click **Render selected scripts to MP4** once. The app renders each selection
   in order, generates speech, and exports its MP4 automatically.
4. Click **Download completed MP4s (.zip)** for one download containing the separate
   videos. Individual MP4 download links are also available as jobs finish.

Each queued script is copied before rendering. Its dialogue, page/source locks,
scene, character choices, seed, performance instructions, timing, end card, and
**output width, height and fps** go through the production renderer unchanged.
Omitted settings use the engine's normal defaults. Batch export does not apply
the browser editor's attached music. Single exports also honor the selected video size.
Files with the same name get distinct numbered MP4 filenames.

Invalid JSONs stay visible with an explanation and are excluded from selection.
CLI batch-manifest arrays are skipped when importing a folder. A render failure
is reported beside that script; the queue continues with the remaining scripts,
and the ZIP contains the completed videos. **Stop after current** finishes the
active video and cancels the waiting items. Up to 100 scripts can be selected per
batch, with a 2 MiB limit per imported JSON.

The script library is saved in browser storage when available; a visible warning
appears if storage is full or unavailable. Keep the source JSONs as your backup.
Desktop batches continue through a GUI refresh while the local server stays
running; batch summaries last for that server session and rendered jobs remain
on disk. Browser batches run in the open, visible tab, use one audio activation
for the whole queue, and prefer H.264/AAC MP4 with supported WebM fallback.
The download extension and MIME type identify the actual format. Download browser
videos before closing or reloading the tab. If WebGL is unavailable, editing and
validation remain available: use **Download local render job** and the local CLI.


## Automation

```sh
node bin/theatre.mjs render examples/parasite.json --preview --json
node bin/theatre.mjs select page-tour --seed 42 --out my-script.json
node bin/theatre.mjs chaos --seed 42 --intensity unhinged --out chaos.json
node bin/theatre.mjs validate my-script.json --json
node bin/theatre.mjs batch examples/batch.json --preview --json
node bin/theatre.mjs status --json
node bin/theatre.mjs resume RUN_ID --json
```

See **[CLI.txt](CLI.txt)** for manifest format, exit codes and output directories.
The default is Instagram Reels, 1080×1920 (9:16) at 24 fps. The Video size control
also offers portrait 1080×1350 (4:5), landscape 1920×1080 (16:9), square
1080×1080, and custom dimensions. CLI previews preserve the aspect ratio at
12 fps, normally with the short edge up to 432 px and the long edge up to 768 px.
Extreme custom ratios retain at least 128 pixels on the short edge.
Measured dialogue and reactions determine duration. Preview retains the whole film.
One job runs at a time within a shared output queue; independent output roots can
run independently when your hardware can handle it.

## Static website / Cloudflare

```sh
npm ci --no-audit --no-fund
npm run build
```

Publish **dist/** as static files. Cloudflare Pages: build command
`npm run build`, output directory `dist`; no functions or paid bindings.
The included `wrangler.jsonc` also describes an assets-only Worker deployment.
No deployment or paid Cloudflare resource is created by building the app.

The build refuses unrelated files already in its output folder so private leftovers
cannot accidentally be published. Preserve those files elsewhere, or build to a
new empty directory with `node tools/build-web.mjs --out-dir public-site`.

To test locally: `python3 -m http.server 8080 --directory dist --bind 127.0.0.1`,
then visit localhost:8080. Static files must be served over HTTPS or localhost;
opening index.html via file:// is unsupported. Downloads during setup/build are
free dependency downloads; rendering does not contact external services.

## Authoring and assets

**[Step-by-step JSON and GUI tutorial](TUTORIAL.md)**

- Start at the top of the editor: upload your JSON, load a worked example, or start a blank script with dialogue fields ready to fill in. JSON upload is also available beside the JSON editor.
- Each selected page has its own **Random comic** button. It picks a different verified comic, keeps your words and settings, and updates that page's script references. Physical page turns limit the choices to compatible spreads.
- **[JSON templates and complete field reference](templates/README.md)**: an editable blank duet plus four runnable examples covering a duet, a solo reading, a multi-page tour, and astronauts on the moon.
- Three templates: book duet, solo fireside reader, and multi-page tour.
- All 141 numbered Book Two pages, plus title/copyright/blank interiors, in book order.
- Native page selectors and previews only for selected pages; random selection uses comics, not frontmatter.
- Exact page hashes throughout. Three reviewed transcripts; other pages are explicitly not transcribed.
- Six clothing/eye variants (blue/rust/olive; white or beady eyes).
- Emotions, mouth motion, listening reactions and reusable book-animation rails.
- Static cameras with close-up, medium, wide, extremely wide, and physical book shots.
- Character-colored phrase captions, enabled by default, with top/bottom placement.
- Jerky gestures, rocket punches, explosions, flattening, nose removal, head spins, and walk-offs.
- Garry's Mod-style stunts: T-pose glide, ragdoll, noclip, big head, prop jitter, helicopter, goose chase.
- Comic cast: Little Billy (spinning propeller cap) and the gooby-hat guy as castable characters.
- Background cameos: an orange-billed goose, Glove Bot, the two-legged walker and the shoe-hat creature.
- Colour grading: a slightly drab `muted` look by default, plus `film` and `vivid`; page inserts stay exact.
- Ordered dither over picture, captions and end card for a slightly crunchy digital look (`subtle`, `crunchy`, `off`).
- Automatic chaos scripts from a seed (`chaos` command / **Generate chaos script** button), no AI.
- Editable retro end card using the actual spinning-book video.
- Exact source hashes and embedded-book page checks; no silent page substitutions.
- Optional local image-capable writer; remote providers are rejected.
- Named loading stages and real stage progress bars; unknown-duration work stays indeterminate.
- Browser-only optional background music from your device, quietly mixed from the track's beginning.

Start with `templates/book-duet.example.json` for a fully worked input, or
`templates/blank-book-duet.json` to write your own dialogue. The blank file is an
authoring draft: fill its empty spoken lines before validation or rendering.

```sh
node bin/theatre.mjs validate templates/book-duet.example.json --json
node bin/theatre.mjs render templates/book-duet.example.json --preview --json
```

Browser MP4 requires an H.264/AAC encoder. Single and batch exports can fall
back to correctly labeled WebM. Local exports use FFmpeg to produce actual MP4.
Browser background music accepts supported audio up to 15 MiB and three minutes.
Music is embedded in portable render jobs, but not ordinary script JSON.

Creative snapshots live in assets/, with editable originals already published in
Goosnav-3D-assets. No archived model paths or sibling checkout is required.
See [NOTICES.md](NOTICES.md) for provenance and artwork rights.

## Development and limits

```sh
npm test
npm run test:browser
npm run verify:assets
```

[Design](DEV/DESIGN.md) · [Implementation plan](DEV/IMPLEMENTATION_PLAN.md) ·
[Verification](DEV/VERIFICATION.md) · [Directory guide](DEV/README.md)

Desktop renders use the GPU (Vulkan) when headless Chromium can reach it, and
fall back through software Chromium to offline Blender CPU automatically (`THEATRE_GPU=0` forces software).
Frames are captured with Chromium's fast screenshot path. On the development
machine (Intel HD 530) a 1080×1920 frame renders in about 20 ms, against about
600 ms in software. The `--grade` and `--dither` options on `render` and `batch`
override a script's look without editing it.

Linux/Chromium is the development test platform. macOS/Windows launchers and
Safari/physical phones require native-device validation; supplying launchers is
not proof of testing there. GPU outputs need not be byte-identical across devices.
Acting, natural finger contact, humor and sales effectiveness are not guaranteed.
This app produces local files; it does not publish or upload to Google Drive.

Character gaze is editable for each beat: automatic, partner, away, book, ceiling,
or camera. Actions include slam, throw, punch, explode, flatten, nose removal,
head spinning, head jerking, and walking away. Punches, throws and explosions
leave the frame without returning during that beat. The next beat can restore
the cast with a hard cut. Motion is deterministic rather than a collision simulation.
Try `examples/chaotic-comedy.json` for the new actions and captions; its dialogue
is invented commentary.
The corrected hats, glasses and folding book are bundled GLBs; editable Blender
sources and rebuild scripts are saved in the companion `goosnav-3D-assets` library.

The scene selector also includes **Meridian — Space Platform**, **Black Pyramids — Sunset Desert**, **Red Mesas — Canyon Overlook**, **Backrooms — The Rooms Beyond**, and **Starter Overgrown Courtyard**, adapted from the active 3D asset library. Astronaut variants now have glass helmets and the original nose pressed against the glass. Try [cursor-chaos.json](examples/cursor-chaos.json) for nose touching, high fives, handshakes, erratic dancing, and tracked ascent. Partner actions use `actor` and `target`; ascent makes the target watch the actor rise out of frame. Wild limbs jump at 24 Hz, deliberately overextend, and continue until the cut.
