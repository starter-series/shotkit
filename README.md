<div align="center">

# shotkit

**Capture browser-extension store assets and demo handoff packs — with Playwright.**

Screenshots · promo images · demo clips · storyboard · handoff manifest. One command.

[![npm](https://img.shields.io/npm/v/%40starter-series%2Fshotkit)](https://www.npmjs.com/package/@starter-series/shotkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](.nvmrc)

**English** | [한국어](README.ko.md)

</div>

---

> **Part of [Starter Series](https://github.com/starter-series)** — reusable tooling, not just clone-templates. `shotkit` is the first capability extracted into an installable package so any repo (and any agent) can use it without copy-paste.

---

## Status & Scope

- **Currently implemented** — A Playwright capture **engine** (build → launch the *built* extension via `launchPersistentContext(--load-extension)` → drive scenes → screenshot → caption/disclaimer band → promo tile from HTML → demo `webm` with DOM caption overlays → listing copy from `STORE_LISTING.md` or `product.manifest.json` → optional `privacy-disclosure.md` worksheet → `storyboard.json` / `captions.json` / `shotkit-manifest.json` handoff pack), a **CLI** (`shotkit`) with an **agent contract** (`--json` machine output, optional `path` argument, `0/1/2` exit codes), **size presets** for both audiences (CWS `1280×800`/`440×280`, SNS `1200×675`/`1280×720`/`1200×630`/`1080×1080`), a **path-traversal-safe** localhost fixture server, a programmatic API (`capture()`), a **Claude Code plugin + skill** ([`skills/capture/`](skills/capture/SKILL.md); `/plugin install shotkit@starter-series`), an **AGENTS.md run-block** so any shell-having coding agent can invoke it, the **npm package** [`@starter-series/shotkit`](https://www.npmjs.com/package/@starter-series/shotkit), and **demo post-processing** for SNS (`webm → H.264 mp4` with `+faststart`, frame-accurate **trim**, static crop/zoom framing, thumbnails — needs an ffmpeg on PATH or `SHOTKIT_FFMPEG`; GitHub ubuntu runners ship one). Consumed by `browser-extension-starter` and `skillBridge`.
- **Story renderer** — Demo configs can use one `demo` or several `demos: []` entries, timed `captions`, pointer-highlighted clicks, paced cursor movement, static zoom/crop framing, thumbnail frames, storyboard lint, and a small `demo` helper (`caption`, `step`, `wait`, `click`) so an agent can turn a feature checklist into 20-40 second before → action → result stories without pulling in a general video editor.
- **Design intent** — *One engine, many surfaces — matched to the tool's nature.* shotkit is a heavy, file-producing build tool, so its surfaces are CLI (+`--json`), skill, and CI — not MCP (see Non-goals). Captures are **deterministic** (login-free fixtures, frozen data) and the run **doubles as a real-bundle smoke test** — a screenshot only appears if that feature rendered from the shipped code. **Trademark-safe** by construction: a disclaimer band is composited onto every shot.
- **Non-goals** — An **MCP server** inside shotkit (dropped by design: agents with a shell get a better contract from `--json` + the skill). Removing the per-repo **scene config** (which screens are *your* money shots is irreducible intent — it lives in your `shotkit.config.js`). A general-purpose video editor or hosted demo platform. shotkit creates source evidence and a handoff pack; Screen Studio, Canva, Supademo, or future MCP connectors can do polish later.
- **Redacted** — none. Ships no private data, credentials, or third-party identifiers.

## Install

```bash
npm i -D @starter-series/shotkit
npx playwright install chromium    # one-time: the browser shotkit drives
```

Or as a **Claude Code plugin** (bundles the capture skill):

```text
/plugin marketplace add starter-series/create-starter
/plugin install shotkit@starter-series
```

Zero-install in any repo that has a config:

```bash
npx @starter-series/shotkit
```

> shotkit launches the **full Chromium** (`channel: 'chromium'`) — never the default headless-shell, which strips the extension subsystem. **Headless works** (`HEADED=0`; verified on macOS and Linux CI, video included) and is the CI default in the starter's capture workflow; the local default stays headed for easy debugging. Headed-under-xvfb proved unreliable on CI runners (the 8-bit default breaks Chromium's screenshot capture, and a 24-bit screen still failed silently) — run headless in CI.

## Usage

Add a `shotkit.config.js` (the per-repo capture contract), then:

```bash
shotkit                         # produce everything into outDir
shotkit --scene 01-feature      # just one scene/promoTile/demo/demos entry, "description", or "privacy"
shotkit --no-video              # skip the screencast (faster/CI)
shotkit --no-build              # use an already-built bundle
shotkit ../my-extension --json  # run against another checkout; JSON result on stdout
```

Outputs land in `outDir` (default `store-assets/`): `<scene>.png`, `<promoTile>.png`, `<demo>.webm`, optional `<demo>.mp4`, optional `<demo>-thumbnail.png`, `description.md`, optional `privacy-disclosure.md`, and, by default, `storyboard.json`, `captions.json`, and `shotkit-manifest.json` (`handoff: false` disables the handoff files).

### Handoff Pack

shotkit is not trying to beat video editors. It is the starter layer before
them: capture the real built extension, write source clips, and describe what
the clips mean.

- `storyboard.json` — demo names, audience, viewport, trim/framing hints, beats,
  structured storyboard lint warnings, and suggested next tool.
- `captions.json` — portable caption timings and text per demo.
- `shotkit-manifest.json` — asset list, output paths, roles, project info, and
  recommended handoff flow plus `adapterHints` for likely next tools.

This makes external polish easier: an agent or MCP connector can read the
manifest, open the mp4/webm + thumbnail + captions in Screen Studio, Canva,
Supademo, or another editor, and keep the repo fixture/storyboard as the source
of truth.

The manifest also recommends possible downstream connections. For example,
`figma-mcp` appears when the run has enough thumbnail/storyboard material for a
design handoff, `higgsfield` appears for AI-video campaign variants, and
`longcat-video-avatar` is marked as needing extra avatar/voice input when the
captured assets are not enough by themselves. shotkit suggests the next tool;
the agent's own MCP/tool environment performs the connection.

The convention is versioned and schema-backed. `$schema` values are URN
identifiers; load the actual schema files from the installed package. See
[`docs/handoff-conventions.md`](docs/handoff-conventions.md) and the packaged
schemas under [`schemas/`](schemas/).

Project-specific application plans stay repo-internal and are not included in
the npm package.

### CWS assets vs SNS demo clips

Chrome Web Store assets are inspection surfaces: crisp screenshots, promo tiles,
listing copy, and trademark-safe disclaimer bands. They should make the product
legible at store dimensions.

SNS demo clips are story surfaces: short, captioned walkthroughs that show the
result quickly, then the action and safety/restore path. For X demo video,
prefer `preset: 'sns-video'` (`1280×720`, 16:9) plus H.264 mp4 because H.264
`yuv420p` wants even dimensions. Use `sns-twitter` (`1200×675`) for static X
card images.

### Demo → mp4 / trim (SNS)

SNS uploaders (X, etc.) want H.264 mp4, not webm. Add `--mp4` (or configure it) and
shotkit post-processes the recording — silent H.264, `yuv420p`, `+faststart`:

```js
demo: {
  name: 'demo',
  preset: 'sns-video',
  mp4: true,                                // or { crf: 18 }
  trim: { start: 2, duration: '00:30' },    // optional; applied to the mp4
  zoom: { scale: 1.06 },                    // optional static center zoom
  thumbnail: { at: 1.2 },                   // writes demo-thumbnail.png
  async run({ page, env }) { /* … */ },
}
```

`trim` without `mp4` stream-copy-trims the webm in place. Requires a real
ffmpeg (`brew install ffmpeg` / `apt-get install -y ffmpeg`; GitHub ubuntu
runners have one; override with `SHOTKIT_FFMPEG`) — Playwright's bundled
ffmpeg is vp8-only and can't encode H.264. If mp4/trim/crop/zoom/thumbnail is
requested and no ffmpeg is found, the run fails with the install hint rather
than skipping.

### Demo story controls

Captions render as a DOM overlay while Playwright records the page. The default
position is lower-left, with a translucent background, large text, safe padding,
and no collision with the top-left disclaimer badge.

Clicks made through `demo.click(selectorOrLocator)` show a synthetic pointer and
click ripple in the recording. Tune pacing with `{ moveMs, beforeMs, holdMs }`,
or turn it off with `{ highlight: false }`. A Playwright Locator or `{ x, y }`
point also works when selectors are awkward.

Use either timed captions, the helper API, or both:

```js
demo: {
  name: 'demo',
  preset: 'sns-video',
  mp4: { crf: 18 },
  trim: { start: 0, duration: '00:35' },
  thumbnail: { at: 1.2 },
  zoom: { scale: 1.04 },
  captions: [
    { at: 0.5, text: 'Open the course page' },
    { at: 4.0, text: 'Translate visible lesson text' },
    { at: 11.0, text: 'Protected AI terms stay intact' },
    { at: 18.0, text: 'Restore the original anytime' },
  ],
  async run({ page, env, demo }) {
    await demo.step('Open the course page', async () => {
      await page.goto(`${env.baseUrl}/course`, { waitUntil: 'networkidle' });
    });
    await demo.step('Translate visible lesson text', async () => {
      await demo.click('[data-demo-translate]', { moveMs: 420, holdMs: 900 });
      await page.waitForSelector('[data-demo-translated="true"]');
    });
    await demo.caption('Restore the original anytime');
    await demo.click('[data-demo-restore]');
    await demo.wait(900);
  },
}
```

Framing options are intentionally small:

```js
demo: {
  crop: { x: 120, y: 0, width: 1040, height: 720 }, // output a cropped mp4
  zoom: { scale: 1.08 },                            // center zoom, still 16:9
  thumbnail: { at: 1.5 },                           // poster frame
  storyboardLint: false,                            // optional escape hatch
}
```

Storyboard lint runs by default and logs warnings instead of failing the run.
The same warnings are written to `storyboard.json` with `code`, `severity`,
`message`, and `fix`, so an agent can revise `shotkit.config.js` on the next
pass. Current checks cover missing mp4, first caption after 3 seconds, odd video
dimensions, long captions, missing safety/restore beat, crop/zoom edge risk, and
clips outside the 20-40 second target.

For several campaign cuts, keep the old single `demo` field out and use
`demos: []`. Each entry writes `<name>.webm` and optional `<name>.mp4`, and
`--scene <name>` captures just that clip:

```js
demos: [
  {
    name: 'demo-translate',
    preset: 'sns-video',
    mp4: { crf: 18 },
    thumbnail: { at: 1.2 },
    trim: { start: 0, duration: '00:30' },
    captions: [
      { at: 0.5, text: 'Translate the lesson in place' },
      { at: 8.0, text: 'Protected terms stay safe' },
      { at: 18.0, text: 'Restore the original anytime' },
    ],
    async run({ page, env, demo }) { /* feature story */ },
  },
  {
    name: 'demo-restore',
    preset: 'sns-video',
    mp4: { crf: 18 },
    captions: [{ at: 0.5, text: 'Restore the original anytime' }],
    async run({ page, env, demo }) { /* safety story */ },
  },
]
```

Good demo stories stay 20-40 seconds, show a visible result in the first 3
seconds, follow before → action → result → safety/restore, keep captions short,
move cursor/click/typing actions slowly, and use mp4 for X.

### Agent contract (`--json`)

`shotkit [path] --json` prints **exactly one JSON object** to stdout (progress
logs move to stderr):

```json
{ "ok": true, "outDir": "/abs/store-assets", "produced": ["/abs/store-assets/01-popup.png"] }
```

Exit codes: `0` ok · `1` runtime failure (stderr carries `{"ok":false,"error":…}`) ·
`2` usage / no config found. Drop-in agent wiring: the run-block in
[`AGENTS.md`](AGENTS.md) (read by Claude Code, Codex, Cursor, Gemini CLI, …) and
the [`skills/capture/`](skills/capture/SKILL.md) skill (Agent Skills format —
copy the folder into any compatible tool's skills directory).

## Config contract (`shotkit.config.js`)

```js
const { serveDirectory, stageExtension, patchManifestForLocalhost } = require('@starter-series/shotkit');

module.exports = {
  build: 'npm run build',                 // run first → real-bundle smoke test (optional)
  prepareExtension: () => '<unpacked dir>', // dir to --load-extension (often a patched temp copy)
  outDir: 'store-assets',
  disclaimer: 'Unofficial · not affiliated with …', // composited onto every shot (optional)
  description: { from: 'store-assets/STORE_LISTING.md' }, // → description.md (optional)
  // Or: { from: 'product.manifest.json', channel: 'chromeWebStore' }

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

  // Use `demo` for one canonical clip, or `demos: []` for campaign variants.
  demos: [
    { name: 'demo-feature', preset: 'sns-video', mp4: { crf: 18 },
      trim: { start: 0, duration: '00:30' },
      captions: [
        { at: 0.5, text: 'Show the result first' },
        { at: 18.0, text: 'Restore the original anytime' },
      ],
      async run({ page, env, demo }) { /* walkthrough with demo.step/click/wait */ } },
  ],
};
```

- A scene/tile takes a **`preset`** name or an explicit `{ width, height }` (see `PRESETS`).
- The harness reduces a captioned scene's capture height by the band height and stacks the band under it, so the final image is exactly the preset size and **no UI is hidden**.
- Demo captions are overlays inside the recorded page, not screenshot bands; they are meant for story clips, not CWS screenshots.
- Demo names must be unique across `demo` and `demos` because they become output filenames.

### Product manifest listing/privacy

Use `STORE_LISTING.md` when you want human-edited copy only. Use
`product.manifest.json` when listing copy, permission disclosures, and future
launch tooling should share one source of truth:

```js
module.exports = {
  description: { from: 'product.manifest.json', channel: 'chromeWebStore' },
};
```

Minimal manifest:

```json
{
  "product": {
    "name": "SkillBridge",
    "summary": "Translate selected text safely.",
    "description": "A browser extension for protected-term translation.",
    "category": "Productivity"
  },
  "stores": {
    "chromeWebStore": {
      "title": "SkillBridge Translator",
      "whatsNew": "- Rebuilt launch disclosures"
    }
  },
  "privacy": {
    "dataCollection": "No sale of personal data.",
    "dataUse": "Selected text is sent only when the user requests translation.",
    "permissions": [
      {
        "name": "storage",
        "purpose": "Save local preferences",
        "disclosure": "Stores settings on this device."
      }
    ],
    "dataFlows": [
      {
        "data": "Selected text",
        "source": "Active page",
        "destination": "Translation API",
        "purpose": "Return translated text",
        "retention": "Not retained by the extension"
      }
    ]
  }
}
```

`privacy-disclosure.md` is a review worksheet for store disclosure and README
permission tables. It is intentionally not a privacy policy generator.

## Public API

`require('@starter-series/shotkit')` →
`capture(config, opts)` · `serveDirectory` · `stageExtension` · `patchManifestForLocalhost` ·
`launchWithExtension` · `closeContext` · `compositeCaption` · `renderPromoTile` ·
`extractListing` · `extractProductManifest` · `renderDescriptionDoc` ·
`renderPrivacyDisclosureDoc` · `PRESETS` · `resolveSize` ·
`createDemoController` · `normalizeDemoConfigs` · `analyzeDemoStoryboard` ·
`lintDemoStoryboard` · `installDemoCaptionOverlay` · `setDemoCaption` ·
`buildVideoFilter` · `buildThumbnailArgs` · `HANDOFF_VERSION` ·
`HANDOFF_SCHEMA_IDS` · `buildHandoffDocs` · `writeHandoffDocs`.

## Roadmap — one engine, many surfaces

| Surface | Status | For |
|---|---|---|
| CLI (`shotkit`, `npx`) with `--json` + `path` | ✅ now | humans / CI / **shell-having agents** |
| Programmatic `capture()` | ✅ now | embedding |
| Claude Code skill ([`skills/capture/`](skills/capture/SKILL.md)) | ✅ now | Claude Code (portable to Codex/Cursor/Gemini via the Agent Skills format) |
| `AGENTS.md` run-block | ✅ now | every agent that reads AGENTS.md |
| npm package (`@starter-series/shotkit`) | ✅ now | `npx` zero-install |
| Demo story rendering (`demo`, `demos[]`, captions, click highlight, pacing, crop/zoom, thumbnails, storyboard lint, `--mp4`, `trim`) | ✅ now | SNS clips |
| Capture-in-CI GitHub Action | ✅ now — ships in [`browser-extension-starter`](https://github.com/starter-series/browser-extension-starter)'s `capture.yml` (headless) | zero-local-browser runs + CI smoke test |
| `starter-series` marketplace entry (`/plugin install shotkit@starter-series`) | ✅ now | discovery |
| Timeline/audio/motion editing | non-goal | use a real editor after shotkit |

An MCP stdio tool was considered and **dropped** — see Non-goals: shotkit is a heavy, file-producing build tool, so a `--json` CLI + skill serves agents better than an MCP server's per-session context cost.

**Generalization rule** (for the next capability in the series): *one npm package (engine + thin CLI), one `*.config.js` contract for irreducible per-repo intent, agent surfaces matched to the tool's nature (fast/structured: an MCP tool taking a `path`; heavy/build-time: a `--json` CLI + skill + AGENTS.md run-block), one marketplace entry. The engine never reads project specifics except through the config contract.*

## License

[MIT](LICENSE) © heznpc
