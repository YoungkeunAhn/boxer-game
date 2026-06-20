# 복서키우기

복서가 몬스터를 자동 공격하고, 처치 골드로 능력치를 강화해 더 강한 보스와 무한히 이어지는 장에 도전하는 방치형 성장 게임이다.

## 핵심 루프

`자동 공격 → 몬스터 처치 → 골드 획득 → 능력치 강화 → 보스 돌파 → 다음 장 도전`

## MVP 범위

- 포함(v0.1 기준선): 복서 생성/조회, 자동 공격, 일반·보스 스테이지, 처치 골드, 5종 능력치 강화, 보스 실패 후 반복 파밍과 재도전, 저장/불러오기, 오프라인 파밍
- 차기 단계(`수정내용2`): 복서 타입·성별, 복서 HP·몬스터 공격, 기본 공격 쿨타임·콤비네이션, 타입 전용 스킬, 게임 화면형 UI ([MVP 범위](./overview/mvp-scope.md) 참고)
- 제외: PVP, 길드, 랭킹, 시즌패스, 결제, 광고, 장비, 코치, 서버 계정 동기화

## 현재 구현 기준선

가정: 아래 값은 플레이테스트 전인 `balanceVersion: 2`의 기준선이다. 값을 바꾸면 관련 문서, 테스트, `BALANCE_VERSION`을 함께 갱신한다.

| 항목 | 구현값 |
| --- | --- |
| 초기 능력치 | 공격력 10, 공격속도 1회/초, 치명타율 5%, 치명타 피해 2배, 골드 보너스 0% |
| 일반/보스 구성 | 장마다 일반 4개와 30초 보스 1개 |
| 기본 스테이지 HP | 30, 45, 68, 105, 330 |
| 기본 스테이지 골드 | 5, 7, 10, 15, 50 |
| 장 배율 | HP `1.8^(장-1)`, 골드 `1.6^(장-1)` |
| 테마 | 숲 입구 → 늑대 숲 → 바위 협곡 순환 |
| 오프라인 인정 시간 | 최대 8시간, 현재 일반 스테이지만 반복 파밍 |
| 저장 키 | `boxer-game.save.v2` |
| 저장 스키마 | `schemaVersion: 2` |
| 밸런스 데이터 | `balanceVersion: 2` |

## 작업 유형별 필수 문서

| 작업 유형 | 먼저 읽을 문서 |
| --- | --- |
| 게임 규칙·밸런스 | 능력치와 수식, 콘텐츠 데이터, 데이터 모델 |
| 자동 전투·상태 구현 | 게임 시스템, 데이터 모델, 기술 스택 |
| 복서 타입·스킬 설계 | 복서 타입, 전용 스킬, 스킬 장착 구조 |
| 전투 심화(HP·몬스터 공격) | 몬스터 공격, 체력과 실패, 보스전 |
| UI·연출·QA | UI 구조, 타입별 UI 톤, 애니메이션, 브라우저 스모크 체크리스트 |
| 저장·오프라인 보상 | 데이터 모델, 게임 시스템, 출시 체크리스트 |
| 앱인토스 연동·출시 | 앱인토스 출시 전략, 출시 체크리스트, 게임 등급분류 준비 |

## 문서 구조

본 기획은 주제별 폴더로 구성한다. `수정내용2`(복서 타입·성별·스킬·복서 HP·몬스터 공격)는 현재 MVP 기준선을 검증한 뒤 확장하는 차기 단계이며, 각 문서 상단에 `가정:`으로 적용 범위를 표시한다.

- **overview** — [프로젝트 개요](./overview/concept.md) · [핵심 루프](./overview/core-loop.md) · [핵심 방향과 한 줄 정의](./overview/one-line-definition.md) · [MVP 범위](./overview/mvp-scope.md)
- **boxer** — [복서 타입](./boxer/types.md) · [인파이터](./boxer/infighter.md) · [아웃복서](./boxer/out-boxer.md) · [캐릭터 성별](./boxer/gender.md)
- **combat** — [공통 기본 공격](./combat/basic-attacks.md) · [콤비네이션](./combat/combinations.md) · [몬스터 공격](./combat/monster-attacks.md) · [체력과 실패](./combat/hp-and-defeat.md) · [보스전](./combat/boss.md)
- **skills** — [스킬 장착 구조](./skills/equip.md) · [인파이터 전용 스킬](./skills/infighter-skills.md) · [아웃복서 전용 스킬](./skills/out-boxer-skills.md)
- **presentation** — [UI 구조](./presentation/ui.md) · [타입별 UI 톤](./presentation/ui-tone.md) · [애니메이션](./presentation/animation.md)
- **systems** — [게임 시스템](./systems/game-systems.md) · [능력치와 수식](./systems/stats-and-formulas.md) · [스테이지 성장과 오프라인](./systems/stage-and-offline.md) · [콘텐츠 데이터](./systems/content-data.md) · [데이터 모델](./systems/data-model.md) · [저장 모델](./systems/save-model.md)
- **progress** — [유저 플로우](./progress/user-flow.md) · [개발 로드맵](./progress/development-roadmap.md) · [개발 순서](./progress/dev-order.md)

## 앱인토스 출시 관련 문서

- [앱인토스 출시 전략](../platform-apps-in-toss.md)
- [출시 체크리스트](../release-checklist.md)
- [게임 등급분류 준비](../game-rating.md)
- [기술 스택](../technical-stack.md)
- [브라우저 스모크 체크리스트](../browser-smoke-checklist.md)

## 문서 작성 원칙

- 미정 사항은 `TODO`, 검증 전 설계 판단은 `가정:`으로 표시한다.
- 구현 중 규칙이 바뀌면 관련 문서와 저장·밸런스 데이터 버전을 함께 갱신한다.
