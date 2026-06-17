# Changelog

All notable changes to `@starter-series/shotkit` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-06-18

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
- The demo post-processing pipeline (`webm → H.264 mp4` with `+faststart`,
  frame-accurate trim) shipped in 1.2.0 and remains available; it requires an
  `ffmpeg` on `PATH` or `SHOTKIT_FFMPEG`.
- The npm package surface is controlled by `package.json` `files`
  (`src`, `bin`, `skills/capture`, `docs/handoff-conventions.md`, `schemas`).
  The repo-local research harness (`scripts/`, `skills/research-to-product-fit/`,
  generated `research-runs/`) is not published.

[Unreleased]: https://github.com/starter-series/shotkit/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/starter-series/shotkit/releases/tag/v1.3.0
