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
