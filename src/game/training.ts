import { calculateLevel } from "./formulas";
import type { Boxer, StatKey, Training } from "./types";

export function applyTraining(boxer: Boxer, training: Training): Boxer {
  const nextStats = { ...boxer.stats };

  for (const [stat, gain] of Object.entries(training.statGains)) {
    if (gain !== undefined) {
      const statKey = stat as StatKey;
      nextStats[statKey] += gain;
    }
  }

  return {
    ...boxer,
    stats: nextStats,
    level: calculateLevel(nextStats),
  };
}

