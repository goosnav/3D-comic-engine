# JSON recovery and caption defaults — 2026-10-26

## Authoring behavior

The shared resolver now repairs optional presentation controls before strict
structural validation. This applies to browser and desktop validation, individual
renders, CLI rendering, and batch rendering. The editor uses the same pure
normalizer during JSON import/apply/restore. Original input objects are not mutated.

An emotion placed in `gesture` is transferred to `emotion` when that field is
missing or unsupported, and the gesture falls back to `none`. A valid explicitly
chosen emotion wins. Swapped emotion/gesture values are recognized. Case, spaces,
hyphens and a small set of common aliases are normalized deterministically.

Unsupported emotions, gestures, shots, gaze, blink, grade and dither use safe
supported defaults. Known facial numeric channels and timing values are converted
from numeric text, clamped, or defaulted. Malformed optional face, gaze, reaction
and caption objects recover. Reader arm gestures while holding the book become
`none`; actual book transitions still have to be valid.

This is not a JSON-syntax fixer. Missing dialogue, unknown fields, source/hash
mismatches, unknown comic/cast/action IDs, incompatible scenes, impossible book
sequences and invalid output dimensions still fail explicitly. No dialogue or
source selection is invented. For strict auditing, callers may use
`resolveScript(raw, catalog, {repair: false})`.

## Generator notes

Each correction records its field path, old value, replacement and reason in
`script.warnings`. Revalidating/reimporting the corrected script retains and
deduplicates these messages. Omitted settings simply take defaults; that alone is
not a correction. Downloaded resolved scripts retain their audit trail.

Jobs expose `warnings` and a completion `exitNote`. The Generated videos job
cards show an expandable **Generator notes** section, open when there are
corrections. This includes jobs produced by batches. Browser and desktop batch
records also preserve per-item correction metadata. Desktop `job.json` and CLI
results include it; the production progress callback prints the completion note.
Warnings remain available when production itself fails. Source validation and
encoder errors are not swallowed or reported as successful renders.

## Captions

Shared defaults: enabled, `position: "top"`, reader `#FFFF00` (yellow), friend
`#228B22` (forest green). Top captions are centered at 12.5% of frame height,
inside the top quarter. Existing two-line wrapping and outline remain unchanged.
These defaults are shared by the editor, resolver and caption renderer.

Explicit valid choices are preserved. A JSON with `"position": "bottom"` still
renders bottom captions. Remove that property or set it to `"top"` for the new
placement. Explicit custom speaker colors also remain unchanged.

The desktop server explicitly allows the new shared modules and notes module;
the static build includes them through its existing esbuild import graph.

## Verification

Run focused regression tests:

```sh
node --test tests/contracts.test.mjs tests/json-recovery.test.mjs tests/json-recovery-browser.test.mjs
```

The browser queue tests use the actual backend with injected asset/export
adapters and mock audio/recording support; they do not create real video files.
They cover single and batch completion reports, validate-then-render history,
explicit caption overrides, and real-error propagation. The unit tests cover
the reported `lines[2].gesture: "concerned"` case, immutable/idempotent recovery,
nested controls, strict mode, source safeguards and text-only DOM notes.

Existing tests that intentionally audit invalid optional values now opt into
strict mode for those assertions. No source, actor, book-state or output safety
assertion is removed.
