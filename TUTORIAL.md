# From a comic to a conversation

3D Comic Engine is an on-device cutscene engine. You write a small JSON
script (or use the editor), select real comics, and let reusable code perform it.
The renderer never asks Codex, Claude or a paid API to animate. Local voice synthesis
is automatic after setup. Optional AI writing is a separate button/command.

## 1. Install on a new computer

For desktop you need **Node.js 22.12 or newer** and **FFmpeg with ffprobe on PATH**.
Flite speech requires no Python. Only optional Kokoro needs **Python 3.10–3.12**.
Windows, macOS and Linux use the same Node commands.
The implementation is tested on Linux; Windows/macOS setup is designed to be
portable but has not yet been exercised on those operating systems.

Clone `goosnav/3D-comic-engine`, then enter its root directory. Its `assets/` contains the character,
book, environment export and verified comic excerpts; there are no runtime links
to another checkout, a home directory, or archived models. Node packages,
browser binaries and optional voice weights are
installed once, not checked in.

```sh
npm ci
npm run setup:browser
node bin/theatre.mjs doctor
# Optional, only for higher-quality Kokoro speech:
# python tools/setup_voice.py
```

Use `python3` instead of `python` on machines where that is the Python command.
On Windows you can use `py -3.12 tools/setup_voice.py`. The setup creates `.venv`
inside this project and downloads the local voice model. It needs an internet
connection once. Subsequent renders use cached model files offline. If Linux
Chromium reports missing system libraries, install the dependencies listed by
Playwright (`npx playwright install-deps chromium` may require administrator rights).

To use an existing compatible Python environment, set `THEATRE_PYTHON` to its
Python executable. This is a local override, not a path saved in the source code.
`FFMPEG`, `FFPROBE` and `THEATRE_BROWSER` are optional executable overrides; normally
leave them unset. The project's pinned browser is the supported default.

**No speech model required:** default Flite runs locally from the installed WASM
package. You can also use recordings with `--voice recorded` (section 6).
`doctor` checks browser, assets and video tools; optional Kokoro setup is separate.

For the static website, open its HTTPS URL: no installation or backend needed.
Choose pages, write dialogue, validate and Generate. Single-video Generate uses
local Flite at the selected Video size; batch rendering uses the output settings
in each JSON. Keep the tab visible and the screen unlocked. Download
the video before closing the page; browser jobs are session-only. Draft JSON is
saved in browser storage when available, but download it for a durable backup.
An interrupted export can be restarted from the script, not resumed mid-recording.
For building/hosting your own static copy, see README.md.

## 2. Open the editor

```sh
npm start
```

The launcher opens the browser. If it cannot, open the printed loopback address, normally
`http://127.0.0.1:8777`. Keep the terminal open while jobs run. This is a local app,
not a public web service: do not expose its port to the internet. No account needed.

The **Start here** panel offers **Upload JSON**, a worked-example chooser, and
**Start blank**. Use an example to see a complete script in the form; use the blank
JSON download if you prefer writing in your own editor. Imports and examples are
checked before replacing your draft, and replacing authored work asks for confirmation.
The lower JSON section also has an upload control with the same behavior.

Choose a template, then open a **Page** dropdown and scroll through book order,
or use **Random comic** beside that row. Each click picks a different verified
comic without duplicating another selected page. It keeps your dialogue, title,
cast, scene, render seed and output settings, and updates references to the old
page. Review the retained dialogue against the new artwork before rendering.
If the script contains a physical page turn, only adjacent-spread replacements
are allowed. No alternative means the row's random button is unavailable.

Only selected pages show a preview, with printed/PDF page numbers and a stable ID.
Clicking the artwork does not leave the editor. The page-tour template supports
two or three pages: a blank tour starts with two empty page slots, and **+ Add page**
adds a third. New drafts include an empty dialogue row for each speaker. Fill them
in, then use **+ Add dialogue** as needed; speaker, emotion, gesture and shot are dropdowns.
You can still edit JSON directly. Validate, download a copy of your script, and
generate the video. The jobs area shows named loading stages and progress bars.
Percentages describe the current stage; an indeterminate bar means the stage's
remaining work cannot yet be measured. Browser downloads prefer compatible MP4,
with clearly labeled WebM fallback. Desktop downloads are MP4.
Use **Start blank** to begin another script in the currently selected template.
It clears selected pages, dialogue, JSON edits, cast, scene/seed, voice, music and
end-card customization, then provides empty dialogue rows for that template's cast.
Confirm discarding authored inputs, or Cancel to keep them. Finished downloads
and submitted jobs stay. If browser storage is unavailable, the editor warns you;
download JSON to preserve new work.

The character selectors distinguish the readers with clothes and accessories.
The end-card fields edit the closing title, supporting text, URL and
duration; disabling the card never removes dialogue.

The AI draft action is optional, requires explicit configuration (section 7), and
sends only the selected comic images and source packet to that configured provider.
It does not silently replace manual work or activate while rendering.

### Render several JSON scripts without opening them one by one

Open **Batch render JSON scripts** near the top of the app. **Add JSON files**
accepts a multiple-file selection. **Add folder** reads JSON files throughout the
chosen folder and its subfolders. Non-JSON files and CLI manifest arrays are
skipped, so you can choose the repository's `examples/` folder directly.
Alternatively, **Load page 1–25 scripts** adds the complete page set in order.

The **Script library** keeps imported scripts separate from the current editor.
Select any combination with the checkboxes, or click **Select all**. Files
uploaded through the editor also appear here; **Add current editor script**
adds an independent snapshot of a draft you have edited. Invalid files show their
validation error and cannot be selected. You can remove a file, fix its original
JSON, and add it again. The library and selection survive a page reload when
browser storage is available. Videos in browser mode are session-only.

Choose a **Batch voice**, then click **Render selected scripts to MP4**. Flite
works on device without a model download. Desktop also offers installed Kokoro
or recorded audio paths already specified in the JSON. Recorded paths follow
the desktop renderer's existing project-relative path rules; selecting a JSON
folder does not grant the browser access to separate audio files.

The queue copies the selected scripts and renders them sequentially. Each film
keeps its own scene, cast, pages, dialogue, acting instructions, output dimensions,
fps, seed and end card. Editing your draft afterward does not change the queue.
Missing fields receive the usual engine defaults. The single-video browser
preview preset and editor music attachment are not added to a batch.

You can leave the queue to finish without further render prompts. Each row shows
whether its script is waiting, rendering, completed, failed or cancelled. The
existing Jobs section also shows the current rendering stage. A failed item
does not stop later items. **Stop after current** lets the active video finish
and cancels the rest. At the end, **Download completed MP4s (.zip)** downloads all
successful videos together with unique numbered filenames; individual MP4 links
are available too. The ZIP contains the original MP4 bytes without recompression.

One batch accepts up to 100 scripts. Imported JSONs may be at most 2 MiB each;
the library holds up to 200 files / 32 MiB, subject to browser storage capacity.
If an archive would exceed the classic ZIP 4 GiB limit, download individual
MP4s or render a smaller selection.

For browser batches, keep the tab visible and your device awake until completion.
The app activates audio once for the entire queue. A browser without H.264/AAC
MP4 encoding is rejected before the queue starts; use the desktop app in that
case. Browser capture runs in real time and can drop frames on slow devices.
For exact per-frame capture, use desktop. Desktop processing continues through
a GUI reload while its server stays running. Restarting that server clears the
batch summary; completed desktop videos remain available in Jobs and on disk.

## 3. Choose a template

| Template ID | Comics | Speakers | Typical use |
| --- | --- | --- | --- |
| `book-duet` | Exactly 1 | `reader`, `friend` | A reading, disagreement, dry reaction |
| `fireside-reader` | Exactly 1 | `reader` | Solo commentary |
| `page-tour` | 2–3 | `reader`, `friend` | Compare several comics or build an argument |

The template provides cast, voice defaults and compatible staging. You do not need
to specify models, rigs, camera coordinates, lighting or frame numbers.

Book Two comic IDs run from `book2-001` through `book2-141`, corresponding to
printed pages 1 through 141. PDF pages are separate (printed page + 4).
The title, copyright and final blank pages are also available manually, but never
selected by the per-page random buttons. Examples with reviewed transcripts:

| ID | Printed page | Subject |
| --- | --- | --- |
| `book2-020` | 20 | Great men of history / cookies / postponed ambition |
| `book2-036` | 36 | The brain parasite's advice |
| `book2-095` | 95 | Repainting white walls eggshell versus ivory |

All 144 interior images are exact source JPEGs checked against the matching
embedded book pages. Only the three examples above have reviewed transcripts;
other pages say **not transcribed**, not an invented description. Look at the
selected image and write the reading yourself. See `assets/catalog.json` for
exact locators, hashes and provenance.

### Optional background music (website)

Choose an audio file under **Background music** before Generate. The engine uses
the beginning of the track, ends it with the film (or earlier if the file is short),
and keeps it quiet beneath the voices. No upload or paid service is involved.
Use a browser-supported MP3, WAV, M4A or Ogg file, at most 15 MiB and three minutes.
Clear the attachment to render without it. Reattach it after reloading: neither
the file nor its machine-specific path is stored in script JSON. Desktop music
attachment is not implemented; this control is only shown in website mode.

## 4. The smallest useful script

For complete editable inputs, start with **[templates/README.md](templates/README.md)**.
It explains every supported field and includes a blank duet, a worked duet with
reactions and facial controls, a solo reading with book actions, a three-page tour,
and a moon scene with compatible astronaut characters. All worked examples pass
the same production validation used by the GUI and CLI; the blank draft requires
your dialogue before it can render.

Save this as `my-script.json` in this folder:

```json
{
  "template": "book-duet",
  "title": "A Second Opinion",
  "comics": ["book2-036"],
  "lines": [
    {
      "speaker": "reader",
      "text": "My brain parasite says you're toxic.",
      "shot": "source"
    },
    {
      "speaker": "friend",
      "text": "That's a very convenient second opinion.",
      "emotion": "skeptical"
    }
  ]
}
```

```sh
node bin/theatre.mjs validate my-script.json
node bin/theatre.mjs render my-script.json --preview
node bin/theatre.mjs render my-script.json
```

`--preview` makes a complete small video at 12 fps, preserving aspect ratio
normally with a short edge up to 432 pixels and long edge up to 768.
Extreme custom ratios retain the minimum 128-pixel short edge. Normal output defaults
to Instagram Reels at 1080×1920/24 fps. Both include the same dialogue; preview never means “end card
only.” Speech is measured, so you do not enter a duration. Pauses and reactions
extend the episode rather than cutting words off.

The first line quotes the visible comic. The friend's line is fictional commentary,
not a new comic panel. Keep that distinction when writing your own episodes.

## 5. Optional acting controls

Add only the fields you need:

```json
{
  "speaker": "reader",
  "text": "He's known him longer.",
  "emotion": "dry",
  "gesture": "head_tilt",
  "face": {"brow_left": 0.1, "brow_right": 0.5, "eye_open": 0.7},
  "pause": 0.6,
  "reaction": {
    "actor": "friend",
    "at": "line_end",
    "emotion": "exasperated",
    "duration": 1
  }
}
```

- Emotions: `neutral`, `thoughtful`, `curious`, `skeptical`, `dry`, `pleased`,
  `concerned`, `exasperated`, `angry`, `furious`, `panicked`, `manic`,
  `cosmic_rage`, `brain_static`, `overclocked`. Omitted means neutral.
- Gestures: `none`, `explain`, `nod`, `head_tilt`, `shrug`, `page_glance`.
  Omitted means none, with restrained automatic talk/listening motion.
  For exaggeration: `arm_flail`, `fist_shake`, `double_point`, `despair`,
  `windmill`, `rubber_hose`. Try `shot: "two-shot"` for the big arm movements.
  These are bounded, repeatable caricatures, not physics or collision simulation.
  Put the book on the table before using arm gestures on its reader; the free
  partner can still gesture. Facial tags change the face, not the synthesized voice.
- Face: `brow_left`, `brow_right`, `mouth_curve` from -1 to 1; `eye_open` from 0
  to 1; `blink`: `auto`, `once`, `off`. Unspecified channels use the emotion preset.
  Audio still controls speech-mouth opening. These settings control the visible
  face, not guaranteed emotional TTS delivery.
- Reaction: the other actor, `line_start` or `line_end`, emotion, optional face/
  gesture, duration. A solo template has no listener, so omit reactions there.
- `pause`: seconds after the spoken line, default 0.4. A longer line-end reaction
  gets its full time. It is not cut short by a smaller pause.
- `shot`: `auto` (default), `speaker`, `two-shot`, `over-shoulder`, `book`, or
  `source`. Auto chooses a repeatable varied sequence using the seed, starting
  with both readers after the opening page coverage when appropriate. Explicit
  choices always win. `book` starts close to the real selected page and gently
  pushes in; `source` shows the unchanged page flat for maximum reading clarity.
  Each new comic gets up to five seconds of physical-book coverage **during**
  narration, not before it. Speech starts immediately unless you author a leading
  action. Coverage ends at the next comic, explicit shot, action, or end of
  dialogue; it never delays speech or covers the end card.

At the **top level** (alongside `template`, not inside a dialogue row), optional
clothing and end-card controls look like this:

```json
{
  "characters": {"reader":"blue", "friend":"rust"},
  "product": "book2",
  "endCard": {
    "enabled": true,
    "title": "Goosnav Book Two",
    "text": "A book of comics.",
    "url": "www.goosnav.shop",
    "seconds": 3
  }
}
```

Merge these fields into a complete script. Available variants: `blue`, `rust`,
`olive` have white eyes; `blue-beady`, `rust-beady`, `olive-beady` have small black
eyes without whites. You can mix the eye styles in one cast. Default readers wear
different colors. Accessory variants are `cowboy`, `glasses`, `crooked` (lopsided
tall hat), and `astronaut`; each also has a `-beady` version. Astronauts require
`moon-base` or `tv-studio`. With Template default, the engine selects a compatible
scene; an explicitly incompatible scene is rejected, not silently changed.
Book Two is the currently supported
product. Omitted end-card values use the example defaults. Title/text/URL limits
are 120/240/160 characters; duration is 1–12 seconds. The card is appended after
every spoken line and reaction. It uses the bundled Minecraft-style spinning-book
video, starting two seconds into the source clip, with a white early-web layout
and blue underlined Times-compatible URL. The clip is looped if needed and decoded
at exact requested times, including when resuming a render. No extra downscaling
or color quantization is applied. Original comic pages are not dithered. Fonts and
the video are bundled so another computer uses the same assets.

Mouth motion uses measured speech energy with smooth jaw/round/wide shapes and
onset/offset easing. It is not phoneme-accurate lip sync. Expressions blend in and
out instead of snapping; all evaluation remains seekable and deterministic.

For a deliberately absurd astronaut example, upload `examples/moon-reading.json`
or run `node bin/theatre.mjs render examples/moon-reading.json --preview`.
The opening quotes the selected comic; the moon setting and replies are invented
commentary, not additional panels or canon from the book.

Local Kokoro currently has stable reader/friend voices, not a reliable direct
“angry” or “sad” synthesis knob. Use punctuation, short phrase structure and pauses,
or supply a recorded take. Do not expect a facial tag to change the voice magically.

## 6. Multiple comics, scene variation, book actions and recordings

For `page-tour`, list 2–3 IDs and put a `comic` on the line where the subject changes:

```json
{
  "template": "page-tour",
  "title": "Ambition and Interior Decorating",
  "seed": 42,
  "comics": ["book2-020", "book2-095"],
  "lines": [
    {"speaker":"reader","comic":"book2-020","text":"He plans to define an era."},
    {"speaker":"friend","text":"After the cookies."},
    {"speaker":"reader","comic":"book2-095","text":"This one has already transformed his entire house."},
    {"speaker":"friend","text":"From white to white.","emotion":"dry"}
  ]
}
```

Lines inherit the last comic ID. Every selected comic needs a dialogue line, and
you cannot reference an undeclared comic. A change to a nonadjacent page is a
deliberate edit/source cut, not a fake continuous page flip.

`scene` may be `library`, `fireside`, `diner`, `basement`, `moon-base`, or
`tv-studio`, if compatible with the template. The four new settings are optional;
ordinary scripts still choose from their original default scenes. Astronauts
without an explicit scene choose from compatible settings. Omit `seed` for fresh variation; the chosen seed and all
defaults are saved in the run. Resume retains them. Randomness never changes the
words, comic IDs, voice identity or an explicitly specified reaction.

Optional action rows go in `lines` between spoken rows:

```json
{"action":"hold"}
```

Supported states: start table-open, unless the very first row is `open` (then
start closed). `hold` lifts an open book; `read` holds a silent reading beat;
`place` returns a held book to the table; `close` or `slam` closes a table-open
book; `open` reopens it. `turn` needs an explicit `comic` target on an adjacent
spread in the catalog. The
three starter excerpts are nonadjacent, so use subject cuts for them. Actions
accept optional `seconds` within 0.3–8. Invalid transitions are rejected before
rendering. Gestures that require the reader's occupied hands are rejected while
holding. **Experimental:** physical hand/finger contact is still subject to the
renderer review notes; do not assume every pose is production-approved.

Recorded audio:

```json
{"speaker":"reader","text":"Your performed line.","audio":"takes/reader.wav"}
```

Audio paths are relative to the input JSON file for CLI runs, and relative to this
project for GUI runs. No absolute paths or `../` escapes. Use WAV, FLAC, MP3, OGG
or M4A. In `--voice recorded` every spoken line needs audio; otherwise the run
fails clearly rather than silently synthesizing or inserting silence. With the
default local voice mode, individual supplied recordings override those lines.

## 7. Optional AI JSON producer

Copy `writer.example.json` to ignored `writer.local.json`. Set `model` to an
image-capable model installed on your own computer. The endpoint must be loopback
(127.0.0.1, localhost or ::1), with an OpenAI-compatible Chat Completions interface
supporting image attachments. Remote/paid provider URLs are rejected. No model
name is hardcoded, and no model is needed for ordinary JSON/GUI rendering.
Optional writing is a desktop feature; the static website has no model API.

```sh
node bin/theatre.mjs draft --template book-duet --seed 21 --out episode.json
node bin/theatre.mjs validate episode.json
node bin/theatre.mjs render episode.json
```

This first chooses source material from the reviewed catalog, then asks the writer
for dialogue about those exact pages. For an existing selection, use
`draft my-script.json --out episode.json`. The GUI exposes the same operation.

There is at most one repair of invalid JSON, never an open-ended animator-agent
loop. Cooldown/authentication errors leave the selection/manual script intact.
Output cannot silently select another comic/template/scene. Writer prose can still
be wrong: image/hash checks prove which source was used, **not the truth or humor
of every interpretation**. Review the page and dialogue before spending on or
publishing a campaign. No live paid writer call was required to test rendering.

Never put keys in an episode, a catalog, or a committed file. Optional writer usage
can cost money; ordinary manual/local-voice rendering does not call that API.

## 8. Outputs, errors, resume and multiple runs

Each run gets its own directory inside `output/`, containing resolved `script.json`,
`timeline.json`, measured `mix.wav`, segment receipts, status, and the full MP4.
The video name contains your title, a UTC timestamp and random run ID.

```sh
node bin/theatre.mjs status
node bin/theatre.mjs resume RUN_ID
```

You may launch multiple commands or GUI runs. They queue in independent run
directories; this version limits production to one active worker per project to
avoid exhausting CPU/GPU memory. It does not coordinate with a separately running
Ad Studio Blender controller. Run this experiment on a dedicated worker while
testing, or wait for the other renderer to finish.

Failed captures preserve verified five-second segments. Resume checks their input
hashes before reuse; changed code/audio invalidates stale segments. Never edit a
running run's files. Edit your source JSON and start a new run instead.

The app does **not upload or publish** experimental videos. Success means a complete
local MP4 passed technical checks, not owner approval or measured sales performance.
Google Drive integration remains separate future work. No source ZIP is uploaded.

Common fixes: `npm ci` for packages; `npm run setup:browser` for the pinned browser;
voice setup for missing local weights; restore/review assets for a hash mismatch;
use a compatible template/page count for validation errors. Do not bypass source
verification to get around an asset mismatch.

## 9. How source consistency works—and how to add a comic

One stable comic ID connects: selected-page preview → source packet → selected
JSON → writer image → book page → source insert → final receipt. PDF hash, PDF page,
printed page and image hash are recorded separately so similarly named editions
cannot be silently mixed. Rendering verifies actual bytes, not filenames alone,
including the JPEG embedded in the physical book GLB. A render serves a frozen
snapshot of verified assets so a mid-render file edit cannot swap its source.

The full supplied Book Two interior is already included. To reimport its exact
bytes from an explicit canonical asset checkout, run:

```sh
node tools/import-book-pages.mjs /path/to/goosnav-3D-assets
npm run verify:assets
```

That path is a development-time input, never a runtime dependency. The importer
checks the edition PDF hash, manifest order, existing image hashes and embedded
book mapping before writing. It preserves reviewed annotations; it does not OCR
or invent transcripts. `verified` means source/page identity, not transcript review.

To extend the reviewed annotations or add a different edition, this is a development/content-curation
step, not something an AI writer can do during a run:

1. Locate the exact supplied edition and its provenance. Never infer membership
   from a file date or an older openable book model.
2. Copy its unchanged page image into `assets/comics/`; do not generate replacement
   canonical art or alter text. Inspect the image yourself and correct its transcript.
3. Add a unique ID, title, relative path, SHA-256, PDF/printed page numbers, transcript
   and factual observations to `assets/catalog.json`. Keep the edition binding.
   If using a different edition, create/review a matching book adapter/catalog
   rather than attaching arbitrary art to the existing book's page indices.
4. Confirm the book GLB contains the matching image at that page. Inspect a rendered
   book shot and source insert. A matching metadata field alone is not sufficient.
5. Mark it verified only after those checks. Run `npm run verify:assets`, tests and
   a real preview. Commit the image and catalog together with a review note.

Saved scripts contain a `sourceLock`; changing the selection means intentionally
reselecting/reviewing the new page. If manually editing JSON, remove the old
`sourceLock` only when making that deliberate new selection, then validate again.
Do not remove it from an existing run to bypass detection of changed assets.

## 10. The best way to get a good episode

Show/read something specific from the comic; give the two readers different wants
or interpretations; let one short reply or reaction land. Use `shot: source` while
reading text the viewer needs to see. Facial cues should underline dialogue that
already makes sense. Avoid depending on a complex prop maneuver to explain the joke.

The repeatable engine can remove production drudgery; it cannot prove a script is
funny or persuasive. Keep good scripts, voice takes and reviewed performance
presets as reusable examples. The card-hand format is recorded in
`DEV/history/V2_CARD_GAME.md`; card selection/animation is not implemented in v1.
