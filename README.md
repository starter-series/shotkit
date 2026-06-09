<div align="center">

# shotkit

**Capture store + social promo assets from a built browser extension — with Playwright.**

Screenshots · promo images · demo screencast · listing copy. One command.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](.nvmrc)

**English** | [한국어](README.ko.md)

</div>

---

> **Part of [Starter Series](https://github.com/starter-series)** — reusable tooling, not just clone-templates. `shotkit` is the first capability extracted into an installable package so any repo (and any agent) can use it without copy-paste.

---

## Status & Scope

- **Currently implemented** — A Playwright capture **engine** (build → launch the *built* extension via `launchPersistentContext(--load-extension)` → drive scenes → screenshot → caption/disclaimer band → promo tile from HTML → demo `webm` → listing copy from `STORE_LISTING.md`), a **CLI** (`shotkit`), **size presets** for both audiences (CWS `1280×800`/`440×280`, SNS `1200×675`/`1200×630`/`1080×1080`), a **path-traversal-safe** localhost fixture server, and a programmatic API (`capture()`). Consumed by `browser-extension-starter` and `skillBridge`.
- **Planned** — an **MCP stdio tool** (`capture_assets({ path })`) so an agent can run captures against any checkout with zero per-repo install; a **Claude Code skill/command** (`/capture`); a listing in the `starter-series` plugin **marketplace**; **video editing** (`webm → mp4`, trim, captions) for SNS; npm publish via OIDC.
- **Design intent** — *One engine, many surfaces* (the pattern [`create-starter`](https://github.com/starter-series/create-starter) already proves: a single engine fronted by CLI + MCP + skill). Captures are **deterministic** (login-free fixtures, frozen data) and the run **doubles as a real-bundle smoke test** — a screenshot only appears if that feature rendered from the shipped code. **Trademark-safe** by construction: a disclaimer band is composited onto every shot.
- **Non-goals** — Removing the per-repo **scene config** (which screens are *your* money shots is irreducible intent — it lives in your `shotkit.config.js`). A general-purpose video editor (v1 records a clean screencast; editing is Planned). A hosted service (file-touching capture is local/stdio by nature).
- **Redacted** — none. Ships no private data, credentials, or third-party identifiers.

## Install

```bash
npm i -D @starter-series/shotkit
npx playwright install chromium    # one-time: the browser shotkit drives
```

Or zero-install in any repo that has a config:

```bash
npx @starter-series/shotkit
```

> Loading an MV3 extension requires a **headed** Chromium — runs headed locally, under `xvfb-run` in CI. Set `HEADED=0` to force headless (not recommended for extensions).

## Usage

Add a `shotkit.config.js` (the per-repo seam — see the contract below), then:

```bash
shotkit                       # produce everything into outDir
shotkit --scene 01-feature    # just one scene/promoTile/demo, or "description"
shotkit --no-video            # skip the screencast (faster/CI)
shotkit --no-build            # use an already-built bundle
```

Outputs land in `outDir` (default `store-assets/`): `<scene>.png`, `<promoTile>.png`, `<demo>.webm`, `description.md`.

## Config contract (`shotkit.config.js`)

```js
const { serveDirectory, stageExtension, patchManifestForLocalhost } = require('@starter-series/shotkit');

module.exports = {
  build: 'npm run build',                 // run first → real-bundle smoke test (optional)
  prepareExtension: () => '<unpacked dir>', // dir to --load-extension (often a patched temp copy)
  outDir: 'store-assets',
  disclaimer: 'Unofficial · not affiliated with …', // composited onto every shot (optional)
  description: { from: 'store-assets/STORE_LISTING.md' }, // → description.md (optional)

  async setup({ context, extensionId, flags }) {  // e.g. start a fixture server / stubs
    return { env: { baseUrl }, teardown: async () => {} };
  },

  scenes: [
    { name: '01-feature', preset: 'cws-screenshot', caption: 'What this shows',
      async run({ page, context, extensionId, env, baseUrl, flags }) {
        await page.goto(`${env.baseUrl}/page`);  // drive the UI, wait until rendered
      } },
  ],

  promoTiles: [{ name: 'promo', template: 'path/to/promo.html', preset: 'cws-promo-small',
                 replacements: { NAME: 'My Ext' } }],

  demo: { name: 'demo', preset: 'cws-screenshot', async run({ page, env }) { /* walkthrough */ } },
};
```

- A scene/tile takes a **`preset`** name or an explicit `{ width, height }` (see `PRESETS`).
- The harness reduces a captioned scene's capture height by the band height and stacks the band under it, so the final image is exactly the preset size and **no UI is hidden**.

## Public API

`require('@starter-series/shotkit')` →
`capture(config, opts)` · `serveDirectory` · `stageExtension` · `patchManifestForLocalhost` ·
`launchWithExtension` · `closeContext` · `compositeCaption` · `renderPromoTile` ·
`extractListing` · `renderDescriptionDoc` · `PRESETS` · `resolveSize`.

## Roadmap — one engine, many surfaces

| Surface | Status | For |
|---|---|---|
| CLI (`shotkit`, `npx`) | ✅ now | humans / CI, zero-install |
| Programmatic `capture()` | ✅ now | embedding |
| **MCP stdio tool** `capture_assets({ path })` | planned | **agents, any repo, no install** |
| Claude Code skill/command `/capture` | planned | Claude Code users |
| `starter-series` marketplace entry | planned | discovery |
| Video editing (`webm→mp4`, trim, captions) | planned | SNS clips |

**Generalization rule** (for the next capability in the series): *one npm package (engine + thin CLI), one `*.config.js` seam for irreducible per-repo intent, one MCP tool taking a `path`, one Claude Code skill, one marketplace entry. The engine never reads project specifics except through the config seam.*

## License

[MIT](LICENSE) © heznpc
