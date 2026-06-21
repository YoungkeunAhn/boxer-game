# TASK-005 복서 HP·몬스터 공격·넉다운 (v1.2a)

## 목표

몬스터가 복서를 공격하고, **복서 HP**가 0이 되면 현재 스테이지를 실패(KNOCK DOWN)한다. 실패는 게임오버가 아니라 **스테이지 유지 + 부분 골드 + 재도전** 구조다. 체력·방어 강화를 도입한다.
회피/가드/카운터 판정은 TASK-006에서 붙인다. 이 태스크는 HP·피격·넉다운·몬스터 공격 루프의 뼈대를 만든다.

## 참고 문서

- `docs/combat/monster-attacks.md`, `docs/combat/hp-and-defeat.md`
- `docs/systems/stats-and-formulas.md`, `docs/systems/game-systems.md`

## 작업 범위

1. `src/game/types.ts`
   - `CombatStats`/`UpgradeLevels`에 `maxHp`, `defense` 추가. `UpgradeKey`에 `hp`, `defense` 포함.
   - `Boxer`에 지속 HP가 필요한지 결정. 가정: 현재 HP는 전투 런타임 값으로 두고(`CombatRuntime.boxerHp`), 저장은 위치·강화만 한다(전투 시작 시 `maxHp`로 충전). 저장 형태가 바뀌면 `SCHEMA_VERSION`을 올린다.
   - `CombatRuntime`에 `boxerHp`, `boxerMaxHp`, `nextMonsterAttackAt`, (예고용) `monsterAttackPrep` 추가.
2. `src/game/constants.ts`
   - 가정: 복서 초기 `maxHp`, 체력 강화 증가량·상한, 방어 강화 증가량·상한, 몬스터 공격 기본 피해와 쿨타임(스테이지/장 배율 포함), 실패 시 부분 골드 비율. 전부 `가정:` 임시값 + 주석. 타입별 HP/방어 보정(TASK-004 골격)을 여기서 실제 계수로 채운다.
   - `BALANCE_VERSION`을 올린다.
3. `src/game/formulas.ts`
   - `maxHp`·`defense` 강화 곡선·비용 함수 추가(기존 `1.25^level` 비용 규칙 따름, 모두 `MAX_SAFE_GAME_INTEGER` 클램프).
   - 피격 피해 수식: 가정 `받는 피해 = max(1, floor(몬스터 공격력 × (1 - 피해감소율)))`. 피해감소율은 `defense`에서 유도(TASK-006의 가드와 합산 방식은 거기서 확정).
4. `src/game/combat.ts`
   - `resolveMonsterAttack(now, combat, boxer, stage, random)`: 몬스터 공격 시각 도달 시 복서 HP 감소, 다음 몬스터 공격 일정 재계산, HP 0 도달 시 `knockedDown` 플래그 반환.
   - `resolveAttack`/`advanceCombat` 경로에 몬스터 공격을 시간순으로 끼워넣는다(복서 공격과 몬스터 공격을 `now` 기준으로 인터리브). 전투 시작·스테이지 전이 시 `boxerHp = boxerMaxHp`로 충전.
   - 넉다운 처리: 현재 스테이지 유지, 부분 골드 지급, 복서 HP 재충전 후 재시작(가정: 자동 재시작). 보스에서의 넉다운은 기존 타임아웃 실패와 동일하게 직전 일반 스테이지 파밍으로(또는 동일 보스 재시작) — `가정:`으로 명시하고 테스트.
5. `src/stores/gameStore.ts`: 넉다운 이벤트 시 즉시 저장, 메시지 노출(`KNOCK DOWN`).
6. 테스트: 몬스터 공격 타이밍, 피격 누적, HP 0 넉다운, 부분 골드, 보스 넉다운, 강화 곡선·비용·상한, 오프라인 정산이 HP 도입 후에도 일관(가정: 오프라인은 피격을 모델링하지 않고 기존 파밍 정산 유지 — 명시).

## 구현 원칙

- 몬스터 공격도 `now` 주입으로 결정적이어야 한다. 랙/백그라운드 후에도 인터리브가 정확해야 한다.
- 실패는 진행 손실이 아니다(스테이지·강화 유지). 부분 골드는 재도전 동기를 준다.

## 하지 않을 것

- 회피/가드/카운터 판정과 회피·카운터 강화(TASK-006).
- 기본 공격 4종 분리(TASK-007) — 이 태스크는 기존 단일 공격 모델 위에서 몬스터 공격만 추가한다.

## 완료 기준

- 몬스터가 쿨타임마다 복서를 공격하고 복서 HP가 줄어든다.
- 복서 HP 0 시 KNOCK DOWN, 스테이지 유지, 부분 골드 지급, 재도전 가능.
- 체력·방어 강화의 증가량·비용·상한이 수식과 일치한다.
- `node tools/check.mjs full` + `npm run e2e` 통과.

## 결과 보고 형식

수정 파일 / 추가 수식·상수(가정값 목록) / 버전 변경 / 넉다운 동작 / 오프라인 정산 영향 / 남은 TODO / 다음 태스크.
