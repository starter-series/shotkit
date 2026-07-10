<div align="center">

# shotkit

**브라우저 익스텐션을 위한 에이전트 친화적 출시 자산 캡처·handoff 파이프라인.**

실제 출하 빌드를 실행해 CWS/SNS 원본 자산과 버전·스키마가 있는
자기완결형 evidence pack을 만듭니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](.nvmrc)

[English](README.md) | **한국어**

</div>

---

> **[Starter Series](https://github.com/starter-series)** — 클론 템플릿이 아니라 재사용 가능한 도구. `shotkit`은 이 출시 자산 파이프라인의 unscoped 패키지 이름입니다. 공개 npm 설치는 릴리스 게이트이며, README가 현재 게시 상태를 가정하지 않습니다.

## 상태와 범위 (Status & Scope)

- **현재 구현된 것** — Playwright로 *실제 출하 빌드*를 실행하는 캡처 엔진과, 그 결과를 에이전트가 이어받을 수 있게 묶는 출시 자산 **파이프라인**입니다. CWS 스크린샷/프로모 타일, SNS 데모 클립, listing/privacy 문안과 함께 `shotkit-manifest.json`, storyboard, captions, 로컬 schema, 구조화된 review 상태, adapter hint, 파일별 SHA-256을 산출합니다. CLI의 `--json` 계약은 선택적 repo `path`, `0/1/2` 종료 코드, manifest entrypoint를 반환하며, 같은 엔진을 `capture()`, Claude Code skill, AGENTS.md 실행 블록에서도 사용합니다.
- **스토리 렌더러** — 데모 config는 단일 `demo` 또는 여러 `demos: []`, timed `captions`, click highlight, cursor pacing, 정적 zoom/crop, thumbnail frame, storyboard lint, 작은 `demo` helper(`caption`, `step`, `wait`, `click`)를 쓸 수 있습니다. 에이전트가 기능 체크리스트를 20~40초짜리 before → action → result → safety/restore 캠페인 컷으로 바꾸기 쉬운 정도까지만 제공합니다.
- **설계 의도** — *엔진 1개, 표면 여러 개 — 단, 도구 성격에 맞는 표면.* shotkit은 무겁고 파일을 산출하는 빌드 도구라 표면이 CLI(+`--json`)·skill·CI입니다 — MCP가 아니라(하지 않기로 한 것 참고). 캡처는 **결정적**(로그인 불필요 픽스처, freeze된 데이터)이고, 실행이 **실제 빌드본 smoke test를 겸함** — 스크린샷이 나온다 = 그 기능이 출하 코드에서 렌더됨. 모든 샷에 면책 밴드를 합성해 **상표 안전**.
- **하지 않기로 한 것** — shotkit 내부 **MCP 서버**(셸이 있는 에이전트에는 `--json` + skill이 더 나은 계약). repo별 **scene 설정** 제거(어떤 화면이 *당신의* money shot인지는 환원 불가한 의도 — `shotkit.config.js`에 둠). 범용 동영상 편집기나 호스티드 데모 플랫폼. shotkit은 source evidence와 handoff pack을 만들고, Screen Studio/Canva/Supademo/향후 MCP connector가 polish를 이어받게 합니다.
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
shotkit --no-video              # 스크린캐스트 생략
shotkit --no-build              # 이미 빌드된 번들 사용
shotkit ../my-extension --json  # 다른 체크아웃 대상 실행; 결과 JSON을 stdout에
```

산출물은 `outDir`(기본 `store-assets/`): `<scene>.png`, `<promoTile>.png`, `<demo>.webm`, 선택적 `<demo>.mp4`, 선택적 `<demo>-thumbnail.png`, `description.md`, 그리고 기본값으로 `storyboard.json`, `captions.json`, `shotkit-manifest.json`, `schemas/*.schema.json`입니다(`handoff: false`면 handoff pack을 끕니다).

### Handoff Pack

shotkit은 영상 편집기를 이기려는 도구가 아닙니다. 편집기 앞단의 starter
layer입니다. 실제 빌드된 확장을 캡처하고, source clip과 “이 클립이 무슨
의도인지”를 같이 남깁니다.

- `storyboard.json` — demo 이름, audience, viewport, trim/framing hint, beats,
  구조화된 storyboard lint warning, 추천 next tool.
- `captions.json` — demo별 caption timing/text.
- `shotkit-manifest.json` — entrypoint. asset inventory/integrity, 실행·freshness
  metadata, review 요약, 로컬 schema path, 다음 도구 후보 `adapterHints`.
- `schemas/*.schema.json` — 설치된 npm 패키지 없이도 검증할 수 있도록
  모든 pack에 함께 복사되는 계약.

이렇게 하면 에이전트나 MCP connector가 manifest를 읽고 mp4/webm,
thumbnail, captions를 Screen Studio, Canva, Supademo 또는 다른 편집 도구로
넘기기 쉽습니다. repo fixture와 storyboard는 반복 가능한 source of truth로
남습니다.

manifest는 downstream 연결 후보도 제안합니다. 예를 들어 thumbnail/storyboard
재료가 충분하면 `figma-mcp`가 나오고, AI video campaign variant에는
`higgsfield`, avatar/presenter 계열에는 `longcat-video-avatar`가 나옵니다.
추가 입력이 필요한 경우 `needs-input`으로 표시됩니다. shotkit은 다음 도구를
제안하고, 실제 연결은 에이전트의 MCP/tool 환경이 수행합니다.

handoff 규약은 버전과 schema를 갖습니다. `$schema` 값은 안정적인 URN
식별자이고, `handoff.schemaFiles`가 output pack 안의 실제 schema로 연결합니다.
자기 자신을 참조하는 manifest를 제외한 실파일에는 byte 크기와 SHA-256이
기록됩니다.
[`docs/handoff-conventions.md`](docs/handoff-conventions.md)와
[`schemas/`](schemas/)를 보세요.

프로젝트별 적용 계획 문서는 repo-internal로 유지하며 npm 패키지에는 포함하지
않습니다.

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
  storyboardLint: false,
}
```

storyboard lint는 기본으로 켜져 있으며 실패 대신 warning을 남깁니다.
같은 warning은 `storyboard.json`에 `code`, `severity`, `message`, `fix`
형태로 기록되므로, 에이전트가 다음 패스에서 `shotkit.config.js`를 고치기
쉽습니다. mp4 누락, 3초 이후 첫 캡션, 홀수 영상 크기, 너무 긴 캡션,
safety/restore beat 누락, crop/zoom edge risk, 20~40초 바깥 trim을
잡아줍니다.

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
(진행 로그는 stderr로 이동): `{ "ok": true, "outDir": …, "manifest": …, "produced": [절대경로…] }`.
종료 코드: `0` 정상 · `1` 런타임 실패 · `2` 사용법 오류/설정 없음입니다.
`ok:true`는 요청 단계가 끝나고 파일이 기록됐다는 뜻이며, 채널 완성도·시각
승인·법률 준수·외부 connector 가용성을 인증하지는 않습니다. 반환된 manifest의
`handoff.review`와 `handoff.adapterHints[]`에서 다음 판단을 이어갑니다. 실패
payload도 stdout의 단일 JSON 객체(`{"ok":false,"error":…}`)를 사용합니다. 에이전트 연결은 [`AGENTS.md`](AGENTS.md) 실행 블록
(Claude Code·Codex·Cursor·Gemini CLI 등이 읽음)과 [`skills/capture/`](skills/capture/SKILL.md)
skill(Agent Skills 표준 — 호환 도구의 skills 디렉터리에 폴더째 복사)을 참고하십시오.

## 로드맵 — 엔진 1개, 표면 여러 개

CLI `--json`+`path`(소스에서 ✅, `npx`는 npm 게시 후) · `capture()`(✅) · Claude Code plugin+skill(✅ `/plugin install shotkit@starter-series`) · AGENTS.md 실행 블록(✅) · npm 패키지(릴리스 대상) · capture-in-CI GitHub Action(✅) · 데모 story rendering(`demo`/`demos[]`/캡션/click highlight/cursor pacing/zoom/crop/thumbnail/lint/mp4/trim ✅). MCP stdio 도구는 검토 후 **폐기** — "하지 않기로 한 것" 참고.

**일반화 규칙**(시리즈의 다음 기능용): npm 패키지 1개(엔진+얇은 CLI) + `*.config.js` 이음새 1개 + **도구 성격에 맞는 에이전트 표면**(빠른 구조화 도구: `path` 받는 MCP 도구 / 무거운 빌드 도구: `--json` CLI + skill + AGENTS.md 블록) + 마켓플레이스 항목 1개. **엔진은 config 이음새 외엔 프로젝트 특이사항을 읽지 않는다.**

## 라이선스

[MIT](LICENSE) © heznpc
