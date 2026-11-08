# Cameo Focus and Ambience Implementation Plan

> Use executing-plans with independent audio implementation and final code review.

**Goal:** Editable cameo focus beats and subtle default ambience in browser and offline exports.
**Architecture:** Extend existing sequence contract with cameo rows; shared evaluator owns focused placement/framing. A shared deterministic ambience generator supplies both audio pipelines.
**Tech Stack:** Existing JS, Three.js, Web Audio, FFmpeg, Blender CPU, Node tests.
**Spec:** docs/superpowers/specs/2026-11-07-cameo-ambience-design.md

## Constraints and review focus
Preserve legacy animation/source behavior and local audio-security changes. No external sound assets. Inspect every cameo model in portrait/landscape. Restore visibility after a focused cut. Avoid cumulative animation state, asset omissions, audio clipping and music loss. User authorized push, not deployment.

- [x] Add failing contract/timeline/scene tests; implement cameo rows, auto inclusion and shared framing/visibility.
- [x] Independently add failing ambience/mix tests; implement shared PCM synthesis, ducking, browser/local integration and music precedence.
- [x] Add GUI cameo controls and ambience controls, examples, routes and documentation; test round trips.
- [x] Run full tests/build and actual CPU/browser acceptance within process permissions; inspect decoded media and frames.
- [x] Independent review and fix findings.

Release procedure: commit scoped changes and push main as authorized. Preserve unrelated local audio-security edits. Verification results are recorded in `docs/cameo-ambience-verification.md`.
