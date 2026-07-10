---
name: capture
description: Autonomously produce publish-ready browser-extension launch assets with shotkit. Use for CWS/YouTube promo video, X video, YouTube Shorts, store screenshots, listing/privacy evidence, or channel variants. Infer mechanical channel settings, capture, validate, fix, and retry without asking the user to review media; escalate only after automated attempts are exhausted.
allowed-tools: Bash(shotkit*), Bash(node bin/shotkit.js*), Bash(npm run capture:store*), Bash(npm exec -- playwright install chromium), Read, Edit, Write
---

# Produce publish-ready launch assets with shotkit

shotkit drives the repo's **built** extension with Playwright and writes assets
into the config's `outDir` (default `store-assets/`). A successful run doubles
as a real-bundle smoke test — a screenshot or clip only appears if that feature
rendered from the shipped code. By default, it also writes a handoff pack:
`storyboard.json`, `captions.json`, and `shotkit-manifest.json`.

## Autonomous workflow

1. **Translate intent into targets** — infer channel profiles from the user's
   campaign request. Supported targets are `cws-youtube`, `x`, and
   `youtube-shorts`. Do not ask the user to choose viewport, codec, duration,
   thumbnail timing, or editor.
2. **Preconditions** — the repo has a `shotkit.config.js` (or legacy
   `store.config.js`); Chromium is installed (`npm exec -- playwright install chromium`,
   one-time); the config's `build` command succeeds.
3. **Create or update one story** — keep product actions and captions in one
   demo and declare channel variants through `targets`:

   ```js
   demo: {
     name: 'skillbridge',
     targets: ['cws-youtube', 'x'],
     captions: [
       { at: 0.5, text: 'Translate the lesson in place' },
       { at: 18, text: 'Restore the original anytime' },
     ],
     async run({ page, env, demo, target }) { /* one reusable story */ },
   }
   ```

   Shotkit expands target-specific names, viewport, H.264 MP4, 30-second cap,
   poster frame, and caption placement. Use `targetOptions.<id>` only when the
   shared story genuinely needs target-specific framing.
4. **Run attempt 1** (from the repo, or pass its path):

   ```bash
   shotkit --json --attempt 1
   shotkit <path> --json --attempt 1
   ```

   Before npm publication, run the source checkout with
   `node bin/shotkit.js --json --attempt 1`, or use a project wrapper such as
   `npm run capture:store -- --json`.

   Useful flags: `--scene <name>` (one story, expanded variant, static scene,
   `description`, or `privacy`),
   `--target <id>` (one channel target),
   `--no-video` (skip the screencast), `--mp4` (also emit an H.264 mp4 of the
   demo — needs ffmpeg on PATH or `SHOTKIT_FFMPEG`), `--no-build` (reuse an
   existing build).
5. **Read the result** — stdout is exactly one JSON object:
   `{ "ok": true, "status": "publish-ready", "outDir": "...", "manifest": "/abs/path/shotkit-manifest.json", "produced": [...] }`.
   Progress logs go to stderr in `--json` mode.
   Read `handoff.automation`, not the legacy human-oriented review summary.
6. **Fix and retry without user interruption**:
   - `publish-ready`: stop. Report final target files and upload authorization
     needed; do not ask the user to watch or edit them.
   - `needs-fix`: apply every `automation.actions[]` item whose owner is
     `agent`, edit the config, then rerun `automation.retryScenes[]` with
     `--attempt 2`. Repeat through `automation.maxAttempts`.
   - `blocked`: automated attempts are exhausted. Report only the concrete
     blocker and attempted fixes. This is the first point at which user input is
     appropriate.
   - `not-requested`: legacy capture mode; no channel target was configured.
7. **On runtime failure** — exit code `2` = usage/no config found, `1` = runtime
   failure; stdout still carries the single JSON payload
   `{ "ok": false, "error": … }`. Common causes: build failure, Chromium not
   installed, an unknown `--scene`, or a scene's wait timing out (feature didn't
   render).

## Notes

- Runs the full-Chromium channel; headless works (`HEADED=0 shotkit …` — verified,
  video included) and is the mode to use in CI. Headed-under-xvfb is
  unreliable on CI runners — don't use it.
- Scenes are the repo's own config — to change *what* is captured, edit
  `shotkit.config.js`, not shotkit.
- `description.from` may point to `STORE_LISTING.md` for copy only or to
  `product.manifest.json` for shared listing + privacy disclosure inputs.
  `privacy-disclosure.md` is a worksheet for store review, not legal policy text.
- CWS assets and SNS demo clips have different jobs. For X/SNS clips, prefer
  `demo.preset: 'sns-video'` (`1280×720`), `demo.mp4: { crf: 18 }`, 20-40
  seconds, short captions, first-result-within-3-seconds, and a
  before → action → result → safety/restore story. Use `sns-twitter`
  (`1200×675`) for static X card images.
- Demo configs can use timed `demo.captions` plus the helper passed to
  `demo.run`: `demo.caption(text)`, `demo.step(text, async () => { ... })`,
  `demo.wait(ms)`, `demo.click(selectorOrLocator, { moveMs, beforeMs, holdMs })`,
  and `demo.select(selectorOrLocator, value, { openMs, holdMs })`. Captions,
  arrow-pointer clicks, and mirrored native-select options render as DOM
  overlays during recording and avoid the top-left disclaimer badge. Always
  use `demo.select()` for a native `<select>` because its OS popup is not part
  of the Playwright page screencast.
- `storyboard.json` carries structured lint (`code`, `severity`, `message`,
  `fix`) for agents. Treat those warnings as the edit list for the next
  `shotkit.config.js` pass.
- Use `demos: []` for multiple campaign cuts. Each entry needs a unique `name`
  because it becomes `<name>.webm` and optional `<name>.mp4`; `--scene <name>`
  reruns just that clip.
- Use `thumbnail: { at: 1.2 }` for poster frames, `zoom: { scale: 1.04 }` or a
  small `crop` when the UI is too small. Keep storyboard lint on for every
  channel target; `storyboardLint:false` is only for legacy, non-publishing
  smoke clips and produces `needs-fix` for a target.
- Shotkit is not a timeline editor. It automates the repeatable channel work
  (capture, trim, framing, captions, encode, poster frame, QA) and leaves manual
  editors disabled by default. Use manifest roles instead of guessing files.
- Target workflows default to `automation.manualFallback:false`; manual editor
  recommendations are omitted. Never suggest iMovie, Screen Studio, Canva, or
  manual recapture unless the user explicitly requests a manual fallback.
- `publish-ready` means the final file passed shotkit's automated story, codec,
  pixel-format, actual-dimension, actual-duration, thumbnail, nonblank-frame,
  integrity, and channel-profile checks. External upload still requires the
  user's authorization or an authorized connector.
- Validate a received pack through `handoff.schemaFiles`; schema paths are
  relative to the manifest directory. On partial runs, compare each asset's
  `runId` with `manifest.run.id` and inspect `state` before assuming it was
  refreshed.
