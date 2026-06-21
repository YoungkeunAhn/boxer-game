# UI 구조

## 핵심

웹으로 만들더라도 웹페이지처럼 보이면 안 된다. 게임 화면처럼 보여야 한다. 360px WebView 한 열 기준은 [기술 스택](../release/technical-stack.md)을 따른다.

TASK-011에서 아래 상/중/하 구성을 구현했다(상=`BoxerStatus`, 중=`CombatPanel`, 하=`SkillCooldownBar`+`SkillPanel`+`UpgradePanel`). UI는 프레젠테이셔널로 스토어 셀렉터만 읽고 디스패치한다(로직·타이머 무추가). 타입별 톤·애니메이션·이펙트는 TASK-012 범위다.

## 상단 UI (`BoxerStatus`)

```text
복서 이름 / 타입·성별 / 골드(G)
스테이지(챕터-스테이지) / 챕터 이름 / 진행(전투·파밍·보스전)
능력치 요약(공격력·공격속도·치명타율·치명타 피해·골드 보너스·총 처치)
```

표시 소스: `combat.position`(스테이지·챕터), `getStageDefinition`(챕터 이름·보스 여부), `boxer.gold`, `calculateCombatStats`.

## 중앙 전투 UI (`CombatPanel`)

```text
왼쪽: 복서 플레이스홀더    VS    오른쪽: 몬스터 플레이스홀더
복서 HP Bar(boxer-hp) / 몬스터 HP Bar(monster-hp) / 보스 Groggy Bar(groggy-bar, 보스에서만)
보상·보스 타이머
전투 피드: 데미지 숫자 / 콤보명 / 스킬명 / MISS·GUARD·COUNTER 텍스트
```

표시 소스: `combat.boxerHp/boxerMaxHp`, `combat.monsterHp`/`stage.maxHp`, `combat.groggyGauge/groggyMax/groggyUntil`, `lastAttack`(데미지), `lastCombo`, `lastSkill`(→ `getSkill().name`), `recentDefense.outcome`(HIT 제외 표시). 복서 HP Bar는 [체력과 실패](../combat/hp-and-defeat.md), Groggy Bar는 [보스전](../combat/boss.md)을 따른다.

## 하단 UI

```text
기본 공격 쿨타임(SkillCooldownBar): 잽 / 스트레이트 / 훅 / 어퍼 진행도
전용 스킬 슬롯(SkillPanel):  Slot 1 / Slot 2 / Slot 3 + 패시브
강화(UpgradePanel):  공격 계열 5종 + 방어 계열 4종
```

- 기본 공격 쿨타임 진행도는 `combat.nextReadyAt[type]`과 실효 쿨타임(`ATTACK_COOLDOWN_MS / attackSpeed`)에서 파생한다. 표시 전용이며 UI에 타이머를 새로 만들지 않는다(스토어 틱 set으로 갱신).
- 전용 스킬 슬롯은 [스킬 장착 구조](../skills/equip.md)와 일치시키고, 장착/해제는 TASK-010 액션(`equipSkill`/`unequipSkill`/`equipPassive`)을 사용한다.

## 강화 UI

- 공격 계열 5종(공격력·공격속도·치명타율·치명타 피해·골드 보너스) → [능력치와 수식](../systems/stats-and-formulas.md)
- 방어 계열 4종(체력·방어·회피·카운터)은 TASK-005~006에서 확정된 항목이다. 비용·상한·잔액 부족 비활성은 `calculateUpgradeCost`/`isUpgradeAtMaxLevel`로 표시한다.

## 관련 문서

- [타입별 UI 톤](./ui-tone.md)
- [애니메이션 요구사항](./animation.md)
- [스킬 장착 구조](../skills/equip.md)
