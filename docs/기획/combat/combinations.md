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

## 관련 문서

- [공통 기본 공격](./basic-attacks.md)
- [보스전](./boss.md)
- [애니메이션 요구사항](../presentation/animation.md)
