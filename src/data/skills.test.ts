import { describe, expect, it } from "vitest";
import {
  getSkill,
  getSkillsForType,
  isActiveSkill,
  isPassiveSkill,
  isSkillEquippableFor,
  SKILLS_BY_ID,
  SKILL_DEFINITIONS,
} from "./skills";
import { SKILL_NUMBERS } from "../game/constants";
import type { SkillId } from "../game/types";

describe("전용 스킬 정의 무결성", () => {
  it("스킬 id가 유일하고 type/kind가 유효하다", () => {
    const ids = SKILL_DEFINITIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const skill of SKILL_DEFINITIONS) {
      expect(["SHARED", "INFIGHTER", "OUT_BOXER"]).toContain(skill.type);
      expect(["ACTIVE", "PASSIVE"]).toContain(skill.kind);
      // 액티브는 양수 쿨타임, 패시브는 쿨타임 없음(null).
      if (skill.kind === "ACTIVE") {
        expect(skill.cooldownMs).toBeGreaterThan(0);
      } else {
        expect(skill.cooldownMs).toBeNull();
      }
    }
  });

  it("인파이터 5종·아웃복서 5종이 모두 존재한다", () => {
    const infighter: SkillId[] = ["liver_shot", "iron_guard", "pressure", "gazelle_punch", "dempsey_roll"];
    const outBoxer: SkillId[] = ["ghost_step", "navi_step", "step_back_counter", "phantom_jab", "distance_control"];
    for (const id of infighter) {
      expect(SKILLS_BY_ID[id].type).toBe("INFIGHTER");
    }
    for (const id of outBoxer) {
      expect(SKILLS_BY_ID[id].type).toBe("OUT_BOXER");
    }
    expect(SKILL_DEFINITIONS).toHaveLength(10);
  });

  it("패시브는 타입별 정확히 1종이다(슬롯 1개에 장착)", () => {
    const infPassives = getSkillsForType("INFIGHTER").filter((s) => s.kind === "PASSIVE");
    const outPassives = getSkillsForType("OUT_BOXER").filter((s) => s.kind === "PASSIVE");
    expect(infPassives.map((s) => s.id)).toEqual(["iron_guard"]);
    expect(outPassives.map((s) => s.id)).toEqual(["step_back_counter"]);
  });

  it("getSkillsForType는 해당 타입(+SHARED)만 돌려준다", () => {
    for (const skill of getSkillsForType("INFIGHTER")) {
      expect(skill.type === "INFIGHTER" || skill.type === "SHARED").toBe(true);
    }
    for (const skill of getSkillsForType("OUT_BOXER")) {
      expect(skill.type === "OUT_BOXER" || skill.type === "SHARED").toBe(true);
    }
    // 인파이터 목록에 아웃복서 전용이 섞이지 않는다.
    expect(getSkillsForType("INFIGHTER").map((s) => s.id)).not.toContain("ghost_step");
  });

  it("isSkillEquippableFor가 교차 타입을 거부한다", () => {
    expect(isSkillEquippableFor("liver_shot", "INFIGHTER")).toBe(true);
    expect(isSkillEquippableFor("liver_shot", "OUT_BOXER")).toBe(false);
    expect(isSkillEquippableFor("ghost_step", "OUT_BOXER")).toBe(true);
    expect(isSkillEquippableFor("ghost_step", "INFIGHTER")).toBe(false);
  });

  it("isActiveSkill/isPassiveSkill가 종류를 구분한다", () => {
    expect(isActiveSkill("liver_shot")).toBe(true);
    expect(isPassiveSkill("iron_guard")).toBe(true);
    expect(isActiveSkill("iron_guard")).toBe(false);
    expect(isPassiveSkill("step_back_counter")).toBe(true);
  });

  it("문서 명시 수치(지속/버프율)가 constants와 일치한다", () => {
    // 압박: 6초·+20%·-10%.
    expect(SKILL_NUMBERS.pressure.durationMs).toBe(6_000);
    expect(SKILL_NUMBERS.pressure.hookUpperDamageBonus).toBe(0.2);
    expect(SKILL_NUMBERS.pressure.monsterAttackWeaken).toBe(0.1);
    // 나비스텝: 5초·+15%·+20%·+10%.
    expect(SKILL_NUMBERS.navi_step.durationMs).toBe(5_000);
    expect(SKILL_NUMBERS.navi_step.dodgeBonus).toBe(0.15);
    expect(SKILL_NUMBERS.navi_step.cooldownSpeedup).toBe(0.2);
    expect(SKILL_NUMBERS.navi_step.counterBonus).toBe(0.1);
    // 거리조절: 6초·+20%·+10%.
    expect(SKILL_NUMBERS.distance_control.durationMs).toBe(6_000);
    expect(SKILL_NUMBERS.distance_control.monsterCooldownDelay).toBe(0.2);
    expect(SKILL_NUMBERS.distance_control.dodgeBonus).toBe(0.1);
    // 리버샷: 내상 5초·Groggy+20. 가젤펀치: Groggy+15.
    expect(SKILL_NUMBERS.liver_shot.internalDurationMs).toBe(5_000);
    expect(SKILL_NUMBERS.liver_shot.groggyGain).toBe(20);
    expect(SKILL_NUMBERS.gazelle_punch.groggyGain).toBe(15);
  });

  it("getSkill이 id로 정의를 돌려준다", () => {
    expect(getSkill("dempsey_roll").name).toBe("뎀프시롤");
  });
});
