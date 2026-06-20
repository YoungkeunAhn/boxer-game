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

// v1.3a: 기본 공격 4종과 타격 손.
export type AttackType = "JAB" | "STRAIGHT" | "HOOK" | "UPPER";
export type Hand = "LEFT" | "RIGHT";

// v1.3b: 콤비네이션 식별자. AttackResult에 이번 타격으로 발동한 콤비네이션을 담는다.
export type ComboId = "ONE_TWO" | "ONE_TWO_HOOK" | "FULL_COMBO";

// v1.3b: 콤비네이션 매칭에 쓰는 한 타격의 (공격 종류·손) 단위.
export type AttackBeat = { attackType: AttackType; hand: Hand };

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
  // 공격별 다음 발동 가능 시각 중 가장 이른 값(boxer 공격 이벤트 시각). nextReadyAt에서 파생한다.
  nextAttackAt: number;
  isFarming: boolean;
  // v1.3a 런타임 전용(저장 안 함): 공격별 쿨타임 종료(다음 발동 가능) 시각과 직전 타격 손.
  nextReadyAt: Record<AttackType, number>;
  lastHand: Hand | null;
  // v1.3b 런타임 전용(저장 안 함): 콤보 진행 상태.
  //  - attackHistory: 최근 타격 (공격 종류·손) 시퀀스. 길이 상한은 ATTACK_HISTORY_LIMIT.
  //  - comboGauge: 잽으로 누적되는 게이지(0~COMBO_GAUGE_MAX). 비저장.
  //  - comboStep: 현재 진행한 콤보 단계(0=미진행). gameStore 연출용.
  attackHistory: AttackBeat[];
  comboGauge: number;
  comboStep: number;
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
  // v1.3a: 어떤 공격을 어느 손으로 쳤는지(쿨타임·애니메이션 UI용).
  attackType: AttackType;
  hand: Hand;
  // v1.3b: 이번 타격으로 발동한 콤비네이션(없으면 null).
  combo: ComboId | null;
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
  // v1.3b: 콤보 연출용 상태(비저장, 런타임 전용). lastCombo는 직전 발동 콤비네이션.
  comboGauge: number;
  comboStep: number;
  lastCombo: ComboId | null;
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
