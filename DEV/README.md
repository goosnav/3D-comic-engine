# Developer guide

Start with DESIGN.md, then IMPLEMENTATION_PLAN.md and VERIFICATION.md.
EXPANSION_IMPLEMENTATION.md explains reset, the absurd performance pack and
catalog-driven character/environment extensions; EXPANSION_PLAN.md records scope.
TECH_STACK.md explains runtime boundaries, interfaces and the coding methodology.
PROGRESS.md records migration decisions. history/ contains the inherited
Comic Theatre prototype notes; these are historical, not current setup guidance.
Its future card-game rails proposal remains in history/V2_CARD_GAME.md.

## Dependency direction

JSON -> src/contracts.mjs -> measured takes -> src/timeline.mjs -> src/player.mjs.
The player evaluates absolute frame time. It does not call a model or improvise
geometry. Expressions, reactions and camera choices follow the JSON and seed.

- web/app.mjs: common source gallery, authoring controls and script editor.
- browser/backend.mjs: same API-shaped operations, entirely on-device.
- browser/assets.mjs: hash-verified, immutable render asset snapshots.
- browser/voice*.mjs + src/flite.mjs: local PCM speech; no OS/network TTS.
- browser/export.mjs: foreground real-time capture with explicit failure cleanup.
- src/audio.mjs, capture.mjs, jobs.mjs: desktop speech, FFmpeg and checkpoints.
- src/server.mjs: loopback-only GUI and renderer routes, not a hosted service.
- bin/theatre.mjs: machine-readable CLI and bounded batch automation.
- tools/build-web.mjs: public static allowlist, bundled imports and notices.

Rendering does not import Ad Studio. assets/catalog.json is the source registry.
To update assets, review canonical source exports, copy portable snapshots, update
hashes/provenance, and run asset checks. Do not scan arbitrary archive folders or
silently replace the page under a saved source lock.

Adding a new exporter should consume the existing measured timeline/player.
Adding a product needs explicit schema/rails/assets/tests; it is not a prompt-only
change. Keep paid services outside this application's required execution path.
