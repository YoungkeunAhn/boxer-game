export type CombatStats = {
  attackPower: number;
  attackSpeed: number;
  critRate: number;
  critDamage: number;
  goldBonus: number;
  // v1.2a: 복서 HP·방어.
  maxHp: number;
  defense: number;
  // v1.2b: 회피율(0~1)·카운터 성능 계수.
  dodge: number;
  counter: number;
};

export type UpgradeLevels = {
  attackPower: number;
  attackSpeed: number;
  critRate: number;
  critDamage: number;
  goldBonus: number;
  // v1.2a: 체력·방어 강화.
  maxHp: number;
  defense: number;
  // v1.2b: 회피·카운터 강화.
  dodge: number;
  counter: number;
};

export type UpgradeKey = keyof UpgradeLevels;

export type BoxerType = "INFIGHTER" | "OUT_BOXER";

export type Gender = "MALE" | "FEMALE";

export type Boxer = {
  id: string;
  name: string;
  boxerType: BoxerType;
  gender: Gender;
  gold: number;
  totalKills: number;
  upgradeLevels: UpgradeLevels;
};

export type StagePosition = {
  chapter: number;
  stage: number;
};

export type StageDefinition = StagePosition & {
  id: string;
  themeId: string;
  chapterName: string;
  monsterName: string;
  isBoss: boolean;
  maxHp: number;
  goldReward: number;
  bossTimeLimitMs: number | null;
};

export type CombatRuntime = {
  position: StagePosition;
  monsterHp: number;
  bossDeadlineAt: number | null;
  nextAttackAt: number;
  isFarming: boolean;
  // v1.2a 런타임 전용(저장 안 함).
  boxerHp: number;
  boxerMaxHp: number;
  nextMonsterAttackAt: number;
  monsterAttackPrep: { dueAt: number } | null;
};

export type AttackResult = {
  stageId: string;
  damage: number;
  isCritical: boolean;
  killed: boolean;
  goldReward: number;
};

// v1.2b: 몬스터 공격 한 번에 대한 복서 방어 결과 분류.
export type DefenseOutcome = "HIT" | "GUARD" | "MISS" | "COUNTER";

// v1.2a/v1.2b: 몬스터 공격 한 번의 결과.
export type MonsterAttackResult = {
  outcome: DefenseOutcome;
  damage: number;
  counterDamage: number;
};

export type CombatStepResult = {
  boxer: Boxer;
  combat: CombatRuntime;
  attack: AttackResult | null;
  bossTimedOut: boolean;
  monsterAttack: MonsterAttackResult | null;
  knockedDown: boolean;
};

export type OfflineProgress = {
  boxer: Boxer;
  position: StagePosition;
  elapsedMs: number;
  kills: number;
  gold: number;
};

export type GameState = {
  boxer: Boxer | null;
  combat: CombatRuntime | null;
  lastAttack: AttackResult | null;
  offlineSummary: OfflineProgress | null;
  message: string | null;
  storageWarning: string | null;
  isRunning: boolean;
  bossRemainingMs: number;
  legacySaveDetected: boolean;
  // v1.2b: 최근 몬스터 공격에 대한 방어 결과(UI 연출용).
  recentDefense: MonsterAttackResult | null;
};

export type SaveDataV2 = {
  schemaVersion: number;
  balanceVersion: number;
  savedAt: string;
  boxer: Boxer;
  position: StagePosition;
  isFarming: boolean;
};

export type SaveDataV3 = SaveDataV2;
export type SaveDataV4 = SaveDataV3;
export type SaveDataV5 = SaveDataV4;
export type SaveData = SaveDataV5;
