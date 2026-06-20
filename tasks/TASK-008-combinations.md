# TASK-008 콤비네이션·콤보 게이지 (v1.3b)

## 목표

기본 공격이 정해진 **순서로 이어지면 콤비네이션 보너스**가 발동하게 한다(원투 → 원투 훅 → 풀 콤비네이션). 잽이 **콤보 게이지**를 쌓는다.

## 참고 문서

- `docs/기획/combat/combinations.md`, `docs/기획/combat/basic-attacks.md`

## 작업 범위

1. `src/game/types.ts`
   - `CombatRuntime`에 `attackHistory`(최근 공격 타입·손 시퀀스, 길이 제한)와 `comboGauge: number` 추가.
   - `AttackResult`에 발동한 콤비네이션 식별자(`'ONE_TWO' | 'ONE_TWO_HOOK' | 'FULL_COMBO' | null`) 추가.
   - 저장 형태 변경 시 `SCHEMA_VERSION` 상향.
2. `src/game/constants.ts`
   - 콤비네이션 정의(문서):
     - 원투: `left_jab → right_straight` → 스트레이트 데미지 증가.
     - 원투 훅: `left_jab → right_straight → left_hook` → 훅 치명타 확률 증가.
     - 풀 콤비네이션: `… → right_upper` → 어퍼 데미지 증가 + 그로기 증가(TASK-009 연계).
   - 가정: 보너스 수치(데미지 증가량, 치명타 증가량, 콤보 게이지 증가량/소비) 전부 `가정:` 임시값. `BALANCE_VERSION` 상향.
3. `src/game/combat.ts`
   - 공격 처리 시 `attackHistory`를 갱신하고 콤비네이션 매칭(순서+손)을 판정해 보너스를 적용한다.
   - 콤보가 끊기는 조건(가정: 시퀀스 이탈/시간 초과)을 명시. 잽이 `comboGauge`를 올린다(강화로 증가량 조절은 가정/후속).
   - TASK-007의 공격 선택 정책을 콤보 진행을 우선하도록 정교화(가정: 콤보 다음 단계 공격이 ready면 우선). 정책 변경을 한 곳에 모은다.
4. `src/stores/gameStore.ts`: 현재 콤보 진행 단계·게이지·직전 발동 콤비네이션을 상태로 노출(연출용).
5. 테스트: 각 콤비네이션의 정확한 시퀀스 발동, 손 불일치 시 미발동, 보너스 적용량, 콤보 끊김, 게이지 누적.

## 구현 원칙

- 콤비네이션 판정은 손 지정까지 일치해야 발동한다(`left_jab`, `right_straight` 등). 손 규칙은 TASK-007을 따른다.
- 보너스 수치는 미확정이므로 `가정:`으로 두고 한 곳에서 관리한다.

## 하지 않을 것

- 그로기 게이지 자체의 도입(TASK-009) — 여기서는 풀 콤보의 "그로기 증가" 연계 지점만 남겨둔다(TASK-009에서 결선).
- 스킬에 의한 콤보 변형(TASK-010).

## 완료 기준

- 잽→스트레이트로 ONE-TWO, 추가 훅으로 ONE-TWO HOOK, 추가 어퍼로 FULL COMBO가 발동한다.
- 손이 어긋나면 콤비네이션이 발동하지 않는다(결정적 테스트).
- 콤보 게이지가 잽으로 누적된다.
- `node tools/check.mjs full` 통과.

## 체크리스트

- [ ] `types.ts`: `CombatRuntime`에 `attackHistory`(길이 제한)·`comboGauge` 추가
- [ ] `types.ts`: `AttackResult`에 콤비네이션 식별자(`'ONE_TWO' | 'ONE_TWO_HOOK' | 'FULL_COMBO' | null`) 추가
- [ ] `types.ts`: 저장 형태 변경 시 `SCHEMA_VERSION` 상향
- [ ] `constants.ts`: 원투/원투훅/풀콤보 정의와 보너스 수치(데미지·치명타·게이지) `가정:` 임시값
- [ ] `constants.ts`: `BALANCE_VERSION` 상향
- [ ] `combat.ts`: `attackHistory` 갱신·콤비네이션 매칭(순서+손) 판정·보너스 적용
- [ ] `combat.ts`: 콤보 끊김 조건(`가정:` 명시), 잽으로 `comboGauge` 누적
- [ ] `combat.ts`: TASK-007 공격 선택 정책을 콤보 진행 우선으로 정교화(한 곳에 모음)
- [ ] `gameStore.ts`: 콤보 진행 단계·게이지·직전 발동 콤비네이션 상태 노출
- [ ] 테스트: 각 콤비네이션 정확한 시퀀스 발동, 손 불일치 미발동, 보너스 적용량, 콤보 끊김, 게이지 누적
- [ ] `node tools/check.mjs full` 통과

## 결과 보고 형식

수정 파일 / 콤비네이션 정의·보너스(가정) / 콤보 게이지 규칙 / 공격 선택 정책 변화 / 버전 변경 / 남은 TODO / 다음 태스크.
