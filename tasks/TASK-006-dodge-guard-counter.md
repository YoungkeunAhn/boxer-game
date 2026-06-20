# TASK-006 회피·가드·카운터 판정 (v1.2b)

## 목표

몬스터 공격에 대해 복서가 **회피(MISS)·가드(피해 감소)·카운터(반격)**로 대응하게 한다. 타입별 차이(인파이터=가드·근접 반격 강함, 아웃복서=회피·카운터 강함)를 적용하고, **회피·카운터 강화**를 도입한다.

## 참고 문서

- `docs/기획/combat/monster-attacks.md`, `docs/기획/boxer/infighter.md`, `docs/기획/boxer/out-boxer.md`
- `docs/기획/systems/stats-and-formulas.md`

## 작업 범위

1. `src/game/types.ts`
   - `CombatStats`/`UpgradeLevels`에 `dodge`(회피율), `counter`(카운터 성능) 추가. `UpgradeKey`에 `dodge`, `counter` 포함.
   - `AttackResult`/`CombatStepResult`에 몬스터 공격 결과 분류 추가: `'HIT' | 'GUARD' | 'MISS' | 'COUNTER'`와 카운터 데미지 필드.
   - 저장 형태 변경 → `SCHEMA_VERSION` 상향.
2. `src/game/constants.ts`
   - 가정: 회피 강화 증가량·상한, 카운터 발동 조건·데미지 계수, 가드 피해 감소율, 타입별 보정(인파이터 가드 감소율↑·회피↓, 아웃복서 회피↑·카운터↑). 전부 `가정:` 임시값. `BALANCE_VERSION` 상향.
3. `src/game/formulas.ts`
   - `dodge`·`counter` 강화 곡선·비용(기존 비용 규칙 따름, 클램프).
   - 판정 수식(가정): `회피 성공 = random < dodgeRate`(타입 보정 합산), 회피 실패 시 가드 적용으로 `받는 피해 = max(1, floor(공격력 × (1 - 가드감소율 - defense감소)))`.
4. `src/game/combat.ts`
   - TASK-005의 `resolveMonsterAttack`를 확장: 몬스터 공격 시 ① 회피 롤 → 성공 시 `MISS`, 아웃복서/조건 충족 시 `COUNTER`(복서가 몬스터에 반격 데미지) → ② 실패 시 가드 적용 피해 → ③ HP 감소/넉다운.
   - 인파이터: 가드 감소율 높고, 가드 성공 시 근접 반격(가정: 약한 반격 데미지). 아웃복서: 회피율·카운터 데미지 높음.
   - 모든 분기는 주입된 `random`으로 결정적. 결과 분류를 `CombatStepResult`로 노출(UI 연출용).
5. `src/stores/gameStore.ts`: 최근 방어 결과(MISS/GUARD/COUNTER)를 상태로 노출.
6. 테스트: 회피/가드/카운터 분기별 결정적 케이스, 타입별 보정 차이, 강화 곡선·비용·상한, 카운터 데미지.

## 구현 원칙

- 회피·가드·카운터는 한 번의 몬스터 공격에 대해 배타적 순서로 판정한다(회피→가드→피격). 순서·우선순위를 `가정:`으로 명시.
- 타입 보정은 TASK-004 골격 테이블을 통해 일관되게 적용한다.

## 하지 않을 것

- 스킬에 의한 회피율/카운터 버프(TASK-010에서 연결).
- 연출/텍스트 표시(TASK-011~012). 여기서는 결과 분류 상태만 노출.

## 완료 기준

- 몬스터 공격이 회피/가드/카운터/피격으로 갈라지고 타입별 경향이 드러난다.
- 회피·카운터 강화의 증가량·비용·상한이 수식과 일치한다.
- 아웃복서가 인파이터보다 더 자주 MISS/COUNTER를 낸다(결정적 테스트로 검증).
- `node tools/check.mjs full` 통과.

## 체크리스트

- [ ] `types.ts`: `CombatStats`/`UpgradeLevels`에 `dodge`·`counter` 추가, `UpgradeKey`에 포함
- [ ] `types.ts`: `AttackResult`/`CombatStepResult`에 `'HIT' | 'GUARD' | 'MISS' | 'COUNTER'` 분류와 카운터 데미지 필드 추가
- [ ] `types.ts`: 저장 형태 변경 → `SCHEMA_VERSION` 상향
- [ ] `constants.ts`: 회피 증가량·상한, 카운터 조건·데미지 계수, 가드 감소율, 타입 보정 `가정:` 임시값 추가
- [ ] `constants.ts`: `BALANCE_VERSION` 상향
- [ ] `formulas.ts`: `dodge`·`counter` 강화 곡선·비용(기존 규칙·클램프), 회피→가드 판정 수식
- [ ] `combat.ts`: `resolveMonsterAttack` 확장(회피→가드→피격, 인파이터 가드 반격, 아웃복서 회피·카운터)
- [ ] `combat.ts`: 모든 분기를 주입된 `random`으로 결정적 처리, 결과 분류를 `CombatStepResult`로 노출
- [ ] `gameStore.ts`: 최근 방어 결과(MISS/GUARD/COUNTER) 상태 노출
- [ ] 테스트: 회피/가드/카운터 분기 결정적 케이스, 타입 보정 차이, 강화 곡선·비용·상한, 카운터 데미지
- [ ] 테스트: 아웃복서가 인파이터보다 MISS/COUNTER를 더 자주 냄을 결정적으로 검증
- [ ] `node tools/check.mjs full` 통과

## 결과 보고 형식

수정 파일 / 판정 순서·수식(가정값) / 타입 보정 차이 / 버전 변경 / 남은 TODO / 다음 태스크.
