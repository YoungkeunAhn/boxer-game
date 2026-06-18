import { describe, expect, it } from "vitest";
import { TRAININGS } from "../data/trainings";
import type { Boxer } from "./types";
import { applyTraining } from "./training";

const boxer: Boxer = {
  id: "player",
  name: "테스트 복서",
  level: 1,
  stats: { health: 10, attack: 10, defense: 10, speed: 10 },
  money: 0,
  fame: 0,
  defeatedOpponentIds: [],
};

describe("훈련", () => {
  it("샌드백 훈련으로 공격력을 2 올리고 원본은 변경하지 않는다", () => {
    const training = TRAININGS[0];
    if (!training) throw new Error("훈련 데이터가 없습니다.");

    const trained = applyTraining(boxer, training);

    expect(trained.stats.attack).toBe(12);
    expect(boxer.stats.attack).toBe(10);
  });
});

