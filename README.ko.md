<div align="center">

# shotkit

**브라우저 익스텐션용 게시 가능 자산을 자동 제작하는 파이프라인.**

스토리와 채널만 정하면 에이전트가 촬영·편집·검증·재시도를 수행하고,
사람에게는 최종 파일 또는 자동화 소진 후 blocker만 전달합니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](.nvmrc)

[English](README.md) | **한국어**

</div>

---

> **[Starter Series](https://github.com/starter-series)** — 클론 템플릿이 아니라 재사용 가능한 도구. `shotkit`은 이 출시 자산 파이프라인의 unscoped 패키지 이름입니다. 공개 npm 설치는 릴리스 게이트이며, README가 현재 게시 상태를 가정하지 않습니다.

## 상태와 범위 (Status & Scope)

- **현재 구현된 것** — Playwright로 *실제 출하 빌드*를 실행하고 하나의 story를 `cws-youtube`, `x`, `youtube-shorts` variant로 확장합니다. target별 viewport/H.264/trim/caption/thumbnail을 자동 적용하고, 최종 MP4를 ffprobe로 검사하며, thumbnail 픽셀의 blank-frame 여부까지 확인해 `publish-ready`, `needs-fix`, `blocked`를 산출합니다. manifest에는 에이전트가 실행할 retry action과 source evidence가 함께 남습니다.
- **스토리 렌더러** — 데모 config는 단일 `demo` 또는 여러 `demos: []`, timed `captions`, click highlight, cursor pacing, 정적 zoom/crop, thumbnail frame, storyboard lint, 작은 `demo` helper(`caption`, `step`, `wait`, `click`)를 쓸 수 있습니다. 에이전트가 기능 체크리스트를 20~40초짜리 before → action → result → safety/restore 캠페인 컷으로 바꾸기 쉬운 정도까지만 제공합니다.
- **설계 의도** — *엔진 1개, 표면 여러 개 — 단, 도구 성격에 맞는 표면.* shotkit은 무겁고 파일을 산출하는 빌드 도구라 표면이 CLI(+`--json`)·skill·CI입니다 — MCP가 아니라(하지 않기로 한 것 참고). 캡처는 **결정적**(로그인 불필요 픽스처, freeze된 데이터)이고, 실행이 **실제 빌드본 smoke test를 겸함** — 스크린샷이 나온다 = 그 기능이 출하 코드에서 렌더됨. 모든 샷에 면책 밴드를 합성해 **상표 안전**.
- **하지 않기로 한 것** — shotkit 내부 MCP 서버, repo별 story/action 의도 제거, 범용 timeline editor, 호스티드 데모 플랫폼. 반복 가능한 채널 작업은 자동화하고 수동 편집기는 명시적으로 요청한 fallback일 때만 노출합니다.
- **공개하지 않음** — 없음.

## 설치

npm 패키지 게시 후:

```bash
npm i -D shotkit
npx playwright install chromium    # 최초 1회: shotkit이 구동할 브라우저
```

npm 게시 전에는 이 repo에서 실행합니다:

```bash
npm ci
npm run lint
npm test
node bin/shotkit.js --help
```

npm 게시 후에는 설정 파일이 있는 repo에서 무설치 실행이 가능합니다:

```bash
npx shotkit
```

> shotkit은 **풀 Chromium**(`channel: 'chromium'`)을 구동합니다 — 확장 서브시스템이 없는 headless-shell이 아닙니다. **headless 동작 검증 완료**(`HEADED=0`; macOS·Linux CI, 영상 포함)이며 starter capture 워크플로의 기본값입니다. 로컬 기본은 디버깅 편의상 headed. CI 러너에서 headed-under-xvfb는 신뢰할 수 없었습니다(8비트 기본값은 스크린샷 캡처가 깨지고, 24비트로도 무성 실패) — CI에서는 headless를 쓰십시오.

## 사용

`shotkit.config.js`(repo별 이음새 — 영문 README의 contract 참고)를 두고:

```bash
shotkit                         # outDir에 전부 산출
shotkit --scene 01-feature      # 특정 scene/타일/데모/demos 항목 또는 "description"만
shotkit --target x              # 설정된 X variant만 제작/재시도
shotkit --attempt 2 --json      # 두 번째 자동 수정 시도
shotkit --no-video              # 스크린캐스트 생략
shotkit --no-build              # 이미 빌드된 번들 사용
shotkit ../my-extension --json  # 다른 체크아웃 대상 실행; 결과 JSON을 stdout에
```

산출물은 `outDir`(기본 `store-assets/`): `<scene>.png`, `<promoTile>.png`, `<demo>.webm`, 선택적 `<demo>.mp4`, 선택적 `<demo>-thumbnail.png`, `description.md`, 그리고 기본값으로 `storyboard.json`, `captions.json`, `shotkit-manifest.json`, `schemas/*.schema.json`입니다(`handoff: false`면 handoff pack을 끕니다).

### Handoff Pack

handoff pack은 에이전트가 target별 최종 파일을 검증하고 자동 수정·재촬영하는
내부 machine boundary입니다. 사람이 JSON을 읽거나 영상을 편집하도록 넘기는
단계가 아닙니다.

- `storyboard.json` — demo 이름, audience, viewport, trim/framing hint, beats,
  구조화된 storyboard lint warning, 추천 next tool.
- `captions.json` — demo별 caption timing/text.
- `shotkit-manifest.json` — entrypoint. asset inventory/integrity, 실행·freshness
  metadata, 로컬 schema path와 `handoff.automation`의 target 검사/retry action.
- `schemas/*.schema.json` — 설치된 npm 패키지 없이도 검증할 수 있도록
  모든 pack에 함께 복사되는 계약.

target workflow에서는 수동 editor hint를 기본으로 숨기며,
`automation.manualFallback:true`일 때만 명시적으로 다시 노출합니다.

handoff 규약은 버전과 schema를 갖습니다. `$schema` 값은 안정적인 URN
식별자이고, `handoff.schemaFiles`가 output pack 안의 실제 schema로 연결합니다.
자기 자신을 참조하는 manifest를 제외한 실파일에는 byte 크기와 SHA-256이
기록됩니다.
[`docs/handoff-conventions.md`](docs/handoff-conventions.md)와
[`schemas/`](schemas/)를 보세요.

프로젝트별 적용 계획 문서는 repo-internal로 유지하며 npm 패키지에는 포함하지
않습니다.

### 자동 채널 target

제품 동작과 caption은 하나의 story로 두고 목적지만 선언합니다.

```js
demo: {
  name: 'skillbridge',
  targets: ['cws-youtube', 'x', 'youtube-shorts'],
  captions: [
    { at: 0.5, text: 'Translate the lesson in place' },
    { at: 18, text: 'Restore the original anytime' },
  ],
  async run({ page, env, demo, target }) { /* 재사용 가능한 제품 동작 */ },
}
```

Shotkit은 이를 target별 이름으로 확장하고 가로형은 1280×720, Shorts는
720×1280로 촬영합니다. H.264/yuv420p, 30초 cap, poster frame과 최종 파일
검사를 자동 적용합니다. `needs-fix`는 사용자 검토 요청이 아니라 에이전트가
config를 수정하고 `automation.retryScenes[]`를 다시 실행하라는 뜻입니다.
기본 3회가 소진된 뒤에만 `blocked`로 사용자 입력을 요청합니다.

### CWS 자산과 SNS 데모 클립

Chrome Web Store 자산은 검사 가능한 표면입니다. 선명한 스크린샷, 프로모
타일, 리스팅 문안, 면책 밴드가 중요하고, 스토어 크기에서 제품이 읽혀야
합니다.

SNS 데모 클립은 스토리 표면입니다. 짧은 캡션이 붙은 walkthrough로 결과를
빨리 보여주고, 그다음 action과 safety/restore 경로를 보여줘야 합니다.
X 데모 영상 기본 추천은 `preset: 'sns-video'`(`1280×720`, 16:9)와 H.264
mp4입니다. H.264 `yuv420p`는 짝수 크기가 안전하기 때문입니다.
`sns-twitter`(`1200×675`)는 정적인 X 카드 이미지에 쓰십시오.

### 데모 mp4 / trim / 캡션 / handoff

SNS 업로더(X 등)는 webm보다 H.264 mp4가 안전합니다. `--mp4` 또는 config의
`demo.mp4`를 쓰면 silent H.264, `yuv420p`, `+faststart`로 후처리합니다.
`trim`도 mp4에 적용됩니다.

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

`demo.click(selectorOrLocator)`는 녹화에 synthetic pointer와 click ripple을
보여줍니다. `{ moveMs, beforeMs, holdMs }`로 속도를 조절하고,
`{ highlight: false }`로 끌 수 있습니다. selector가 어색한 경우 Playwright
Locator나 `{ x, y }` point도 받을 수 있습니다. 영상 framing은 작게 유지합니다:

```js
demo: {
  crop: { x: 120, y: 0, width: 1040, height: 720 },
  zoom: { scale: 1.08 },
  thumbnail: { at: 1.5 },
  storyboardLint: false, // legacy/짧은 smoke clip 전용
}
```

storyboard lint는 기본으로 켜져 있으며 실패 대신 warning을 남깁니다.
같은 warning은 `storyboard.json`에 `code`, `severity`, `message`, `fix`
형태로 기록되므로, 에이전트가 다음 패스에서 `shotkit.config.js`를 고치기
쉽습니다. mp4 누락, 3초 이후 첫 캡션, 홀수 영상 크기, 너무 긴 캡션,
safety/restore beat 누락, crop/zoom edge risk, 20~40초 바깥 trim을
잡아줍니다.
자동 channel target은 lint가 켜져 있어야 하며, `storyboardLint:false`이면
automation status가 `needs-fix`가 됩니다.

여러 홍보 컷이 필요하면 단일 `demo` 대신 `demos: []`를 쓰십시오. 각 항목은
`<name>.webm`과 선택적 `<name>.mp4`를 만들고, `--scene <name>`으로 하나만
다시 캡처할 수 있습니다.

```js
demos: [
  {
    name: 'demo-translate',
    preset: 'sns-video',
    mp4: { crf: 18 },
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

캡션은 녹화 중 페이지 위 DOM 오버레이로 렌더됩니다. 기본은 좌하단,
반투명 배경, 큰 글자, 안전 padding이며 상단 좌측 disclaimer badge와 겹치지
않습니다. 좋은 데모는 20~40초, 첫 3초 안에 결과 노출, before → action →
result → safety/restore, 짧은 캡션, 느린 cursor/click/typing, X용 mp4를
기본으로 둡니다.

### 에이전트 계약 (`--json`)

`shotkit [path] --json`은 stdout에 **정확히 하나의 JSON 객체**를 출력합니다
(진행 로그는 stderr로 이동): `{ "ok": true, "status": "publish-ready", "outDir": …, "manifest": …, "produced": [절대경로…] }`.
종료 코드: `0` 정상 · `1` 런타임 실패 · `2` 사용법 오류/설정 없음입니다.
`ok:true`는 실행 완료, `status:publish-ready`는 story lint, H.264/yuv420p,
실제 해상도·길이, thumbnail, nonblank-frame, integrity와 target profile 검사를
통과했다는 뜻입니다. 외부 업로드 완료를 뜻하지는 않으며 권한 있는 connector나
외부 쓰기 승인은 별도로 필요합니다. 실패
payload도 stdout의 단일 JSON 객체(`{"ok":false,"error":…}`)를 사용합니다. 에이전트 연결은 [`AGENTS.md`](AGENTS.md) 실행 블록
(Claude Code·Codex·Cursor·Gemini CLI 등이 읽음)과 [`skills/capture/`](skills/capture/SKILL.md)
skill(Agent Skills 표준 — 호환 도구의 skills 디렉터리에 폴더째 복사)을 참고하십시오.

## 로드맵 — 엔진 1개, 표면 여러 개

CLI `--json`+`path`(소스에서 ✅, `npx`는 npm 게시 후) · `capture()`(✅) · Claude Code plugin+skill(✅ `/plugin install shotkit@starter-series`) · AGENTS.md 실행 블록(✅) · npm 패키지(릴리스 대상) · capture-in-CI GitHub Action(✅) · 데모 story rendering(`demo`/`demos[]`/캡션/click highlight/cursor pacing/zoom/crop/thumbnail/lint/mp4/trim ✅). MCP stdio 도구는 검토 후 **폐기** — "하지 않기로 한 것" 참고.

**일반화 규칙**(시리즈의 다음 기능용): npm 패키지 1개(엔진+얇은 CLI) + `*.config.js` 이음새 1개 + **도구 성격에 맞는 에이전트 표면**(빠른 구조화 도구: `path` 받는 MCP 도구 / 무거운 빌드 도구: `--json` CLI + skill + AGENTS.md 블록) + 마켓플레이스 항목 1개. **엔진은 config 이음새 외엔 프로젝트 특이사항을 읽지 않는다.**

## 라이선스

[MIT](LICENSE) © heznpc
