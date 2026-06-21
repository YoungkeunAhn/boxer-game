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

// TASK-015: 전투 컨트롤 모드(휘발 UI 상태, 저장 안 함).
//  - AUTO: 현행 자동 전투 타이머.
//  - MANUAL: 자동 틱 정지 + 입력 액션(수동 탭/수동 스킬)으로만 진행.
export type AutoMode = "AUTO" | "MANUAL";
// TASK-015: 전투 배속(게임 시간 가속 배율). 현재 x1/x2만(가정, 확장은 추후).
export type SpeedMultiplier = 1 | 2;

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
  // TASK-019(P3): 재화·플레이어 진행 필드. 저장 대상(v5→v6 SCHEMA 범프).
  //  - diamond: 무과금 획득 프리미엄 재화(💎). 정수·음수불가·MAX_SAFE_GAME_INTEGER 클램프.
  //    획득원은 퀘스트·업적·레벨업 보상(TASK-021/상점 골격), 사용처(sink)는 상점·타입전환 비용으로 후속 연결(TODO).
  //  - playerLevel: 전투 강화 레벨과 별개인 플레이어 레벨(Lv). 최소 1.
  //  - playerExp: 현재 레벨 내 누적 경험치(다음 레벨까지의 잔여 경험치). expToNext(level)은 저장하지 않고 순수 파생.
  diamond: number;
  playerLevel: number;
  playerExp: number;
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
  // TASK-015: 전투 컨트롤 상태(비저장, 런타임 전용 UI 상태).
  //  - autoMode: AUTO=자동 타이머, MANUAL=수동 입력.
  //  - speedMultiplier: 게임 시간 배속(x1/x2). 보스 타임아웃은 게임 시간 기준이라 밸런스 불변.
  autoMode: AutoMode;
  speedMultiplier: SpeedMultiplier;
  // TASK-021(P3): 퀘스트 진행 상태(저장 대상). boxer가 없으면 빈 초기 상태로 둔다.
  questState: QuestState;
};

// === TASK-021(P3) 퀘스트 시스템 — 추적 가능한 목표만, 보상은 골드·다이아 ===
//   카테고리: 일일/주간/도전/업적. 일일·주간은 리셋, 도전·업적은 영구(비리셋).
export type QuestCategory = "daily" | "weekly" | "challenge" | "achievement";

// 추적 가능한 목표 타입만 채택한다. 보류 시스템 의존 목표(enhanceEquip/enhanceTraining)는 제외.
//   - stageClear: 일반 스테이지 전진 횟수.
//   - bossClear: 보스 클리어(다음 챕터 진입) 횟수.
//   - killMonster: 몬스터 처치 누적(boxer.totalKills의 일일 시작 스냅샷 기준 증분).
//   - upgradeStat: 강화(purchaseUpgrade 성공) 횟수(9종 합산).
//   - autoBattleMinutes: 자동 전투 누적 분(주입 now 기준 온라인 경과만 — 가정).
//   - claimFreeChest: 무료 상자 수령 횟수(상점 골격 — TASK-023 연결 TODO).
//   - playerLevelUp: 플레이어 레벨업 횟수.
export type QuestGoalType =
  | "stageClear"
  | "bossClear"
  | "killMonster"
  | "upgradeStat"
  | "autoBattleMinutes"
  | "claimFreeChest"
  | "playerLevelUp";

// 보상은 골드·다이아만(아이템·에너지 제외).
export type QuestReward = { gold?: number; diamond?: number };

// 퀘스트 정의(정적 카탈로그 — 저장하지 않는다).
export type QuestDef = {
  id: string;
  category: QuestCategory;
  goalType: QuestGoalType;
  target: number; // 3회·30마리·20분 등.
  reward: QuestReward;
  points: number; // 일일 진행도 마일스톤 기여 점수.
  title: string;
  description: string;
};

// 진행 추적에 쓰는 이벤트(스토어가 순수 함수로 전달).
export type QuestEventType =
  | "stageClear"
  | "bossClear"
  | "upgradeStat"
  | "claimFreeChest"
  | "playerLevelUp";

// 일일 시작 스냅샷이 필요한 비리셋 누적값의 키(현재는 처치 수만).
export type QuestSnapshotKey = "killMonster" | "autoBattleMinutes";

// 퀘스트 진행 상태(저장 대상 — SaveData의 top-level 필드). 정의(QuestDef)와 분리한다.
export type QuestState = {
  // questId → 현재 진행값.
  progress: Record<string, number>;
  // questId → 보상 수령 여부(중복 수령 방지).
  claimed: Record<string, boolean>;
  // 일일 진행도 누적 점수(예 45/100).
  dailyPoints: number;
  // 수령한 마일스톤 구간(예 [20, 40]).
  milestonesClaimed: number[];
  // 일일 시작 시 비리셋 누적값 스냅샷(killMonster 등). 증분 계산 기준.
  dailySnapshot: Record<QuestSnapshotKey, number>;
  // 다음 리셋 epoch ms(주입 now 기준 순수 파생).
  resetAt: { daily: number; weekly: number };
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
// TASK-019(P3): diamond/playerLevel/playerExp가 Boxer에 추가돼 SaveDataV2 파이프라인(boxer 통째 직렬화)을
//   그대로 타고 저장된다. SaveData 형태 자체는 동일하나 boxer 내부 필드가 늘어 SCHEMA 5→6 범프.
export type SaveDataV6 = SaveDataV5;
// TASK-021(P3): questState가 SaveData의 새 top-level 필드로 추가돼 저장 형태가 바뀐다 → SCHEMA 6→7 범프.
export type SaveDataV7 = SaveDataV6 & {
  questState: QuestState;
};
export type SaveData = SaveDataV7;
