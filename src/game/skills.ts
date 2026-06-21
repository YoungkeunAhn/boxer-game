import { isSkillEquippableFor, SKILLS_BY_ID } from "../data/skills";
import {
  MAX_SAFE_GAME_INTEGER,
  SKILL_NUMBERS,
} from "./constants";
import { calculateCounterDamage } from "./formulas";
import type {
  Boxer,
  CombatStats,
  InternalDoT,
  SkillBuff,
  SkillId,
} from "./types";

// v1.3d(TASK-010): 전용 스킬의 순수 로직. now/randomValue는 호출부(combat.ts/store)가 주입한다.
//   React/DOM/타이머를 참조하지 않는다. 효과 수치는 모두 constants.SKILL_NUMBERS(가정)에서 읽는다.

function toSafeInteger(value: number): number {
  return Number.isFinite(value)
    ? Math.min(MAX_SAFE_GAME_INTEGER, Math.max(0, Math.floor(value)))
    : MAX_SAFE_GAME_INTEGER;
}

// 활성 버프의 동종 효과 합산값.
export type BuffModifiers = {
  dodgeBonus: number;
  counterBonus: number;
  cooldownSpeedup: number;
  monsterAttackWeaken: number;
  monsterCooldownDelay: number;
  hookUpperDamageBonus: number;
};

// 빈 버프(모든 가산 0). 동종 효과 합산의 항등원이자 기본값. SkillBuff 생성 시 스프레드용.
const ZERO_BUFF_MODS: BuffModifiers = {
  dodgeBonus: 0,
  counterBonus: 0,
  cooldownSpeedup: 0,
  monsterAttackWeaken: 0,
  monsterCooldownDelay: 0,
  hookUpperDamageBonus: 0,
};

// 액티브 스킬 쿨타임 초기화(정책: AFTER_COOLDOWN — 전투 시작 후 cooldownMs 지나야 첫 발동).
//   패시브/미장착/쿨타임 없는 스킬은 키를 만들지 않는다.
export function initSkillCooldowns(
  activeSlots: readonly SkillId[],
  now: number,
): Partial<Record<SkillId, number>> {
  const cooldowns: Partial<Record<SkillId, number>> = {};
  for (const id of activeSlots) {
    const def = SKILLS_BY_ID[id];
    if (def?.kind === "ACTIVE" && def.cooldownMs !== null) {
      cooldowns[id] = now + def.cooldownMs;
    }
  }
  return cooldowns;
}

// 전투 중 장착 변경 시 액티브 쿨타임 맵을 재정합한다(정책: AFTER_COOLDOWN 유지).
//   - 유지되는 스킬: 진행 중 쿨타임(existing[id])을 보존한다.
//   - 새로 장착된 스킬: now+cooldownMs로 초기화한다(즉시 발동 방지 — 슬롯 교체 악용 차단).
//   - 해제된 스킬: 키를 버린다(맵에 남지 않음).
//   이걸 호출하지 않으면 새 스킬에 쿨타임 키가 없어 selectReadySkill이 영영 미발동(undefined)으로 본다.
export function mergeSkillCooldowns(
  activeSlots: readonly SkillId[],
  existing: Partial<Record<SkillId, number>>,
  now: number,
): Partial<Record<SkillId, number>> {
  const cooldowns: Partial<Record<SkillId, number>> = {};
  for (const id of activeSlots) {
    const def = SKILLS_BY_ID[id];
    if (def?.kind === "ACTIVE" && def.cooldownMs !== null) {
      cooldowns[id] = existing[id] ?? now + def.cooldownMs;
    }
  }
  return cooldowns;
}

// 발동 가능한 액티브 스킬 1개 선택(정책: 쿨 종료된 것 중 슬롯 순서 우선). 없으면 null.
//   쿨타임 키가 없으면(초기화 안 됨) 미발동으로 본다(combat가 createCombatRuntime에서 초기화).
export function selectReadySkill(
  activeSlots: readonly SkillId[],
  skillCooldowns: Partial<Record<SkillId, number>>,
  now: number,
): SkillId | null {
  for (const id of activeSlots) {
    const def = SKILLS_BY_ID[id];
    if (def?.kind !== "ACTIVE") continue;
    const readyAt = skillCooldowns[id];
    if (readyAt !== undefined && now >= readyAt) return id;
  }
  return null;
}

// 액티브 스킬 발동 효과. combat.ts가 결과를 monsterHp 차감·그로기 누적·버프/DoT 부여에 반영한다.
//   - monsterDamage: 이번 발동으로 몬스터에게 줄 직접 피해 총합(다단은 타격 합).
//   - hits: 타격 수(단일=1, 다단=hits). 연출용.
//   - groggyGain: 보스 그로기 누적량(combat가 보스일 때만 게이지에 더한다).
//   - buff: 부여할 일시 버프(없으면 null). combat가 activeBuffs에 추가한다.
//   - internalDoT: 부여할 내상(리버샷, 없으면 null). combat가 internalDoT에 설정한다.
//   - cooldownMs: 이 스킬의 쿨타임(combat가 skillCooldowns 갱신에 쓴다, null이면 단발).
export type ActiveSkillEffect = {
  monsterDamage: number;
  hits: number;
  groggyGain: number;
  buff: SkillBuff | null;
  internalDoT: InternalDoT | null;
  cooldownMs: number | null;
};

export function applyActiveSkill(
  id: SkillId,
  stats: CombatStats,
  now: number,
): ActiveSkillEffect {
  const def = SKILLS_BY_ID[id];
  const cooldownMs = def?.cooldownMs ?? null;
  const empty: ActiveSkillEffect = {
    monsterDamage: 0,
    hits: 1,
    groggyGain: 0,
    buff: null,
    internalDoT: null,
    cooldownMs,
  };

  switch (id) {
    case "liver_shot": {
      const n = SKILL_NUMBERS.liver_shot;
      return {
        ...empty,
        monsterDamage: toSafeInteger(stats.attackPower * n.damageCoefficient),
        groggyGain: n.groggyGain,
        internalDoT: {
          until: now + n.internalDurationMs,
          perTickDamage: toSafeInteger(stats.attackPower * n.internalDamageCoefficient),
          nextTickAt: now + n.internalTickMs,
        },
      };
    }
    case "pressure": {
      const n = SKILL_NUMBERS.pressure;
      return {
        ...empty,
        buff: {
          sourceSkill: id,
          until: now + n.durationMs,
          ...ZERO_BUFF_MODS,
          hookUpperDamageBonus: n.hookUpperDamageBonus,
          monsterAttackWeaken: n.monsterAttackWeaken,
        },
      };
    }
    case "gazelle_punch": {
      const n = SKILL_NUMBERS.gazelle_punch;
      return {
        ...empty,
        monsterDamage: toSafeInteger(stats.attackPower * n.damageCoefficient),
        groggyGain: n.groggyGain,
      };
    }
    case "dempsey_roll": {
      const n = SKILL_NUMBERS.dempsey_roll;
      const perHit = toSafeInteger(stats.attackPower * n.hitCoefficient);
      return {
        ...empty,
        monsterDamage: Math.min(MAX_SAFE_GAME_INTEGER, perHit * n.hits),
        hits: n.hits,
        groggyGain: n.groggyGain,
      };
    }
    case "ghost_step": {
      const n = SKILL_NUMBERS.ghost_step;
      return {
        ...empty,
        buff: {
          sourceSkill: id,
          until: now + n.durationMs,
          ...ZERO_BUFF_MODS,
          dodgeBonus: n.dodgeBonus,
          counterBonus: n.counterBonus,
        },
      };
    }
    case "navi_step": {
      const n = SKILL_NUMBERS.navi_step;
      return {
        ...empty,
        buff: {
          sourceSkill: id,
          until: now + n.durationMs,
          ...ZERO_BUFF_MODS,
          dodgeBonus: n.dodgeBonus,
          cooldownSpeedup: n.cooldownSpeedup,
          counterBonus: n.counterBonus,
        },
      };
    }
    case "phantom_jab": {
      const n = SKILL_NUMBERS.phantom_jab;
      const perHit = toSafeInteger(stats.attackPower * n.hitCoefficient);
      return {
        ...empty,
        monsterDamage: Math.min(MAX_SAFE_GAME_INTEGER, perHit * n.hits),
        hits: n.hits,
        buff: {
          sourceSkill: id,
          until: now + n.durationMs,
          ...ZERO_BUFF_MODS,
          dodgeBonus: n.dodgeBonus,
        },
      };
    }
    case "distance_control": {
      const n = SKILL_NUMBERS.distance_control;
      return {
        ...empty,
        buff: {
          sourceSkill: id,
          until: now + n.durationMs,
          ...ZERO_BUFF_MODS,
          dodgeBonus: n.dodgeBonus,
          monsterCooldownDelay: n.monsterCooldownDelay,
        },
      };
    }
    // 패시브(iron_guard/step_back_counter)는 여기서 발동하지 않는다(collectPassiveModifiers 경로).
    default:
      return empty;
  }
}

// 장착 패시브에서 상시 적용 계수를 도출한다.
//   - guardDamageReduction: 철벽가드 받는 피해 추가 감소율(없으면 0).
//   - counterRate: 스텝백카운터 회피 성공 시 자동 반격 비율(없으면 0=비활성).
export type PassiveModifiers = {
  guardDamageReduction: number;
  stepBackCounterRate: number;
};

export function collectPassiveModifiers(boxer: Boxer): PassiveModifiers {
  const passive = boxer.equippedSkills?.passive ?? null;
  let guardDamageReduction = 0;
  let stepBackCounterRate = 0;
  // 장착 패시브가 이 타입에 유효할 때만 적용한다(교차 타입 방어).
  if (passive && isSkillEquippableFor(passive, boxer.boxerType)) {
    if (passive === "iron_guard") {
      guardDamageReduction = SKILL_NUMBERS.iron_guard.damageReduction;
    } else if (passive === "step_back_counter") {
      stepBackCounterRate = SKILL_NUMBERS.step_back_counter.counterRate;
    }
  }
  return { guardDamageReduction, stepBackCounterRate };
}

// 만료된 버프 제거(now>=until). 변화가 없으면 같은 배열 참조를 돌려준다(불변·재할당 최소화).
export function tickBuffs(buffs: readonly SkillBuff[], now: number): SkillBuff[] {
  const kept = buffs.filter((buff) => now < buff.until);
  return kept.length === buffs.length ? (buffs as SkillBuff[]) : kept;
}

// 활성 버프의 동종 효과를 합산한다(만료 버프는 제외해 호출하는 게 정확하지만, 여기서도 now로 거른다).
export function getActiveBuffModifiers(
  buffs: readonly SkillBuff[],
  now: number,
): BuffModifiers {
  const mods: BuffModifiers = { ...ZERO_BUFF_MODS };
  for (const buff of buffs) {
    if (now >= buff.until) continue;
    mods.dodgeBonus += buff.dodgeBonus;
    mods.counterBonus += buff.counterBonus;
    mods.cooldownSpeedup += buff.cooldownSpeedup;
    mods.monsterAttackWeaken += buff.monsterAttackWeaken;
    mods.monsterCooldownDelay += buff.monsterCooldownDelay;
    mods.hookUpperDamageBonus += buff.hookUpperDamageBonus;
  }
  return mods;
}

// 내상(DoT) 정산. now까지 도래한 틱들을 누적해 총 피해와 갱신된 DoT 상태를 돌려준다.
//   - until 초과 틱은 더하지 않고, until을 지나면 DoT를 종료(null)한다.
//   - 가정: 복서 공격 틱 시점에 일괄 정산한다(정밀 시간 틱 인터리브는 TODO). 결정적(now 주입).
export function applyInternalDamage(
  dot: InternalDoT | null,
  now: number,
): { damage: number; internalDoT: InternalDoT | null } {
  if (!dot) return { damage: 0, internalDoT: null };
  let damage = 0;
  let nextTickAt = dot.nextTickAt;
  // until 시각 이하의 틱만 유효하다. nextTickAt이 until을 넘으면 더 이상 틱하지 않는다.
  while (nextTickAt <= now && nextTickAt <= dot.until) {
    damage = Math.min(MAX_SAFE_GAME_INTEGER, damage + dot.perTickDamage);
    nextTickAt += SKILL_NUMBERS.liver_shot.internalTickMs;
  }
  // 다음 틱이 만료 시각을 넘었으면 DoT 종료.
  const internalDoT = nextTickAt > dot.until ? null : { ...dot, nextTickAt };
  return { damage, internalDoT };
}
