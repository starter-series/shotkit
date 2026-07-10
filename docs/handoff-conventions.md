# shotkit Handoff Conventions

shotkit is the autonomous launch asset pipeline for browser extensions. It
turns a reusable product story into channel variants, validates the final files,
and gives agents machine-readable fixes until the requested targets are
publish-ready. The handoff pack is an internal machine boundary, not a request
for a user to inspect JSON or edit media.

## Files

Every successful run writes these files unless `handoff: false` is set:

- `shotkit-manifest.json` — the entry point. Read this first.
- `storyboard.json` — demo intent, beats, viewport, trim/framing hints, and
  structured storyboard lint.
- `captions.json` — portable caption timing and text.
- `schemas/shotkit-manifest.schema.json` — local manifest validation contract.
- `schemas/storyboard.schema.json` — local storyboard validation contract.
- `schemas/captions.schema.json` — local captions validation contract.

Schema references are included in each file as `$schema` URNs, and the package
ships matching schema files under `schemas/`. Each output pack also carries its
own copies; resolve `handoff.schemaFiles` relative to the directory containing
`shotkit-manifest.json`. The URN is an identity key, not a network fetch
requirement. shotkit validates the finalized three-document pack with these
same schemas before publishing the manifest.

The CLI's `ok:true` means the requested stages completed. Its separate `status`
is `publish-ready`, `needs-fix`, `blocked`, or `not-requested`.

## Manifest Roles

External tools should use `assets[].role`, not filename guessing:

- `store-screenshot` — CWS screenshot PNG.
- `promo-tile` — CWS promo image PNG.
- `store-listing-copy` — generated listing copy.
- `privacy-disclosure` — generated store-review worksheet.
- `source-demo-webm` — Playwright's original recording, useful as evidence.
- `sns-demo-mp4` — H.264 MP4 intended for X/SNS upload or editor import.
- `thumbnail` — poster frame extracted from the final clip.
- `storyboard-contract` — `storyboard.json`.
- `captions-contract` — `captions.json`.
- `handoff-manifest` — `shotkit-manifest.json`.
- `handoff-schema` — one of the locally bundled JSON schemas.

Each asset has a stable `id`, repo-relative `path`, `outPath`, `type`, `format`,
`role`, and `source.kind`. Resolve `outPath` relative to the manifest directory;
use `path` only when the consumer also knows the repository root. Delivered
files other than the self-referential manifest carry byte size and SHA-256
integrity metadata. Consumers must ignore unknown roles and fields for
forward-compatible v1 processing.

## Run and Review State

`manifest.run.id` identifies the current invocation. On a full run, every
asset's `runId` matches it and its state is `produced`. A scene-filtered or
`--no-video` run is `run.mode:"partial"`; untouched outputs keep their older
`runId` and become `retained`. Missing files are pruned. A retained file whose
digest changed becomes `modified`, is excluded from adapter readiness, and must
be recaptured.

`handoff.review` remains an additive v1 compatibility summary. Autonomous
callers use `handoff.automation` instead; `needs-fix` never means "ask the user
to review." `handoff.summary` reports asset, demo, adapter, and publish-ready
target counts.

## Autonomous Publishing

One demo story can declare `targets: ['cws-youtube', 'x', 'youtube-shorts']`.
Each expanded target records its profile in `storyboard.json` and receives
mechanical defaults for viewport, H.264/yuv420p, duration cap, caption position,
and thumbnail.

`handoff.automation.targets[]` validates:

- final MP4 presence and unchanged integrity;
- ffprobe codec, pixel format, actual dimensions, and actual duration;
- poster-frame presence and nonblank PNG pixel statistics;
- storyboard lint being enabled for every publish target;
- structured storyboard warnings, including early result and restore beats;
- configured targets that were skipped or produced no output.

Failures become `automation.actions[]` with `owner:"agent"`, an explicit `fix`,
and a target/scene rerun instruction. Agents increment `--attempt`, apply every
fix, and rerun `automation.retryScenes[]`. The default maximum is three. Only
the exhausted `blocked` state sets `userActionRequired:true`.

`publish-ready` means these automated checks passed. External publication has
not happened yet; `targets[].upload` identifies the connector and notes that an
authorized external write is required.

Adapter `readiness` is tool-specific. `ready` means the required, unmodified
asset roles and storyboard content are present for that recommendation; it does
not mean the connector is installed or the assets were visually approved.

## Manual Fallback

Target workflows omit `adapterHints[]` by default. They are available for
legacy targetless captures or when `automation.manualFallback:true` is
explicitly configured. Hints are advisory; shotkit does not hold credentials or
install MCP servers.

Each hint includes:

- `id` / `label` — the target tool or tool family.
- `kind` — broad category such as `design-mcp`, `desktop-editor`,
  `code-video`, or `avatar-video`.
- `readiness` — `ready`, `needs-input`, or `needs-assets`.
- `connector` — optional connector metadata, for example `{ "type": "mcp",
  "name": "figma" }`.
- `useAssets` — manifest asset references the tool should consume.
- `missingRoles` / `missingInputs` — what to capture or provide next.
- `nextStep` — the agent-facing action.

Autonomous flow:

1. Read the CLI `status` and manifest path.
2. On `needs-fix`, execute every agent-owned action and rerun only the listed
   scenes with the next `--attempt`.
3. On `publish-ready`, use each target's deliverable and upload connector.
4. On `blocked`, report the exhausted blocker and attempted fixes.
5. Keep repo fixtures and the story/action script as the repeatable source.

Fallback tool notes:

- Figma MCP: use the `figma-mcp` hint when the manifest has a thumbnail and
  storyboard. It is good for cover frames, social layout, and design-system
  review. The agent should connect to Figma through its own MCP environment.
- Screen Studio: use `sns-demo-mp4` as the base clip, then add polish such as
  cursor smoothing, callouts, and final crop. Preserve `captions.json` timing.
- Canva: use `thumbnail` as a cover/poster frame and import the MP4 for light
  layout work. Keep captions short enough to survive mobile previews.
- Supademo: use `storyboard.json` beats as step names if converting the clip
  into a guided product tour.
- Remotion: use `sns-demo-mp4`, `captions.json`, and `storyboard.json` when a
  repeatable template-based video is better than hand editing.
- Higgsfield or AI video studios: use the `higgsfield` hint for campaign
  variants around the proof clip. Do not replace the captured product proof
  with generated UI.
- LongCat Video Avatar or presenter video: use the `longcat-video-avatar` hint
  only after adding avatar reference and voice/narration inputs.
- MCP adapters: treat the manifest as the only required input path. The adapter
  should resolve all other files through `assets[]`.

## Storyboard Lint

`storyboard.json.storyboardLint[]` is structured for agents:

```json
{
  "name": "demo",
  "ok": false,
  "warnings": [
    {
      "code": "missing-safety-restore",
      "severity": "warning",
      "message": "storyboard has no visible safety/restore beat",
      "fix": "show restore, undo, original text, or another safety path"
    }
  ]
}
```

Current warning codes:

- `no-captions`
- `single-caption`
- `late-first-caption`
- `long-caption`
- `missing-safety-restore`
- `missing-mp4`
- `edge-framing`
- `odd-viewport`
- `short-duration`
- `long-duration`
- `missing-duration`

Lint warnings do not fail a capture. They tell the agent how to improve the next
`shotkit.config.js` edit.

## Versioning

The handoff contract is versioned independently from the npm package:

- Top-level `version: 1` means handoff contract v1.
- Top-level `kind` identifies the document type.
- `$schema` points at the matching schema URN.
- New fields may be added in v1. Existing fields should keep their meaning.

Downstream tools should ignore unknown fields and key off `kind`, `version`, and
`assets[].role`. For validation, prefer the schemas copied into the handoff
pack. The same files remain available through the installed `shotkit` package's
`./schemas/*` export; never fetch the URN as a URL.
