# 구현 태스크 (수정내용2 확장: v1.1 ~ v1.4)

`구현문서1~3`(v0.1 자동전투 코어 + 보스·강화 + 저장·오프라인 + 앱인토스 SDK 연동)은 완료된 기준선이다.
이 폴더의 태스크는 기획 README의 **`수정내용2` 확장**(복서 타입·성별, 복서 HP·몬스터 공격, 기본 공격·콤비네이션·그로기·스킬, 게임 화면형 UI)을 구현 가능한 순서로 쪼갠 것이다.

> 기존 `docs/구현문서*.md`(옛 계획)는 삭제했다. 이 폴더가 현재 작업 순서의 기준이다.

## 진행 순서

| 태스크 | 로드맵 | 제목 | 핵심 산출물 |
| --- | --- | --- | --- |
| [TASK-004](./TASK-004-boxer-type-gender.md) | v1.1 | 복서 타입·성별 도입 | `boxerType`/`gender`, 생성 플로우, 타입 보정 골격 |
| [TASK-005](./TASK-005-boxer-hp-monster-attack.md) | v1.2a | 복서 HP·몬스터 공격·넉다운 | 복서 HP, 몬스터 공격 루프, 실패(넉다운) 구조 |
| [TASK-006](./TASK-006-dodge-guard-counter.md) | v1.2b | 회피·가드·카운터 판정 | 방어 강화 4종, 타입별 회피/가드/카운터 |
| [TASK-007](./TASK-007-basic-attacks.md) | v1.3a | 기본 공격 4종·손·쿨타임 | 잽/스트레이트/훅/어퍼, 손 관리, 개별 쿨타임 |
| [TASK-008](./TASK-008-combinations.md) | v1.3b | 콤비네이션·콤보 게이지 | 원투/원투훅/풀콤보, 콤보 게이지 |
| [TASK-009](./TASK-009-boss-groggy.md) | v1.3c | 보스 그로기 시스템 | 그로기 게이지·해제·추가 피해 |
| [TASK-010](./TASK-010-skill-slots.md) | v1.3d | 전용 스킬 슬롯·액티브/패시브 | 스킬 장착 구조, 인파이터/아웃복서 스킬 |
| [TASK-011](./TASK-011-game-screen-ui.md) | v1.4a | 게임 화면형 UI 재구성 | 상/중/하 레이아웃, HP·그로기 바, 신규 강화 버튼 |
| [TASK-012](./TASK-012-type-tone-animation.md) | v1.4b | 타입별 톤·애니메이션 | 타입 톤, 애니메이션 키, MISS/GUARD/COUNTER 연출 |
| [TASK-013](./TASK-013-integration-balance.md) | — | 통합 검증·밸런스 확정 | E2E 갱신, 가정값 확정, 버전·문서 정합 |

## 모든 태스크 공통 규칙 (CLAUDE.md / AGENTS.md)

- **순수 함수 유지**: 전투·피해·보상·전이·강화·정산은 `src/game/`의 순수 함수로 구현한다. React/DOM/`Date.now`/`Math.random`/타이머는 스토어에서 주입한다.
- **버전 관리**: 저장 형태(`Boxer`/`SaveData`)가 바뀌면 `SCHEMA_VERSION`을 올리고 저장 키 접미사(`boxer-game.save.vN`)를 맞춘다. 수식·밸런스가 바뀌면 `BALANCE_VERSION`을 올린다. 옛 버전 저장은 삭제하지 않고 `legacy`/`invalid`로 안내한다.
  - 가정: `수정내용2` 개발 중에는 저장 형태를 바꾸는 태스크마다 `SCHEMA_VERSION`을 1씩 올린다. 출시 직전(TASK-013)에 최종 버전으로 한 번 더 정리한다. 개발 중 생성된 옛 스키마 저장은 `invalid`로 처리해도 무방하다.
- **미확정 수치**: 기획에 `가정:`/`TODO`로 남은 모든 밸런스 수치(스킬 데미지·쿨타임·회피율·그로기량 등)는 `src/game/constants.ts`에 `가정:` 주석과 함께 임시값으로 넣고, 같은 값을 기획 문서/테스트와 함께 갱신한다. 추측으로 단정하지 않는다.
- **테스트**: 신규 순수 함수는 colocated `*.test.ts`로, 스토어 변경은 `createGameStore` + 가짜 `now`/`random`/`schedule`로 검증한다.
- **검증 게이트**: 변경 후 `node tools/check.mjs fast "<바뀐 파일>"`, 설정·번들·의존성 변경이나 최종 검증은 `node tools/check.mjs full`. UI/CSS/스토어 변경 시 `npm run e2e`를 추가로 돌린다.
- **MVP 경계 유지**: PVP·길드·랭킹·시즌패스·결제·광고·장비·코치·서버 동기화는 범위 밖이다.

## 의존성 메모

- TASK-005~006은 TASK-004의 `boxerType`에 의존한다(타입별 회피/가드/카운터 보정).
- TASK-008(콤비네이션)·TASK-009(그로기)는 TASK-007(기본 공격 4종/손)에 의존한다.
- TASK-010(스킬)은 TASK-005~009의 메커닉(HP·카운터·그로기)에 효과를 연결한다.
- TASK-011~012(UI/연출)는 그 위 시스템이 노출하는 상태를 표시만 한다(로직 변경 없음).
