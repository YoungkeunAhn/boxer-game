import { describe, expect, it } from "vitest";
import {
  DODGE_RATE_CAP,
  FULL_COMBO_UPPER_DAMAGE_MULT,
  INFIGHTER_GUARD_COUNTER_RATE,
  LEVEL_UP_DIAMOND_REWARD,
  MAX_SAFE_GAME_INTEGER,
  ONE_TWO_HOOK_CRIT_BONUS,
  ONE_TWO_STRAIGHT_DAMAGE_MULT,
  PLAYER_EXP_BASE,
  PLAYER_EXP_GROWTH,
} from "./constants";
import type { Boxer, CombatStats, UpgradeLevels } from "./types";
import {
  addDiamondToBoxer,
  addExpToBoxer,
  attackAnimationKey,
  calculateAttackDamage,
  calculateAttackDps,
  calculateAttackIntervalMs,
  calculateBasicAttackDamage,
  calculateCombatStats,
  calculateComboAdjustedDamage,
  comboBonus,
  calculateCounterDamage,
  calculateDamageReduction,
  calculateExpectedHitDamage,
  calculateGoldReward,
  calculateGuardedDamage,
  calculateIncomingDamage,
  calculateMonsterAttackPower,
  calculateUpgradeCost,
  expToNext,
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
  diamond: 0,
  playerLevel: 1,
  playerExp: 0,
  equippedSkills: { active: [], passive: null },
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

  it("TASK-013 밸런스: 아웃복서 글래스캐논 공격 배율(×2.0)로 인파이터의 2배 공격력", () => {
    // attackPower 레벨 0: 인파 10(×1.0), 아웃 20(×2.0) — 반올림 없이 정확히 2배.
    const inf = calculateCombatStats(zeroLevels, "INFIGHTER");
    const out = calculateCombatStats(zeroLevels, "OUT_BOXER");
    expect(inf.attackPower).toBe(10);
    expect(out.attackPower).toBe(20);
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

  it("공격별 데미지 계수(잽<스트레이트<훅<어퍼)를 곱하고 치명타를 재사용한다", () => {
    const stats = calculateCombatStats(zeroLevels); // 공격력 10, 치명타율 0.05, 치명타 2배.
    // 비치명타(random ≥ 0.05): floor(10 × 계수).
    expect(calculateBasicAttackDamage(stats, "JAB", 0.5).damage).toBe(3);
    expect(calculateBasicAttackDamage(stats, "STRAIGHT", 0.5).damage).toBe(15);
    expect(calculateBasicAttackDamage(stats, "HOOK", 0.5).damage).toBe(20);
    expect(calculateBasicAttackDamage(stats, "UPPER", 0.5).damage).toBe(30);
    // 치명타(random < 0.05): 계수 × 치명타 배수.
    expect(calculateBasicAttackDamage(stats, "UPPER", 0.0)).toEqual({
      damage: 60,
      isCritical: true,
    });
    expect(() => calculateBasicAttackDamage(stats, "JAB", 1)).toThrow(RangeError);
  });

  it("comboBonus가 콤비네이션별 가정 상수와 정확히 일치하는 배수·치명타 가산을 낸다", () => {
    expect(comboBonus(null)).toEqual({ damageMultiplier: 1, critBonus: 0 });
    expect(comboBonus("ONE_TWO")).toEqual({
      damageMultiplier: ONE_TWO_STRAIGHT_DAMAGE_MULT,
      critBonus: 0,
    });
    expect(comboBonus("ONE_TWO_HOOK")).toEqual({
      damageMultiplier: 1,
      critBonus: ONE_TWO_HOOK_CRIT_BONUS,
    });
    expect(comboBonus("FULL_COMBO")).toEqual({
      damageMultiplier: FULL_COMBO_UPPER_DAMAGE_MULT,
      critBonus: 0,
    });
  });

  it("calculateComboAdjustedDamage가 콤보 데미지 배수와 치명타 가산을 반영한다", () => {
    const stats = calculateCombatStats(zeroLevels); // 공격력 10, 치명타율 0.05, 치명타 2배.
    // combo=null이면 calculateBasicAttackDamage와 동일.
    expect(calculateComboAdjustedDamage(stats, "STRAIGHT", null, 0.5)).toEqual(
      calculateBasicAttackDamage(stats, "STRAIGHT", 0.5),
    );
    // 원투: 스트레이트 15 × 1.3 = 19.5 → floor 19(비치명타).
    expect(calculateComboAdjustedDamage(stats, "STRAIGHT", "ONE_TWO", 0.5).damage).toBe(19);
    // 풀콤보: 어퍼 30 × 1.5 = 45(비치명타).
    expect(calculateComboAdjustedDamage(stats, "UPPER", "FULL_COMBO", 0.5).damage).toBe(45);
    // 원투훅: 치명타율 0.05 + 0.2 = 0.25. random=0.1 → 치명타 발동(보너스 없으면 미발동).
    const hook = calculateComboAdjustedDamage(stats, "HOOK", "ONE_TWO_HOOK", 0.1);
    expect(hook.isCritical).toBe(true);
    expect(hook.damage).toBe(40); // 훅 20 × 치명타 2.
    // 같은 random이라도 콤보 없으면 비치명타(0.1 ≥ 0.05).
    expect(calculateComboAdjustedDamage(stats, "HOOK", null, 0.1).isCritical).toBe(false);
    expect(() => calculateComboAdjustedDamage(stats, "JAB", "ONE_TWO", 1)).toThrow(RangeError);
  });

  it("평균 DPS는 계수 가중합 1.0으로 기존 단일 공격(공격력×attackSpeed×기대배수)과 동일하다", () => {
    const stats = calculateCombatStats(zeroLevels);
    // expectedHit 10.5 × attackSpeed 1 × Σ(계수/쿨타임초)=1.0 = 10.5.
    expect(calculateAttackDps(stats)).toBeCloseTo(calculateExpectedHitDamage(stats) * stats.attackSpeed, 6);
    expect(calculateAttackDps(stats)).toBeCloseTo(10.5, 6);
  });

  it("애니메이션 키 매핑 규약을 노출한다", () => {
    expect(attackAnimationKey("JAB", "LEFT")).toBe("boxer_left_jab");
    expect(attackAnimationKey("STRAIGHT", "RIGHT")).toBe("boxer_right_straight");
    expect(attackAnimationKey("HOOK", "LEFT")).toBe("boxer_left_hook");
    expect(attackAnimationKey("UPPER", "RIGHT")).toBe("boxer_right_upper");
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

describe("TASK-019 플레이어 경험치·재화 파생", () => {
  it("expToNext(level) = floor(BASE × GROWTH^level)이고 단조 증가한다", () => {
    expect(expToNext(0)).toBe(Math.floor(PLAYER_EXP_BASE));
    expect(expToNext(1)).toBe(Math.floor(PLAYER_EXP_BASE * PLAYER_EXP_GROWTH));
    expect(expToNext(5)).toBe(Math.floor(PLAYER_EXP_BASE * PLAYER_EXP_GROWTH ** 5));
    // 단조 증가(GROWTH>1).
    let prev = -1;
    for (let level = 0; level <= 20; level += 1) {
      const value = expToNext(level);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });

  it("큰 level에서 expToNext가 MAX_SAFE_GAME_INTEGER로 클램프된다", () => {
    expect(expToNext(10_000)).toBe(MAX_SAFE_GAME_INTEGER);
    expect(expToNext(10_000)).toBeLessThanOrEqual(MAX_SAFE_GAME_INTEGER);
  });

  it("음수·비유한 level은 거부한다", () => {
    expect(() => expToNext(-1)).toThrow(RangeError);
    expect(() => expToNext(1.5)).toThrow(RangeError);
    expect(() => expToNext(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("addDiamondToBoxer가 다이아를 가산하고 음수는 거부, 상한 클램프된다", () => {
    expect(addDiamondToBoxer(boxer, 100).diamond).toBe(100);
    expect(addDiamondToBoxer({ ...boxer, diamond: 5 }, 7).diamond).toBe(12);
    expect(() => addDiamondToBoxer(boxer, -1)).toThrow(RangeError);
    expect(() => addDiamondToBoxer(boxer, Number.NaN)).toThrow(RangeError);
    expect(addDiamondToBoxer({ ...boxer, diamond: MAX_SAFE_GAME_INTEGER }, 10).diamond).toBe(
      MAX_SAFE_GAME_INTEGER,
    );
  });

  it("임계 미만이면 레벨업 없이 경험치만 누적한다", () => {
    const result = addExpToBoxer(boxer, 10);
    expect(result.playerLevel).toBe(1);
    expect(result.playerExp).toBe(10);
    expect(result.diamond).toBe(0);
  });

  it("임계 초과 시 레벨업하고 잉여 경험치를 이월하며 다이아 보상을 가산한다", () => {
    const threshold = expToNext(1); // Lv1 → Lv2 임계.
    const result = addExpToBoxer(boxer, threshold + 3);
    expect(result.playerLevel).toBe(2);
    expect(result.playerExp).toBe(3);
    expect(result.diamond).toBe(LEVEL_UP_DIAMOND_REWARD);
  });

  it("한 번에 여러 레벨업을 처리한다(다중 레벨업·다이아 누적)", () => {
    // Lv1~Lv3 임계 합을 한 번에 부여 → 2회 레벨업(Lv1→2→3).
    const total = expToNext(1) + expToNext(2) + 4;
    const result = addExpToBoxer(boxer, total);
    expect(result.playerLevel).toBe(3);
    expect(result.playerExp).toBe(4);
    expect(result.diamond).toBe(LEVEL_UP_DIAMOND_REWARD * 2);
  });

  it("음수·비유한 경험치는 거부하고 0은 무변화다", () => {
    expect(() => addExpToBoxer(boxer, -1)).toThrow(RangeError);
    expect(() => addExpToBoxer(boxer, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    const same = addExpToBoxer({ ...boxer, playerExp: 7 }, 0);
    expect(same.playerExp).toBe(7);
    expect(same.playerLevel).toBe(1);
  });
});
