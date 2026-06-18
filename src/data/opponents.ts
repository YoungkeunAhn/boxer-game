import type { Opponent } from "../game/types";

export const OPPONENTS: readonly Opponent[] = [
  {
    id: "street_thug",
    name: "동네 도전자",
    description: "첫 승을 노리는 풋내기 복서입니다.",
    stats: { health: 12, attack: 12, defense: 12, speed: 12 },
    reward: { money: 50, fame: 5 },
  },
];

export function findOpponent(id: string): Opponent | undefined {
  return OPPONENTS.find((opponent) => opponent.id === id);
}

