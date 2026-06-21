import { SKILL_NUMBERS } from "../game/constants";
import type { BoxerType, SkillId, SkillKind, SkillType } from "../game/types";

// v1.3d(TASK-010): 전용 스킬 정의 데이터 모듈(순수).
//   - 식별·표시 이름·소속 타입·종류(액티브/패시브)·쿨타임 같은 메타를 담는다.
//   - 효과 수치는 constants.ts의 SKILL_NUMBERS(가정 임시값)에 모아 두고, 여기서는 참조만 한다.
//   - 기본 4종(잽/스트레이트/훅/어퍼)은 AttackType이라 여기 포함하지 않는다(고정·항상 사용).

export type SkillDefinition = {
  id: SkillId;
  name: string; // 표시명(한국어)
  type: SkillType; // SHARED | INFIGHTER | OUT_BOXER
  kind: SkillKind; // ACTIVE | PASSIVE
  // 액티브 스킬의 쿨타임(ms). 패시브는 null(상시 적용).
  cooldownMs: number | null;
  // 효과 요약(연출·디버그용). 실제 수치는 SKILL_NUMBERS 참조.
  description: string;
};

export const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  // === 인파이터 전용 ===
  {
    id: "liver_shot",
    name: "리버샷",
    type: "INFIGHTER",
    kind: "ACTIVE",
    cooldownMs: SKILL_NUMBERS.liver_shot.cooldownMs,
    description: "내상(지속 피해) + 보스 그로기 증가",
  },
  {
    id: "iron_guard",
    name: "철벽가드",
    type: "INFIGHTER",
    kind: "PASSIVE",
    cooldownMs: null,
    description: "받는 피해 감소(상시)",
  },
  {
    id: "pressure",
    name: "압박",
    type: "INFIGHTER",
    kind: "ACTIVE",
    cooldownMs: SKILL_NUMBERS.pressure.cooldownMs,
    description: "훅/어퍼 데미지 증가 + 몬스터 공격력 감소(버프)",
  },
  {
    id: "gazelle_punch",
    name: "가젤펀치",
    type: "INFIGHTER",
    kind: "ACTIVE",
    cooldownMs: SKILL_NUMBERS.gazelle_punch.cooldownMs,
    description: "강한 단일 강타 + 그로기 증가",
  },
  {
    id: "dempsey_roll",
    name: "뎀프시롤",
    type: "INFIGHTER",
    kind: "ACTIVE",
    cooldownMs: SKILL_NUMBERS.dempsey_roll.cooldownMs,
    description: "다단 훅 + 대량 그로기",
  },

  // === 아웃복서 전용 ===
  {
    id: "ghost_step",
    name: "고스트스텝",
    type: "OUT_BOXER",
    kind: "ACTIVE",
    cooldownMs: SKILL_NUMBERS.ghost_step.cooldownMs,
    description: "완전 회피 + 카운터 강화(버프)",
  },
  {
    id: "navi_step",
    name: "나비 스텝",
    type: "OUT_BOXER",
    kind: "ACTIVE",
    cooldownMs: SKILL_NUMBERS.navi_step.cooldownMs,
    description: "회피율·쿨타임 회복·카운터 버프",
  },
  {
    id: "step_back_counter",
    name: "스텝백 카운터",
    type: "OUT_BOXER",
    kind: "PASSIVE",
    cooldownMs: null,
    description: "회피 성공 시 자동 강한 반격(상시)",
  },
  {
    id: "phantom_jab",
    name: "팬텀 잽",
    type: "OUT_BOXER",
    kind: "ACTIVE",
    cooldownMs: SKILL_NUMBERS.phantom_jab.cooldownMs,
    description: "다단 잽 + 짧은 회피 버프",
  },
  {
    id: "distance_control",
    name: "거리 조절",
    type: "OUT_BOXER",
    kind: "ACTIVE",
    cooldownMs: SKILL_NUMBERS.distance_control.cooldownMs,
    description: "몬스터 공격 쿨타임 지연 + 회피 버프",
  },
] as const;

// id → 정의 인덱스(O(1) 조회).
export const SKILLS_BY_ID: Readonly<Record<SkillId, SkillDefinition>> = Object.fromEntries(
  SKILL_DEFINITIONS.map((skill) => [skill.id, skill]),
) as Record<SkillId, SkillDefinition>;

export function getSkill(id: SkillId): SkillDefinition {
  return SKILLS_BY_ID[id];
}

// 해당 복서 타입이 장착할 수 있는 스킬(같은 타입 + SHARED).
export function getSkillsForType(boxerType: BoxerType): SkillDefinition[] {
  return SKILL_DEFINITIONS.filter(
    (skill) => skill.type === "SHARED" || skill.type === boxerType,
  );
}

// 교차 타입 거부: 인파이터에는 아웃복서 스킬을 장착할 수 없다(SHARED는 모두 허용).
export function isSkillEquippableFor(id: SkillId, boxerType: BoxerType): boolean {
  const skill = SKILLS_BY_ID[id];
  if (!skill) return false;
  return skill.type === "SHARED" || skill.type === boxerType;
}

// 액티브/패시브 종류 조회 헬퍼.
export function isActiveSkill(id: SkillId): boolean {
  return SKILLS_BY_ID[id]?.kind === "ACTIVE";
}

export function isPassiveSkill(id: SkillId): boolean {
  return SKILLS_BY_ID[id]?.kind === "PASSIVE";
}
