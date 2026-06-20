import {
  ATTACK_COOLDOWN_MS,
  ATTACK_DAMAGE_COEFFICIENTS,
  ATTACK_TYPES,
  BOXER_TYPE_MODIFIERS,
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
  // 가정: maxHp/defense = floor((기본 + 레벨×레벨당) × 타입 배율).
  const maxHp = toSafeInteger(
    (INITIAL_COMBAT_STATS.maxHp + levels.maxHp * MAX_HP_PER_LEVEL) *
      modifiers.maxHpMultiplier,
  );
  const defense = toSafeInteger(
    (INITIAL_COMBAT_STATS.defense + levels.defense * DEFENSE_PER_LEVEL) *
      modifiers.defenseMultiplier,
  );
  // 가정: dodge = min(CAP, max(0, (기본 + 레벨×레벨당) × 회피 배율)).
  const dodge = Math.min(
    DODGE_RATE_CAP,
    Math.max(
      0,
      (INITIAL_COMBAT_STATS.dodge + levels.dodge * DODGE_PER_LEVEL) *
        modifiers.evasionMultiplier,
    ),
  );
  // 가정: counter = min(CAP, max(0, (기본 + 레벨×레벨당) × 카운터 배율)).
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

// 가정: 방어 → 피해감소율. defense/(defense+K)를 0~CAP로 클램프.
export function calculateDamageReduction(defense: number): number {
  if (!Number.isFinite(defense) || defense < 0) {
    throw new RangeError("방어는 0 이상의 유한한 수여야 합니다.");
  }
  const raw = defense / (defense + DEFENSE_REDUCTION_K);
  return Math.min(DEFENSE_DAMAGE_REDUCTION_CAP, Math.max(0, raw));
}

// 가정: 받는 피해 = max(1, floor(공격력 × (1 - 피해감소율))).
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

// v1.2b 가정: 가드 적용 피해. 합산 감소율 = min(TOTAL_CAP, 방어감소 + GUARD_DAMAGE_REDUCTION×타입 배율).
//   받는 피해 = max(1, floor(공격력 × (1 - 합산 감소율))). guarded = 가드 감소가 0보다 큼(GUARD/HIT 경계).
export function calculateGuardedDamage(
  monsterAttackPower: number,
  defense: number,
  boxerType: BoxerType = DEFAULT_BOXER_TYPE,
): { damage: number; guarded: boolean } {
  if (!Number.isFinite(monsterAttackPower) || monsterAttackPower < 0) {
    throw new RangeError("몬스터 공격력은 0 이상의 유한한 수여야 합니다.");
  }
  const modifiers = BOXER_TYPE_MODIFIERS[boxerType];
  const defenseReduction = calculateDamageReduction(defense);
  const guardReduction = Math.max(
    0,
    GUARD_DAMAGE_REDUCTION * modifiers.damageReductionMultiplier,
  );
  const totalReduction = Math.min(
    GUARD_DAMAGE_REDUCTION_TOTAL_CAP,
    Math.max(0, defenseReduction + guardReduction),
  );
  const damage = Math.max(1, toSafeInteger(monsterAttackPower * (1 - totalReduction)));
  return { damage, guarded: guardReduction > 0 };
}

// v1.2b 가정: 카운터 데미지 = max(1, floor(기대 타격 피해 × counter 계수 × rate)).
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

// 가정: 스테이지별 몬스터 공격력. 기본 공격력 × 장 배율^(chapter-1) × 스테이지 배율.
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

// v1.3a: 공격별 데미지. 기존 치명타·클램프 로직을 재사용하고 공격 계수를 곱한다.
export function calculateBasicAttackDamage(
  stats: CombatStats,
  attackType: AttackType,
  randomValue: number,
): { damage: number; isCritical: boolean } {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("randomValue는 0 이상 1 미만이어야 합니다.");
  }
  const isCritical = randomValue < stats.critRate;
  const coefficient = ATTACK_DAMAGE_COEFFICIENTS[attackType];
  return {
    damage: toSafeInteger(
      stats.attackPower * coefficient * (isCritical ? stats.critDamage : 1),
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
