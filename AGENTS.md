# shotkit

A Playwright capture engine for store/social assets, used via the `shotkit` CLI,
`capture()` programmatically, or (planned) an MCP tool. Vanilla JS, CommonJS, no
build step.

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
  index.js       → public API (the contract — don't break exports)
bin/shotkit.js   → CLI (thin wrapper over capture())
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
per-repo intent, one MCP tool taking a `path`, one Claude Code skill, one
marketplace entry. **The engine never reads project specifics except through the
config seam.** shotkit is the reference implementation of this pattern; mirror
[`create-starter`](https://github.com/starter-series/create-starter) for the
CLI+MCP+plugin surfaces when adding them.

## Dev

```bash
npm install
npm run install:browser   # playwright chromium (for an end-to-end run)
npm run lint
npm test
```
