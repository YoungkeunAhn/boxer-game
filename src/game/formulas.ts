import type { Stats } from "./types";

export const INITIAL_STATS: Readonly<Stats> = {
  health: 10,
  attack: 10,
  defense: 10,
  speed: 10,
};

const MIN_WIN_CHANCE = 0.05;
const MAX_WIN_CHANCE = 0.95;

export function calculateCombatPower(stats: Stats): number {
  return (
    stats.health * 0.3 +
    stats.attack * 0.4 +
    stats.defense * 0.2 +
    stats.speed * 0.1
  );
}

export function calculateWinChance(
  boxerStats: Stats,
  opponentStats: Stats,
): number {
  const boxerPower = calculateCombatPower(boxerStats);
  const opponentPower = calculateCombatPower(opponentStats);
  const totalPower = boxerPower + opponentPower;
  const baseChance = totalPower === 0 ? 0.5 : boxerPower / totalPower;

  return Math.min(MAX_WIN_CHANCE, Math.max(MIN_WIN_CHANCE, baseChance));
}

export function calculateLevel(stats: Stats): number {
  const initialTotal = Object.values(INITIAL_STATS).reduce(
    (sum, value) => sum + value,
    0,
  );
  const currentTotal = Object.values(stats).reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalGrowth = Math.max(0, currentTotal - initialTotal);

  return Math.floor(Math.sqrt(totalGrowth / 10)) + 1;
}

