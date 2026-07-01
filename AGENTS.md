# shotkit

A Playwright capture engine for store/social assets, used via the `shotkit` CLI,
`capture()` programmatically, or the `skills/capture/` Claude Code skill.
Vanilla JS, CommonJS, no build step.

## Run this tool (for agents)

To capture store/social assets from a repo that has a `shotkit.config.js`
(or legacy `store.config.js`):

```bash
node bin/shotkit.js --json          # from this source repo
node bin/shotkit.js <path> --json   # run against another checkout
```

After npm publication, installed projects can use `shotkit --json` or
`npm run capture:store -- --json` when the project defines that wrapper.

Prereqs: `npm exec -- playwright install chromium` (one-time); the config's `build`
command must succeed. Headless works (`HEADED=0`; verified on macOS + Linux CI,
video included); the local default is headed. Exit codes: `0` ok · `1` runtime
failure · `2` usage / no config. In `--json` mode progress logs go to stderr;
stdout is exactly one JSON object. Useful flags: `--scene <name>`,
`--mp4`, `--no-video`, `--no-build`.
Every run also writes `storyboard.json`, `captions.json`, and
`shotkit-manifest.json` unless `handoff:false` is set in config.

## Structure

```
src/
  capture.js     → capture(config, opts): the runner (build→launch→shot→caption→promo→video→describe)
  launch.js      → launchWithExtension / closeContext (persistent context, extension-id discovery)
  extension.js   → stageExtension / patchManifestForLocalhost
  serve.js       → serveDirectory (path-traversal-safe localhost fixture server)
  caption.js     → compositeCaption (disclaimer/caption band, stacked UNDER the shot)
  demo.js        → demo story helpers (DOM caption overlay + demo.caption/step/wait/click)
  promo.js       → renderPromoTile (HTML template → image)
  describe.js    → extractListing / renderDescriptionDoc (STORE_LISTING.md → copy)
  presets.js     → PRESETS / resolveSize (CWS + SNS sizes)
  video.js       → demo post-processing: mp4/trim/crop/zoom/thumbnail (real ffmpeg required)
  handoff.js     → storyboard/captions/shotkit-manifest JSON contract
  schemas/       → JSON schemas for the v1 handoff contract
  cli.js         → CLI arg parsing + config resolution (unit-tested)
  index.js       → public API (the contract — don't break exports)
bin/shotkit.js   → CLI (thin wrapper over capture(); --json agent contract)
skills/capture/  → Claude Code skill wrapping the CLI (Agent Skills format)
test/            → unit tests for the pure/safe modules (no browser)
```

## Invariants (don't regress)

- **`serve.js` path-safety**: never feed the request URL straight into `path.join`.
  Keep the `path.normalize(...).replace(/^(\.\.(\/|\\|$))+/, '')` sanitizer
  (CodeQL `js/path-injection`). There's a test for it.
- **Full-Chromium channel**: always `channel:'chromium'` — the headless-shell
  strips the extension subsystem; never switch to it. Under the full channel,
  headless **works** (`HEADED=0`; verified 2026-06-10 on macOS + Linux CI,
  recordVideo included); the local default stays headed for debuggability.
  Headed-under-xvfb is unsupported on CI runners (the 8-bit default breaks
  `Page.captureScreenshot`; a 24-bit screen still failed silently) — run
  headless in CI.
- **Caption band stacks UNDER the shot** (scene captured at `height - bandHeight`,
  band appended) so the final image is the exact preset size and no UI is hidden.
- **Demo captions and pointer highlights overlay the recorded page**, while the
  disclaimer badge stays top-left. Keep this lightweight: one `demo` or several
  `demos[]` entries, timed captions, `demo.caption/step/wait/click`, static
  `zoom`/`crop`, `thumbnail`, and storyboard lint — not a timeline editor.
- **Handoff JSON is the product boundary**: shotkit creates source evidence and
  metadata; external editors or MCP adapters do polish. Read
  `shotkit-manifest.json` first, then use `assets[].role` and the packaged
  `schemas/` files instead of filename guessing.
- **Adapter hints are product guidance**: `handoff.adapterHints[]` should tell
  agents which MCP/editor/video tool to try next and whether it is ready,
  missing assets, or missing non-shotkit inputs. Do not call those tools from
  shotkit itself.
- **Storyboard lint is structured for agents**: runtime logs are human strings,
  but `storyboard.json` carries `code`, `severity`, `message`, and `fix` so the
  next config edit can be mechanical.
- **`promo.js` innerHTML** is trusted, build-time content only (the repo's own
  template + config replacements) rendered in a throwaway page — not user input.
- **`config.build`** is a repo-committed command string run via shell on purpose
  (so projects can write `npm run build`); never derive it from external input.
- Unit tests cover only the pure modules; the browser path is verified by running
  a real consumer's capture (browser-extension-starter / skillBridge).

## Generalization rule (for the next starter-series capability)

One npm package (engine + thin CLI), one `*.config.js` contract for irreducible
per-repo intent, **agent surfaces matched to the tool's nature** — fast /
structured-data tools get an MCP tool taking a `path` (like `create-starter`'s
audits); heavy, file-producing build tools like shotkit get a `--json` CLI +
Claude Code skill + AGENTS.md run-block instead — plus one marketplace entry.
**The engine never reads project specifics except through the config contract.**
shotkit is the reference implementation of the non-MCP branch; mirror
[`create-starter`](https://github.com/starter-series/create-starter) for the
MCP branch.

## Dev

```bash
npm install
npm run install:browser   # playwright chromium (for an end-to-end run)
npm run lint
npm test
```

## Demo story guidance

CWS assets and SNS demo clips are different outputs. CWS screenshots/promo tiles
should be crisp inspection assets. X/SNS demo clips should be 20-40 seconds,
`preset:'sns-video'` (`1280×720`) when possible, H.264 mp4 (`demo.mp4` or
`--mp4`), and a short story: before → action → result → safety/restore. Use
`sns-twitter` (`1200×675`) for static X card images. Show a visible result in
the first 3 seconds, keep captions short, and move clicks or typing slowly
enough to read.
Use `demos: []` for multiple campaign cuts such as `demo-translate`,
`demo-restore`, or `demo-popup`; `--scene <name>` reruns just one clip.
Use `demo.click(selectorOrLocator, { moveMs, beforeMs, holdMs })` for visible cursor
pacing. Prefer `thumbnail: { at: 1.2 }`; use `zoom: { scale: 1.04 }` or a
small `crop` only when the key UI is too small. Storyboard lint warns; set
`storyboardLint:false` only for intentionally short smoke clips.
Read `shotkit-manifest.json` before handing assets to Screen Studio, Canva,
Supademo, or a connector. Use `handoff.adapterHints[]` to choose the next tool
instead of making the user research the ecosystem first.
