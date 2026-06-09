# shotkit

A Playwright capture engine for store/social assets, used via the `shotkit` CLI,
`capture()` programmatically, or the `skills/capture/` Claude Code skill.
Vanilla JS, CommonJS, no build step.

## Run this tool (for agents)

To capture store/social assets from a repo that has a `shotkit.config.js`
(or legacy `store.config.js`):

```bash
npx @starter-series/shotkit --json          # all assets; stdout = {ok, outDir, produced[]}
npx @starter-series/shotkit <path> --json   # run against another checkout
```

Prereqs: `npx playwright install chromium` (one-time); the config's `build`
command must succeed. Loading an MV3 extension needs a **headed** Chromium —
works as-is locally, `xvfb-run` in CI. Exit codes: `0` ok · `1` runtime
failure · `2` usage / no config. In `--json` mode progress logs go to stderr;
stdout is exactly one JSON object. Useful flags: `--scene <name>`,
`--no-video`, `--no-build`.

## Structure

```
src/
  capture.js     → capture(config, opts): the runner (build→launch→shot→caption→promo→video→describe)
  launch.js      → launchWithExtension / closeContext (persistent context, extension-id discovery)
  extension.js   → stageExtension / patchManifestForLocalhost
  serve.js       → serveDirectory (path-traversal-safe localhost fixture server)
  caption.js     → compositeCaption (disclaimer/caption band, stacked UNDER the shot)
  promo.js       → renderPromoTile (HTML template → image)
  describe.js    → extractListing / renderDescriptionDoc (STORE_LISTING.md → copy)
  presets.js     → PRESETS / resolveSize (CWS + SNS sizes)
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
- **Headed Chromium**: MV3 extensions only load headed (`channel:'chromium'`,
  `headless:false`). Runs headed locally, `xvfb-run` in CI. Don't "optimize" to
  headless.
- **Caption band stacks UNDER the shot** (scene captured at `height - bandHeight`,
  band appended) so the final image is the exact preset size and no UI is hidden.
- **`promo.js` innerHTML** is trusted, build-time content only (the repo's own
  template + config replacements) rendered in a throwaway page — not user input.
- **`config.build`** is a repo-committed command string run via shell on purpose
  (so projects can write `npm run build`); never derive it from external input.
- Unit tests cover only the pure modules; the browser path is verified by running
  a real consumer's capture (browser-extension-starter / skillBridge).

## Generalization rule (for the next starter-series capability)

One npm package (engine + thin CLI), one `*.config.js` seam for irreducible
per-repo intent, **agent surfaces matched to the tool's nature** — fast /
structured-data tools get an MCP tool taking a `path` (like `create-starter`'s
audits); heavy, file-producing build tools like shotkit get a `--json` CLI +
Claude Code skill + AGENTS.md run-block instead — plus one marketplace entry.
**The engine never reads project specifics except through the config seam.**
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
