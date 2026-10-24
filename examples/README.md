# First 25 pages: performed skits

Twenty-five standalone scripts, one for each numbered comic page **1–25** in
Goosnav Book Two. These are **PDF pages 5–29**, after the frontmatter. Each
`page-NNN-*.json` selects exactly `book2-NNN`; the number in its filename and title
is the printed page number.

The spoken exchanges are original skits responding to the actual artwork. They
are not verbatim readings or additional panels. Skit titles identify these
performances, not official titles of the source comics. Each script includes an
explicit `source` shot so the audience sees the page being discussed.

The set includes **20 duets and 5 solo readings**. Two additional multi-page skits
exercise physical page turns and cuts between nonadjacent pages. Existing
examples and authoring templates remain available alongside them.

## Run one or all 25

In the web or desktop editor, use **Upload JSON** and select an individual script.
The batch manifest is for the CLI; upload the individual scripts to the editor.

After the setup in the [main README](../README.md), run from the repository root:

```sh
node bin/theatre.mjs validate examples/page-007-i-paid-you-back.json --json
node bin/theatre.mjs render examples/page-007-i-paid-you-back.json --preview
node bin/theatre.mjs batch examples/pages-001-025.batch.json --preview --json
```

[`pages-001-025.batch.json`](pages-001-025.batch.json) contains exactly the 25
standalone skits, in page order. Its paths are relative to this directory. The
two bonus tours are separate and are not repeated in that batch.

**Preview mode overrides output to 432 × 540 at 12 fps.** To compare the authored
aspect ratios and frame rates, omit `--preview`:

```sh
node bin/theatre.mjs render examples/page-024-since-tuesday.json --json
node bin/theatre.mjs batch examples/pages-001-025.batch.json --json
```

Each script has a fixed seed. Reuse it for consistent staging when comparing
changes to dialogue, performance, or output settings. Duration comes from the
actual speech plus pauses, reactions, and book actions.

## Page index

| Printed page | Script | Format / setting | Skit premise |
| --- | --- | --- | --- |
| 001 | [Something Else Is in There](page-001-something-else-is-in-there.json) | Duet / basement | If the idea organ has gone, who decided to buy the book? |
| 002 | [A Hat Helps](page-002-a-hat-helps.json) | Duet / library | A cowboy recommends hats for being recognized as human. |
| 003 | [Another Chicken](page-003-another-chicken.json) | Duet / diner | A reason to keep living is waiting in the fridge. |
| 004 | [Capital Letters](page-004-capital-letters.json) | Duet / TV studio | Official-looking instructions become an immediate problem. |
| 005 | [I'll Take Two](page-005-ill-take-two.json) | Duet / TV studio | Buying the correct quantity of one-bladed scissors. |
| 006 | [Still Here](page-006-still-here.json) | Solo / fireside | Spending everything before an apocalypse that fails to arrive. |
| 007 | [I Paid You Back](page-007-i-paid-you-back.json) | Duet / library | Subjective reality is useful when you owe fifty dollars. |
| 008 | [Spare Furniture](page-008-spare-furniture.json) | Duet / fireside | An invented insult causes an unexpectedly real grievance. |
| 009 | [Start with the Monster](page-009-start-with-the-monster.json) | Duet / diner | Ordinary introductions are already frightening enough. |
| 010 | [The Reassurance Visit](page-010-the-reassurance-visit.json) | Solo / fireside | Feeling obliged to appreciate unwanted reassurance. |
| 011 | [Joint Custody](page-011-joint-custody.json) | Duet / basement | Sharing an afterlife between a robot and a jar. |
| 012 | [Unauthorized Laughter](page-012-unauthorized-laughter.json) | Duet / TV studio | Someone laughs before the critic has given permission. |
| 013 | [The Shelf](page-013-the-shelf.json) | Solo / basement | A useful idea for organizing ideas that never get used. |
| 014 | [Everyone Belongs](page-014-everyone-belongs.json) | Duet / library | Universal love refuses to accept an opt-out. |
| 015 | [Turn It Down](page-015-turn-it-down.json) | Duet / TV studio | Disable the part of the brain that notices the problem. |
| 016 | [The Sun Lobby](page-016-the-sun-lobby.json) | Duet / TV studio | A candidate abolishes mornings and resents follow-up questions. |
| 017 | [First Contact Cancelled](page-017-first-contact-cancelled.json) | Duet / moon base | Two astronauts reconsider human progress after noticing the nail. |
| 018 | [The Guest Room](page-018-the-guest-room.json) | Solo / basement | The worm's refusal to explain is enough to rearrange the sleeping arrangements. |
| 019 | [Starter Home](page-019-starter-home.json) | Duet / fireside | A vacuum swallowing a son counts as moving out. |
| 020 | [The Memoirs](page-020-the-memoirs.json) | Duet / fireside | A future great man has one historic grievance about cookies. |
| 021 | [A Drink and a Meal](page-021-a-drink-and-a-meal.json) | Duet / diner | Every objection becomes a selling point for the meat beverage. |
| 022 | [No Enemies on the Moon](page-022-no-enemies-on-the-moon.json) | Duet / moon base | Escaping foreign enemies leaves only one other person to suspect. |
| 023 | [Version One Was Fine](page-023-version-one-was-fine.json) | Duet / TV studio | An elaborate debugging machine replaces a simple greeting. |
| 024 | [Since Tuesday](page-024-since-tuesday.json) | Duet / TV studio | A rocket cart solves a very ordinary supermarket grievance. |
| 025 | [I Used to Get Two](page-025-i-used-to-get-two.json) | Solo / TV studio | The appeal of a captive audience, even a scarecrow. |

## Bonus multi-page skits

| Script | Sources | Distinct behavior |
| --- | --- | --- |
| [Find a Responsible Adult](tour-pages-001-002-004-find-a-responsible-adult.json) | 001 → 002 → 004 → 002 | Three selected pages; two forward physical turns followed by a reverse turn. The search for competent leadership ends back at the gorilla. |
| [Returns Department](tour-pages-005-019-024-returns-department.json) | 005 → 019 → 024 | Explicit dialogue-source cuts between distant pages. A shopping list becomes a return trip. |

The physical tour uses adjacent **spreads**, which are not the same as adjacent
printed pages. Its spread indices are 1 → 2 → 3 → 2, calculated using the engine's
`Math.floor((pdfPage - 2) / 2)` rule. The returns tour uses changes to the dialogue
`comic` field; it does not try to flip continuously across distant pages.

```sh
node bin/theatre.mjs render examples/tour-pages-001-002-004-find-a-responsible-adult.json --preview
node bin/theatre.mjs render examples/tour-pages-005-019-024-returns-department.json --preview
```

## Capability coverage

The controls are distributed across the skits, with quiet performances as well
as exaggerated ones. See the [complete JSON field reference](../templates/README.md)
for the allowed values and their constraints.

| Capability | Coverage / useful examples |
| --- | --- |
| Episode formats | All 3: `book-duet`, `fireside-reader`, `page-tour`. |
| Settings | All 6: library, fireside, diner, basement, moon base, TV studio. |
| Appearance variants | All 14: blue, rust, olive, cowboy, glasses, crooked, astronaut, and each corresponding `-beady` variant. Astronauts use compatible moon-base scenes. |
| Emotions | All 15 supported presets, including listener reactions. Compare restrained page 007, `furious` on 016, `brain_static` on 015/019/024, and `cosmic_rage` on 024. |
| Gestures | The original 12. Page 023 includes `rubber_hose`; 016/024 use large gestures; 006 keeps the held-book reader's hands occupied. |
| Shots | The original 6: `auto`, `speaker`, `two-shot`, `over-shoulder`, `book`, `source`. Every selected comic in every file receives an explicit source shot. |
| Book actions | Seven: `open`, `turn`, `hold`, `read`, `place`, `close`, `slam`. Page 004 ends with a requested slam; the physical tour turns forward and backward. |
| Held-book performance | Pages 003, 006, 010, 018, 023. Reader dialogue and listener reactions respect the occupied-hand restriction. |
| Listener reactions | Both `line_start` and `line_end`, including reactions that continue through a pause. Solo files do not create a second actor. |
| Face controls | Independent brows, eye openness, mouth curve, and `auto` / `once` / `off` blink settings. |
| Output shape | 4:5 portrait, 9:16 portrait, square, and 16:9 landscape. |
| Frame rate | All 3 supported values: 12, 24, 30 fps. |
| End cards | Enabled and disabled; enabled cards use the bundled book presentation and a plain shop URL. |
| Source transitions | Physical forward/reverse turns and deliberate nonadjacent source cuts, demonstrated in separate tours. |

Voice engines are selected in the GUI or CLI, not in the script's character or
emotion fields. These files run with the default bundled Flite voice. Recorded
audio requires real local recordings; browser background music is a separate
attachment. Neither is fabricated as an extra JSON field in this set.

## Verification

Checked on 2026-10-23: **27/27 scripts passed**, with 171 verified catalog assets
and 583 sampled renderer frames. Actual Flite timing puts the standalone skits
at **16.28–24.92 seconds each**, totaling 8 minutes 2.06 seconds. The physical
tour is 38.14 seconds; the source-cut tour is 24.52 seconds. A different voice
or a dialogue edit changes those timings.

The source images were visually inspected against the scripts. The supplied
book PDF's SHA-256 matches the catalog edition, and the embedded JPEG on each
of its first 25 numbered pages matches the corresponding catalog image.

The scripts were checked with the production resolver, source-asset validation,
actual local Flite synthesis, measured timeline compilation, and sample frames
from the real WebGL player. Checks cover cast and scene loading, displayed source
identity, book-action states, reaction timing, and deterministic backward seeking.
Sample-frame checks preserve the authored aspect ratio and fps at a reduced
resolution. They do not constitute full MP4 export tests.

The batch manifest is checked for all 25 pages exactly once, in order, with valid
relative paths. There are no engine-code or catalog changes in this example set.


## Chaotic comedy

[chaotic-comedy.json](chaotic-comedy.json) adds static close/medium/wide/extreme-wide
shots, colored phrase captions, abrupt arm gestures, crying, a rocket punch,
flattening, nose removal and replacement, head spins/jerks, a flying book,
explosion, and walking off stage. It uses zero default dialogue pauses and lets
characters reappear at the next cut without a return animation.

### Cursor chaos and library worlds

`cursor-chaos.json` combines cosmic rage, nose contact, high fives, handshakes, dancing, rocket punches and tracked ascent in the black-pyramid desert. Change `scene` to `space` or `red-mesas` to use the other library worlds. In space, try `astronaut` and `astronaut-beady` for the glass helmets and squashed noses. Every action holds its outcome until the cut.

`space-chaos.json` showcases the glass helmets. `backrooms-reading.json` and `courtyard-reading.json` start in the Backrooms and `starter-overgrown-courtyard` settings. All five library worlds are available in the Scene dropdown.
