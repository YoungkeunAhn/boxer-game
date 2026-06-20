# UI 구조

## 핵심

웹으로 만들더라도 웹페이지처럼 보이면 안 된다. 게임 화면처럼 보여야 한다. 360px WebView 한 열 기준은 [기술 스택](../release/technical-stack.md)을 따른다.

가정: 아래 구성은 `수정내용2` 설계 방향이며 일부 요소(HP·스킬 슬롯)는 신규 시스템에 의존한다.

## 상단 UI

```text
현재 스테이지 / 챕터 이름 / 복서 타입 / 골드 / 보스 여부
```

## 중앙 전투 UI

```text
왼쪽: 복서 캐릭터       오른쪽: 몬스터 캐릭터
복서 HP Bar / 몬스터 HP Bar / 보스 Groggy Bar
데미지 숫자 / 스킬명 텍스트
MISS / GUARD / COUNTER 텍스트
```

복서 HP Bar는 [체력과 실패](../combat/hp-and-defeat.md), Groggy Bar는 [보스전](../combat/boss.md)을 따른다.

## 하단 UI

```text
기본 스킬 쿨타임: 잽 / 스트레이트 / 훅 / 어퍼
전용 스킬 슬롯:  Slot 1 / Slot 2 / Slot 3
강화 버튼:      스킬 강화 / 체력 강화 / 방어 강화 / 회피 강화 / 카운터 강화
```

스킬 슬롯은 [스킬 장착 구조](../skills/equip.md)와 일치시킨다.

## 기존 강화 UI와의 관계

- 기존 5종 강화(공격력·공격속도·치명타율·치명타 피해·골드 보너스)는 유지한다. → [능력치와 수식](../systems/stats-and-formulas.md)
- 체력·방어·회피·카운터 강화는 신규 전투 모델용 항목으로 확장이 필요하다(미확정).

## 관련 문서

- [타입별 UI 톤](./ui-tone.md)
- [애니메이션 요구사항](./animation.md)
- [스킬 장착 구조](../skills/equip.md)
