import { describe, expect, it } from "vitest";
import { STAGES_BALANCE_VERSION } from "../data/stages";
import {
  BALANCE_VERSION,
  BOSS_TIME_LIMIT_MS,
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
    });
    expect(INITIAL_UPGRADE_LEVELS).toEqual({
      attackPower: 0,
      attackSpeed: 0,
      critRate: 0,
      critDamage: 0,
      goldBonus: 0,
    });
    expect(SCHEMA_VERSION).toBe(2);
    expect(BALANCE_VERSION).toBe(2);
    expect(STAGES_BALANCE_VERSION).toBe(BALANCE_VERSION);
  });

  it("강화 비용, 상한, 보스와 오프라인 제한을 고정한다", () => {
    expect(UPGRADE_BASE_COSTS).toEqual({
      attackPower: 10,
      attackSpeed: 25,
      critRate: 40,
      critDamage: 50,
      goldBonus: 30,
    });
    expect(UPGRADE_MAX_LEVELS).toEqual({
      attackPower: null,
      attackSpeed: 40,
      critRate: 45,
      critDamage: 30,
      goldBonus: 100,
    });
    expect(BOSS_TIME_LIMIT_MS).toBe(30_000);
    expect(OFFLINE_MAX_DURATION_MS).toBe(28_800_000);
  });
});
