import { describe, expect, it } from "vitest";
import type { Boxer, CombatStats, UpgradeLevels } from "./types";
import {
  calculateAttackDamage,
  calculateAttackIntervalMs,
  calculateCombatStats,
  calculateExpectedHitDamage,
  calculateGoldReward,
  calculateUpgradeCost,
  isUpgradeAtMaxLevel,
  purchaseUpgrade,
} from "./formulas";

const zeroLevels: UpgradeLevels = {
  attackPower: 0,
  attackSpeed: 0,
  critRate: 0,
  critDamage: 0,
  goldBonus: 0,
};

const boxer: Boxer = {
  id: "player",
  name: "테스트 복서",
  boxerType: "INFIGHTER",
  gender: "MALE",
  gold: 100,
  totalKills: 0,
  upgradeLevels: zeroLevels,
};

describe("자동 전투 수식", () => {
  it("강화 레벨에서 능력치를 계산하고 상한을 적용한다", () => {
    expect(calculateCombatStats(zeroLevels)).toEqual({
      attackPower: 10,
      attackSpeed: 1,
      critRate: 0.05,
      critDamage: 2,
      goldBonus: 0,
    });
    expect(
      calculateCombatStats({
        attackPower: 1,
        attackSpeed: 999,
        critRate: 999,
        critDamage: 999,
        goldBonus: 999,
      }),
    ).toEqual({
      attackPower: 12,
      attackSpeed: 5,
      critRate: 0.5,
      critDamage: 5,
      goldBonus: 5,
    });
  });

  it("공격 속도를 공격 간격으로 변환한다", () => {
    expect(calculateAttackIntervalMs(1)).toBe(1_000);
    expect(calculateAttackIntervalMs(5)).toBe(200);
    expect(() => calculateAttackIntervalMs(0)).toThrow(RangeError);
  });

  it("치명타 경계와 피해 내림을 적용한다", () => {
    const stats: CombatStats = {
      attackPower: 11,
      attackSpeed: 1,
      critRate: 0.05,
      critDamage: 2.5,
      goldBonus: 0,
    };
    expect(calculateAttackDamage(stats, 0.049)).toEqual({
      damage: 27,
      isCritical: true,
    });
    expect(calculateAttackDamage(stats, 0.05)).toEqual({
      damage: 11,
      isCritical: false,
    });
    expect(() => calculateAttackDamage(stats, 1)).toThrow(RangeError);
  });

  it("골드 보상과 기대 타격 피해를 계산한다", () => {
    expect(calculateGoldReward(7, 0.15)).toBe(8);
    expect(
      calculateExpectedHitDamage({
        attackPower: 10,
        attackSpeed: 1,
        critRate: 0.5,
        critDamage: 2,
        goldBonus: 0,
      }),
    ).toBe(15);
  });

  it("강화 비용을 올림하고 구매 시 원본을 변경하지 않는다", () => {
    expect(calculateUpgradeCost("attackPower", 0)).toBe(10);
    expect(calculateUpgradeCost("attackPower", 1)).toBe(13);
    const result = purchaseUpgrade(boxer, "attackPower");
    expect(result).toMatchObject({ purchased: true, cost: 10 });
    expect(result.boxer.gold).toBe(90);
    expect(result.boxer.upgradeLevels.attackPower).toBe(1);
    expect(boxer.gold).toBe(100);
    expect(boxer.upgradeLevels.attackPower).toBe(0);
  });

  it("골드 부족과 최대 레벨에서는 강화하지 않는다", () => {
    const poor = { ...boxer, gold: 0 };
    expect(purchaseUpgrade(poor, "attackPower").boxer).toBe(poor);
    expect(isUpgradeAtMaxLevel("attackSpeed", 40)).toBe(true);
    const maxed = {
      ...boxer,
      upgradeLevels: { ...zeroLevels, attackSpeed: 40 },
    };
    expect(purchaseUpgrade(maxed, "attackSpeed").boxer).toBe(maxed);
  });

  it("상한 없는 공격력도 안전한 정수 경계에서는 기술적으로 강화하지 않는다", () => {
    const boundary = {
      ...boxer,
      gold: Number.MAX_SAFE_INTEGER,
      upgradeLevels: {
        ...zeroLevels,
        attackPower: Number.MAX_SAFE_INTEGER,
      },
    };

    expect(isUpgradeAtMaxLevel("attackPower", Number.MAX_SAFE_INTEGER)).toBe(true);
    const result = purchaseUpgrade(boundary, "attackPower");
    expect(result.purchased).toBe(false);
    expect(result.boxer).toBe(boundary);
    expect(result.boxer.upgradeLevels.attackPower).toBe(Number.MAX_SAFE_INTEGER);
  });
});
