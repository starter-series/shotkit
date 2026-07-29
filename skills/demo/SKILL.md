---
name: demo
description: Record a captioned demo video of a web app with shotkit so the user can see it running — proof that what was just built actually works. Use when the user asks to "show me", "record a demo", "make a video of the app", "prove it works", or after building/changing a web app when visual evidence would close the loop. Works zero-config against a dev-server URL, a static build directory, or a single .html file; outputs webm plus mp4 and a thumbnail when ffmpeg exists.
allowed-tools: Bash(shotkit demo*), Bash(demoshot demo*), Bash(node bin/shotkit.js demo*), Bash(npx demoshot demo*), Bash(npm exec -- playwright install chromium), Read
---

# Record a proof clip with `shotkit demo`

`shotkit demo <target>` records a captioned walkthrough clip of any web app
with **no config file**. It loads the target, captions the clip from the
page's own title and headings, walks the page with a paced scroll, and writes
the files into `shotkit-demo/`.

## When to reach for it

- The user just had an app built or changed and wants to see it working.
- The user asks for a demo video, a proof clip, or "show me what you made".
- A PR / handoff needs visual evidence that a clean checkout renders.

## Run

1. **Preconditions** — Node ≥ 22 and Playwright's Chromium
   (`npm exec -- playwright install chromium`, one-time). ffmpeg on PATH is
   optional; with it you also get `demo.mp4` + `demo-thumbnail.png`.
2. **Pick the target** — a running dev server URL (`http://localhost:5173`),
   a static build directory (`./dist`), or one `.html` file. Directories and
   files are served on a local loopback port automatically.
3. **Record** — always use `--json` so the result is machine-readable:

   ```bash
   npx demoshot demo http://localhost:3000 --json
   # inside a shotkit clone:
   node bin/shotkit.js demo http://localhost:3000 --json
   ```

   Useful options: `--out <dir>` (default `shotkit-demo`), `--name <clip>`,
   `--duration <s>` (default 20, clamped 5–120), `--no-mp4`.
4. **Report** — parse the single JSON object on stdout
   (`{ok, outDir, produced[]}`) and hand the user the produced file paths.
   Exit codes: `0 ok · 1 runtime failure · 2 usage error`.
5. **Headless CI** — set `HEADED=0`; the recording still works.

## Escalate to the full pipeline

When the user wants store screenshots, promo tiles, channel-targeted SNS
variants, or an approval gate, switch to the `capture` skill and a
`shotkit.config.js` — same engine, richer contract.
