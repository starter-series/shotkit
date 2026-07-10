<div align="center">

# shotkit

**Autonomous, publish-ready launch assets for browser extensions.**

Name the story and channels. Agents capture, edit, validate, and retry. Humans
only see final target files or a blocker after automation is exhausted.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](.nvmrc)

**English** | [한국어](README.ko.md)

</div>

---

> **Part of [Starter Series](https://github.com/starter-series)** — reusable tooling, not just clone-templates. `shotkit` is the unscoped package identity for this launch asset pipeline; public npm install is a release gate, not assumed by the repo README.

---

## Status & Scope

- **Currently implemented** — An autonomous launch asset **pipeline** whose Playwright engine builds and drives the *shipped* extension, expands one story into `cws-youtube`, `x`, and `youtube-shorts` variants, applies target viewport/H.264/trim/caption/thumbnail defaults, probes the final MP4 with ffprobe, checks the poster pixels for blank-frame failures, and emits `publish-ready`, `needs-fix`, or `blocked`. The schema-backed pack still carries source evidence, captions, run provenance, integrity, and agent-owned retry actions. The same engine is exposed through the CLI, `capture()`, skill, and AGENTS.md run-block.
- **Story renderer** — Demo configs can use one `demo` or several `demos: []` entries, timed `captions`, pointer-highlighted clicks, paced cursor movement, static zoom/crop framing, thumbnail frames, storyboard lint, and a small `demo` helper (`caption`, `step`, `wait`, `click`) so an agent can turn a feature checklist into 20-40 second before → action → result stories without pulling in a general video editor.
- **Design intent** — *One engine, many surfaces — matched to the tool's nature.* shotkit is a heavy, file-producing build tool, so its surfaces are CLI (+`--json`), skill, and CI — not MCP (see Non-goals). Captures are **deterministic** (login-free fixtures, frozen data) and the run **doubles as a real-bundle smoke test** — a screenshot only appears if that feature rendered from the shipped code. **Trademark-safe** by construction: a disclaimer band is composited onto every shot.
- **Non-goals** — An **MCP server** inside shotkit (agents with a shell get a better contract from `--json` + the skill). Removing the per-repo **story/action config** (which product state proves the claim is irreducible intent). A general-purpose timeline editor or hosted demo platform. Repeatable channel work is automated; manual editors are fallback-only and disabled unless explicitly requested.
- **Redacted** — none. Ships no private data, credentials, or third-party identifiers.

## Install

After the unscoped npm package is published:

```bash
npm i -D shotkit
npx playwright install chromium    # one-time: the browser shotkit drives
```

Before npm publication, run from this repository:

```bash
npm ci
npm run lint
npm test
node bin/shotkit.js --help
```

Or as a **Claude Code plugin** (bundles the capture skill):

```text
/plugin marketplace add starter-series/create-starter
/plugin install shotkit@starter-series
```

Zero-install after npm publication in any repo that has a config:

```bash
npx shotkit
```

> shotkit launches the **full Chromium** (`channel: 'chromium'`) — never the default headless-shell, which strips the extension subsystem. **Headless works** (`HEADED=0`; verified on macOS and Linux CI, video included) and is the CI default in the starter's capture workflow; the local default stays headed for easy debugging. Headed-under-xvfb proved unreliable on CI runners (the 8-bit default breaks Chromium's screenshot capture, and a 24-bit screen still failed silently) — run headless in CI.

## Usage

Add a `shotkit.config.js` (the per-repo capture contract), then:

```bash
shotkit                         # produce everything into outDir
shotkit --scene 01-feature      # just one scene/promoTile/demo/demos entry, "description", or "privacy"
shotkit --target x              # render/retry only the configured X variants
shotkit --attempt 2 --json      # next autonomous fix attempt
shotkit --no-video              # skip the screencast (faster/CI)
shotkit --no-build              # use an already-built bundle
shotkit ../my-extension --json  # run against another checkout; JSON result on stdout
```

Outputs land in `outDir` (default `store-assets/`): `<scene>.png`, `<promoTile>.png`, `<demo>.webm`, optional `<demo>.mp4`, optional `<demo>-thumbnail.png`, `description.md`, optional `privacy-disclosure.md`, and, by default, `storyboard.json`, `captions.json`, `shotkit-manifest.json`, plus the three schemas under `schemas/` (`handoff: false` disables the handoff pack).

### Handoff Pack

The handoff pack is primarily an internal machine boundary: agents use it to
fix and retry until channel assets are publish-ready. It is not a request for a
human to inspect JSON or edit media.

- `storyboard.json` — demo names, audience, viewport, trim/framing hints, beats,
  structured storyboard lint warnings, and suggested next tool.
- `captions.json` — portable caption timings and text per demo.
- `shotkit-manifest.json` — the entrypoint: asset inventory and integrity,
  run/freshness metadata, bundled schema paths, and
  `handoff.automation` with target checks and agent-owned retry actions.
- `schemas/*.schema.json` — local validation contracts, copied into every pack
  so a downstream agent does not need the installed npm package.

Target workflows omit manual editor recommendations by default. Targetless
legacy runs may still expose `adapterHints`; setting
`automation.manualFallback:true` restores them for an explicitly requested
manual path. Repo fixtures and the story/action script remain the repeatable
source of truth in either mode.

The convention is versioned and schema-backed. `$schema` values are stable URN
identifiers; `handoff.schemaFiles` resolves them to files inside the output pack.
Every delivered file except the self-referential manifest carries byte size and
SHA-256 integrity metadata. See
[`docs/handoff-conventions.md`](docs/handoff-conventions.md) and the packaged
schemas under [`schemas/`](schemas/).

### Autonomous channel targets

Keep one product story and declare destinations. Do not set viewport, codec,
thumbnail, or duration mechanically unless a target genuinely needs an
override:

```js
demo: {
  name: 'skillbridge',
  targets: ['cws-youtube', 'x', 'youtube-shorts'],
  captions: [
    { at: 0.5, text: 'Translate the lesson in place' },
    { at: 18, text: 'Restore the original anytime' },
  ],
  async run({ page, env, demo, target }) {
    // Reusable product actions. target contains the current channel profile.
  },
}
```

The story expands to `skillbridge-cws-youtube`, `skillbridge-x`, and
`skillbridge-youtube-shorts`. Landscape targets use 1280×720; Shorts uses
720×1280. All target variants receive H.264/yuv420p, a 30-second cap, a poster
frame, and automated final-file checks. `targetOptions.<id>` is available for a
channel-specific framing override.

The default policy is exception-only: `needs-fix` actions belong to the agent,
which edits the config and reruns `automation.retryScenes[]` with an incremented
`--attempt`. User input is requested only when `blocked` is reached after
`automation.maxAttempts` (default 3). Manual editor hints appear only with
`automation: { manualFallback: true }`.

Project-specific application plans stay repo-internal and are not included in
the npm package.

### CWS assets vs SNS demo clips

Chrome Web Store assets are inspection surfaces: crisp screenshots, promo tiles,
listing copy, and trademark-safe disclaimer bands. They should make the product
legible at store dimensions.

SNS demo clips are story surfaces: short, captioned walkthroughs that show the
result quickly, then the action and safety/restore path. For X demo video,
the `x` target applies 1280×720 H.264 automatically. The lower-level
`preset:'sns-video'` path remains available for legacy/custom captures. Use
`sns-twitter` (`1200×675`) for static X card images.

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
  storyboardLint: false,                            // legacy/short smoke clips only
}
```

Storyboard lint runs by default and logs warnings instead of failing the run.
The same warnings are written to `storyboard.json` with `code`, `severity`,
`message`, and `fix`, so an agent can revise `shotkit.config.js` on the next
pass. Current checks cover missing mp4, first caption after 3 seconds, odd video
dimensions, long captions, missing safety/restore beat, crop/zoom edge risk, and
clips outside the 20-40 second target.
Autonomous channel targets require lint to remain enabled; setting
`storyboardLint:false` makes their automation status `needs-fix`.

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
{ "ok": true, "status": "publish-ready", "outDir": "/abs/store-assets", "manifest": "/abs/store-assets/shotkit-manifest.json", "produced": ["/abs/store-assets/skillbridge-x.mp4"] }
```

Exit codes: `0` ok · `1` runtime failure · `2` usage / no config found. Failure
payloads also use the single stdout JSON object (`{"ok":false,"error":…}`).
`ok:true` means execution completed. `status:publish-ready` additionally means
every requested target passed shotkit's story lint, H.264/yuv420p, actual
dimensions, actual duration, thumbnail, nonblank-frame, integrity, and target
profile checks. It does not mean an external upload occurred; publishing still
requires an authorized connector or explicit external-write approval.
Drop-in agent wiring: the run-block in
[`AGENTS.md`](AGENTS.md) (read by Claude Code, Codex, Cursor, Gemini CLI, …) and
the [`skills/capture/`](skills/capture/SKILL.md) skill (Agent Skills format —
copy the folder into any compatible tool's skills directory).

## Config contract (`shotkit.config.js`)

```js
const { serveDirectory, stageExtension, patchManifestForLocalhost } = require('shotkit');

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

  // One story can render several channel variants automatically.
  demos: [
    { name: 'demo-feature', targets: ['cws-youtube', 'x', 'youtube-shorts'],
      captions: [
        { at: 0.5, text: 'Show the result first' },
        { at: 18.0, text: 'Restore the original anytime' },
      ],
      async run({ page, env, demo, target }) { /* reusable walkthrough */ } },
  ],
};
```

- A scene/tile takes a **`preset`** name or an explicit `{ width, height }` (see `PRESETS`).
- The harness reduces a captioned scene's capture height by the band height and stacks the band under it, so the final image is exactly the preset size and **no UI is hidden**.
- Demo captions are overlays inside the recorded page, not screenshot bands; they are meant for story clips, not CWS screenshots.
- Demo names must be unique across `demo` and `demos` because they become output filenames.
- Target demos expand to `<name>-<target>` filenames. Use `--target x` or
  `--scene <expanded-name>` for an automatic retry pass.

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

`require('shotkit')` →
`capture(config, opts)` · `serveDirectory` · `stageExtension` · `patchManifestForLocalhost` ·
`launchWithExtension` · `closeContext` · `compositeCaption` · `renderPromoTile` ·
`extractListing` · `extractProductManifest` · `renderDescriptionDoc` ·
`renderPrivacyDisclosureDoc` · `PRESETS` · `resolveSize` · `CHANNEL_PROFILES` ·
`resolveChannelProfile` · `buildPublishPlan` ·
`createDemoController` · `normalizeDemoConfigs` · `analyzeDemoStoryboard` ·
`lintDemoStoryboard` · `installDemoCaptionOverlay` · `setDemoCaption` ·
`buildVideoFilter` · `buildThumbnailArgs` · `HANDOFF_VERSION` ·
`HANDOFF_SCHEMA_IDS` · `buildHandoffDocs` · `writeHandoffDocs`.

## Roadmap — one engine, many surfaces

| Surface | Status | For |
|---|---|---|
| CLI (`shotkit`) with `--json` + `path` | ✅ now from source; `npx` after npm publication | humans / CI / **shell-having agents** |
| Programmatic `capture()` | ✅ now | embedding |
| Claude Code skill ([`skills/capture/`](skills/capture/SKILL.md)) | ✅ now | Claude Code (portable to Codex/Cursor/Gemini via the Agent Skills format) |
| `AGENTS.md` run-block | ✅ now | every agent that reads AGENTS.md |
| npm package (`shotkit`) | release target | `npx` zero-install after publish |
| Autonomous target rendering (`demo.targets`, CWS/YouTube, X, Shorts, ffprobe, pixel QA, retry actions) | ✅ now | publish-ready channel variants |
| Capture-in-CI GitHub Action | ✅ now — ships in [`browser-extension-starter`](https://github.com/starter-series/browser-extension-starter)'s `capture.yml` (headless) | zero-local-browser runs + CI smoke test |
| `starter-series` marketplace entry (`/plugin install shotkit@starter-series`) | ✅ now | discovery |
| Timeline/audio/motion editing | non-goal | explicit `automation.manualFallback:true` only |

An MCP stdio tool was considered and **dropped** — see Non-goals: shotkit is a heavy, file-producing build tool, so a `--json` CLI + skill serves agents better than an MCP server's per-session context cost.

**Generalization rule** (for the next capability in the series): *one npm package (engine + thin CLI), one `*.config.js` contract for irreducible per-repo intent, agent surfaces matched to the tool's nature (fast/structured: an MCP tool taking a `path`; heavy/build-time: a `--json` CLI + skill + AGENTS.md run-block), one marketplace entry. The engine never reads project specifics except through the config contract.*

## License

[MIT](LICENSE) © heznpc
