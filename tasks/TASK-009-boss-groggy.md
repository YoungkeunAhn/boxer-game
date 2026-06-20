# TASK-009 보스 그로기 시스템 (v1.3c)

## 목표

보스전에 **그로기 게이지**를 도입한다. 훅·어퍼(및 후속 스킬)가 그로기를 누적하고, 보스가 그로기 상태가 되면 **추가 피해**를 받는다. 타입별 공략(인파이터=그로기 누적, 아웃복서=회피 후 카운터) 구도를 만든다.

## 참고 문서

- `docs/combat/boss.md`, `docs/combat/combinations.md`, `docs/systems/stats-and-formulas.md`

## 작업 범위

1. `src/game/types.ts`
   - `CombatRuntime`(보스 한정 유효)에 `groggyGauge`, `groggyMax`, `groggyUntil`(그로기 상태 종료 시각) 추가.
   - `AttackResult`에 그로기 누적량/그로기 발동 여부 필드 추가.
   - 저장 형태 변경 시 `SCHEMA_VERSION` 상향(가정: 그로기는 보스 전투 런타임 값이므로 비저장 가능 — 택일 후 명시).
2. `src/game/constants.ts`
   - 가정: `groggyMax`, 공격별 그로기 누적량(훅·어퍼·풀콤보·인파이터 스킬), 그로기 지속 시간, 그로기 상태 추가 피해 배수. 전부 `가정:` 임시값. `BALANCE_VERSION` 상향.
   - 보스 강공격 예고(WARNING) 타이밍 값(연출은 TASK-011~012, 여기서는 판정용 시점만).
3. `src/game/combat.ts`
   - 보스 공격 처리 시 훅/어퍼/풀콤보로 `groggyGauge` 누적, `groggyMax` 도달 시 `groggyUntil` 설정(그로기 진입) 및 게이지 리셋.
   - 그로기 상태 동안 보스가 받는 피해에 추가 배수 적용.
   - 기존 30초 보스 제한시간·경계 시각 우선 처리(`resolveBossTimeout`)와 호환되게 통합. 보스가 아닌 일반 스테이지에서는 그로기 비활성.
4. `src/stores/gameStore.ts`: 그로기 게이지·그로기 상태를 상태로 노출(보스 UI용).
5. 테스트: 그로기 누적·발동·만료, 그로기 중 추가 피해, 비보스 비활성, 제한시간과의 상호작용, 인파이터(그로기 빠름) vs 아웃복서(느림) 경향.

## 구현 원칙

- 그로기 게이지는 보스 전투에서만 의미를 가진다. 일반 스테이지 전이 시 초기화.
- 제한 시간·경계 시각 우선 처리 규칙(기존)을 깨지 않는다.

## 하지 않을 것

- 그로기를 직접 발생시키는 액티브 스킬(리버샷·뎀프시롤)의 구현(TASK-010에서 그로기 누적 소스로 연결).
- 화면 흔들림/WARNING 연출(TASK-012).

## 완료 기준

- 훅·어퍼·풀콤보로 그로기가 차고, 가득 차면 보스가 그로기 상태가 되어 추가 피해를 받는다.
- 그로기 상태는 일정 시간 후 해제된다.
- 보스 제한시간·실패·재도전이 기존대로 동작한다.
- `node tools/check.mjs full` 통과.

## 체크리스트

- [ ] `types.ts`: `CombatRuntime`(보스 한정)에 `groggyGauge`·`groggyMax`·`groggyUntil` 추가
- [ ] `types.ts`: `AttackResult`에 그로기 누적량·발동 여부 필드 추가
- [ ] `types.ts`: 저장 형태 변경 시 `SCHEMA_VERSION` 상향(비저장 택일 시 명시)
- [ ] `constants.ts`: `groggyMax`, 공격별 누적량, 지속 시간, 추가 피해 배수, 강공격 예고 타이밍 `가정:` 임시값
- [ ] `constants.ts`: `BALANCE_VERSION` 상향
- [ ] `combat.ts`: 훅/어퍼/풀콤보로 `groggyGauge` 누적, `groggyMax` 도달 시 `groggyUntil` 설정·게이지 리셋
- [ ] `combat.ts`: 그로기 상태 동안 보스 받는 피해 추가 배수, `resolveBossTimeout`(제한시간·경계) 호환 통합, 비보스 비활성
- [ ] `gameStore.ts`: 그로기 게이지·그로기 상태 상태 노출
- [ ] 테스트: 그로기 누적·발동·만료, 그로기 중 추가 피해, 비보스 비활성, 제한시간 상호작용, 타입별 경향
- [ ] `node tools/check.mjs full` 통과

## 결과 보고 형식

수정 파일 / 그로기 수식·누적 소스(가정) / 추가 피해 배수 / 제한시간 통합 / 버전 변경 / 남은 TODO / 다음 태스크.
