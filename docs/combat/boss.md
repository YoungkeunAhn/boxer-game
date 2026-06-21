# 보스전

## 핵심

보스전은 일반 몬스터와 다르게 특별해야 한다. 각 장의 5스테이지는 제한 시간 보스다. → [핵심 루프](../overview/core-loop.md)

가정: 그로기·강공격 예고 연출은 `수정내용2` 설계 방향이다. 보스 제한 시간 등 확정된 수치는 [능력치와 수식](../systems/stats-and-formulas.md)을 따른다.

## 보스 UI

```text
BOSS WARNING
보스 이름 표시
큰 HP Bar
Groggy Bar
제한 시간
강공격 예고
화면 흔들림
```

## 그로기

- 훅·어퍼·리버샷·뎀프시롤 등으로 그로기를 누적한다. → [공통 기본 공격](./basic-attacks.md), [인파이터 전용 스킬](../skills/infighter-skills.md)
- 그로기 상태의 보스는 추가 데미지를 받는다(어퍼 강화 등).
- 인파이터는 그로기 누적, 아웃복서는 회피 후 카운터로 보스를 공략한다.

### 구현 확정값 (TASK-009, `src/game/constants.ts`)

아래 값은 TASK-013에서 확정·동결했다(확정값 balanceVersion 9). 코드(`constants.ts`)·테스트와 같은 값을 유지한다. 그로기는 보스 전투 런타임 전용 값이라 저장하지 않는다(`CombatRuntime`의 `groggyGauge`/`groggyMax`/`groggyUntil`, 비저장 → `SCHEMA_VERSION` 영향 없음).

- 누적 소스: **훅 +15**, **어퍼 +25** (`GROGGY_GAIN_BY_ATTACK`). 잽·스트레이트는 0. 풀 콤비네이션 마무리 어퍼는 추가로 **+20**(`FULL_COMBO_GROGGY_BONUS`).
- 게이지 상한: **100** (`GROGGY_MAX_BASE`). 도달 시 그로기 진입·게이지 0 리셋.
- 그로기 지속: **4000ms** (`GROGGY_DURATION_MS`). 그로기 상태 보스가 받는 추가 피해 배수 **×1.5** (`GROGGY_DAMAGE_MULT`). 추가 피해는 그로기 중 친 공격에만 적용하며 누적은 멈춘다.
- 타입별 누적 배율: 인파이터 **×1.4**(그로기 빠름), 아웃복서 **×0.7**(그로기 느림) (`BOXER_TYPE_MODIFIERS.groggyGainMultiplier`).
- 강공격 예고 판정 시점: **800ms** (`BOSS_WARNING_LEAD_MS`, 시점 상수만 — 연출은 TASK-011~012).
- 그로기는 보스 스테이지에서만 활성(비보스 `groggyMax=0`). 킬·스테이지 전이·넉다운·보스 타임아웃 시 `createCombatRuntime` 재생성으로 초기화한다. 제한 시간 만료는 그로기 상태보다 우선한다.
- 미구현(범위 밖): 리버샷·뎀프시롤 등 액티브 스킬 그로기 소스(TASK-010), WARNING·화면 흔들림 연출(TASK-012). 오프라인 정산은 그로기 미모델링(가정 유지).

## 타입별 보스전 예시

```text
보스 광폭 돌진 준비 → WARNING!

아웃복서:
GHOST STEP! → MISS! → COUNTER STRAIGHT!

인파이터:
IRON GUARD! → 피해 -60% → LIVER SHOT! → Groggy +20
```

## 성공·실패

- 제한 시간 안에 처치하면 다음 장 1스테이지로 이동한다.
- 시간초과·HP 0이면 실패 처리하고 같은 장 4스테이지 반복 파밍으로 돌아간다. → [체력과 실패](./hp-and-defeat.md)
- 경계 시각 처리 규칙은 [능력치와 수식](../systems/stats-and-formulas.md)을 따른다.

## 관련 문서

- [몬스터 공격 시스템](./monster-attacks.md)
- [체력과 실패 구조](./hp-and-defeat.md)
- [타입별 UI 톤](../presentation/ui-tone.md)
