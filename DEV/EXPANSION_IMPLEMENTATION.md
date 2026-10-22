# Deterministic performance and scene pack

## Boundaries

The editor's `+ New video` uses `src/editor-defaults.mjs`, a pure fresh-state
policy shared with first launch. The adapter resets revision and operation tokens
before installing it. Old sample/writer/validator/upload responses cannot replace
new input. Submitted renders retain their immutable input snapshots and download
URLs. Reset never calls cancellation or deletes output. Failed persistence is
reported; an old saved draft is removed if storage permits it.

`src/gesture-performance.mjs` samples absolute time into bounded rest-relative
bone offsets. No physics, frame history, network or AI is involved. Actor update
restores the rig before sampling. Held-book rules exist both in JSON validation
and actor application. Silent expressions do not generate speech energy.
Legacy performance output is covered by a captured characterization hash.

Catalog entries—not machine paths—connect characters and scenes to bundled GLBs.
`variants[].allowedScenes` constrains active cast only. `scenes[].default:false`
keeps opt-in environments from changing legacy seeded scene selection. A
restricted cast without an explicit scene chooses compatible scenes; explicit
conflicts return helpful errors. The GUI disables incompatible options without
silently replacing an existing cast selection.

The new scene GLBs include the whole set and table, but no actors or product.
Their table top stays at Y=.816, with unchanged reader/friend/book anchors.
Legacy library/fireside geometry stays procedural. New sets load before GPU
allocation, use existing lighting/cameras, and participate in resource disposal.
Extended head accessories get deterministic headroom fitting at native scale.
Over-the-shoulder staging steps around bulky near headgear; original unadorned
characters retain their original camera coordinates.
Browser snapshots fetch/hash only the chosen scene, cast, pages and end-card
resources; missing scenes fail explicitly instead of using a different set.

## Source assets

Canonical editable sources and portable exports live in `goosnav-3D-assets`:

- `scripts/build_theatre_expansion.py`, `docs/theatre-expansion-characters.json`
- `scripts/build_theatre_sets.py`, `docs/theatre-sets.json`
- `exports/theatre-performance.mjs`, `exports/theatre-gestures.mjs`

Character builds reuse active theatre v10 rigs; astronaut suit details come from
the active astronaut model. Original sources and canonical comic art stay intact.
White-eye and beady-eye variants share the established mouth/face controls.
Engine GLBs are byte-identical reviewed export snapshots, not runtime links to
the asset repository. Samplers are mirrored byte-for-byte. Provenance paths in
the catalog are descriptive; runtime uses only its relative `assets/` paths.

Canonical asset release: `2ab0e1d5657fd88b90a6febd10208bcdd46b2269` on main.
All 60 LFS objects uploaded successfully and `git lfs fsck HEAD` passed.
Environment rebuilds require explicit `--rebuild` and matching ownership hashes
for GLBs, editable blends and previews; modified/unowned outputs are rejected
before any generation. This preserves artist edits rather than blessing them.

To extend the pack: add/review the canonical asset and its contract tests, copy
its portable export, register its SHA-256 and selectors, then test actual camera
compositions and frame seeking. Do not silently pull newer or archived models.

## Verification seams

- `tests/editor-defaults.test.mjs`: fresh defaults and malformed catalogs.
- GUI suites: reset/cancel, malformed JSON, storage failure, stale responses,
  music clearing, preserved downloads/jobs, scene-compatible character menus.
- Gesture/performance tests: bounded sampling, repeat/reverse seeking, legacy
  characterization, held-book safety and silent reactions.
- `tests/scene-selection.test.mjs`: legacy seed stability and cast restrictions.
- Scene asset tests: selected-only fetch, hash failures and cleanup; browser
  checks load actual GLBs and render all sets at established camera positions.
- Canonical Blender tests: source identity, rig/accessory tracking, export
  reload, table/clearance, standalone resources and deterministic rebuilds.

See VERIFICATION.md for actual run results. Numerical bounds do not guarantee
collision-free slapstick, and desktop/browser checks do not certify a physical
iPhone. The browser end card continues using decoded frames, not autoplay.
