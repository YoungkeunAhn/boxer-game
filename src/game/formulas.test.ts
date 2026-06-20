import { describe, expect, it } from "vitest";
import {
  DODGE_RATE_CAP,
  INFIGHTER_GUARD_COUNTER_RATE,
} from "./constants";
import type { Boxer, CombatStats, UpgradeLevels } from "./types";
import {
  calculateAttackDamage,
  calculateAttackIntervalMs,
  calculateCombatStats,
  calculateCounterDamage,
  calculateDamageReduction,
  calculateExpectedHitDamage,
  calculateGoldReward,
  calculateGuardedDamage,
  calculateIncomingDamage,
  calculateMonsterAttackPower,
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
  maxHp: 0,
  defense: 0,
  dodge: 0,
  counter: 0,
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
    // 기본(인파이터): maxHp 100×1.3=130, defense 0, dodge 0.05×0.6, counter 1×0.5.
    expect(calculateCombatStats(zeroLevels)).toEqual({
      attackPower: 10,
      attackSpeed: 1,
      critRate: 0.05,
      critDamage: 2,
      goldBonus: 0,
      maxHp: 130,
      defense: 0,
      dodge: 0.05 * 0.6,
      counter: 1 * 0.5,
    });
    const capped = calculateCombatStats({
      attackPower: 1,
      attackSpeed: 999,
      critRate: 999,
      critDamage: 999,
      goldBonus: 999,
      maxHp: 0,
      defense: 999,
      dodge: 999,
      counter: 999,
    });
    expect(capped.attackPower).toBe(12);
    expect(capped.attackSpeed).toBe(5);
    expect(capped.critRate).toBe(0.5);
    expect(capped.critDamage).toBe(5);
    expect(capped.goldBonus).toBe(5);
    expect(capped.dodge).toBe(DODGE_RATE_CAP);
    expect(capped.counter).toBe(5);
  });

  it("dodge 강화 곡선은 레벨에 단조 증가하고 CAP에서 멈춘다", () => {
    const dodgeAt = (level: number) =>
      calculateCombatStats({ ...zeroLevels, dodge: level }, "INFIGHTER").dodge;
    expect(dodgeAt(0)).toBeLessThan(dodgeAt(5));
    expect(dodgeAt(5)).toBeLessThan(dodgeAt(20));
    expect(dodgeAt(100_000)).toBe(DODGE_RATE_CAP);
  });

  it("counter 강화 곡선·비용·상한이 규칙과 일치한다", () => {
    const counterAt = (level: number) =>
      calculateCombatStats({ ...zeroLevels, counter: level }, "INFIGHTER").counter;
    expect(counterAt(0)).toBeLessThan(counterAt(10));
    expect(calculateUpgradeCost("counter", 0)).toBe(55);
    expect(calculateUpgradeCost("counter", 1)).toBe(Math.ceil(55 * 1.25));
    expect(calculateUpgradeCost("dodge", 0)).toBe(45);
    expect(calculateUpgradeCost("dodge", 1)).toBe(Math.ceil(45 * 1.25));
    expect(isUpgradeAtMaxLevel("dodge", 55)).toBe(true);
    expect(isUpgradeAtMaxLevel("counter", 50)).toBe(true);
    expect(isUpgradeAtMaxLevel("dodge", 54)).toBe(false);
  });

  it("타입별 evasion/counter 보정으로 아웃복서가 인파이터보다 회피·카운터가 높다", () => {
    const levels = { ...zeroLevels, dodge: 10, counter: 10 };
    const inf = calculateCombatStats(levels, "INFIGHTER");
    const out = calculateCombatStats(levels, "OUT_BOXER");
    expect(out.dodge).toBeGreaterThan(inf.dodge);
    expect(out.counter).toBeGreaterThan(inf.counter);
    const tank = { ...zeroLevels, maxHp: 4, defense: 4 };
    expect(calculateCombatStats(tank, "INFIGHTER").maxHp).toBeGreaterThan(
      calculateCombatStats(tank, "OUT_BOXER").maxHp,
    );
    expect(calculateCombatStats(tank, "INFIGHTER").defense).toBeGreaterThan(
      calculateCombatStats(tank, "OUT_BOXER").defense,
    );
  });

  it("calculateGuardedDamage는 가드+방어 감소를 합산하고 최소 1을 보장한다", () => {
    const inf = calculateGuardedDamage(100, 0, "INFIGHTER");
    expect(inf).toEqual({ damage: 70, guarded: true });
    const out = calculateGuardedDamage(100, 0, "OUT_BOXER");
    expect(out.damage).toBe(77);
    expect(out.guarded).toBe(true);
    expect(inf.damage).toBeLessThan(out.damage);
    expect(calculateGuardedDamage(1, 0, "INFIGHTER").damage).toBe(1);
  });

  it("calculateCounterDamage는 counter 계수·rate에 비례하고 결정적이다", () => {
    const stats: CombatStats = {
      attackPower: 10,
      attackSpeed: 1,
      critRate: 0,
      critDamage: 2,
      goldBonus: 0,
      maxHp: 100,
      defense: 0,
      dodge: 0.1,
      counter: 2,
    };
    expect(calculateExpectedHitDamage(stats)).toBe(10);
    expect(calculateCounterDamage(stats, 0.8)).toBe(16);
    expect(calculateCounterDamage(stats, INFIGHTER_GUARD_COUNTER_RATE)).toBe(6);
  });

  it("방어로 받는 피해를 줄이고 최소 1을 보장한다", () => {
    expect(calculateDamageReduction(0)).toBe(0);
    expect(calculateDamageReduction(100)).toBeCloseTo(0.5);
    expect(calculateIncomingDamage(100, 0)).toBe(100);
    expect(calculateIncomingDamage(100, 100)).toBe(50);
    expect(calculateIncomingDamage(1, 100)).toBe(1);
  });

  it("몬스터 공격력이 장·스테이지 배율로 커진다", () => {
    expect(calculateMonsterAttackPower({ chapter: 1, stage: 1 })).toBe(8);
    expect(calculateMonsterAttackPower({ chapter: 1, stage: 5 })).toBe(12);
    expect(calculateMonsterAttackPower({ chapter: 2, stage: 1 })).toBe(12);
    expect(() => calculateMonsterAttackPower({ chapter: 1, stage: 6 })).toThrow(RangeError);
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
      maxHp: 100,
      defense: 0,
      dodge: 0.05,
      counter: 1,
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
        maxHp: 100,
        defense: 0,
        dodge: 0.05,
        counter: 1,
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
