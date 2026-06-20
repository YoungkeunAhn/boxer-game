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
