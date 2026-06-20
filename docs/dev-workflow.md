# `dev` 개발 워크플로우

복서게임의 **단일 작업 1개**를 `계획 → 구현 → 검증 → 리뷰` 멀티에이전트 사이클로 끝까지 돌리는 재사용 워크플로우다.
스크립트 본체는 [`.claude/workflows/dev.js`](../.claude/workflows/dev.js)에 있다.

## 무엇을 하는가

작업 1개(태스크 문서 또는 자유 스펙)를 받아 4단계 파이프라인으로 처리한다.

| 단계 | 누가 | 하는 일 | 코드 수정 |
| --- | --- | --- | --- |
| **Plan** | 단일 에이전트 | 태스크 문서 + 참고 기획 문서를 정독하고 현재 코드와 대조해 구조화된 계획(파일/버전bump/테스트/리스크)을 세운다 | ❌ |
| **Implement** | 단일 에이전트 | **작업 브랜치를 만들고**, 계획대로 구현 + colocated 테스트 추가, `check.mjs fast`가 green이 될 때까지 자체 반복 | ✅ (커밋 X) |
| **Verify** | 독립 에이전트 | `node tools/check.mjs full`(+옵션 `npm run e2e`)을 다시 실행해 통과/실패를 정밀 보고 | ❌ |
| **Review** | `code-reviewer` + 검증 에이전트 | `git diff HEAD`를 리뷰해 지적을 내고, 각 지적을 **병렬로 적대 검증**해 거짓 양성을 걸러낸다 | ❌ |

마지막에 `{ task, plan, implementation, verification, confirmedFindings, droppedFindings }`를 반환한다.

## 어떻게 실행하는가

워크플로우는 **자동으로 돌지 않는다.** 멀티에이전트로 실제 코드를 자율 수정하므로, 사용자가 명시적으로 켜야만 실행된다.

| 방법 | 입력 예시 | 동작 |
| --- | --- | --- |
| 슬래시 스킬 | `/dev TASK-004` | 그 태스크로 사이클 실행 (가장 명확) |
| 말로 지시 | "dev 워크플로우로 TASK-004 돌려줘" | Claude가 Workflow 도구를 그 args로 호출 |
| 그냥 구현 요청 | "TASK-004 구현해줘" | ❌ 워크플로우를 쓰지 않고 Claude가 직접 구현 |

### args 형태

```
"TASK-004"                                  → 해당 태스크, fast 게이트
{ task: "TASK-011", full: true, e2e: true } → full 게이트 + e2e (UI 태스크용)
{ spec: "임의 구현 지시문" }                 → 태스크 문서 없이 자유 스펙으로 재사용
```

- `taskId`도 `spec`도 없으면 에러로 멈춘다.
- `full: true`가 아니어도 **Verify 단계는 항상 `check.mjs full`로 통일**한다(독립 재검증에는 변경 파일 인자가 필요한 fast 대신 full을 쓴다). `full` 플래그는 의미 표기용이다.
- `e2e: true`면 Verify에서 `npm run e2e`를 추가로 돌린다. UI/CSS/스토어를 건드리는 태스크(TASK-011·012 등)에 쓴다.

## 브랜치 규칙

Implement 단계의 에이전트가 **코드를 만지기 전에 1회** 수행한다.

1. `git branch --show-current`로 현재 브랜치 확인.
2. `main`(또는 `master`)이면 새 작업 브랜치를 만들고 전환(`git switch -c <브랜치명>`).
   - 이미 `main`이 아닌 작업 브랜치 위면 새로 만들지 않고 그대로 사용.
   - 같은 이름 브랜치가 이미 있으면 전환만(`git switch <브랜치명>`).
3. 커밋·푸시는 하지 않는다(브랜치 생성/전환까지만). 커밋·푸시는 사람이 `deploy`로 처리.

### 브랜치 명명 규칙

전부 **소문자 케밥**, `feat/` 접두사.

| 입력 | 브랜치 이름 |
| --- | --- |
| `TASK-004` (`tasks/TASK-004-boxer-type-gender.md`) | `feat/task-004-boxer-type-gender` |
| `TASK-011` (`tasks/TASK-011-game-screen-ui.md`) | `feat/task-011-game-screen-ui` |
| 자유 스펙 | `feat/<스펙을 한 줄로 요약한 짧은 영문 케밥 슬러그>` |

- 태스크: `feat/task-<번호>-<태스크 문서 파일명 슬러그>` — 파일명에서 `TASK-`를 떼고 소문자화한다.
- 슬러그는 영문 케밥만 사용한다(한글 브랜치명 금지).

## 설계 의도 / 운영 모델

- **구현은 단일 에이전트(순차).** TASK-004→013은 `types.ts`/`constants.ts`/`save.ts` 같은 공유 파일을 차례로 바꾸는 의존 체인이라, 구현을 병렬 팬아웃하면 충돌한다. 그래서 구현은 1개 에이전트가 작업 트리에 직접 쓴다(worktree 격리 불필요).
- **검증·리뷰는 병렬.** 멀티에이전트의 이득은 독립 검증과 리뷰 지적의 병렬 적대 검증, 그리고 매 작업 일관된 게이트 강제에서 나온다.
- **한 번에 1개씩.** 의존 체인이므로 전체를 한 번에 자동으로 돌리지 말고, 작업 1개 = 사이클 1회로 돌린 뒤 결과(diff·확정 지적)를 사람이 확인하고 `deploy`로 커밋한 다음 다음 작업으로 넘어가는 것을 권장한다.
- **커밋은 사람이.** 워크플로우는 브랜치 생성·구현·검증·리뷰까지만 한다. 스테이징·커밋·푸시는 사람이 `deploy` 스킬로 처리한다.

## 프로젝트 규칙 준수

각 단계 에이전트 프롬프트에 다음 규칙이 주입된다(자세한 내용은 [CLAUDE.md](../CLAUDE.md) / [tasks/README.md](../tasks/README.md)).

- 전투·피해·보상·전이·강화·정산 로직은 `src/game/`의 순수 함수로. React/DOM/`Date.now`/`Math.random`/타이머는 스토어에서 주입.
- 저장 형태가 바뀌면 `SCHEMA_VERSION` + 저장 키 접미사(`boxer-game.save.vN`), 수식·밸런스가 바뀌면 `BALANCE_VERSION`을 올린다. 옛 저장은 삭제하지 않고 `legacy`/`invalid` 안내.
- 미확정 수치는 `constants.ts`에 `가정:` 주석 + 임시값. 같은 값을 테스트/기획 문서와 함께 갱신.
- 신규 순수 함수는 colocated `*.test.ts`, 스토어 변경은 `createGameStore` + 가짜 deps로 테스트.
- MVP 경계(PVP·길드·랭킹·결제·광고·장비·서버동기화) 밖은 손대지 않는다.
