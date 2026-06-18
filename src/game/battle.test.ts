import { describe, expect, it } from "vitest";
import { OPPONENTS } from "../data/opponents";
import type { Boxer } from "./types";
import { fight } from "./battle";

const boxer: Boxer = {
  id: "player",
  name: "테스트 복서",
  level: 1,
  stats: { health: 10, attack: 10, defense: 10, speed: 10 },
  money: 0,
  fame: 0,
  defeatedOpponentIds: [],
};

describe("경기", () => {
  const opponent = OPPONENTS[0];
  if (!opponent) throw new Error("상대 데이터가 없습니다.");

  it("승리하면 보상을 지급하고 상대를 최초 승리 목록에 넣는다", () => {
    const outcome = fight(boxer, opponent, 0);

    expect(outcome.result.won).toBe(true);
    expect(outcome.result.isFirstWin).toBe(true);
    expect(outcome.boxer.money).toBe(50);
    expect(outcome.boxer.fame).toBe(5);
    expect(outcome.boxer.defeatedOpponentIds).toContain(opponent.id);
  });

  it("패배하면 보상과 상태 변경이 없다", () => {
    const outcome = fight(boxer, opponent, 0.99);

    expect(outcome.result.won).toBe(false);
    expect(outcome.result.reward).toEqual({ money: 0, fame: 0 });
    expect(outcome.boxer).toBe(boxer);
  });

  it("범위를 벗어난 난수 입력을 거부한다", () => {
    expect(() => fight(boxer, opponent, 1)).toThrow(RangeError);
  });
});

