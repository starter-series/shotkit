---
name: capture
description: Capture Chrome Web Store + social promo assets (screenshots, promo tiles, demo screencast, listing copy) from a built browser extension using shotkit. Use when asked to generate store screenshots, CWS assets, promo/OG images, or a demo video for a repo that has a shotkit.config.js (or store.config.js).
allowed-tools: Bash(npx @starter-series/shotkit*), Bash(npm run capture:store*), Bash(npx playwright install chromium), Read
---

# Capture store/social assets with shotkit

shotkit drives the repo's **built** extension with Playwright and writes assets
into the config's `outDir` (default `store-assets/`). A successful run doubles
as a real-bundle smoke test — a screenshot only appears if that feature
rendered from the shipped code.

## Steps

1. **Preconditions** — the repo has a `shotkit.config.js` (or legacy
   `store.config.js`); Chromium is installed (`npx playwright install chromium`,
   one-time); the config's `build` command succeeds.
2. **Run** (from the repo, or pass its path):

   ```bash
   npx @starter-series/shotkit --json
   npx @starter-series/shotkit <path> --json   # against another checkout
   ```

   Useful flags: `--scene <name>` (one scene/promoTile/demo or `description`),
   `--no-video` (skip the screencast), `--no-build` (reuse an existing build).
3. **Read the result** — stdout is exactly one JSON object:
   `{ "ok": true, "outDir": "...", "produced": ["/abs/path/01-….png", …] }`.
   Progress logs go to stderr in `--json` mode.
4. **On failure** — exit code `2` = no config found, `1` = runtime failure;
   stderr carries `{ "ok": false, "error": … }`. Common causes: build failure,
   Chromium not installed, a scene's wait timing out (feature didn't render).

## Notes

- Runs the full-Chromium channel; headless works (`HEADED=0 npx …` — verified,
  video included) and is the mode to use in CI. Headed-under-xvfb is
  unreliable on CI runners — don't use it.
- Scenes are the repo's own config — to change *what* is captured, edit
  `shotkit.config.js`, not shotkit.
