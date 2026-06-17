---
name: capture
description: Capture Chrome Web Store + social promo assets (screenshots, promo tiles, demo screencast, listing copy) from a built browser extension using shotkit. Use when asked to generate store screenshots, CWS assets, promo/OG images, or a demo video for a repo that has a shotkit.config.js (or store.config.js).
allowed-tools: Bash(npx @starter-series/shotkit*), Bash(npm run capture:store*), Bash(npx playwright install chromium), Read
---

# Capture store/social assets with shotkit

shotkit drives the repo's **built** extension with Playwright and writes assets
into the config's `outDir` (default `store-assets/`). A successful run doubles
as a real-bundle smoke test — a screenshot or clip only appears if that feature
rendered from the shipped code. By default, it also writes a handoff pack:
`storyboard.json`, `captions.json`, and `shotkit-manifest.json`.

## Steps

1. **Preconditions** — the repo has a `shotkit.config.js` (or legacy
   `store.config.js`); Chromium is installed (`npx playwright install chromium`,
   one-time); the config's `build` command succeeds.
2. **Run** (from the repo, or pass its path):

   ```bash
   npx @starter-series/shotkit --json
   npx @starter-series/shotkit <path> --json   # against another checkout
   ```

   Useful flags: `--scene <name>` (one scene/promoTile/demo/demos entry or `description`),
   `--no-video` (skip the screencast), `--mp4` (also emit an H.264 mp4 of the
   demo — needs ffmpeg on PATH or `SHOTKIT_FFMPEG`), `--no-build` (reuse an
   existing build).
3. **Read the result** — stdout is exactly one JSON object:
   `{ "ok": true, "outDir": "...", "produced": ["/abs/path/01-….png", …] }`.
   Progress logs go to stderr in `--json` mode.
   For follow-up editing, read `shotkit-manifest.json` first; it lists the
   mp4/webm, thumbnail, captions, storyboard, schema ids, recommended handoff
   flow, and `handoff.adapterHints[]` for likely next tools/connectors.
4. **On failure** — exit code `2` = no config found, `1` = runtime failure;
   stderr carries `{ "ok": false, "error": … }`. Common causes: build failure,
   Chromium not installed, a scene's wait timing out (feature didn't render).

## Notes

- Runs the full-Chromium channel; headless works (`HEADED=0 npx …` — verified,
  video included) and is the mode to use in CI. Headed-under-xvfb is
  unreliable on CI runners — don't use it.
- Scenes are the repo's own config — to change *what* is captured, edit
  `shotkit.config.js`, not shotkit.
- CWS assets and SNS demo clips have different jobs. For X/SNS clips, prefer
  `demo.preset: 'sns-video'` (`1280×720`), `demo.mp4: { crf: 18 }`, 20-40
  seconds, short captions, first-result-within-3-seconds, and a
  before → action → result → safety/restore story. Use `sns-twitter`
  (`1200×675`) for static X card images.
- Demo configs can use timed `demo.captions` plus the helper passed to
  `demo.run`: `demo.caption(text)`, `demo.step(text, async () => { ... })`,
  `demo.wait(ms)`, and `demo.click(selectorOrLocator, { moveMs, beforeMs, holdMs })`.
  Captions and click highlights render as DOM overlays during recording and
  avoid the top-left disclaimer badge.
- `storyboard.json` carries structured lint (`code`, `severity`, `message`,
  `fix`) for agents. Treat those warnings as the edit list for the next
  `shotkit.config.js` pass.
- Use `demos: []` for multiple campaign cuts. Each entry needs a unique `name`
  because it becomes `<name>.webm` and optional `<name>.mp4`; `--scene <name>`
  reruns just that clip.
- Use `thumbnail: { at: 1.2 }` for poster frames, `zoom: { scale: 1.04 }` or a
  small `crop` when the UI is too small, and keep storyboard lint on unless the
  clip is intentionally short.
- Do not position shotkit as a video editor. It is the source capture +
  handoff layer before Screen Studio, Canva, Supademo, or future MCP adapters.
  Use `assets[].role` from `shotkit-manifest.json` rather than guessing
  filenames.
- When the user asks "what should I connect next?", inspect
  `handoff.adapterHints[]`. Prefer `readiness:"ready"` hints first; treat
  `needs-input` as a prompt to ask for missing avatar/audio/brand inputs; treat
  `needs-assets` as a prompt to rerun shotkit with mp4/thumbnail/captions.
