import {
  INITIAL_COMBAT_STATS,
  MAX_SAFE_GAME_INTEGER,
  UPGRADE_BASE_COSTS,
  UPGRADE_MAX_LEVELS,
} from "./constants";
import type {
  Boxer,
  CombatStats,
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

export function calculateCombatStats(levels: UpgradeLevels): CombatStats {
  Object.values(levels).forEach(assertLevel);

  return {
    attackPower: toSafeInteger(
      INITIAL_COMBAT_STATS.attackPower * 1.2 ** levels.attackPower,
    ),
    attackSpeed: Math.min(5, 1 + levels.attackSpeed * 0.1),
    critRate: Math.min(0.5, 0.05 + levels.critRate * 0.01),
    critDamage: Math.min(5, 2 + levels.critDamage * 0.1),
    goldBonus: Math.min(5, levels.goldBonus * 0.05),
  };
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
