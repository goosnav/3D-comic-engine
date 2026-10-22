# New-video reset and absurd performance pack

Status: approved pack implemented and verified, including astronauts, one additional
environment and more extreme performances. See VERIFICATION.md for evidence and limits.

## Intended result

Keep the existing standalone, free, deterministic engine and simple GUI. A user
can start a genuinely clean video and choose more expressive performances,
characters and settings from the existing dropdowns. No runtime AI, ragdoll
physics, canonical comic changes, or archived models.

The owner requested a reset beside Random sample, anger, exaggerated GMod-like
arm movement, more environments, and hats/glasses/weird character variants.
The owner approved the pack below; visual quality remains subject to review.
Added scope: astronaut variants, a bizarre television-studio environment, and
extra extreme deterministic expressions/gestures. No unstable physics or
unbounded joint transforms: absurdity is authored and repeatable.

## Approved scope

- **New video:** beside Random sample. Restore first-launch editor defaults:
  empty pages/dialogue, Untitled reading, default duet, automatic scene/seed,
  default cast, Book Two/end-card settings, default voice, no attached music or
  uploaded JSON file, no source lock or unapplied JSON. Replace the saved draft
  so reloading cannot resurrect the previous script. One short discard
  confirmation if authored input exists; Cancel changes nothing. Never require
  valid JSON to reset a broken draft. Pending writer/sample/validation/upload
  results must not overwrite the new draft.
- Preserve existing downloadable films and submitted jobs. Reset is an editor
  operation, not deletion of output or cancellation of rendering. Keep this
  distinction explicit in confirmation wording. A separate delete-jobs feature
  is outside scope.
- **Emotions:** angry, furious, panicked, manic, cosmic_rage, brain_static,
  overclocked. Use the existing brows, eyes,
  mouth shapes and head controls. Silent reactions must not invent speech.
- **Gestures:** arm_flail, fist_shake, double_point, despair, windmill,
  rubber_hose. Strong,
  readable silhouettes with deterministic timing, no physics simulation. Prevent
  hand gestures from fighting a held book, including listener reactions.
- **Characters:** cowboy hat, thick glasses, astronaut, and a comically tall lopsided hat;
  both white-eye and beady-eye variants. Reuse the active v10 rig and oral cavity,
  with distinct clothing colors. Accessories follow the head; no eye, nose,
  mouth or book occlusion in the standard shots. No new canonical comic people
  or lore are implied.
- **Environments:** diner reading booth, cluttered basement reading table,
  moon-base reading room, absurd TV studio. Keep the established book/table interaction anchors
  and camera rails. Low-poly, textured/impressionistic rather than photorealistic.
  Default library and existing scripts remain unchanged. These are original
  staging assets, not locations claimed to appear in the book.

## Existing seams

`web/app.mjs` owns draft state, local persistence and revision-based stale-response
protection. Initial blank state currently lives in `connect()`; source fields are
disabled for unapplied JSON, so a reset placed inside that disabled fieldset
would be inaccessible when most needed.

`src/facial-performance.mjs` is mirrored in the active 3D library's
`exports/theatre-performance.mjs`. `src/actor.mjs` already samples the rig from
absolute time. `src/contracts.mjs` owns emotion/gesture choices and held-book
validation. `src/player.mjs` currently builds environments procedurally.

The active 3D library has deterministic character build scripts and editable
plate-eye/beady-eye v10 sources. Its instructions require editable sources,
portable exports, visual review, layout checks and Git LFS upload verification.
Its pre-existing untracked `goosnav-brain/` must remain untouched.

## Module map

No existing modules are retroactively marked ACCEPTED. Existing renderer and
editor integrations need characterization/seam checks before modification.
Items below retain their design contracts; the execution ledger records progress.

### R1 — clean-draft policy — CORE — VERIFIED

Purpose: return the complete first-launch authoring state without retaining old
input. IN: catalog `{templates: Array<{id:string}>}` with at least one template.
OUT: `{script:{version:1,template:string,title:string,comics:[],lines:[]},
voice:'flite',clearAttachments:true}` with fresh nested values.
RAISES: invalid/empty template catalog. DEPS: none.
Checks: preferred duet/fallback template, no caller mutation, no shared mutable
defaults; repeated calls are equivalent. This replaces duplicate blank defaults.

### R2 — editor reset adapter — SHELL — VERIFIED

Purpose: apply the clean-draft policy after explicit user activation.
IN: approved R1 result; existing editor adapter with install/revision/persistence
operations; user confirmation callback. OUT: reset or cancelled result, updated
controls/storage/attachments only on confirmation. RAISES: persistence errors
remain visible without reintroducing discarded text. DEPS: R1.
Checks: dirty/malformed JSON, attached music, saved draft/reload, cancellation,
in-flight responses, retained completed downloads and submitted jobs. Reset
stays reachable near Random sample even while source fields are disabled.

### P1 — performance sampling — CORE — VERIFIED

Purpose: sample additional expressions and gestures without frame history.
IN: named preset, finite age/duration, integer seed and actor index, numeric
weight in 0..1. OUT: bounded named facial controls and rest-relative joint
rotations; identical inputs give identical output. RAISES: unsupported explicit
presets or invalid numeric inputs at the authoring contract boundary. DEPS: none.
Checks: distinguishable extrema, attack/release, neutral/rest restoration,
repeat/reverse seeking, speech silence, held-book exclusions in both speaker
and reaction paths. Preserve current sampler behavior through characterization.

### A1 — character accessory generation — SHELL — VERIFIED

Purpose: build reproducible variants from active editable source rigs.
IN: asset-library root, reviewed source identity, preset ID, output location
inside library. OUT: editable blend, self-contained GLB, provenance manifest and
preview. RAISES: absent/mismatched source, incompatible rig or output collision.
DEPS: none (existing Blender build pipeline is the integration boundary).
Checks: source originals unchanged, head attachment, mouth/eye keys retained,
both eye styles, export reload, dimensions/material budgets, relative resources.

### E1 — reading-set generation — SHELL — VERIFIED

Purpose: build reusable scene geometry around unchanged reading anchors.
IN: preset ID, library output location and deterministic seed.
OUT: editable source, GLB, anchor metadata, provenance and preview.
RAISES: unknown preset, invalid anchors or output collision. DEPS: none.
Checks: reader/friend/book/camera clearances, portable exports, bounded geometry
and textures, no canonical page modifications or remote dependencies.

### I1 — pack registration and renderer integration — SHELL — VERIFIED

Purpose: expose reviewed performances/assets through existing JSON and GUI.
IN: accepted P1/A1/E1 outputs and existing engine catalog.
OUT: catalog-relative, hash-verified runtime choices, matching dropdowns and
documented JSON examples. RAISES: unknown presets, missing hashes/assets,
incompatible book-state gestures or unavailable scene anchors. DEPS: P1,A1,E1.
Checks: standalone build, selected-only loading, backwards-compatible old
scripts, all shot types, complete local/browser film, no new paid calls or
video-autoplay dependency. Rename character labels from clothing-only terminology
where necessary without adding explanatory UI clutter.

## Build and acceptance order

R1 → R2 first, so the reset can be reviewed independently. Then P1, A1, E1 and I1.
Each item needs a contract, failing test, implementation and review before the
next item; each new integration reruns the earlier seams. Owner approval may
authorize a batch of these named items, but failed tests or material scope
changes still require stopping rather than bypassing checks.

## Approved batch execution ledger

Owner's “Sounds good, go for it” authorizes R1/R2/P1/A1/E1/I1 as a batch.
Independent asset and performance work may proceed in parallel; registration
waits for verified outputs. Existing files retain their established conventions;
new reusable helpers carry explicit contracts and independent tests.

- [x] R1/R2: reset policy and GUI, regression tests for broken drafts, attachments,
  persistence, stale responses and retained outputs; no rendering changes.
- [x] P1: expression/gesture presets, sampler tests, held-book validation,
  canonical performance copy and runtime review.
- [x] A1: accessories and astronaut variants, active-source checks, GLB/blend
  exports, canonical metadata and visual review.
- [x] E1: four reusable reading sets, fixed book/cast anchors, GLB/blend exports,
  canonical metadata and visual review.
- [x] I1: catalog/dropdowns, selected-only environment loading, scene-safe
  astronaut selection, standalone build, full tests and short rendered demo.
- [ ] Final independent review, asset layout/LFS checks, asset and engine pushes.

Concrete implementation choices: keep scene table top at existing y=.816 and
cast/book anchors unchanged. New scene assets contain background/set geometry,
not duplicate actors or canonical book. The fourth set is `tv-studio`.
Astronauts are offered for `moon-base` and `tv-studio` (a relevant staged space
show); ordinary readers remain unrestricted. Existing scripts/defaults stay valid.

## Visual and delivery checks

- Actual posed previews of each expression/gesture and both eye styles, not
  just successful exports. Check face readability and arm/table intersections.
- Show each setting with the existing book cameras and the cast together.
- Export a short absurd dialogue scene and inspect its final frames. Separate
  automated audio checks from any personal listening claim.
- Put reusable sources/exports/performance definitions into the 3D asset library;
  copy only portable verified runtime assets into the standalone engine. No
  runtime dependency on a sibling checkout, archive path or this machine.
- Verify relevant asset tests, library layout and LFS before asset publication;
  then engine unit/browser/build checks before engine publication. Do not update
  unrelated Ad Studio files or upload marketing videos as part of this work.

## Owner decision

Approve this pack and reset behavior, or adjust the selection. In particular,
reset preserves completed films and submitted jobs rather than deleting them.
The proposed unusual character is a tall lopsided-hat reader, not a replacement
of the existing Goosnav body/face style.
