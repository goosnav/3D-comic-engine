# Desktop source launchers

Install Node 22.12 or newer with npm from https://nodejs.org/ and install FFmpeg
including `ffprobe`. Both FFmpeg executables must be on PATH. You can instead set
`FFMPEG` and `FFPROBE` to their full executable paths. Node/npm are prerequisites;
setup installs the project's npm dependencies, not Node itself.

- Linux: run `./launchers/start-linux.sh` from a terminal.
- macOS: open `launchers/start-macos.command`, or run it from Terminal.
- Windows: open `launchers/start-windows.cmd`, or run
  `powershell -NoProfile -ExecutionPolicy Bypass -File launchers/start-windows.ps1`.

Each launcher finds its own checkout, runs `node tools/setup.mjs`, then starts the
GUI and opens the local URL in your default browser. Keep its terminal open.
Forward CLI options such as `--port 0` (an available port), `--no-open`, or
`--output-dir "my films"` after the launcher name. Relative output paths in launchers
are relative to the checkout; direct CLI paths are relative to your current directory.

The first setup needs internet to run `npm ci` and download Playwright Chromium.
Later launches reuse the installation, checking prerequisites and whether the lockfile
or Node major version changed. Failed setup exits nonzero and never starts the GUI.
Run `node tools/setup.mjs --check` for a check without downloads. Setup does not install
Python, Kokoro models, paid services, or request administrator access. On Linux,
missing Chromium system libraries must be installed through your normal package
manager; setup reports Chromium's error. `THEATRE_BROWSER` can select an existing
compatible Chromium executable. The Windows wrapper bypasses execution policy only
for its own PowerShell process; it does not change machine policy.

If the default browser cannot open, the terminal prints a local URL to open manually.
On Linux a desktop browser opener (`xdg-open`) is normally provided by the desktop.
Terminal-free native installers are not supplied. Shell behavior is tested on Linux;
macOS and Windows native launcher testing must be recorded separately.

## Automation

`node bin/theatre.mjs --help` documents every command. For example:

```sh
node bin/theatre.mjs render examples/fireside.json --output-dir films --json
node bin/theatre.mjs batch batch.json --output-dir films --json
node bin/theatre.mjs status --output-dir films --json
node bin/theatre.mjs resume RUN_ID --output-dir films --json
```

A batch manifest is an array of 1–100 items:

```json
[
  {"input": "scripts/first.json"},
  {"input": "scripts/second.json", "voice": "recorded"},
  {"input": "scripts/third.json", "voice": "kokoro"}
]
```

Script paths must stay beneath the manifest directory, including after symlink
resolution. Recorded audio resolves relative to each input script. `voice` defaults
to `flite`; a batch-wide `--voice` provides a default and per-item `voice` overrides it.
Scripts are limited to 256000 bytes, manifests to 1 MiB. Jobs run sequentially with
the existing production locks, 600-second episode bound, subprocess deadlines and
verified checkpoints. Every item gets a result; invalid items and production errors
do not stop later items. Batch output contains `ok`, `succeeded`, `failed`, and
`results`; successful entries contain the full `job`, failed entries an `error`
and, if created, their job `id`. Completed films remain in the selected output folder.

`--json` writes one JSON result to stdout; progress and diagnostics go to stderr.
Exit 0 means success, 1 means runtime failure or any failed batch entry, and 2 means
invalid CLI syntax, single input JSON/contract, or top-level manifest. Ctrl+C normally
exits 130; interrupted jobs can be resumed from verified checkpoints. GUI JSON emits
its local URL once when ready and remains running until stopped.

Flite is bundled, free speech with no model download. Recorded takes and explicitly
selected Kokoro remain supported. Install optional Kokoro separately with
`python tools/setup_voice.py`; ordinary Flite rendering needs no Python.
