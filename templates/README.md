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

`--preview` keeps the full script and aspect ratio normally at up to 768 pixels and 12 fps. The normal render uses
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
| `captions` | No | Enabled by default; `position` is `top` or `bottom`, with `colors.reader` and `colors.friend` as six-digit hex colors. |
| `output` | No | `{ "width": 1080, "height": 1920, "fps": 24 }` by default. Width/height must be even integers from 128 through 1920. FPS is 12, 24, or 30. |
| `endCard` | No | Optional final product card. See below. |
| `grade` | No | Colour grade of the 3D stage: `muted` (default, slightly drab), `film` (dusty, faded, grainy) or `vivid` (the original bright colours). Comic page inserts, captions and the end card are never graded. |
| `dither` | No | Ordered (Bayer) dither over the 3D picture, captions and end card, for a slightly crunchy digital look: `subtle` (default), `crunchy` (strong bitcrushed pattern) or `off`. Full resolution, no pixelation. Comic page inserts are never dithered. |
| `extras` | No | Up to four background cameos: `goose`, `glove-bot`, `walker`, `shoe-hat`. See below. |

### Format, source count, and cast

| `template` | Comics | `speaker` IDs | Compatible scenes |
| --- | --- | --- | --- |
| `book-duet` | 1 | `reader`, `friend` | `library`, `fireside`, `diner`, `basement`, `moon-base`, `tv-studio`, `space`, `black-pyramids`, `red-mesas`, `backrooms`, `starter-overgrown-courtyard` |
| `fireside-reader` | 1 | `reader` | `fireside`, `diner`, `basement`, `moon-base`, `tv-studio`, `space`, `black-pyramids`, `red-mesas`, `backrooms`, `starter-overgrown-courtyard` |
| `page-tour` | 2-3 | `reader`, `friend` | `library`, `fireside`, `diner`, `basement`, `moon-base`, `tv-studio`, `space`, `black-pyramids`, `red-mesas`, `backrooms`, `starter-overgrown-courtyard` |

Appearance variants are `blue`, `rust`, `olive`, `cowboy`, `glasses`, `crooked`,
and `astronaut`, plus a `-beady` version of each. The comic cast adds `billy`
(Little Billy: about half height, rainbow propeller cap that always spins) and
`gooby` (beady-eyed guy with a slime-green goo hat whose stalk always wobbles).
Short characters such as Billy stand on a wooden crate so they can reach the
table, hold the book and stay above the table edge in close-ups. `astronaut` and
`astronaut-beady` support `moon-base`, `tv-studio`, `space`, `black-pyramids`, `red-mesas`, `backrooms`, and `starter-overgrown-courtyard`. Their clear helmets enclose noses squashed against the glass. The solo format has no
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
| `shot` | `auto`, `close-up`, `medium`, `wide`, `extreme-wide`, `speaker`, `two-shot`, `over-shoulder`, `book`, or `source`; default `auto`. `source` shows the unchanged comic page flat, while `book` shows the physical book. |
| `pause` | Silence after the spoken line, 0-5 seconds; default 0. A longer line-end reaction receives its full duration. |
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
arm_flail fist_shake double_point despair windmill rubber_hose snap_pose cry head_spin head_jerk
```

`snap_pose` is the posed-ragdoll look: a random full-arm pose snaps in, holds
for four or eight frames, then snaps to the next.

Big arm gestures are optional performance controls, not physical simulations.
Poses jump at 24 Hz for abrupt, erratic cartoon acceleration. While the
reader holds the book, use `none`, `nod`, `head_tilt`, `page_glance`, `head_spin`, or `head_jerk` for that
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

`at` is `line_start` (default) or `line_end`. `duration` is 0.1-5 seconds (default
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

- `{"action":"throw","seconds":1.8}` closes and rockets a held book out of frame.
  Use `hold` first and `open` before further dialogue.
- `{"action":"slam"}` rapidly closes an open table book.
- `{"action":"punch","actor":"reader","target":"friend","seconds":1.2}` launches the target off stage. There is no return flight.
- `{"action":"explode","actor":"friend","seconds":1.2}` bursts into 42 rapidly spinning fragments. The body stays hidden for the rest of the beat.
- `{"action":"flatten","actor":"reader"}` abruptly compresses the character toward the floor and holds the squash.
- `{"action":"nose_off","actor":"reader"}` removes the original nose, holds it, and snaps it back on.
- `{"action":"head_spin","actor":"reader"}` rotates the head around the neck axis in sharp steps.
- `{"action":"head_jerk","actor":"friend"}` snaps the head in different directions.
- `{"action":"walk_away","actor":"friend"}` strides off stage without returning.
- `{"action":"nose_touch","actor":"reader","target":"friend"}` snaps the pair together nose-first.
- `{"action":"high_five","actor":"reader","target":"friend"}` brings their raised hands together.
- `{"action":"handshake","actor":"reader","target":"friend"}` shakes their joined hands rapidly.
- `{"action":"dance","actor":"friend"}` jerks, spins, hops and overextends the arms.
- `{"action":"ascend","actor":"reader","target":"friend"}` rockets upward while the friend tracks him with his head. No return before the cut.

Garry's Mod-style stunts (one actor, no target):

- `{"action":"t_pose","actor":"friend"}` locks into a rigid T and glides around the floor, snapping 90° at a time.
- `{"action":"ragdoll","actor":"reader"}` collapses limp with one bounce, limbs splayed, then twitches.
- `{"action":"noclip","actor":"friend"}` sinks through the floor, pops up, and drifts out through the back wall.
- `{"action":"big_head","actor":"reader"}` scales the head up in snapping steps (hands grow too), then snaps back.
- `{"action":"jitter","actor":"friend"}` vibrates like a prop stuck in a wall, then gets flung into the sky.
- `{"action":"helicopter","actor":"friend"}` spins up with rotor arms and lifts off through the ceiling. Billy's propeller goes wild.
- `{"action":"goose_chase","actor":"reader"}` startles the actor, who sprints off-frame with the goose honking on their heels. Adds the `goose` extra automatically.

Place the book before character actions. They accept 0.8–8 seconds, `actor`, optional `gaze`, and `shot`. `punch`, `nose_touch`, `high_five`, `handshake`, and `ascend` accept `target`, defaulting to the other character. For ascent, `actor` rises and `target` watches. Partner actions require a two-character template. Book actions use the reader. These are repeatable cartoon poses, not a physics simulation. Characters reset at the next beat with no return animation; the missing book resets when the next book action starts. Deliberate continuity cuts are part of the effect.

### Background cameos (`extras`)

`"extras": ["goose", "glove-bot"]` adds characters who live in the background for
the whole film, following a seeded schedule (the script `seed` picks it):

- `goose`: a white goose with an orange bill. It waddles, honks, flaps, pecks,
  stares at the camera, spins, T-pose glides, noclips half into the floor,
  zooms across the set, and ragdolls over. It also performs `goose_chase`.
- `glove-bot`, `walker`, `shoe-hat`: Glove Bot, the two-legged walker and the
  shoe-hat creature from the comic cast walk across the back of the set, play
  their own takes (wave, stomp, tip hat, power up…) and wander off again.

Cameos never steer the camera. If a camera ends up inside one (over-shoulder
shots sit behind the cast), that cameo hides for the frame.

`cry`, `head_spin`, and `head_jerk` are also dialogue/listener gestures, so they can run during speech. Crying adds tears and frantic arm movement. The head gestures work while holding the book.

## Static shots and captions

Every shot is fixed at the cut, including book shots and wild actions. `close-up` frames the speaker's head and shoulders, `medium` frames the speaker roughly from the waist up, `wide` includes more of the set, and `extreme-wide` places the camera far away. Existing shot IDs remain supported. Use the Shot dropdown on either a dialogue or action row.

Captions are enabled by default, use bold Helvetica (Arial or bundled metric-compatible sans fallback), and render into exported video. The controls set placement and a separate color for each speaker:

```json
"captions": {
  "enabled": true,
  "position": "bottom",
  "colors": { "reader": "#ffe35b", "friend": "#6ee7ff" }
}
```

`position` accepts `top` or `bottom`; text stays within that quarter of the frame. Colors must be six-digit hex values. Captions show balanced phrases of 2–5 words (one word for a one-word line), with at most two displayed rows. Phrase timing follows measured speech energy and word length; it is approximate rather than forced word alignment. Captions appear only during speech, never on silent actions or end cards.

Generated and recorded speech have leading/trailing silence trimmed with a 25 ms consonant margin. The default pause is zero and reactions default to `line_start`, so the next clip starts when speech ends. An explicit `pause` or `reaction.at: "line_end"` still creates the requested hold. Internal speech pauses are preserved.

See [chaotic-comedy.json](../examples/chaotic-comedy.json) for all new actions, both caption colors, and shot sizes.

`cosmic_rage`, `brain_static`, and `overclocked` also drive abrupt body motion, even with gesture `none`. Free arms stretch; held-book arms keep their grip. Wild gestures use seeded 24 Hz jumps with no default fade to rest. The camera remains fixed.
