# 애니메이션 요구사항

타입·성별 외형 차이는 [캐릭터 성별](../boxer/gender.md)을 따르며, 공격 키는 [공통 기본 공격](../combat/basic-attacks.md)의 손 규칙과 일치한다.

## 공통 모션

```text
대기 / 공격 / 피격 / 회피 / 사망 / 스킬 발동
```

## 공격 모션

```text
잽       = 왼손이 빠르게 뻗음
스트레이트 = 오른손이 몸 회전과 함께 뻗음
훅       = 좌우 방향 회전 타격
어퍼     = 아래에서 위로 올려침
```

## 회피 모션

```text
더킹       = 아래로 숙임
위빙       = 좌우로 흔듦
스웨이      = 상체를 뒤로 젖힘
스텝백      = 뒤로 빠짐
고스트스텝   = 잔상과 함께 회피
나비 스텝    = 가볍게 발을 움직이며 버프 발동
```

회피 모션은 [몬스터 공격](../combat/monster-attacks.md) 판정과 연동된다.

## 애니메이션 키 예시

```text
boxer_left_jab
boxer_right_straight
boxer_left_hook
boxer_right_hook
boxer_left_upper
boxer_right_upper
```

손 선택 규칙에 따라 같은 스킬도 좌/우 키를 번갈아 사용한다. → [공통 기본 공격](../combat/basic-attacks.md)

## 관련 문서

- [캐릭터 성별](../boxer/gender.md)
- [공통 기본 공격](../combat/basic-attacks.md)
- [타입별 UI 톤](./ui-tone.md)
