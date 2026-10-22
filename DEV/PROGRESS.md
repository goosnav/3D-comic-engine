# Implementation ledger

Plan: DEV/IMPLEMENTATION_PLAN.md

- Copied tracked source engine from Ad Studio 9f09962 only.
- New empty target checkout is the requested isolated destination; working there
  under owner's migration/push authorization, leaving Ad Studio unchanged.
- Shared interfaces checked: PCM speech feeds both adapters; browser backend
  preserves GUI API envelopes; contracts/timeline are single animation authority.
- Owner authorized on-device execution, superseding paid-hosting design.
- Task 1: shared validator browser-compatible; static build bundles assets and
  licenses with no CDN or Node runtime imports. Asset verification checks all 16
  snapshots, including the exact embedded book pages.
- Task 3: desktop default Flite, JSON CLI, bounded batch, launchers and bootstrap
  implemented. Real desktop film completed: 166 frames / 13.833 seconds, all four
  dialogue lines and spinning end card, about 78 seconds wall time while tests ran.
- Task 4: static/local shared GUI, source locks, editable end card, browser draft
  persistence and local-only optional writer implemented. GUI suite: 27 passed.
- Unit suite with optional local Python fixture: 65 passed, no skips/failures.
- Canonical asset remote main confirmed at 65f9ae1; all six bundled variants
  byte-match the active published exports. No new models or canonical repo edits.
- Browser integration caught first-frame recording startup ordering and an overly
  strict wall-clock stall detector; these are being corrected before release.
- Independent review found audio startup cancellation/deadline and stale private
  build output issues. Both reproduced in failing tests, fixed, and passed.
  Also fixed subdirectory-hosted source thumbnails after a failing browser test.
- Static GUI end-to-end export passed from /studio/: restored input, selected real
  sources, both voices, spinning end card, decoded 7.86s video/audio, no API calls.
- Browser startup now warms the first frame and supplies a silent audio clock
  before recording, and stall detection compares clock progress rather than
  rejecting a late timer. Progress notifications are bounded to reduce GUI load.
- Review limitations: physical phones/native Windows/macOS and subjective acting
  remain unverified, not inferred from Linux tests. Artwork provenance retained;
  no new legal ownership claim is made.
- Final whole-suite and clean-checkout checks are running before push.
- Whole-browser run exposed a legacy shutdown hang: an idle speculative TCP
  connection kept startServer.close pending before browser teardown. Reproduced
  with a raw idle connection; closeAllConnections fixes it (2 server tests pass).
  Interrupted that test run deliberately, preserving partial results; a clean
  final browser run will replace it after export timing work freezes.
- Browser timing fix frozen: warm distinct scene/shot combinations, schedule
  speech from recorder.start(), and await each draw's readback before submitting
  another. Scoped 432×540 timing test: planned 4.238s, recorded 4.800s, first
  speech 0.320s. CPU stalls may drop frames, not accumulate a GPU backlog.
- Final unit suite: 68 passed, no failures/skips. Fresh Git-only source snapshot
  installs from the offline npm cache, builds, and verifies all 16 assets.
- Final full browser suite: 45 passed, zero failures/skips/cancellations. Static
  GUI output decoded 4.86s; complete audio and final frame verified. All requested
  implementation tasks are complete. Native phone/Safari/macOS/Windows checks
  remain explicitly outside the verified platform claims, not hidden failures.
