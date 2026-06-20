# 워크플로우 인덱스

이 레포에서 **언제 무엇을 쓰는지** 한 장으로 본다. 어떤 명령/스킬/게이트를 골라야 할지 헷갈리면 여기부터.

## 명령·스킬 목록

| 무엇 | 어떻게 | 한 줄 설명 | 언제 |
| --- | --- | --- | --- |
| **dev 사이클** | `/dev TASK-004` | 태스크 1개를 계획→구현(`feat/...` 브랜치)→검증→리뷰로 끝까지 자율 처리 | 태스크 문서/스펙 하나를 멀티에이전트로 돌릴 때 (사용자 트리거 전용) |
| **deploy** | `/deploy` ("커밋하고 푸시") | 변경을 기능 단위로 나눠 한글 Conventional Commit으로 커밋·푸시 | 작업이 끝나 올릴 때 |
| **코드 리뷰** | `code-reviewer` 에이전트 / "리뷰해줘" | diff를 읽고 정확성 버그·보안·규칙 위반만 신뢰도 높게 지적(수정 안 함) | 커밋·PR 전 |
| **검증 게이트(빠름)** | `node tools/check.mjs fast "<바뀐 파일들>"` | 바뀐 파일에 맞는 최소 검사(타입체크+관련 테스트) | 구현 중·커밋 전 (기본) |
| **검증 게이트(전체)** | `node tools/check.mjs full` | 전체 타입체크+전체 테스트+프로덕션 빌드 | 설정/의존성/번들 변경, 릴리스 전 |
| **게이트 미리보기** | `node tools/check.mjs plan "<파일>"` | 실제로 어떤 검사가 돌지 출력만 | 무엇이 돌지 확인하고 싶을 때 |
| **브라우저 E2E** | `npm run e2e` | Playwright로 `docs/browser-smoke-checklist.md` 자동화 | UI·CSS·스토어·화면 동작 변경 시, 릴리스 직전 |
| **릴리스 게이트** | `npm run check:e2e` | `check.mjs full` + E2E 동시 | 출시 직전 최종 |
| **인코딩 안전 읽기** | `python tools/read-md.py "<path>"` | 혼합/비UTF-8·한글 경로 파일 셸 읽기 | 셸에서 파일이 깨져 읽힐 때 |

> 빌트인 보조 스킬도 있다: `/code-review`(diff 정밀 리뷰), `/simplify`(정리만), `/security-review`(보안), `/verify`(앱 띄워 동작 확인). 프로젝트 게이트(`check.mjs`)·`/dev`로 안 되는 보강용.

## 선택 가이드

```
┌─ 무엇을 하려는가?
│
├─ 태스크 1개를 처음부터 끝까지 돌린다 ───────→ /dev TASK-NNN
├─ 코드는 다 짰고 검증만                       → check.mjs fast (UI·스토어면 + npm run e2e)
├─ 설정/의존성/번들을 바꿨다                   → check.mjs full
├─ 커밋 전에 눈으로 한 번 더                   → "리뷰해줘" (code-reviewer)
├─ 다 됐고 올린다                              → /deploy
└─ 출시 직전 최종 점검                         → npm run check:e2e + docs/release-checklist.md
```

## 변경 전후 필수 절차 (요약)

자세한 내용은 [CLAUDE.md](../CLAUDE.md)의 "변경 전 영향도 / 변경 후 체크리스트 / 개발 원칙" 참조.

1. **변경 전 영향도** — 버전 커플링(`formulas`/`stages`/`SaveData`/`constants`/`save`)이 강하다. 손대기 전 역의존처를 훑고 위험도(🔴/🟡/🟢)를 매긴다. `/dev`는 Plan 단계에서 자동으로 한다.
2. **변경 후 체크리스트** — 순수 함수·클램프·스테이지 접근·버전 범프(`BALANCE_VERSION`/`SCHEMA_VERSION`)·콜로케이트 테스트·게이트·MVP 경계를 대조한다.
3. **개발 원칙** — 요구된 것만 최소 변경으로(Karpathy). 불필요한 추상화·요청 안 된 기능 추가 금지.

## 관련 문서

- [docs/dev-workflow.md](dev-workflow.md) — `/dev` 사이클 상세(args·브랜치 규칙·운영 모델)
- [docs/git-workflow.md](git-workflow.md) — 브랜치·커밋 규칙
- [docs/release-checklist.md](release-checklist.md) — 출시 전 점검
- [docs/browser-smoke-checklist.md](browser-smoke-checklist.md) — E2E가 자동화하는 항목 / 수동 항목
- [tasks/README.md](../tasks/README.md) — 태스크 로드맵·공통 규칙
