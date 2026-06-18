import { calculateWinChance } from "./formulas";
import type { BattleResult, Boxer, Opponent } from "./types";

export type BattleOutcome = {
  boxer: Boxer;
  result: BattleResult;
};

const NO_REWARD = { money: 0, fame: 0 } as const;

export function fight(
  boxer: Boxer,
  opponent: Opponent,
  randomValue: number,
): BattleOutcome {
  if (randomValue < 0 || randomValue >= 1 || !Number.isFinite(randomValue)) {
    throw new RangeError("randomValue는 0 이상 1 미만이어야 합니다.");
  }

  const winChance = calculateWinChance(boxer.stats, opponent.stats);
  const won = randomValue < winChance;
  const isFirstWin =
    won && !boxer.defeatedOpponentIds.includes(opponent.id);
  const reward = won ? { ...opponent.reward } : { ...NO_REWARD };
  const defeatedOpponentIds = isFirstWin
    ? [...boxer.defeatedOpponentIds, opponent.id]
    : boxer.defeatedOpponentIds;

  return {
    boxer: won
      ? {
          ...boxer,
          money: boxer.money + reward.money,
          fame: boxer.fame + reward.fame,
          defeatedOpponentIds,
        }
      : boxer,
    result: {
      opponentId: opponent.id,
      opponentName: opponent.name,
      won,
      winChance,
      reward,
      isFirstWin,
    },
  };
}

