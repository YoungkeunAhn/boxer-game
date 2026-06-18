# 데이터 모델

가정: TypeScript 기반 구현이며 콘텐츠 원본은 별도 JSON/정적 데이터로 관리한다.

## 공통 타입

```ts
type Stats = { health: number; attack: number; defense: number; speed: number };
type StatKey = keyof Stats;
type Reward = { money: number; fame: number };
type UnlockCondition = { minFame?: number; defeatedOpponentId?: string };
```

## 핵심 콘텐츠 타입

```ts
type Boxer = {
  id: string; name: string; level: number; baseStats: Stats;
  money: number; fame: number; ownedEquipmentIds: string[];
  equippedBySlot: Partial<Record<Equipment["slot"], string>>;
  activeCoachId?: string; defeatedOpponentIds: string[];
};

type Training = {
  id: string; name: string; statGains: Partial<Stats>;
  cost: { resource: "energy" | "money"; amount: number };
  unlock: UnlockCondition; intervalSeconds?: number;
};

type Opponent = {
  id: string; name: string; stats: Stats; reward: Reward;
  firstWinBonus?: Reward; unlock: UnlockCondition;
};

type Equipment = {
  id: string; name: string;
  slot: "gloves" | "shoes" | "trunks" | "mouthguard" | "wraps" | "bag";
  price: number; statBonus?: Partial<Stats>;
  trainingMultiplier?: { trainingId: string; value: number };
};

type Coach = {
  id: string; name: string; specialty: "attack" | "defense" | "health" | "strategy";
  price: number; trainingMultiplier?: Partial<Record<StatKey, number>>;
  winChanceBonus?: number;
};
```

## 저장 타입

```ts
type AutoTrainingState = {
  unlocked: boolean; trainingId?: string; lastSettledAt: string;
};

type Settings = { sound: boolean; vibration: boolean; locale: "ko-KR" };

type SaveData = {
  schemaVersion: number; balanceVersion: number; savedAt: string;
  boxer: Boxer; energy: { current: number; lastRecoveredAt: string };
  ownedCoachIds: string[]; autoTraining: AutoTrainingState;
  settings: Settings;
};
```

## 저장 및 검증 규칙

- 날짜는 UTC ISO 8601 문자열로 저장한다.
- 저장 시 임시 키에 전체 데이터를 기록하고 검증 후 활성 키로 교체한다.
- 로드 시 `schemaVersion`별 마이그레이션을 순서대로 수행한다.
- 콘텐츠 ID를 찾지 못하면 해당 참조를 제거하고 경고 로그를 남긴다.
- 숫자는 유한값과 최소 범위를 검사하며 잘못된 값에는 기본값을 적용한다.
- 경기 판정과 보상 반영이 끝난 뒤 한 번의 저장 작업으로 커밋한다.
- `TODO: 저장소를 LocalStorage, IndexedDB 또는 네이티브 저장소 중 확정`

## 파생 데이터

- 전투력, 유효 능력치, 승률, 해금 여부는 저장하지 않고 원본 상태에서 계산한다.
- 오프라인 보상은 `lastSettledAt`을 기준으로 한 번 계산한 뒤 즉시 갱신한다.

## 관련 문서

- [게임 시스템](./game-systems.md)
- [능력치와 수식](./stats-and-formulas.md)
- [콘텐츠 데이터](./content-data.md)

