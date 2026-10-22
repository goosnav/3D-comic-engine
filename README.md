# 3D Comic Engine

**JSON → performed comic conversation → video, entirely on your device.**

An independent application, extracted from Comic Theatre. No Ad Studio checkout,
cloud container, paid API, account or AI writer is required. Write the dialogue
yourself in JSON or the GUI. Code controls faces, gestures, book actions, camera
shots and timing. The desktop and browser share the same animation engine.

## Choose how to run

| Mode | Requirements | Speech and export |
| --- | --- | --- |
| Desktop GUI / CLI | Node 22.12+, FFmpeg + ffprobe, installed Chromium | Free Flite by default; optional Kokoro or recordings; verified MP4 |
| Static website | Modern browser with WebGL2, WASM, Web Audio and MediaRecorder | Free Flite on device; H.264/AAC MP4 preferred, WebM fallback; lower-resolution real-time capture |

Browser mode needs **no local server installation**. Hosting only serves static
files. Keep the tab visible and phone unlocked during recording; interruptions
fail visibly and your JSON remains available for retry. Download videos before
closing the page. Slow devices can drop frames. Use desktop for long/bulk or
frame-exact high-resolution rendering.

The browser's spinning-book end card uses frames extracted from the original
video, not autoplay. It needs no video playback permission or extra tap. Desktop
exports retain the full-resolution original video.

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

## Automation

```sh
node bin/theatre.mjs render examples/parasite.json --preview --json
node bin/theatre.mjs select page-tour --seed 42 --out my-script.json
node bin/theatre.mjs validate my-script.json --json
node bin/theatre.mjs batch examples/batch.json --preview --json
node bin/theatre.mjs status --json
node bin/theatre.mjs resume RUN_ID --json
```

See **[CLI.txt](CLI.txt)** for manifest format, exit codes and output directories.
Desktop default is 1080×1350 / 24 fps; preview is 432×540 / 12 fps.
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

- Three templates: book duet, solo fireside reader, and multi-page tour.
- All 141 numbered Book Two pages, plus title/copyright/blank interiors, in book order.
- Native page selectors and previews only for selected pages; random selection uses comics, not frontmatter.
- Exact page hashes throughout. Three reviewed transcripts; other pages are explicitly not transcribed.
- Six clothing/eye variants (blue/rust/olive; white or beady eyes).
- Emotions, mouth motion, listening reactions and reusable book-animation rails.
- Seeded camera compositions, including both readers and physical page close-ups.
- Editable retro end card using the actual spinning-book video.
- Exact source hashes and embedded-book page checks; no silent page substitutions.
- Optional local image-capable writer; remote providers are rejected.
- Named loading stages and real stage progress bars; unknown-duration work stays indeterminate.
- Browser-only optional background music from your device, quietly mixed from the track's beginning.

MP4 requires the browser to expose an H.264/AAC encoder. A generic MP4 container
with unusual codecs is not substituted. Where compatible encoding is unavailable,
the download is clearly labeled WebM; desktop always exports MP4. Browser background
music accepts supported audio files up to 15 MiB and three minutes, uses only the
part that fits the film, and never uploads the file. Attachments are session-only
and are not embedded in portable JSON.

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

Linux/Chromium is the development test platform. macOS/Windows launchers and
Safari/physical phones require native-device validation; supplying launchers is
not proof of testing there. GPU outputs need not be byte-identical across devices.
Acting, natural finger contact, humor and sales effectiveness are not guaranteed.
This app produces local files; it does not publish or upload to Google Drive.
