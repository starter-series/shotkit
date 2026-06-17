# shotkit Handoff Conventions

shotkit is the capture layer for browser-extension promotion assets. It should
not try to become Screen Studio, Canva, Supademo, or a hosted demo editor.
Instead, it writes repeatable source clips and a small JSON contract that other
tools or MCP adapters can consume.

## Files

Every successful run writes these files unless `handoff: false` is set:

- `shotkit-manifest.json` — the entry point. Read this first.
- `storyboard.json` — demo intent, beats, viewport, trim/framing hints, and
  structured storyboard lint.
- `captions.json` — portable caption timing and text.

Schema references are included in each file as `$schema` URNs, and the package
ships matching schema files under `schemas/`. The URN is an identity key, not a
network fetch requirement.

## Manifest Roles

External tools should use `assets[].role`, not filename guessing:

- `store-screenshot` — CWS screenshot PNG.
- `promo-tile` — CWS promo image PNG.
- `store-listing-copy` — generated listing copy.
- `source-demo-webm` — Playwright's original recording, useful as evidence.
- `sns-demo-mp4` — H.264 MP4 intended for X/SNS upload or editor import.
- `thumbnail` — poster frame extracted from the final clip.
- `storyboard-contract` — `storyboard.json`.
- `captions-contract` — `captions.json`.
- `handoff-manifest` — `shotkit-manifest.json`.

Each asset has a stable `id`, repo-relative `path`, `outPath`, `type`, `format`,
`role`, and `source.kind`.

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

1. Read `shotkit-manifest.json`.
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
`assets[].role`. For validation, load the schema files from the installed
`@starter-series/shotkit` package rather than fetching the URN.
