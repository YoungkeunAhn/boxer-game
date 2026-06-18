import { describe, expect, it } from "vitest";
import { calculateCombatPower, calculateLevel, calculateWinChance } from "./formulas";

describe("전투 수식", () => {
  it("능력치 가중치로 전투력을 계산한다", () => {
    expect(
      calculateCombatPower({ health: 10, attack: 20, defense: 30, speed: 40 }),
    ).toBe(21);
  });

  it("같은 전투력의 승률은 50%다", () => {
    const stats = { health: 10, attack: 10, defense: 10, speed: 10 };
    expect(calculateWinChance(stats, stats)).toBe(0.5);
  });

  it("승률을 5%에서 95% 사이로 제한한다", () => {
    const weak = { health: 0, attack: 0, defense: 0, speed: 0 };
    const strong = { health: 100, attack: 100, defense: 100, speed: 100 };
    expect(calculateWinChance(weak, strong)).toBe(0.05);
    expect(calculateWinChance(strong, weak)).toBe(0.95);
  });

  it("누적 성장치에 따라 레벨을 계산한다", () => {
    expect(calculateLevel({ health: 10, attack: 20, defense: 10, speed: 10 })).toBe(2);
  });
});

