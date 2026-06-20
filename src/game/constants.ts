import type { CombatStats, UpgradeKey, UpgradeLevels } from "./types";

export const INITIAL_UPGRADE_LEVELS: Readonly<UpgradeLevels> = {
  attackPower: 0,
  attackSpeed: 0,
  critRate: 0,
  critDamage: 0,
  goldBonus: 0,
};

export const INITIAL_COMBAT_STATS: Readonly<CombatStats> = {
  attackPower: 10,
  attackSpeed: 1,
  critRate: 0.05,
  critDamage: 2,
  goldBonus: 0,
};

export const UPGRADE_BASE_COSTS: Readonly<Record<UpgradeKey, number>> = {
  attackPower: 10,
  attackSpeed: 25,
  critRate: 40,
  critDamage: 50,
  goldBonus: 30,
};

export const UPGRADE_MAX_LEVELS: Readonly<Record<UpgradeKey, number | null>> = {
  attackPower: null,
  attackSpeed: 40,
  critRate: 45,
  critDamage: 30,
  goldBonus: 100,
};

export const BOSS_TIME_LIMIT_MS = 30_000;
export const OFFLINE_MAX_DURATION_MS = 8 * 60 * 60 * 1_000;
export const SCHEMA_VERSION = 2;
export const BALANCE_VERSION = 2;
export const MAX_SAFE_GAME_INTEGER = Number.MAX_SAFE_INTEGER;
