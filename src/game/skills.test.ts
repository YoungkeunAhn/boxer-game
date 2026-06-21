import { describe, expect, it } from "vitest";
import { SKILL_NUMBERS } from "./constants";
import { calculateCombatStats } from "./formulas";
import {
  applyActiveSkill,
  applyInternalDamage,
  collectPassiveModifiers,
  getActiveBuffModifiers,
  initSkillCooldowns,
  mergeSkillCooldowns,
  selectReadySkill,
  tickBuffs,
} from "./skills";
import type { Boxer, SkillBuff, UpgradeLevels } from "./types";

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

function makeBoxer(overrides: Partial<Boxer> = {}): Boxer {
  return {
    id: "p",
    name: "복서",
    boxerType: "INFIGHTER",
    gender: "MALE",
    gold: 0,
    totalKills: 0,
    upgradeLevels: { ...zeroLevels },
    diamond: 0,
    playerLevel: 1,
    playerExp: 0,
    equippedSkills: { active: [], passive: null },
    ...overrides,
  };
}

const infStats = calculateCombatStats(zeroLevels, "INFIGHTER");

describe("initSkillCooldowns / selectReadySkill", () => {
  it("액티브 스킬만 cooldownMs 후로 초기화한다(AFTER_COOLDOWN 정책)", () => {
    const cd = initSkillCooldowns(["liver_shot", "iron_guard"], 1_000);
    // 패시브(iron_guard)는 키가 없다.
    expect(cd.iron_guard).toBeUndefined();
    expect(cd.liver_shot).toBe(1_000 + SKILL_NUMBERS.liver_shot.cooldownMs);
  });

  it("쿨 종료된 스킬만 슬롯 순서로 발동한다", () => {
    const active = ["liver_shot", "pressure"] as const;
    const cd = initSkillCooldowns(active, 0);
    // 쿨 중이면 미발동.
    expect(selectReadySkill(active, cd, 100)).toBeNull();
    // liver_shot만 쿨 종료된 시각.
    const t = SKILL_NUMBERS.liver_shot.cooldownMs;
    expect(selectReadySkill(active, cd, t)).toBe("liver_shot");
    // 둘 다 쿨 종료면 슬롯1(liver_shot) 우선.
    const both = SKILL_NUMBERS.pressure.cooldownMs;
    expect(selectReadySkill(active, cd, both + 1)).toBe("liver_shot");
  });

  it("쿨타임 키가 없으면 미발동으로 본다", () => {
    expect(selectReadySkill(["liver_shot"], {}, 999_999)).toBeNull();
  });
});

describe("mergeSkillCooldowns(장착 변경 시 쿨타임 재정합)", () => {
  it("새로 장착된 액티브 스킬에 now+cooldownMs 키를 만든다(장착 후 발동 가능)", () => {
    // 전투 중 새 스킬을 장착하면 키가 생겨 selectReadySkill이 쿨 종료 후 발동한다.
    const merged = mergeSkillCooldowns(["liver_shot"], {}, 1_000);
    expect(merged.liver_shot).toBe(1_000 + SKILL_NUMBERS.liver_shot.cooldownMs);
    // 쿨 종료 전 미발동, 종료 후 발동.
    expect(selectReadySkill(["liver_shot"], merged, 1_000)).toBeNull();
    expect(selectReadySkill(["liver_shot"], merged, merged.liver_shot!)).toBe("liver_shot");
  });

  it("유지되는 스킬의 진행 중 쿨타임은 보존한다", () => {
    const existing = { liver_shot: 50_000 };
    const merged = mergeSkillCooldowns(["liver_shot", "pressure"], existing, 1_000);
    expect(merged.liver_shot).toBe(50_000); // 진행 중 쿨타임 보존
    expect(merged.pressure).toBe(1_000 + SKILL_NUMBERS.pressure.cooldownMs); // 신규는 초기화
  });

  it("해제된 스킬의 키는 버린다", () => {
    const existing = { liver_shot: 50_000, pressure: 60_000 };
    const merged = mergeSkillCooldowns(["pressure"], existing, 1_000);
    expect(merged.liver_shot).toBeUndefined();
    expect(merged.pressure).toBe(60_000);
  });

  it("패시브는 쿨타임 키를 만들지 않는다", () => {
    const merged = mergeSkillCooldowns(["iron_guard"], {}, 1_000);
    expect(merged.iron_guard).toBeUndefined();
  });
});

describe("applyActiveSkill 효과", () => {
  it("리버샷: 단일 피해 + 그로기 + 내상 DoT 부여", () => {
    const eff = applyActiveSkill("liver_shot", infStats, 1_000);
    expect(eff.monsterDamage).toBe(
      Math.floor(infStats.attackPower * SKILL_NUMBERS.liver_shot.damageCoefficient),
    );
    expect(eff.groggyGain).toBe(20);
    expect(eff.internalDoT).not.toBeNull();
    expect(eff.internalDoT?.until).toBe(1_000 + SKILL_NUMBERS.liver_shot.internalDurationMs);
    expect(eff.internalDoT?.nextTickAt).toBe(1_000 + SKILL_NUMBERS.liver_shot.internalTickMs);
    expect(eff.hits).toBe(1);
  });

  it("뎀프시롤: 다단 타격으로 피해가 타수만큼 합산되고 대량 그로기", () => {
    const eff = applyActiveSkill("dempsey_roll", infStats, 0);
    const perHit = Math.floor(infStats.attackPower * SKILL_NUMBERS.dempsey_roll.hitCoefficient);
    expect(eff.hits).toBe(SKILL_NUMBERS.dempsey_roll.hits);
    expect(eff.monsterDamage).toBe(perHit * SKILL_NUMBERS.dempsey_roll.hits);
    expect(eff.groggyGain).toBe(SKILL_NUMBERS.dempsey_roll.groggyGain);
  });

  it("가젤펀치: 단일 강타 + 그로기, 버프/DoT 없음", () => {
    const eff = applyActiveSkill("gazelle_punch", infStats, 0);
    expect(eff.groggyGain).toBe(15);
    expect(eff.buff).toBeNull();
    expect(eff.internalDoT).toBeNull();
  });

  it("압박: 훅/어퍼 증댐·몬스터 약화 버프 부여(피해 없음)", () => {
    const eff = applyActiveSkill("pressure", infStats, 500);
    expect(eff.monsterDamage).toBe(0);
    expect(eff.buff?.until).toBe(500 + SKILL_NUMBERS.pressure.durationMs);
    expect(eff.buff?.hookUpperDamageBonus).toBe(0.2);
    expect(eff.buff?.monsterAttackWeaken).toBe(0.1);
  });

  it("팬텀잽: 다단 잽 피해 + 회피 버프", () => {
    const out = calculateCombatStats(zeroLevels, "OUT_BOXER");
    const eff = applyActiveSkill("phantom_jab", out, 0);
    expect(eff.hits).toBe(SKILL_NUMBERS.phantom_jab.hits);
    expect(eff.buff?.dodgeBonus).toBe(SKILL_NUMBERS.phantom_jab.dodgeBonus);
  });

  it("나비스텝: 회피·쿨가속·카운터 버프", () => {
    const out = calculateCombatStats(zeroLevels, "OUT_BOXER");
    const eff = applyActiveSkill("navi_step", out, 0);
    expect(eff.buff?.dodgeBonus).toBe(0.15);
    expect(eff.buff?.cooldownSpeedup).toBe(0.2);
    expect(eff.buff?.counterBonus).toBe(0.1);
  });
});

describe("collectPassiveModifiers", () => {
  it("철벽가드: 피해감소율 도출", () => {
    const mods = collectPassiveModifiers(makeBoxer({ equippedSkills: { active: [], passive: "iron_guard" } }));
    expect(mods.guardDamageReduction).toBe(SKILL_NUMBERS.iron_guard.damageReduction);
    expect(mods.stepBackCounterRate).toBe(0);
  });

  it("스텝백카운터: 자동 반격 비율 도출(아웃복서)", () => {
    const mods = collectPassiveModifiers(
      makeBoxer({ boxerType: "OUT_BOXER", equippedSkills: { active: [], passive: "step_back_counter" } }),
    );
    expect(mods.stepBackCounterRate).toBe(SKILL_NUMBERS.step_back_counter.counterRate);
  });

  it("교차 타입 패시브는 무시한다", () => {
    // 아웃복서가 인파이터 패시브를 끼고 있어도(이론적) 적용 안 됨.
    const mods = collectPassiveModifiers(
      makeBoxer({ boxerType: "OUT_BOXER", equippedSkills: { active: [], passive: "iron_guard" } }),
    );
    expect(mods.guardDamageReduction).toBe(0);
  });
});

describe("tickBuffs / getActiveBuffModifiers", () => {
  const buff = (until: number, partial: Partial<SkillBuff>): SkillBuff => ({
    sourceSkill: "navi_step",
    until,
    dodgeBonus: 0,
    counterBonus: 0,
    cooldownSpeedup: 0,
    monsterAttackWeaken: 0,
    monsterCooldownDelay: 0,
    hookUpperDamageBonus: 0,
    ...partial,
  });

  it("만료 버프를 제거한다", () => {
    const buffs = [buff(1_000, {}), buff(5_000, {})];
    expect(tickBuffs(buffs, 2_000)).toHaveLength(1);
    expect(tickBuffs(buffs, 500)).toHaveLength(2);
    // 변화 없으면 같은 배열 참조.
    expect(tickBuffs(buffs, 500)).toBe(buffs);
  });

  it("동종 효과를 합산한다(만료 제외)", () => {
    const buffs = [
      buff(10_000, { dodgeBonus: 0.15, counterBonus: 0.1 }),
      buff(10_000, { dodgeBonus: 0.1, monsterCooldownDelay: 0.2 }),
      buff(500, { dodgeBonus: 1.0 }), // 만료
    ];
    const mods = getActiveBuffModifiers(buffs, 1_000);
    expect(mods.dodgeBonus).toBeCloseTo(0.25);
    expect(mods.counterBonus).toBeCloseTo(0.1);
    expect(mods.monsterCooldownDelay).toBeCloseTo(0.2);
  });
});

describe("applyInternalDamage(내상 DoT)", () => {
  it("도래한 틱만 누적하고 만료 후 종료한다", () => {
    const dot = {
      until: 5_000,
      perTickDamage: 4,
      nextTickAt: 1_000,
    };
    // now=2_500이면 1_000·2_000 두 틱.
    const r1 = applyInternalDamage(dot, 2_500);
    expect(r1.damage).toBe(8);
    expect(r1.internalDoT?.nextTickAt).toBe(3_000);

    // now=10_000이면 1_000~5_000(=tick까지) 누적 후 다음 틱이 until 초과 → 종료.
    const r2 = applyInternalDamage(dot, 10_000);
    expect(r2.damage).toBe(4 * 5); // 1,2,3,4,5초 틱
    expect(r2.internalDoT).toBeNull();
  });

  it("DoT가 없으면 0", () => {
    expect(applyInternalDamage(null, 1_000)).toEqual({ damage: 0, internalDoT: null });
  });

  it("아직 틱이 도래하지 않으면 0 피해·DoT 유지", () => {
    const dot = { until: 5_000, perTickDamage: 4, nextTickAt: 3_000 };
    const r = applyInternalDamage(dot, 2_000);
    expect(r.damage).toBe(0);
    expect(r.internalDoT).toEqual(dot);
  });
});
