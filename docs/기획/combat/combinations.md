# 콤비네이션 시스템

## 핵심

공격 스킬이 특정 순서로 이어지면 콤비네이션 보너스가 발동한다. 손 지정과 순서는 [공통 기본 공격](./basic-attacks.md)의 동작 규칙을 따른다.

가정: 아래 보너스는 `수정내용2` 설계 방향이며 수치는 미확정이다.

## 콤비네이션 목록

| 이름 | 순서 | 효과 |
| --- | --- | --- |
| 원투 | `left_jab → right_straight` | 스트레이트 데미지 증가 |
| 원투 훅 | `left_jab → right_straight → left_hook` | 훅 치명타 확률 증가 |
| 풀 콤비네이션 | `left_jab → right_straight → left_hook → right_upper` | 어퍼 데미지 증가 + 그로기 증가 |

## 발동 연출

```text
원투:
JAB! → STRAIGHT! → ONE-TWO!

원투 훅:
JAB! → STRAIGHT! → LEFT HOOK! → ONE-TWO HOOK!

풀 콤비네이션:
JAB! → STRAIGHT! → LEFT HOOK! → RIGHT UPPER! → FULL COMBO!
```

## 콤보 게이지

- 잽은 콤보 게이지를 쌓으며, 강화로 게이지 증가량을 올릴 수 있다. → [공통 기본 공격 강화](./basic-attacks.md)
- 콤보가 손 지정과 어긋나지 않도록 손 선택 규칙을 우선 적용한다.

## 구현 가정값 (TASK-008, `src/game/constants.ts`)

가정: 아래 임시값은 TASK-013에서 확정한다. 코드(`constants.ts`)·테스트와 같은 값을 유지한다.

- 보너스(콤보를 마무리한 그 타격에만 적용):
  - 원투(`ONE_TWO`): 마무리 **스트레이트 데미지 ×1.3** (`ONE_TWO_STRAIGHT_DAMAGE_MULT`).
  - 원투 훅(`ONE_TWO_HOOK`): 마무리 **훅 치명타 확률 +0.2** 가산, 최종 확률 1.0 클램프 (`ONE_TWO_HOOK_CRIT_BONUS`).
  - 풀 콤비네이션(`FULL_COMBO`): 마무리 **어퍼 데미지 ×1.5** (`FULL_COMBO_UPPER_DAMAGE_MULT`).
  - 풀 콤비네이션의 **그로기 증가**는 TASK-009 연계 자리로만 둔다(`FULL_COMBO_GROGGY_BONUS=0`, 현재 미사용).
- 콤보 게이지: 잽 1회당 **+10**, 상한 **100** (`COMBO_GAUGE_PER_JAB`, `COMBO_GAUGE_MAX`). 게이지 소비·효과·증가량 강화는 후속 태스크.
- 콤보 끊김 조건(가정): 1차 구현은 **시퀀스 이탈**(직전 타격들이 콤보 prefix와 어긋남)과 **킬·스테이지 전이·넉다운·보스 타임아웃 리셋**만으로 끊는다.
  - 시퀀스 매칭은 최근 타격 시퀀스(`attackHistory`, 상한 4타)의 끝부분이 콤보 시퀀스와 정확히 일치할 때만 발동하므로, 이탈한 타격은 자동으로 콤보를 깬다.
  - TODO(가정): **시간 초과 끊김**(`COMBO_WINDOW_MS`)은 `attackHistory`에 타임스탬프가 필요해 1차 범위에서 제외한다(TASK-013에서 결정).
- 공격 선택 정책: 진행 중인 콤보의 **다음 단계 공격이 ready면 우선** 친다. 아니면 기존 우선순위(어퍼>훅>스트레이트>잽) 폴백. 콤보 시작(잽)은 폴백에 맡긴다.
- 평균 DPS·오프라인 정산: 오프라인 정산(`calculateAttackDps`/`calculateOfflineProgress`)은 콤보 보너스를 모델링하지 않는다(가정). 온라인 전투만 보너스만큼 빨라지며 밸런스는 TASK-013에서 재조정한다.

## 관련 문서

- [공통 기본 공격](./basic-attacks.md)
- [보스전](./boss.md)
- [애니메이션 요구사항](../presentation/animation.md)
