import { describe, expect, it } from "vitest";
import { STAGES_BALANCE_VERSION } from "../data/stages";
import {
  ATTACK_HISTORY_LIMIT,
  BALANCE_VERSION,
  BOSS_TIME_LIMIT_MS,
  BOXER_TYPE_MODIFIERS,
  COMBINATIONS,
  COMBO_GAUGE_MAX,
  COMBO_GAUGE_PER_JAB,
  INITIAL_COMBAT_STATS,
  INITIAL_UPGRADE_LEVELS,
  OFFLINE_MAX_DURATION_MS,
  SCHEMA_VERSION,
  UPGRADE_BASE_COSTS,
  UPGRADE_MAX_LEVELS,
} from "./constants";

describe("게임 기준 상수", () => {
  it("자동 전투 초기값과 데이터 버전을 고정한다", () => {
    expect(INITIAL_COMBAT_STATS).toEqual({
      attackPower: 10,
      attackSpeed: 1,
      critRate: 0.05,
      critDamage: 2,
      goldBonus: 0,
      maxHp: 100,
      defense: 0,
      dodge: 0.05,
      counter: 1.0,
    });
    expect(INITIAL_UPGRADE_LEVELS).toEqual({
      attackPower: 0,
      attackSpeed: 0,
      critRate: 0,
      critDamage: 0,
      goldBonus: 0,
      maxHp: 0,
      defense: 0,
      dodge: 0,
      counter: 0,
    });
    expect(SCHEMA_VERSION).toBe(5);
    expect(BALANCE_VERSION).toBe(6);
    expect(STAGES_BALANCE_VERSION).toBe(BALANCE_VERSION);
  });

  it("콤비네이션 손 시퀀스가 문서(combinations.md)와 일치한다", () => {
    const byId = Object.fromEntries(COMBINATIONS.map((c) => [c.id, c.sequence]));
    // 원투: left_jab → right_straight.
    expect(byId.ONE_TWO).toEqual([
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
    ]);
    // 원투 훅: + left_hook.
    expect(byId.ONE_TWO_HOOK).toEqual([
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
      { attackType: "HOOK", hand: "LEFT" },
    ]);
    // 풀 콤비네이션: + right_upper.
    expect(byId.FULL_COMBO).toEqual([
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
      { attackType: "HOOK", hand: "LEFT" },
      { attackType: "UPPER", hand: "RIGHT" },
    ]);
    // 가장 긴 콤보를 담을 수 있는 history 상한·게이지 상수.
    expect(ATTACK_HISTORY_LIMIT).toBe(4);
    expect(COMBO_GAUGE_PER_JAB).toBe(10);
    expect(COMBO_GAUGE_MAX).toBe(100);
  });

  it("타입 보정은 더 이상 중립이 아니라 타입별 경향을 반영한다", () => {
    const inf = BOXER_TYPE_MODIFIERS.INFIGHTER;
    const out = BOXER_TYPE_MODIFIERS.OUT_BOXER;
    // 인파이터: 체력·방어·가드 피해감소 높음, 회피·카운터 낮음.
    expect(inf.maxHpMultiplier).toBeGreaterThan(1);
    expect(inf.defenseMultiplier).toBeGreaterThan(1);
    expect(inf.damageReductionMultiplier).toBeGreaterThan(1);
    expect(inf.evasionMultiplier).toBeLessThan(1);
    expect(inf.counterMultiplier).toBeLessThan(1);
    // 아웃복서: 회피·카운터 높음, 체력·방어 낮음.
    expect(out.evasionMultiplier).toBeGreaterThan(1);
    expect(out.counterMultiplier).toBeGreaterThan(1);
    expect(out.maxHpMultiplier).toBeLessThan(1);
    expect(out.defenseMultiplier).toBeLessThan(1);
    // 타입 간 비교.
    expect(inf.maxHpMultiplier).toBeGreaterThan(out.maxHpMultiplier);
    expect(out.evasionMultiplier).toBeGreaterThan(inf.evasionMultiplier);
    expect(out.counterMultiplier).toBeGreaterThan(inf.counterMultiplier);
    expect(inf.damageReductionMultiplier).toBeGreaterThan(out.damageReductionMultiplier);
  });

  it("강화 비용, 상한, 보스와 오프라인 제한을 고정한다", () => {
    expect(UPGRADE_BASE_COSTS).toEqual({
      attackPower: 10,
      attackSpeed: 25,
      critRate: 40,
      critDamage: 50,
      goldBonus: 30,
      maxHp: 20,
      defense: 35,
      dodge: 45,
      counter: 55,
    });
    expect(UPGRADE_MAX_LEVELS).toEqual({
      attackPower: null,
      attackSpeed: 40,
      critRate: 45,
      critDamage: 30,
      goldBonus: 100,
      maxHp: null,
      defense: 60,
      dodge: 55,
      counter: 50,
    });
    expect(BOSS_TIME_LIMIT_MS).toBe(30_000);
    expect(OFFLINE_MAX_DURATION_MS).toBe(28_800_000);
  });
});
