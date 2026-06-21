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
  DEFAULT_AUTO_MODE,
  DEFAULT_SPEED_MULTIPLIER,
  INITIAL_COMBAT_STATS,
  INITIAL_UPGRADE_LEVELS,
  OFFLINE_MAX_DURATION_MS,
  SCHEMA_VERSION,
  SPEED_MULTIPLIERS,
  TYPE_SKILLS,
  TYPE_SWITCH_COOLDOWN_MS,
  TYPE_SWITCH_COST,
  UPGRADE_BASE_COSTS,
  UPGRADE_MAX_LEVELS,
} from "./constants";
import { BOXER_TYPES } from "./constants";

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
    expect(SCHEMA_VERSION).toBe(6);
    expect(BALANCE_VERSION).toBe(7);
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

  it("TASK-015 전투 컨트롤 기본값과 배속 단계를 고정하고, 저장/밸런스 버전은 불변이다", () => {
    // 컨트롤은 휘발 UI 상태(저장 안 함), 보스 타임아웃은 게임 시간 기준 → 두 버전 모두 불변.
    expect(SCHEMA_VERSION).toBe(6);
    expect(BALANCE_VERSION).toBe(7);
    // 가정값: 배속 x1/x2, 기본 AUTO·x1.
    expect(SPEED_MULTIPLIERS).toEqual([1, 2]);
    expect(DEFAULT_SPEED_MULTIPLIER).toBe(1);
    expect(DEFAULT_AUTO_MODE).toBe("AUTO");
  });

  it("TASK-017 타입 전환: 전용 스킬 세트가 모든 타입을 커버하고 라벨이 비어있지 않다", () => {
    for (const type of BOXER_TYPES) {
      const set = TYPE_SKILLS[type];
      expect(set).toBeDefined();
      expect(set.active.length).toBeGreaterThan(0);
      expect(set.active.every((label) => label.trim().length > 0)).toBe(true);
      expect(set.passive.trim().length).toBeGreaterThan(0);
    }
    // 타입별 전용 스킬은 서로 달라야 한다(인파이터/아웃복서 세트가 동일하면 표시 의미 없음).
    expect(TYPE_SKILLS.INFIGHTER.active).not.toEqual(TYPE_SKILLS.OUT_BOXER.active);
    expect(TYPE_SKILLS.INFIGHTER.passive).not.toBe(TYPE_SKILLS.OUT_BOXER.passive);
  });

  it("TASK-017 타입 전환 비용·쿨다운 임시값이 정의돼 있다(가정값: 무료·무제한)", () => {
    // 가정/TODO: P3(TASK-019) 재화 도입 전까지 무료, 쿨다운 0(무제한). 저장/밸런스 버전은 불변.
    expect(TYPE_SWITCH_COST).toBe(0);
    expect(TYPE_SWITCH_COOLDOWN_MS).toBe(0);
    expect(TYPE_SWITCH_COOLDOWN_MS).toBeGreaterThanOrEqual(0);
    expect(SCHEMA_VERSION).toBe(6);
    expect(BALANCE_VERSION).toBe(7);
  });
});
