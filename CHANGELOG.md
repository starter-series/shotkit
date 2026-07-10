# Changelog

All notable changes to `shotkit` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Autonomous channel profiles for `cws-youtube`, `x`, and `youtube-shorts`.
  One demo story can declare `targets[]`; shotkit expands target variants and
  applies viewport, H.264, duration-cap, caption, and thumbnail defaults.
- Final MP4 probing through ffprobe plus PNG pixel QA for blank/uniform poster
  frames. The manifest now carries per-target checks and media metadata.
- Publish targets cannot bypass story checks with `storyboardLint:false`.
- `demo.select()` mirrors native select options into page recordings while
  applying the real value change; pointer actions now use a visible arrow and
  click ripple instead of an ambiguous circle.
- Exception-only `handoff.automation`: `publish-ready`, `needs-fix`, and
  exhausted `blocked` states, agent-owned fix/rerun actions, `--target`, and
  bounded `--attempt` retries.
- Every handoff pack now bundles its three JSON Schemas, exposes their
  manifest-relative paths, and records byte size plus SHA-256 integrity for
  each delivered file except the self-referential manifest.
- The manifest now carries additive v1 metadata for the agent-ready launch
  asset category, current run selection, per-asset provenance/state, a
  manifest-level review summary, and the number of asset-ready adapters.

### Changed
- Package identity is now the unscoped npm product noun `shotkit`.
- The handoff manifest `tool` field now emits `shotkit`, matching the package
  and CLI identity.
- `--json` success results now return the absolute `manifest` entrypoint.
- Public messaging now leads with the autonomous publish-ready launch asset
  pipeline; Playwright remains the implementation mechanism.
- Target workflows no longer route routine work to human review or manual
  editors. Manual adapter hints require `automation.manualFallback:true`.

### Fixed
- `step(text, fn, options)` now honors flat caption display options (e.g.
  `{ position }`, by analogy with `caption()`) instead of silently dropping
  anything outside `options.captionOptions`.
- `lintDemoStoryboard()` no longer emits a spurious "missing mp4" warning when
  the demo config sets `mp4`/`crop`/`zoom` — the public caller need not pass
  `mp4Requested`.
- A thumbnail-only demo (no mp4/crop/zoom/trim) no longer re-muxes and
  overwrites the source `.webm`; the thumbnail is taken from the original clip.
- Partial handoff runs prune missing outputs, replace every retained format for
  a refreshed logical source, mark untouched assets as `retained`, and flag
  changed retained evidence as `modified` instead of recommending it.
- A fresh `--no-video` run with configured demos now reports an `incomplete`
  review and does not claim storyboard-only adapter readiness.
- Final handoff publication validates all three documents with the packaged
  AJV schemas, rejects duplicate asset IDs/paths, and writes JSON through atomic
  temporary-file renames. Malformed or foreign prior packs are no longer merged
  into a partial run.
- New manifest fields remain additive under contract v1; the original v1
  `positioning` and storyboard `purpose` constants stay unchanged.

## 1.3.0 - 2026-06-18 (source-staged)

### Added
- **Demo story renderer** — demo configs accept a single `demo` or several
  `demos: []` entries with timed `captions`, pointer-highlighted clicks, paced
  cursor movement, static zoom/crop framing, thumbnail frames, storyboard lint,
  and a small `demo` helper (`caption`, `step`, `wait`, `click`) for turning a
  feature checklist into short before → action → result stories.
- **Handoff contract** — emits a `storyboard.json` / `captions.json` /
  `shotkit-manifest.json` handoff pack, with JSON Schemas under `schemas/` so a
  downstream agent can consume the output against a stable contract. The
  conventions are documented in [`docs/handoff-conventions.md`](docs/handoff-conventions.md).
- **Integrations module** for wiring captured assets into a consuming project.

### Fixed
- Handoff caption/beat times are now relative to the delivered (trimmed) clip —
  `trim.start` is subtracted and captions before the clip start are dropped — so
  `captions.json`/`storyboard.json` line up with the mp4, not the raw recording.
- Storyboard fields are coerced to the published schema (object `preset` omitted,
  bare-number `thumbnail` → `{ at }`, non-object `trim` → `null`), so a loosely-typed
  demo config no longer emits a schema-invalid storyboard.
- A scene-filtered or `--no-video` run now MERGES into the existing handoff
  contract instead of overwriting a prior full run's storyboard/captions/manifest.
- Post-processed mp4/thumbnail assets no longer record the source-viewport size
  when `crop` changes the output dimensions (size is omitted rather than wrong).
- A thumbnail seek past the end of a trimmed clip no longer records a phantom
  asset — the file's existence is verified before it is recorded.
- One demo failing (e.g. mp4 requested with no ffmpeg) no longer aborts the
  remaining demos, the handoff pack, or temp-dir cleanup.
- Storyboard lint no longer throws on a malformed `trim.duration`/caption time;
  it surfaces as a lint warning, as documented.
- ffmpeg arg/filter validation: a zero/negative `crop` dimension, a non-finite
  `mp4.crf`, or a NaN `zoom` offset now fail with a clear shotkit error instead
  of an opaque ffmpeg parse failure.
- `demo.captions` must be an array — validated at config-normalize time (fail
  fast) rather than late, mid-capture.
- Handoff readiness no longer claims `high` confidence for a recommendation with
  no captured clip, and the source `.webm` is surfaced to video editors even
  when no mp4 was produced.
- Added an ajv (draft 2020-12) schema-validation test that checks emitted
  storyboard/captions/manifest documents against `schemas/`.

### Notes
- Source files are versioned at `1.3.0`, but no `v1.3.0` GitHub release tag or
  public npm publication is assumed until the release step is cut.
- The demo post-processing pipeline (`webm → H.264 mp4` with `+faststart`,
  frame-accurate trim) shipped in 1.2.0 and remains available; it requires an
  `ffmpeg` on `PATH` or `SHOTKIT_FFMPEG`.
- The npm package surface is controlled by `package.json` `files`
  (`src`, `bin`, `skills/capture`, `docs/handoff-conventions.md`, `schemas`).
  The repo-local research harness (`scripts/`, `skills/research-to-product-fit/`,
  generated `research-runs/`) is not published.

[Unreleased]: https://github.com/starter-series/shotkit/compare/v1.2.0...HEAD
