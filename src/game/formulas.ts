import {
  ATTACK_COOLDOWN_MS,
  ATTACK_DAMAGE_COEFFICIENTS,
  ATTACK_TYPES,
  BOXER_TYPE_MODIFIERS,
  FULL_COMBO_UPPER_DAMAGE_MULT,
  LEVEL_UP_DIAMOND_REWARD,
  ONE_TWO_HOOK_CRIT_BONUS,
  ONE_TWO_STRAIGHT_DAMAGE_MULT,
  PLAYER_EXP_BASE,
  PLAYER_EXP_GROWTH,
  COUNTER_BASE_DAMAGE_RATE,
  COUNTER_PER_LEVEL,
  COUNTER_RATE_CAP,
  DEFAULT_BOXER_TYPE,
  DEFENSE_DAMAGE_REDUCTION_CAP,
  DEFENSE_PER_LEVEL,
  DEFENSE_REDUCTION_K,
  DODGE_PER_LEVEL,
  DODGE_RATE_CAP,
  GUARD_DAMAGE_REDUCTION,
  GUARD_DAMAGE_REDUCTION_TOTAL_CAP,
  INITIAL_COMBAT_STATS,
  MAX_HP_PER_LEVEL,
  MAX_SAFE_GAME_INTEGER,
  MONSTER_ATTACK_CHAPTER_MULTIPLIER,
  MONSTER_ATTACK_STAGE_MULTIPLIERS,
  MONSTER_BASE_ATTACK_POWER,
  UPGRADE_BASE_COSTS,
  UPGRADE_MAX_LEVELS,
} from "./constants";
import type {
  AttackType,
  Boxer,
  BoxerType,
  CombatStats,
  ComboId,
  Hand,
  StagePosition,
  UpgradeKey,
  UpgradeLevels,
} from "./types";

function assertLevel(level: number): void {
  if (!Number.isSafeInteger(level) || level < 0) {
    throw new RangeError("강화 레벨은 0 이상의 안전한 정수여야 합니다.");
  }
}

function toSafeInteger(value: number): number {
  return Number.isFinite(value)
    ? Math.min(MAX_SAFE_GAME_INTEGER, Math.max(0, Math.floor(value)))
    : MAX_SAFE_GAME_INTEGER;
}

function safeAdd(left: number, right: number): number {
  return Math.min(MAX_SAFE_GAME_INTEGER, left + right);
}

export function calculateCombatStats(
  levels: UpgradeLevels,
  boxerType: BoxerType = DEFAULT_BOXER_TYPE,
): CombatStats {
  Object.values(levels).forEach(assertLevel);

  const modifiers = BOXER_TYPE_MODIFIERS[boxerType];
  // 확정(BALANCE 8): maxHp/defense = floor((기본 + 레벨×레벨당) × 타입 배율).
  const maxHp = toSafeInteger(
    (INITIAL_COMBAT_STATS.maxHp + levels.maxHp * MAX_HP_PER_LEVEL) *
      modifiers.maxHpMultiplier,
  );
  const defense = toSafeInteger(
    (INITIAL_COMBAT_STATS.defense + levels.defense * DEFENSE_PER_LEVEL) *
      modifiers.defenseMultiplier,
  );
  // 확정(BALANCE 8): dodge = min(CAP, max(0, (기본 + 레벨×레벨당) × 회피 배율)).
  const dodge = Math.min(
    DODGE_RATE_CAP,
    Math.max(
      0,
      (INITIAL_COMBAT_STATS.dodge + levels.dodge * DODGE_PER_LEVEL) *
        modifiers.evasionMultiplier,
    ),
  );
  // 확정(BALANCE 8): counter = min(CAP, max(0, (기본 + 레벨×레벨당) × 카운터 배율)).
  const counter = Math.min(
    COUNTER_RATE_CAP,
    Math.max(
      0,
      (INITIAL_COMBAT_STATS.counter + levels.counter * COUNTER_PER_LEVEL) *
        modifiers.counterMultiplier,
    ),
  );

  return {
    attackPower: toSafeInteger(
      INITIAL_COMBAT_STATS.attackPower * 1.2 ** levels.attackPower,
    ),
    attackSpeed: Math.min(5, 1 + levels.attackSpeed * 0.1),
    critRate: Math.min(0.5, 0.05 + levels.critRate * 0.01),
    critDamage: Math.min(5, 2 + levels.critDamage * 0.1),
    goldBonus: Math.min(5, levels.goldBonus * 0.05),
    maxHp: Math.max(1, maxHp),
    defense,
    dodge,
    counter,
  };
}

// 확정(BALANCE 8): 방어 → 피해감소율. defense/(defense+K)를 0~CAP로 클램프.
export function calculateDamageReduction(defense: number): number {
  if (!Number.isFinite(defense) || defense < 0) {
    throw new RangeError("방어는 0 이상의 유한한 수여야 합니다.");
  }
  const raw = defense / (defense + DEFENSE_REDUCTION_K);
  return Math.min(DEFENSE_DAMAGE_REDUCTION_CAP, Math.max(0, raw));
}

// 확정(BALANCE 8): 받는 피해 = max(1, floor(공격력 × (1 - 피해감소율))).
export function calculateIncomingDamage(
  monsterAttackPower: number,
  defense: number,
): number {
  if (!Number.isFinite(monsterAttackPower) || monsterAttackPower < 0) {
    throw new RangeError("몬스터 공격력은 0 이상의 유한한 수여야 합니다.");
  }
  const reduction = calculateDamageReduction(defense);
  return Math.max(1, toSafeInteger(monsterAttackPower * (1 - reduction)));
}

// v1.2b 확정(BALANCE 8): 가드 적용 피해. 합산 감소율 = min(TOTAL_CAP, 방어감소 + GUARD_DAMAGE_REDUCTION×타입 배율 + 패시브감소).
//   받는 피해 = max(1, floor(공격력 × (1 - 합산 감소율))). guarded = 가드 감소가 0보다 큼(GUARD/HIT 경계).
// v1.3d(TASK-010) 확정: passiveReduction(철벽가드 등)을 합산에 더한 뒤 동일 TOTAL_CAP(0.9)로 클램프한다.
//   캡 적용 순서: (방어 + 가드 + 패시브)를 합산 → TOTAL_CAP로 클램프. 패시브만으로 캡을 넘기면 캡이 우선한다.
export function calculateGuardedDamage(
  monsterAttackPower: number,
  defense: number,
  boxerType: BoxerType = DEFAULT_BOXER_TYPE,
  passiveReduction = 0,
): { damage: number; guarded: boolean } {
  if (!Number.isFinite(monsterAttackPower) || monsterAttackPower < 0) {
    throw new RangeError("몬스터 공격력은 0 이상의 유한한 수여야 합니다.");
  }
  if (!Number.isFinite(passiveReduction) || passiveReduction < 0) {
    throw new RangeError("패시브 피해감소율은 0 이상의 유한한 수여야 합니다.");
  }
  const modifiers = BOXER_TYPE_MODIFIERS[boxerType];
  const defenseReduction = calculateDamageReduction(defense);
  const guardReduction = Math.max(
    0,
    GUARD_DAMAGE_REDUCTION * modifiers.damageReductionMultiplier,
  );
  const totalReduction = Math.min(
    GUARD_DAMAGE_REDUCTION_TOTAL_CAP,
    Math.max(0, defenseReduction + guardReduction + passiveReduction),
  );
  const damage = Math.max(1, toSafeInteger(monsterAttackPower * (1 - totalReduction)));
  // guarded는 가드(타입 가드 감소)가 작동했는지로 본다. 패시브만 있고 가드가 0이면 HIT(연출 일관성).
  return { damage, guarded: guardReduction > 0 };
}

// v1.2b 확정(BALANCE 8): 카운터 데미지 = max(1, floor(기대 타격 피해 × counter 계수 × rate)).
export function calculateCounterDamage(
  stats: CombatStats,
  rate: number = COUNTER_BASE_DAMAGE_RATE,
): number {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new RangeError("카운터 비율은 0 이상의 유한한 수여야 합니다.");
  }
  const expected = calculateExpectedHitDamage(stats);
  return Math.max(1, toSafeInteger(expected * stats.counter * rate));
}

// 확정(BALANCE 8): 스테이지별 몬스터 공격력. 기본 공격력 × 장 배율^(chapter-1) × 스테이지 배율.
export function calculateMonsterAttackPower(position: StagePosition): number {
  if (
    !Number.isSafeInteger(position.chapter) ||
    position.chapter < 1 ||
    !Number.isSafeInteger(position.stage) ||
    position.stage < 1 ||
    position.stage > MONSTER_ATTACK_STAGE_MULTIPLIERS.length
  ) {
    throw new RangeError("유효한 스테이지 위치가 필요합니다.");
  }
  const stageMultiplier = MONSTER_ATTACK_STAGE_MULTIPLIERS[position.stage - 1];
  const value =
    MONSTER_BASE_ATTACK_POWER *
    MONSTER_ATTACK_CHAPTER_MULTIPLIER ** (position.chapter - 1) *
    (stageMultiplier ?? 1);
  return Math.max(1, toSafeInteger(value));
}

export function calculateAttackIntervalMs(attackSpeed: number): number {
  if (!Number.isFinite(attackSpeed) || attackSpeed <= 0) {
    throw new RangeError("공격 속도는 0보다 큰 유한한 수여야 합니다.");
  }
  return 1_000 / attackSpeed;
}

export function calculateUpgradeCost(
  key: UpgradeKey,
  currentLevel: number,
): number {
  assertLevel(currentLevel);
  return Math.min(
    MAX_SAFE_GAME_INTEGER,
    Math.ceil(UPGRADE_BASE_COSTS[key] * 1.25 ** currentLevel),
  );
}

export function isUpgradeAtMaxLevel(
  key: UpgradeKey,
  currentLevel: number,
): boolean {
  assertLevel(currentLevel);
  const maxLevel = UPGRADE_MAX_LEVELS[key];
  return currentLevel >= (maxLevel ?? MAX_SAFE_GAME_INTEGER);
}

export type PurchaseUpgradeResult = {
  boxer: Boxer;
  purchased: boolean;
  cost: number;
};

export function purchaseUpgrade(
  boxer: Boxer,
  key: UpgradeKey,
): PurchaseUpgradeResult {
  const currentLevel = boxer.upgradeLevels[key];
  const cost = calculateUpgradeCost(key, currentLevel);

  if (isUpgradeAtMaxLevel(key, currentLevel) || boxer.gold < cost) {
    return { boxer, purchased: false, cost };
  }

  return {
    boxer: {
      ...boxer,
      gold: boxer.gold - cost,
      upgradeLevels: {
        ...boxer.upgradeLevels,
        [key]: currentLevel + 1,
      },
    },
    purchased: true,
    cost,
  };
}

export function calculateAttackDamage(
  stats: CombatStats,
  randomValue: number,
): { damage: number; isCritical: boolean } {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("randomValue는 0 이상 1 미만이어야 합니다.");
  }

  const isCritical = randomValue < stats.critRate;
  return {
    damage: toSafeInteger(
      stats.attackPower * (isCritical ? stats.critDamage : 1),
    ),
    isCritical,
  };
}

// v1.3a: 콤보 없는 공격별 데미지. calculateComboAdjustedDamage(combo=null)와 동일하므로 그쪽에 위임한다.
export function calculateBasicAttackDamage(
  stats: CombatStats,
  attackType: AttackType,
  randomValue: number,
): { damage: number; isCritical: boolean } {
  return calculateComboAdjustedDamage(stats, attackType, null, randomValue);
}

// v1.3b: 발동한 콤비네이션에 따른 보너스 계수. 콤보가 없으면 중립값(배수 1.0·치명타 가산 0).
//   원투 → 마무리 스트레이트 데미지 ×ONE_TWO_STRAIGHT_DAMAGE_MULT.
//   원투 훅 → 마무리 훅 치명타 확률 +ONE_TWO_HOOK_CRIT_BONUS(가산).
//   풀 콤비네이션 → 마무리 어퍼 데미지 ×FULL_COMBO_UPPER_DAMAGE_MULT.
// 보너스는 콤보를 마무리한 그 타격(스트레이트/훅/어퍼)에만 적용된다(combat.ts가 매칭 결과를 넘긴다).
export function comboBonus(combo: ComboId | null): {
  damageMultiplier: number;
  critBonus: number;
} {
  switch (combo) {
    case "ONE_TWO":
      return { damageMultiplier: ONE_TWO_STRAIGHT_DAMAGE_MULT, critBonus: 0 };
    case "ONE_TWO_HOOK":
      return { damageMultiplier: 1, critBonus: ONE_TWO_HOOK_CRIT_BONUS };
    case "FULL_COMBO":
      return { damageMultiplier: FULL_COMBO_UPPER_DAMAGE_MULT, critBonus: 0 };
    default:
      return { damageMultiplier: 1, critBonus: 0 };
  }
}

// v1.3b: 콤보 보너스를 반영한 공격 데미지/치명타. combo=null이면 calculateBasicAttackDamage와 동일.
//   치명타 판정 = randomValue < (critRate + critBonus)(1.0 클램프). 데미지 = 기본계수 × 콤보배수 × (치명타?critDamage:1).
export function calculateComboAdjustedDamage(
  stats: CombatStats,
  attackType: AttackType,
  combo: ComboId | null,
  randomValue: number,
): { damage: number; isCritical: boolean } {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("randomValue는 0 이상 1 미만이어야 합니다.");
  }
  const { damageMultiplier, critBonus } = comboBonus(combo);
  const critRate = Math.min(1, stats.critRate + critBonus);
  const isCritical = randomValue < critRate;
  const coefficient = ATTACK_DAMAGE_COEFFICIENTS[attackType];
  return {
    damage: toSafeInteger(
      stats.attackPower *
        coefficient *
        damageMultiplier *
        (isCritical ? stats.critDamage : 1),
    ),
    isCritical,
  };
}

// v1.3a: 공격 4종의 평균 초당 피해. 실효 쿨타임 = 기본 쿨타임 / attackSpeed 이므로
// 초당 발동 횟수 = attackSpeed / 기본쿨타임초. 오프라인 정산을 4종 평균 효율로 일반화하는 데 쓴다.
// 계수 가중합을 1.0으로 맞춰 두었으므로 기존 단일 공격 정산과 동일한 값을 낸다.
export function calculateAttackDps(stats: CombatStats): number {
  const expectedHit = calculateExpectedHitDamage(stats);
  let weightPerSecond = 0;
  for (const type of ATTACK_TYPES) {
    weightPerSecond +=
      ATTACK_DAMAGE_COEFFICIENTS[type] / (ATTACK_COOLDOWN_MS[type] / 1_000);
  }
  return expectedHit * stats.attackSpeed * weightPerSecond;
}

// v1.3a: 애니메이션 키 매핑 규약(예: boxer_left_jab, boxer_right_upper). TASK-012에서 실제 적용.
export function attackAnimationKey(attackType: AttackType, hand: Hand): string {
  return `boxer_${hand.toLowerCase()}_${attackType.toLowerCase()}`;
}

export function calculateGoldReward(
  baseGold: number,
  goldBonus: number,
): number {
  if (!Number.isFinite(baseGold) || baseGold < 0) {
    throw new RangeError("기본 골드는 0 이상의 유한한 수여야 합니다.");
  }
  if (!Number.isFinite(goldBonus) || goldBonus < 0) {
    throw new RangeError("골드 보너스는 0 이상의 유한한 수여야 합니다.");
  }
  return toSafeInteger(baseGold * (1 + goldBonus));
}

export function calculateExpectedHitDamage(stats: CombatStats): number {
  return (
    stats.attackPower *
    (1 + stats.critRate * (stats.critDamage - 1))
  );
}

export function addProgressToBoxer(
  boxer: Boxer,
  kills: number,
  gold: number,
): Boxer {
  return {
    ...boxer,
    totalKills: safeAdd(boxer.totalKills, kills),
    gold: safeAdd(boxer.gold, gold),
  };
}

// TASK-019(P3): 플레이어 경험치 곡선(가정값). expToNext(level) = floor(BASE × GROWTH^level), 세이프정수 클램프.
//   기존 강화 비용 곡선(1.25^level)과 톤을 맞춘다. level은 0 이상의 안전한 정수.
export function expToNext(level: number): number {
  assertLevel(level);
  return toSafeInteger(PLAYER_EXP_BASE * PLAYER_EXP_GROWTH ** level);
}

// TASK-019(P3): 다이아 가산(획득). 음수 거부, 새 Boxer 반환, MAX_SAFE_GAME_INTEGER 클램프.
export function addDiamondToBoxer(boxer: Boxer, amount: number): Boxer {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("다이아 획득량은 0 이상의 유한한 수여야 합니다.");
  }
  return {
    ...boxer,
    diamond: safeAdd(boxer.diamond, Math.floor(amount)),
  };
}

// TASK-019(P3): 경험치 가산 후 레벨업 정산(순수). 임계(expToNext) 초과 시 다중 레벨업을 루프로 처리하고
//   잉여 경험치는 다음 레벨로 이월, 레벨업 1회당 LEVEL_UP_DIAMOND_REWARD 다이아를 가산한다.
//   새 Boxer 반환·변이 없음·MAX_SAFE_GAME_INTEGER 클램프. 음수 경험치는 거부한다.
//   가정/TODO: 획득원·곡선·레벨업 보상은 전부 임시값(constants.ts)이며 밸런스 확정 시 갱신.
export function addExpToBoxer(boxer: Boxer, exp: number): Boxer {
  if (!Number.isFinite(exp) || exp < 0) {
    throw new RangeError("경험치 획득량은 0 이상의 유한한 수여야 합니다.");
  }
  let playerLevel = boxer.playerLevel;
  let playerExp = safeAdd(boxer.playerExp, Math.floor(exp));
  let diamond = boxer.diamond;

  // 레벨업 루프. 임계가 0이면(이론상) 무한 루프를 막기 위해 threshold>0 조건을 둔다.
  while (playerLevel < MAX_SAFE_GAME_INTEGER) {
    const threshold = expToNext(playerLevel);
    if (threshold <= 0 || playerExp < threshold) break;
    playerExp -= threshold;
    playerLevel += 1;
    diamond = safeAdd(diamond, LEVEL_UP_DIAMOND_REWARD);
  }

  return { ...boxer, playerLevel, playerExp, diamond };
}
