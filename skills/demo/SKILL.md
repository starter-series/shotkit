---
name: demo
description: Record a captioned demo video of a web app with take-a-repo so the user can see it running — proof that what was just built actually works. Use when the user asks to "show me", "record a demo", "make a video of the app", "prove it works", or after building/changing a web app when visual evidence would close the loop. Works zero-config against a dev-server URL, a static build directory, or a single .html file; outputs webm plus mp4 and a thumbnail when ffmpeg exists.
allowed-tools: Bash(take-a-repo demo*), Bash(take-a-repo demo*), Bash(node bin/take-a-repo.js demo*), Bash(npx take-a-repo demo*), Bash(npm exec -- playwright install chromium), Read
---

# Record a proof clip with `take-a-repo demo`

`take-a-repo demo <target>` records a captioned walkthrough clip of any web app
with **no config file**. It loads the target, captions the clip from the
page's own title and headings, walks the page with a paced scroll, and writes
the files into `take-a-repo-demo/`.

## When to reach for it

- The user just had an app built or changed and wants to see it working.
- The user asks for a demo video, a proof clip, or "show me what you made".
- A PR / handoff needs visual evidence that a clean checkout renders.

## Run

1. **Preconditions** — Node ≥ 22 and Playwright's Chromium. Install both into
   the project so they resolve the same tree:
   `npm i -D take-a-repo && npx playwright install chromium` (one-time). A bare
   `npx playwright install` can fetch a build for a different Playwright
   version, which take-a-repo will not find. ffmpeg on PATH is optional; with it
   you also get `demo.mp4` + `demo-thumbnail.png`.
2. **Pick the target** — a running dev server URL (`http://localhost:5173`),
   a static build directory (`./dist`), or one `.html` file. Directories and
   files are served on a local loopback port automatically.
3. **Record** — always use `--json` so the result is machine-readable:

   ```bash
   npx take-a-repo demo http://localhost:3000 --json
   # inside a take-a-repo clone:
   node bin/take-a-repo.js demo http://localhost:3000 --json
   ```

   Useful options: `--out <dir>` (default `take-a-repo-demo`), `--name <clip>`,
   `--duration <s>` (default 20, clamped 5–120), `--no-mp4`.
4. **Uploadable file?** When the user wants something they can post rather than
   just look at, add `--for <channel>` (`x`, `youtube-shorts`, `cws-youtube`;
   repeatable or comma-separated). The channel supplies viewport, codec, trim,
   and caption style, and each delivered mp4 is measured against that channel's
   published limits — the run exits 1 if one misses. Needs ffmpeg. The JSON
   result gains `channels[]` with `{target, file, ok, width, height,
   durationSeconds, problems[]}`; report `problems[]` verbatim on failure.
5. **Report** — parse the single JSON object on stdout
   (`{ok, outDir, produced[], channels[]}`) and hand the user the file paths.
   Exit codes: `0 ok · 1 runtime failure · 2 usage error`.
6. **Headless CI** — set `TAKE_A_REPO_HEADED=0`; the recording still works.

## Escalate to the full pipeline

When the user wants store screenshots, promo tiles, channel-targeted SNS
variants, or an approval gate, switch to the `capture` skill and a
`take-a-repo.config.js` — same engine, richer contract.
