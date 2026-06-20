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

export type Boxer = {
  id: string;
  name: string;
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

export type SaveData = SaveDataV2;
