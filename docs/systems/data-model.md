# 데이터 모델

가정: TypeScript 기반 구현이며 테마와 스테이지 템플릿은 정적 데이터로 관리한다.

## 공통 타입

```ts
type UpgradeKey =
  | "attackPower"
  | "attackSpeed"
  | "critRate"
  | "critDamage"
  | "goldBonus"
  // v1.2a: 복서 HP·방어 강화
  | "maxHp"
  | "defense"
  // v1.2b: 회피·카운터 강화
  | "dodge"
  | "counter";

type CombatStats = Record<UpgradeKey, number>;
type UpgradeLevels = Record<UpgradeKey, number>;

type StagePosition = {
  chapter: number;
  stage: number;
};

type StageDefinition = StagePosition & {
  id: string;
  themeId: string;
  chapterName: string;
  monsterName: string;
  isBoss: boolean;
  maxHp: number;
  goldReward: number;
  bossTimeLimitMs: number | null;
};
```

## 플레이어와 전투 런타임

```ts
// 전투 스타일 타입. 전투 성능 차이는 전적으로 타입이 결정한다.
type BoxerType = "INFIGHTER" | "OUT_BOXER";
// 성별은 외형·모션 식별자 전용이며 전투 성능에는 영향이 없다.
type Gender = "MALE" | "FEMALE";

// 액티브=쿨타임마다 자동 발동, 패시브=장착 시 상시 적용. 기본 4종은 고정이라 비저장.
type EquippedSkills = {
  active: SkillId[]; // 최대 3
  passive: SkillId | null;
};

type Boxer = {
  id: string;
  name: string;
  boxerType: BoxerType;
  gender: Gender;
  gold: number;
  totalKills: number;
  upgradeLevels: UpgradeLevels; // 9키
  equippedSkills: EquippedSkills; // v1.3d(TASK-010): 저장 대상
};

type CombatRuntime = {
  position: StagePosition;
  monsterHp: number;
  bossDeadlineAt: number | null;
  nextAttackAt: number;
  isFarming: boolean;
  // v1.3a 기본 공격 4종: 공격별 다음 발동 가능 시각·직전 타격 손.
  nextReadyAt: Record<AttackType, number>;
  lastHand: Hand | null;
  // v1.3b 콤보: 최근 타격 시퀀스·게이지·진행 단계.
  attackHistory: AttackBeat[];
  comboGauge: number;
  comboStep: number;
  // v1.3c 보스 그로기(보스 전용): 누적 게이지·상한·상태 종료 시각.
  groggyGauge: number;
  groggyMax: number;
  groggyUntil: number | null;
  // v1.3d 스킬 런타임: 액티브 쿨다운·발동 버프·리버샷 내상 DoT.
  skillCooldowns: Partial<Record<SkillId, number>>;
  activeBuffs: SkillBuff[];
  internalDoT: InternalDoT | null;
  // v1.2a 복서 HP·몬스터 공격 타이머.
  boxerHp: number;
  boxerMaxHp: number;
  nextMonsterAttackAt: number;
  monsterAttackPrep: { dueAt: number } | null;
};
```

- `CombatStats`는 `UpgradeLevels`(9키)에서 `boxerType` 보정을 곱해 계산하며 저장하지 않는다.
- `CombatRuntime`은 메모리 상태다. 몬스터 HP·타이머 시각·복서 HP·콤보·그로기·스킬 쿨다운/버프/내상은 모두 비저장이다(저장 대상은 `equippedSkills`뿐).
- `isFarming`이 참이면 같은 장 4스테이지 처치 후 위치를 유지하고 새 몬스터를 만든다.
- `boxerType`/`gender`는 생성 시 한 번 정해지고 변하지 않는다. 타입별 전투 보정은 `constants.ts`의 `BOXER_TYPE_MODIFIERS`에 확정값으로 적용돼 있다(인파이터 체력·방어·가드·그로기 높음/회피·카운터 낮음, 아웃복서 반대).

저장 타입(`SaveDataV6`), 검증 규칙, 복원·오프라인 정산은 [저장 모델](./save-model.md)로 분리한다.

## 파생 데이터

- 전투 능력치, 강화 비용, 스테이지 정의, 처치 골드와 보스 남은 시간은 저장하지 않는다.
- 테마는 장 번호, 몬스터 수치는 장·스테이지 번호에서 결정한다.
- 최근 타격과 오프라인 보상 요약은 UI 런타임 상태로만 유지한다.

## 수정내용2 확장 (구현 완료, schemaVersion 6)

`수정내용2`(TASK-004~012)의 데이터 모델 확장은 모두 도입 완료이며 TASK-013에서 동결했다.

- `Boxer`: 타입(`INFIGHTER`/`OUT_BOXER`)·성별(`MALE`/`FEMALE`)·9키 강화 레벨·`equippedSkills` 도입 완료. → [복서 타입](../boxer/types.md), [스킬 장착 구조](../skills/equip.md)
- 강화 키 확장: 체력·방어·회피·카운터 신규 강화 도입 완료. → [몬스터 공격](../combat/monster-attacks.md)
- `CombatRuntime`: 복서 현재 HP·몬스터 공격 타이머, 콤보(시퀀스·게이지·단계), 보스 그로기, 스킬 쿨다운/버프/내상 DoT를 비저장 런타임 값으로 추가. → [보스전](../combat/boss.md), [콤비네이션](../combat/combinations.md)

## 관련 문서

- [저장 모델](./save-model.md)
- [게임 시스템](./game-systems.md)
- [능력치와 수식](./stats-and-formulas.md)
- [콘텐츠 데이터](./content-data.md)
