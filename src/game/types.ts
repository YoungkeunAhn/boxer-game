export type CombatStats = {
  attackPower: number;
  attackSpeed: number;
  critRate: number;
  critDamage: number;
  goldBonus: number;
};

export type UpgradeLevels = {
  attackPower: number;
  attackSpeed: number;
  critRate: number;
  critDamage: number;
  goldBonus: number;
};

export type UpgradeKey = keyof UpgradeLevels;

// 전투 스타일 타입. 전투 성능 차이는 전적으로 타입이 결정한다(docs/기획/boxer/types.md).
export type BoxerType = "INFIGHTER" | "OUT_BOXER";

// 성별은 외형·모션 식별자 전용이며 전투 성능에는 영향을 주지 않는다(docs/기획/boxer/gender.md).
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
};

export type AttackResult = {
  stageId: string;
  damage: number;
  isCritical: boolean;
  killed: boolean;
  goldReward: number;
};

export type CombatStepResult = {
  boxer: Boxer;
  combat: CombatRuntime;
  attack: AttackResult | null;
  bossTimedOut: boolean;
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
};

export type SaveDataV2 = {
  schemaVersion: number;
  balanceVersion: number;
  savedAt: string;
  boxer: Boxer;
  position: StagePosition;
  isFarming: boolean;
};

// v3: 복서에 타입·성별이 추가됨(schemaVersion 3). 형식은 v2와 동일하되 boxer가 확장된다.
export type SaveDataV3 = SaveDataV2;

export type SaveData = SaveDataV3;
