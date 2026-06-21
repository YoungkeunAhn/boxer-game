import { describe, expect, it } from "vitest";
import { STAGES_BALANCE_VERSION } from "../data/stages";
import {
  ACTIVE_SKILL_SLOT_MAX,
  ATTACK_HISTORY_LIMIT,
  BALANCE_VERSION,
  BOSS_TIME_LIMIT_MS,
  BOXER_TYPE_MODIFIERS,
  COMBINATIONS,
  COMBO_GAUGE_MAX,
  COMBO_GAUGE_PER_JAB,
  DEFAULT_EQUIPPED_SKILLS,
  FULL_COMBO_GROGGY_BONUS,
  GROGGY_DAMAGE_MULT,
  GROGGY_DURATION_MS,
  GROGGY_GAIN_BY_ATTACK,
  GROGGY_MAX_BASE,
  INITIAL_COMBAT_STATS,
  INITIAL_UPGRADE_LEVELS,
  OFFLINE_MAX_DURATION_MS,
  PASSIVE_SKILL_SLOT_MAX,
  SCHEMA_VERSION,
  SKILL_NUMBERS,
  UPGRADE_BASE_COSTS,
  UPGRADE_MAX_LEVELS,
} from "./constants";
import { isSkillEquippableFor, isActiveSkill, isPassiveSkill } from "../data/skills";

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
    expect(BALANCE_VERSION).toBe(9);
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

  it("그로기 상수가 불변식을 지킨다", () => {
    // 상한·지속은 양수, 추가 피해 배수는 1 초과.
    expect(GROGGY_MAX_BASE).toBeGreaterThan(0);
    expect(GROGGY_DURATION_MS).toBeGreaterThan(0);
    expect(GROGGY_DAMAGE_MULT).toBeGreaterThan(1);
    // 공격별 누적량은 음수 없음. 잽·스트레이트는 0, 훅·어퍼는 양수.
    for (const v of Object.values(GROGGY_GAIN_BY_ATTACK)) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(GROGGY_GAIN_BY_ATTACK.JAB).toBe(0);
    expect(GROGGY_GAIN_BY_ATTACK.STRAIGHT).toBe(0);
    expect(GROGGY_GAIN_BY_ATTACK.HOOK).toBeGreaterThan(0);
    expect(GROGGY_GAIN_BY_ATTACK.UPPER).toBeGreaterThan(GROGGY_GAIN_BY_ATTACK.HOOK);
    // 풀콤보 그로기 보너스는 양수(TASK-009에서 0→양수로 활성화).
    expect(FULL_COMBO_GROGGY_BONUS).toBeGreaterThan(0);
    // 타입별 그로기 누적: 인파이터(빠름) > 아웃복서(느림).
    expect(BOXER_TYPE_MODIFIERS.INFIGHTER.groggyGainMultiplier).toBeGreaterThan(1);
    expect(BOXER_TYPE_MODIFIERS.OUT_BOXER.groggyGainMultiplier).toBeLessThan(1);
    expect(BOXER_TYPE_MODIFIERS.INFIGHTER.groggyGainMultiplier).toBeGreaterThan(
      BOXER_TYPE_MODIFIERS.OUT_BOXER.groggyGainMultiplier,
    );
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

  it("전용 스킬 슬롯 수와 가정 수치 불변식을 지킨다", () => {
    expect(ACTIVE_SKILL_SLOT_MAX).toBe(3);
    expect(PASSIVE_SKILL_SLOT_MAX).toBe(1);

    // 액티브 스킬 쿨타임은 양수, 다단 타수는 양수.
    expect(SKILL_NUMBERS.liver_shot.cooldownMs).toBeGreaterThan(0);
    expect(SKILL_NUMBERS.dempsey_roll.hits).toBeGreaterThan(0);
    expect(SKILL_NUMBERS.phantom_jab.hits).toBeGreaterThan(0);

    // 버프율은 0~1 범위(가산형 임시값).
    for (const rate of [
      SKILL_NUMBERS.pressure.hookUpperDamageBonus,
      SKILL_NUMBERS.pressure.monsterAttackWeaken,
      SKILL_NUMBERS.navi_step.dodgeBonus,
      SKILL_NUMBERS.navi_step.cooldownSpeedup,
      SKILL_NUMBERS.distance_control.monsterCooldownDelay,
      SKILL_NUMBERS.iron_guard.damageReduction,
    ]) {
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThanOrEqual(1);
    }

    // 내상 지속·틱은 양수.
    expect(SKILL_NUMBERS.liver_shot.internalDurationMs).toBeGreaterThan(0);
    expect(SKILL_NUMBERS.liver_shot.internalTickMs).toBeGreaterThan(0);
  });

  it("타입별 기본 장착 스킬이 타입에 맞고 슬롯 수를 지킨다", () => {
    for (const type of ["INFIGHTER", "OUT_BOXER"] as const) {
      const equipped = DEFAULT_EQUIPPED_SKILLS[type];
      expect(equipped.active.length).toBeLessThanOrEqual(ACTIVE_SKILL_SLOT_MAX);
      for (const id of equipped.active) {
        expect(isSkillEquippableFor(id, type)).toBe(true);
        expect(isActiveSkill(id)).toBe(true);
      }
      if (equipped.passive) {
        expect(isSkillEquippableFor(equipped.passive, type)).toBe(true);
        expect(isPassiveSkill(equipped.passive)).toBe(true);
      }
    }
  });
});
