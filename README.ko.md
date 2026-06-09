<div align="center">

# shotkit

**빌드된 브라우저 익스텐션에서 스토어·SNS 홍보 자산을 캡처 — Playwright 기반.**

스크린샷 · 프로모 이미지 · 데모 스크린캐스트 · 리스팅 문안. 한 커맨드.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](.nvmrc)

[English](README.md) | **한국어**

</div>

---

> **[Starter Series](https://github.com/starter-series)** — 클론 템플릿이 아니라 재사용 가능한 도구. `shotkit`은 복사-붙여넣기 없이 어느 repo(그리고 에이전트)에서도 쓸 수 있게 설치형 패키지로 분리한 첫 번째 기능입니다.

## 상태와 범위 (Status & Scope)

- **현재 구현된 것** — Playwright 캡처 **엔진**(빌드 → `--load-extension`으로 *빌드된* 익스텐션 로드 → scene 구동 → 스크린샷 → 캡션/면책 밴드 → HTML 프로모 타일 → 데모 `webm` → `STORE_LISTING.md`에서 문안 추출), **CLI**(`shotkit`), 양쪽 용도 **사이즈 프리셋**(CWS `1280×800`/`440×280`, SNS `1200×675`/`1200×630`/`1080×1080`), **path-traversal 안전** 로컬 픽스처 서버, 프로그램 API(`capture()`). `browser-extension-starter`·`skillBridge`가 소비.
- **계획된 것** — **MCP stdio 도구**(`capture_assets({ path })`) — 에이전트가 어느 체크아웃이든 repo당 설치 없이 캡처 실행; **Claude Code skill/command**(`/capture`); `starter-series` 플러그인 **마켓플레이스** 등재; **동영상 편집**(`webm → mp4`, 트림, 캡션); OIDC npm publish.
- **설계 의도** — *엔진 1개, 표면 여러 개* ([`create-starter`](https://github.com/starter-series/create-starter)가 이미 증명한 패턴: CLI + MCP + skill). 캡처는 **결정적**(로그인 불필요 픽스처, freeze된 데이터)이고, 실행이 **실제 빌드본 smoke test를 겸함** — 스크린샷이 나온다 = 그 기능이 출하 코드에서 렌더됨. 모든 샷에 면책 밴드를 합성해 **상표 안전**.
- **하지 않기로 한 것** — repo별 **scene 설정** 제거(어떤 화면이 *당신의* money shot인지는 환원 불가한 의도 — `shotkit.config.js`에 둠). 범용 동영상 편집기(v1은 깔끔한 녹화만; 편집은 계획). 호스티드 서비스(파일을 만지는 캡처는 본질적으로 로컬/stdio).
- **공개하지 않음** — 없음.

## 설치

```bash
npm i -D @starter-series/shotkit
npx playwright install chromium    # 최초 1회: shotkit이 구동할 브라우저
```

설정 파일이 있는 repo면 무설치 실행:

```bash
npx @starter-series/shotkit
```

> MV3 익스텐션 로드는 **headed** Chromium이 필요합니다 — 로컬 headed, CI는 `xvfb-run`.

## 사용

`shotkit.config.js`(repo별 이음새 — 영문 README의 contract 참고)를 두고:

```bash
shotkit                    # outDir에 전부 산출
shotkit --scene 01-feature # 특정 scene/타일/데모 또는 "description"만
shotkit --no-video         # 스크린캐스트 생략
shotkit --no-build         # 이미 빌드된 번들 사용
```

산출물은 `outDir`(기본 `store-assets/`): `<scene>.png`, `<promoTile>.png`, `<demo>.webm`, `description.md`.

## 로드맵 — 엔진 1개, 표면 여러 개

CLI(✅) · `capture()`(✅) · **MCP stdio 도구**(계획, 에이전트용) · Claude Code skill(계획) · 마켓플레이스 등재(계획) · 동영상 편집(계획).

**일반화 규칙**(시리즈의 다음 기능용): npm 패키지 1개(엔진+얇은 CLI) + `*.config.js` 이음새 1개 + `path` 받는 MCP 도구 1개 + Claude Code skill 1개 + 마켓플레이스 항목 1개. **엔진은 config 이음새 외엔 프로젝트 특이사항을 읽지 않는다.**

## 라이선스

[MIT](LICENSE) © heznpc
