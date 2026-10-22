# 3D Comic Engine — standalone/local/cloud design

Status: PROPOSED; not an implementation or deployment claim.
Prepared 2026-10-21. Owner approval of the hosted execution/cost choice is pending.
Independent builder review found no other consequential unanswered decisions.

## Intent

Turn the working Comic Theatre experiment into an independent application:
reviewed comic source + a small JSON script -> deterministic performed scene ->
verified downloadable video. A person uses a local browser GUI or a phone; an
agent or script uses the same operations through a noninteractive CLI/API.
Submitting 100 scripts must be practical without launching 100 renderers at once.

The user explicitly requests both local and Cloudflare operation, shell/native
command-script launchers, strong CLI automation, and committed design notes in
`DEV`. These override a staged local-only productization process, a default
Python rewrite, and a default private/ignored development-doc directory.

## Existing evidence and scope

- Target repository was cloned but empty, with no commits or user files.
- Migration source: `goosnav-ad-studio/experimental/comic-theatre`, parent commit
  `9f09962590c33dbff3e3b085cffe1d37e66997ef`.
- That folder already bundles its reviewed assets, fonts, source catalog and
  spinning-book clip. A Git-files-only copy passed 44 unit tests independently
  of Ad Studio. Its 39 browser cases have passing results across scoped runs.
- Current export uses Node, Playwright/Chromium, FFmpeg/ffprobe and local Python
  Kokoro speech. It has verified capture segments and resume, but a foreground
  CLI, one project-wide rendering lock, and manual dependency setup.
- Homunculus uses static Cloudflare assets. Its browser game executes on the
  viewer's device; that is different from reliable server-side video export.
- Generated blue/rust/olive and beady-eye variants, editable Blender sources,
  GLBs and facial presets are already on Goosnav-3D-assets `main`, confirmed at
  `65f9ae1f791b86b5e2ce2b235ee0d2f00908557a`.

Retain the functioning scene renderer, source grounding, JSON semantics, voice
measurement, end card and regression tests. No Ad Studio runtime import, sibling
checkout, archived-asset path, Git installation or AI-agent process is required
to run a released application. Import only the engine, not Ad Studio's ad/upload
harness. Leave the original studio experiment working during the transition.

## Recommended architecture (builder's proposal)

Use the existing JavaScript/Three.js engine with small runtime adapters. Do not
rewrite working animation code into another language or introduce a UI framework
just to move repositories.

```text
Local launcher -> local GUI ----+
Local CLI ---------------------+-> shared validation / script / job services
Hosted phone GUI -> Worker API -+              |
Remote CLI ------> Worker API --+              v
                                    deterministic render worker
                                    Three.js + speech + FFmpeg
                                               |
                                  verified MP4 + result manifest
```

Local and hosted adapters differ in scheduling, authentication and persistence,
not script interpretation, camera/face animation or output validation. Providers
cannot mutate the script silently. Voice engine and asset versions are recorded.

### Local edition

Provide `Open Comic Engine.command` for macOS, `Open Comic Engine.ps1` plus a
convenient `.cmd` wrapper for Windows, and `open-comic-engine.sh` for Linux.
Running the GUI launcher must open the default browser; printing a URL alone is
not success. Start a loopback setup/status page before lengthy first-run work.

Bootstrap pinned/checksummed managed runtimes and locked dependencies instead
of assuming globally installed Node, Python or FFmpeg. Reuse verified caches.
Do not run arbitrary remote scripts, request a compiler, silently change system
PATH, or require administrator privileges. Linux native browser-library needs
must be checked and reported honestly; a container-based fallback may be offered.
Dependency download failures preserve the last working runtime and show recovery.

Resolve installation files relative to the launcher/module. Keep config, voice
models, caches, jobs and logs in platform application-data directories, with an
explicit workspace/output override for automation. A read-only installation,
spaces/Unicode in paths and launches from another working directory must work.

Use an OS-assigned loopback port, readiness checks, owned child-process cleanup,
and authenticated GUI shutdown. Reopen a verified healthy existing instance;
never kill an arbitrary PID or process merely because a port is occupied.

Ship script launchers first, as requested. Signed native installers and universal
native launcher images are not a prerequisite for this repository migration.
Do not describe macOS/Windows as verified from Linux-only tests: require native
CI smoke evidence and document any outstanding interactive desktop checks.

### Hosted edition — recommended, pending approval

Cloudflare Worker serves the responsive GUI and authenticated API. Cloudflare
Containers run the same Linux render worker, including local Kokoro and FFmpeg.
Durable job state and result/checkpoint objects live outside ephemeral container
disks. Use Durable Objects for bounded scheduling/leases and R2 for objects;
add a separate queue only if it simplifies a demonstrated recovery requirement.

The submit request returns a durable job ID promptly. Rendering does not depend
on an open HTTP request or a phone tab remaining alive. Reopening the site shows
progress and the downloadable result. A container restart can resume verified
segments from R2. Temporary frames stay on local disk; persist completed segments
and receipts, not every individual PNG. Only a verified, durably stored result is
reported as complete. Failed uploads stay explicitly pending/retryable.

Treat this as a private owner application first, not a public unmetered rendering
service. Protect all job, source and result routes with server-side authentication
and authorization. Default to Cloudflare Access for interactive access and scoped
service credentials for CLI automation. Do not ship a public `/api/session` that
gives arbitrary visitors authority to run expensive jobs. Development auth bypass
must be local-only and explicitly unavailable in a hosted production build.

Keep provider keys and infrastructure tokens server-side. Set active-render,
queued-job, input-size, disk and daily compute limits with a visible stop control.
No paid resources, domains, accounts or deployments are created without approval.
The initial target is one owner; public signup, billing and multi-tenant SaaS are
out of scope. Preserve ownership checks so future expansion is not a security
rewrite. Do not integrate Drive or automatic publication in this migration.

Cloudflare Containers requires a paid Workers plan plus usage/storage charges.
Preserving Kokoro avoids needing a weaker voice purely for platform compatibility.
Software rendering must be benchmarked in the actual container before promising
throughput, latency or cost. A Docker image and emulator test are not evidence of
a successful live Cloudflare deployment.

### Alternative: static browser execution

A static Cloudflare deployment could run animation and a browser-compatible
voice/export backend on the user's device. It saves server compute but depends
on device memory, encoder availability and foreground browser execution. Browser
background throttling means it is not the proposed reliable unattended batch
backend. Do not silently substitute this for hosted background rendering.

If the owner chooses static-only hosting, revise the scope explicitly: keep the
local full-quality exporter, add a capability-checked in-browser exporter, label
its device/format/voice limits, and do not promise completion after phone lock.
Homunculus's browser voice adapter is relevant reuse, not proof that audio/video
export already works on every phone.

## Shared contracts and automation

Version the script, source catalog, job/event schemas and result manifest. Preserve
existing example scripts and source locks. Distinguish canonical comic text from
new commentary. Keep seeded choices reproducible without random replacement assets.

Proposed CLI surface (names can be refined before implementation):

```text
comic gui
comic doctor --json
comic select TEMPLATE --seed 42 --out script.json
comic validate script.json --json
comic render script.json --preview --json
comic submit script.json --json
comic batch manifest.json --concurrency 2 --json
comic status JOB_ID --json
comic wait JOB_ID --json
comic resume JOB_ID --json
comic cancel JOB_ID --json
comic download JOB_ID --out video.mp4 --json
```

All relevant commands accept an explicit local/remote backend and workspace;
support stdin JSON and unambiguous help/selection errors. Preserve a direct Node
entrypoint for developers. `--json` emits a stable JSON result to stdout, progress
to stderr; optional JSONL events serve automation. Exit codes distinguish invalid
input, missing prerequisites, authentication, retryable infrastructure failures,
failed jobs and cancellation. No prompts in automation mode.

Batch manifests identify each input, output destination and idempotency key.
Persist per-item results so rerunning a batch resumes/reuses successful jobs and
does not overwrite outputs or rerender all 100 items. One bad script does not
erase or falsely mark the batch complete. Default concurrency is one; validated
configuration raises a shared worker-pool limit, not an unconstrained process
fork per input. Separate CLI processes and the GUI honor the same capacity limit.

Submission snapshots scripts, uploaded recordings and exact asset references.
Jobs never depend on the continued existence of an external input pathname.
Idempotency is scoped to the authenticated owner and immutable request digest:
same key/same input returns the original job; same key/different input is an error.

Use explicit queued/running/retrying/cancelling/cancelled/failed/complete states,
stage progress and leases with fencing so stale workers cannot finalize a new
attempt. Retry transient faults with bounded backoff, not forever for invalid
scripts, missing assets or corrupt configuration. Preserve useful checkpoints.
Performance budgets are targets; never replace a delayed film with an end card.
Resource safety limits remain hard, explicit and recoverable where possible.

## Assets and portability

Commit a reviewed, self-contained runtime snapshot of needed assets with hashes
and provenance. Keep authoring `.blend` files, exported variants and shared emotion
presets canonical in Goosnav-3D-assets. Supply an explicit developer sync/verify
tool accepting a source checkout path; do not require that checkout at runtime.
No `.git` internals, LFS pointer stubs, private brain submodules, generated outputs,
credentials or caches enter the new repository or release archive.

Changing source content requires explicit catalog review, not a silent hash
refresh. Record new/revised reusable 3D assets in the assets repository and push
them before updating the application's pinned snapshot. Existing published
variants need verification, not duplicate generation.

## Delivery slices and acceptance

1. Extract the engine and tests without behavior changes. Run from a clean clone
   outside Ad Studio; produce and decode a real video with source hashes intact.
2. Add application-data paths, supervised job services, automation CLI and batch
   recovery. Prove GUI/CLI parity and a 100-item lightweight queue stress test;
   use a smaller real-render batch for expensive end-to-end evidence.
3. Add bootstrap launchers and native CI matrix. Exercise browser opening, second
   launch, port conflicts, path portability, failed downloads and interrupted setup.
4. Add the approved Cloudflare adapter, authenticated job API, R2 persistence,
   container build and recovery tests. Live deployment is a separate approval and
   credential step; do not claim remote success solely from local tests.
5. Write `README`, `CLI.txt`, JSON tutorial, deployment instructions and `DEV`
   architecture/decisions/failure-model/test evidence. Push verified code to the
   new repo; document any target platform not exercised.

Required regressions include readable correct book orientation, immediate
narration, all measured dialogue, expressive/seekable faces, seeded cameras,
spinning end-card fractional seeks, complete audio/video exports, corrupt segment
recovery, stale worker/render races, source locks, malicious paths, API access,
duplicate submissions, cancellation, closed-phone/reconnect and cloud restart.
Do not infer identical encoded bytes across different GPU/OS implementations.

## Outstanding owner decision

Is a paid Cloudflare rendering backend acceptable so a phone can submit a job,
close the tab, and return to a finished video? Recommended: yes, with conservative
concurrency and compute limits. Alternative: static/browser-only execution with
the foreground/device limitations above. Plan approval is not authorization to
incur deployment charges; deployment configuration and limits are confirmed first.

## Primary references checked 2026-10-21

- Cloudflare Containers: https://developers.cloudflare.com/containers/
- Instance limits: https://developers.cloudflare.com/containers/platform/limits/
- Pricing: https://developers.cloudflare.com/containers/platform/pricing/
- Ephemeral disks and lifecycle: https://developers.cloudflare.com/containers/faq/
- Workers runtime: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Background-tab behavior: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API

Provider capabilities and rates are external facts to recheck before deployment,
not constants scattered through application logic. This design makes no claim
that an instance size, runtime bootstrap or live hosted render has been tested yet.
