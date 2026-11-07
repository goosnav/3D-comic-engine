# General Scenes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task with independent final review.

**Goal:** Ready-to-export general animation with v12 beady/regular default cast.
**Architecture:** Catalog template metadata controls book presence and startup presets. Shared contracts/timeline represent silent holds; shared scene evaluator owns book-free staging and prop animation. Existing render/encode boundaries remain intact.
**Tech Stack:** JavaScript, Three.js, existing Blender CPU adapter, Node test runner and Playwright.
**Spec:** docs/superpowers/specs/2026-11-07-general-scenes.md

## Global constraints
Preserve explicit legacy scripts/models and pre-existing audio-security edits. Blank shots last two seconds. No replacement artwork, deployment, or asset-library modifications.

## Review focus
- Empty/whitespace/absent text must not synthesize placeholder speech; missing text plus recording must keep recorded audio.
- General scenes must not fetch hidden book assets or auto-cut to book views.
- Switching template must produce valid defaults without silently rewriting authored dialogue.
- v12 speech must move actual mouth/jaw without the v10 floating overlay.
- Silent exports need a valid clock/audio stream, finite frames and recoverable CPU output.

### 1. Contracts and timelines
- [x] Add failing tests in tests/general-scenes.test.mjs for default cast, book-free templates, silent/mixed/empty timelines and rejected book actions.
- [x] Add catalog templates and template default metadata; update src/contracts.mjs and src/editor-defaults.mjs.
- [x] Compile silent holds in src/timeline.mjs and skip absent speech in browser/voice.mjs while preserving local recordings.
- [x] Run focused contract/timeline/audio tests.

### 2. Assets and rendering
- [x] Inspect v12 GLB nodes/morphs; add models and provenance catalog entries.
- [x] Add real rig/mouth regression tests; adapt src/actor.mjs.
- [x] Make book loading optional in src/player.mjs, src/cpu-scene.mjs, browser/assets.mjs and src/scene-evaluator.mjs.
- [x] Add deterministic button interaction shared by both renderers; test seeking, visible book absence and prop motion.

### 3. Editor and delivery
- [x] Update web/app.mjs and web/index.html for general presets, optional page UI and silent-row copy.
- [x] Add packaged examples and expose them in build/server routes. Update documentation.
- [x] Test untouched startup GUI export, template switching, real speech/mouth and CPU output; inspect rendered frames and verified video streams.
- [x] Run unit suite, relevant browser regressions, production build and fresh code review.
