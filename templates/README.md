# JSON authoring templates

Start with `blank-book-duet.json` to write your own dialogue, or copy a worked
example to see a complete input. These are ordinary input JSON files for both the
web editor and the CLI. They need no writer model or paid API.

| File | Format | Demonstrates |
| --- | --- | --- |
| [`blank-book-duet.json`](blank-book-duet.json) | One comic, two readers | An editable draft with empty dialogue, a selected source, and explicit settings. |
| [`book-duet.example.json`](book-duet.example.json) | One comic, two readers | A complete starter, book opening/closing, source coverage, face controls, and a listener reaction. |
| [`fireside.example.json`](fireside.example.json) | One comic, one reader | Holding and placing the book, a silent reading beat, and an episode without an end card. |
| [`page-tour.example.json`](page-tour.example.json) | Three comics, two readers | Explicit subject changes between nonadjacent pages, inherited comic IDs, and a diner scene. |
| [`astronaut.example.json`](astronaut.example.json) | One comic, two astronauts | A compatible moon setting, mixed eye styles, and restrained acting. |

The blank file is deliberately **not ready to render**: fill in both empty `text`
values, or remove a row you do not need. Empty text is rejected by validation so
unfinished dialogue cannot accidentally become speech. `book2-036` is an initial
selection, not a required source. Change it in both `comics` and any explicit
line/action `comic` fields when choosing another page. Review that page and rewrite
the dialogue to match it.

The worked examples are demonstrations, not approved campaign scripts. Their
source quotations come from the catalog's reviewed transcripts for pages
`book2-020`, `book2-036`, and `book2-095`. The readers' replies, reactions, astronaut
setting, and titles are invented commentary, not extra panels, quoted book text,
or claims about the author's intent. No new comic artwork is generated.

## Load, edit, validate, render

Use **Upload JSON** in the editor and choose a file from this directory. Edit the
dialogue and settings, then download your JSON to retain an editable copy.

For the CLI, run these commands from the repository root after the setup in
[`README.md`](../README.md):

```sh
node bin/theatre.mjs validate templates/book-duet.example.json --json
node bin/theatre.mjs render templates/book-duet.example.json --preview
node bin/theatre.mjs render templates/book-duet.example.json
```

`--preview` keeps the full script and aspect ratio at up to 768 pixels and 12 fps. The normal render uses
the dimensions/fps in your JSON. Run `validate` first: it catches unsupported
fields, scene/cast mismatches, missing dialogue, and impossible book actions
before production starts. These examples have fixed seeds for repeatability;
changing a seed changes automatic variation, not dialogue or selected comics.

## Top-level fields

JSON has no comments. Put notes in a separate file; fields such as `notes`,
`description`, `duration`, and `music` are not supported script fields.

| Field | Required? | Meaning and accepted values |
| --- | --- | --- |
| `version` | No | `1`; omitted also means version 1. |
| `template` | Yes | `book-duet`, `fireside-reader`, or `page-tour`; see the next table. |
| `title` | Yes | A nonempty title, at most 160 characters. Used to identify the episode. |
| `comics` | Yes | Distinct verified catalog IDs. One for either single-comic format; two or three for `page-tour`. Every selected comic needs a spoken line. |
| `seed` | No | Integer from 0 through 4294967295. Omit for fresh variation; the resolved script records the seed. |
| `scene` | No | An allowed setting for the format and cast. If omitted, the resolver chooses a compatible scene. |
| `characters` | No | Maps cast IDs such as `reader` and `friend` to catalog variants. This chooses appearance, not voice. |
| `product` | No | `book2` is the only supported product. |
| `lines` | Yes | 1-200 ordered dialogue/action objects. At least one must be dialogue. |
| `output` | No | `{ "width": 1080, "height": 1920, "fps": 24 }` by default. Width/height must be even integers from 128 through 1920. FPS is 12, 24, or 30. |
| `endCard` | No | Optional final product card. See below. |

### Format, source count, and cast

| `template` | Comics | `speaker` IDs | Compatible scenes |
| --- | --- | --- | --- |
| `book-duet` | 1 | `reader`, `friend` | `library`, `fireside`, `diner`, `basement`, `moon-base`, `tv-studio` |
| `fireside-reader` | 1 | `reader` | `fireside`, `diner`, `basement`, `moon-base`, `tv-studio` |
| `page-tour` | 2-3 | `reader`, `friend` | `library`, `fireside`, `diner`, `basement`, `moon-base`, `tv-studio` |

Appearance variants are `blue`, `rust`, `olive`, `cowboy`, `glasses`, `crooked`,
and `astronaut`, plus a `-beady` version of each. `astronaut` and
`astronaut-beady` require `moon-base` or `tv-studio`. The solo format has no
`friend`, so it cannot use listener reactions. Avoid adding inactive cast entries.

Use [`assets/catalog.json`](../assets/catalog.json) for current IDs and constraints.
`verified` establishes page/source identity; it does not mean every page has a
reviewed transcript. Do not treat a random selection as permission to invent what
the displayed comic says.

## Dialogue rows

Each dialogue row needs `speaker` and `text`. The fully populated duet example
shows how the optional fields fit together.

| Field | Meaning |
| --- | --- |
| `speaker` | A cast ID allowed by the chosen format. |
| `text` | The actual spoken words, 1-1000 characters, not whitespace alone. Stage directions would be spoken too; express them through the other fields. |
| `comic` | Optional selected comic ID. The first line inherits the first item in `comics`; subsequent lines inherit the last active comic. Explicitly set this when changing subject. |
| `emotion` | Visible facial preset; default `neutral`. It does not guarantee emotional voice delivery. |
| `gesture` | Visible body/head gesture; default `none`. |
| `shot` | `auto`, `speaker`, `two-shot`, `over-shoulder`, `book`, or `source`; default `auto`. `source` shows the unchanged comic page flat, while `book` shows the physical book. |
| `pause` | Silence after the spoken line, 0-5 seconds; default 0.4. A longer line-end reaction receives its full duration. |
| `face` | Optional overrides for individual facial channels; see below. |
| `reaction` | Optional performance by the other actor; see below. |
| `audio` | Optional relative recording filename, such as `takes/reader-01.wav`. See recorded audio below. |

Supported emotions:

```text
neutral thoughtful curious skeptical dry pleased concerned exasperated
angry furious panicked manic cosmic_rage brain_static overclocked
```

Supported gestures:

```text
none explain nod head_tilt shrug page_glance
arm_flail fist_shake double_point despair windmill rubber_hose
```

Big arm gestures are optional performance controls, not physical simulations.
Start with small gestures and let the spoken exchange carry the joke. While the
reader holds the book, use `none`, `nod`, `head_tilt`, or `page_glance` for that
actor, including their listener reactions. The free partner can use arm gestures.

### Face and listener reaction

`face` accepts `brow_left`, `brow_right`, and `mouth_curve` from -1 to 1;
`eye_open` from 0 to 1; and `blink` as `auto`, `once`, or `off`. Omitted channels
use the emotion preset. Mouth opening still follows audio.

`reaction` belongs inside a dialogue row and controls the **other** cast member:

```json
{
  "speaker": "reader",
  "text": "You just did.",
  "emotion": "dry",
  "shot": "two-shot",
  "pause": 1.2,
  "reaction": {
    "actor": "friend",
    "emotion": "skeptical",
    "gesture": "page_glance",
    "face": { "eye_open": 0.65, "mouth_curve": -0.2 },
    "at": "line_end",
    "duration": 1.1
  }
}
```

`at` is `line_start` or `line_end` (default). `duration` is 0.1-5 seconds (default
0.8). If omitted, `actor` selects the other cast member. A reaction cannot target
the speaker or create a second actor in a solo episode.

## Book action rows and source changes

An action is its own entry in `lines`. Do not mix `action` with `speaker`, `text`,
`emotion`, or other dialogue fields.

```json
{ "action": "hold", "seconds": 1 }
```

The book starts open on the table, unless the very first row is `open`; then it
starts closed so that opening action has something to do.

| Action | Required starting state | Result | Default seconds |
| --- | --- | --- | --- |
| `open` | Closed on table | Open on table | 1.3 |
| `turn` | Open on table | Open on the explicitly named adjacent spread | 1.2 |
| `hold` | Open on table | Held open by the reader | 1 |
| `read` | Open, on table or held | Same state; a silent reading beat | 1 |
| `place` | Held open | Open on table | 1 |
| `close` | Open on table | Closed on table | 0.9 |
| `slam` | Open on table | Closed on table | 0.65 |

Every action accepts `seconds` from 0.3 through 8 and an optional selected `comic`
ID. `turn` requires `comic`. Only `open` and `turn` actions may change the active
comic. Place a held book before turning, closing, slamming, or changing its comic;
open a closed book before dialogue.

`turn` means a physically adjacent **spread**, not an arbitrary page jump. The
three reviewed example pages are far apart, so `page-tour.example.json` changes
`comic` on dialogue rows. Those changes create deliberate source cuts. Do not
replace them with impossible continuous page flips.

For an adjacent turn, select both IDs and check their `pdfPage` values in the
catalog. In this edition the spread index is `Math.floor((pdfPage - 2) / 2)`; the
two indices must differ by exactly one. Both selected comics still need dialogue.

## End card, timing, and audio

The end card follows all dialogue, pauses, reactions, and actions:

```json
{
  "enabled": true,
  "title": "Goosnav Book Two",
  "text": "A book of comics.",
  "url": "www.goosnav.shop",
  "seconds": 3
}
```

Those are the defaults. The title/text/URL limits are 120/240/160 characters;
`seconds` is 1-12. Set `enabled` to `false` for no card, as in the solo example.
There is no top-level episode duration: speech is measured, then pauses, reactions,
book actions, and the optional card determine the running time.

For a recorded line, add `"audio": "takes/reader-01.wav"` to its dialogue row.
CLI paths resolve relative to the input JSON; desktop GUI paths resolve relative
to the project. Absolute paths and `../` escapes are forbidden. Supported formats
are WAV, FLAC, MP3, OGG, and M4A. `--voice recorded` requires a recording for every
spoken line. In ordinary local-voice mode, supplied recordings override only
their own lines. The static website does not load desktop recording paths from
your filesystem; use the desktop workflow for per-line recordings.

Browser background music is a separate local attachment in the GUI, not a JSON
field. Reattach it after reloading. `characters`, `emotion`, and `face` do not
select a different voice engine; choose the voice through the GUI or CLI.

## Keep authoring inputs portable

These starter inputs omit `sourceLock`, `cast`, per-line `id`, and `bookState`.
The resolver derives them. A downloaded or resolved script can include them;
they are not fields you need to write by hand.

`sourceLock` pins the exact source files and edition. Keep it when reusing a
resolved script. If deliberately choosing a different comic, use the editor's
selection controls, review the new page, and validate the new input. For manual
JSON edits, remove the old lock only as part of that deliberate source change;
never remove it to bypass a changed-asset warning for an existing run.

Prefer one clear exchange: show a real line from the page, give the readers
different reactions, then let one short reply land. Add animation controls only
when they clarify that exchange. The renderer validates the structure and source
identity; editorial judgment remains yours.

## Video presets, gaze, and physical comedy

Use `"output": {"preset":"instagram_reels","fps":24}` for 1080×1920 (9:16).
Other presets are `instagram_portrait` (1080×1350, 4:5), `landscape`
(1920×1080, 16:9), and `square` (1080×1080). Omit `preset` for custom
`width` and `height`; conflicting preset dimensions are rejected. Existing
explicit dimensions are preserved. The GUI and browser export use these same settings.

A dialogue or action beat can set both characters' gaze:
`"gaze": {"reader":"book","friend":"ceiling"}`. Values are `auto`, `partner`,
`away`, `book`, `ceiling`, and `camera`. Explicit gaze overrides automatic reading
and holding poses for that beat. A listener reaction can also set `"gaze":"camera"`;
the beat's explicit actor gaze takes priority.

- `{"action":"throw","seconds":1.8}` closes and tosses a held book onto the table.
  Use `hold` first and `open` before further dialogue.
- `{"action":"slam"}` rapidly closes an open table book.
- `{"action":"punch","actor":"reader","target":"friend","seconds":2.4}`
  launches the target into an authored tumble. The target must be another cast member.
- `{"action":"explode","actor":"friend","seconds":2.4}` briefly replaces that
  character with a burst of colored pieces.

Place the book before punch/explode. Character actions accept 0.8–8 seconds and
reset the cast at the end; there is no persistent damage, physics simulation or
collision response. The camera widens to contain the action. Book actions use the
reader. See `examples/physical-comedy.json` for a complete valid sequence.
