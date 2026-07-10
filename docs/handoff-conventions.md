# shotkit Handoff Conventions

shotkit is the agent-ready launch asset capture and handoff layer for browser
extensions. It should not try to become Screen Studio, Canva, Supademo, or a
hosted demo editor. Instead, it turns the shipped product into repeatable source
evidence and a self-contained contract that agents, tools, or MCP adapters can
consume.

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

The CLI's `ok:true` only means the requested stages completed and files were
written. It does not certify visual approval, store-policy compliance, channel
completeness, legal compliance, or connector availability.

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

`handoff.review.status` is `ready` when the captured storyboard has no warnings,
`needs-review` when lint found improvements, and `incomplete` when a selected
demo was skipped or retained evidence changed. This is a quality-review signal,
not launch certification. `handoff.summary` reports asset, demo, and ready-
adapter counts.

Adapter `readiness` is tool-specific. `ready` means the required, unmodified
asset roles and storyboard content are present for that recommendation; it does
not mean the connector is installed or the assets were visually approved.

## Tool Handoff

`shotkit-manifest.json.handoff.adapterHints[]` is the recommendation layer. It
lets an agent see likely next tools without the user researching the ecosystem.
Hints are advisory; shotkit does not call external services, hold credentials,
or install MCP servers.

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

Recommended downstream flow:

1. Read the CLI result's `manifest` path and, when needed, validate it with
   `handoff.schemaFiles.manifest`.
2. Select the MP4 asset for upload/editing; keep the WEBM as source evidence.
3. Read `storyboard.json` for the beat list and lint warnings.
4. Read `captions.json` for subtitle/caption timing.
5. Import the MP4, thumbnail, and captions into the downstream tool.
6. Keep repo fixtures and `shotkit.config.js` as the repeatable source of truth.

Tool-specific notes:

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
