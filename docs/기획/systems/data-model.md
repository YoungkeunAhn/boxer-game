# 데이터 모델

가정: TypeScript 기반 구현이며 테마와 스테이지 템플릿은 정적 데이터로 관리한다.

## 공통 타입

```ts
type UpgradeKey =
  | "attackPower"
  | "attackSpeed"
  | "critRate"
  | "critDamage"
  | "goldBonus";

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

type Boxer = {
  id: string;
  name: string;
  boxerType: BoxerType;
  gender: Gender;
  gold: number;
  totalKills: number;
  upgradeLevels: UpgradeLevels;
};

type CombatRuntime = {
  position: StagePosition;
  monsterHp: number;
  bossDeadlineAt: number | null;
  nextAttackAt: number;
  isFarming: boolean;
};
```

- `CombatStats`는 `UpgradeLevels`에서 계산하며 저장하지 않는다.
- `CombatRuntime`은 메모리 상태다. 몬스터 HP와 타이머 시각은 저장하지 않는다.
- `isFarming`이 참이면 같은 장 4스테이지 처치 후 위치를 유지하고 새 몬스터를 만든다.
- `boxerType`/`gender`는 생성 시 한 번 정해지고 변하지 않는다. 타입별 전투 보정 골격은 `constants.ts`의 `BOXER_TYPE_MODIFIERS`에 자리만 잡혀 있고(가정: 모두 1.0 중립), 실제 계수는 HP/회피/카운터 도입 태스크에서 적용한다.

저장 타입(`SaveDataV3`), 검증 규칙, 복원·오프라인 정산은 [저장 모델](./save-model.md)로 분리한다.

## 파생 데이터

- 전투 능력치, 강화 비용, 스테이지 정의, 처치 골드와 보스 남은 시간은 저장하지 않는다.
- 테마는 장 번호, 몬스터 수치는 장·스테이지 번호에서 결정한다.
- 최근 타격과 오프라인 보상 요약은 UI 런타임 상태로만 유지한다.

## 수정내용2 확장 (가정)

진행 상황: 복서 타입(`BoxerType`)·성별(`Gender`)은 도입 완료(`schemaVersion: 3`). 나머지는 후속 태스크에서 추가하며 형식이 미확정이라 확정 시 본 문서·타입·밸런스 버전을 함께 갱신한다.

- `Boxer`: 타입(`INFIGHTER`/`OUT_BOXER`)·성별(`MALE`/`FEMALE`) 도입 완료. 복서 HP·HP 강화 레벨, 장착 스킬 슬롯은 미도입. → [복서 타입](../boxer/types.md), [스킬 장착 구조](../skills/equip.md)
- 강화 키 확장: 체력·방어·회피·카운터 등 신규 강화. → [몬스터 공격](../combat/monster-attacks.md)
- `CombatRuntime`: 복서 현재 HP, 보스 그로기 수치 등 신규 런타임 값(저장 제외). → [보스전](../combat/boss.md)

## 관련 문서

- [저장 모델](./save-model.md)
- [게임 시스템](./game-systems.md)
- [능력치와 수식](./stats-and-formulas.md)
- [콘텐츠 데이터](./content-data.md)
