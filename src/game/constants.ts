import type { BoxerType, CombatStats, Gender, UpgradeKey, UpgradeLevels } from "./types";

export const INITIAL_UPGRADE_LEVELS: Readonly<UpgradeLevels> = {
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

export const INITIAL_COMBAT_STATS: Readonly<CombatStats> = {
  attackPower: 10,
  attackSpeed: 1,
  critRate: 0.05,
  critDamage: 2,
  goldBonus: 0,
  // 가정: 기본 체력 100·방어 0(임시값).
  maxHp: 100,
  defense: 0,
  // 가정: 기본 회피율 0.05·카운터 계수 1.0(임시값).
  dodge: 0.05,
  counter: 1.0,
};

export const UPGRADE_BASE_COSTS: Readonly<Record<UpgradeKey, number>> = {
  attackPower: 10,
  attackSpeed: 25,
  critRate: 40,
  critDamage: 50,
  goldBonus: 30,
  // 가정: 체력 20·방어 35(임시값).
  maxHp: 20,
  defense: 35,
  // 가정: 회피 45·카운터 55(임시값).
  dodge: 45,
  counter: 55,
};

export const UPGRADE_MAX_LEVELS: Readonly<Record<UpgradeKey, number | null>> = {
  attackPower: null,
  attackSpeed: 40,
  critRate: 45,
  critDamage: 30,
  goldBonus: 100,
  // 가정: 체력 무제한·방어 60레벨 상한(임시값).
  maxHp: null,
  defense: 60,
  // 가정: 회피 55레벨 상한(기본 0.05 + 0.01×55 = 0.6 = CAP), 카운터 50레벨 상한(임시값).
  dodge: 55,
  counter: 50,
};

// 가정: 체력 강화 1레벨당 +25 HP(선형, 임시값).
export const MAX_HP_PER_LEVEL = 25;
// 가정: 방어 강화 1레벨당 방어 +4(임시값).
export const DEFENSE_PER_LEVEL = 4;
// 가정: 피해감소율 상한 80%(임시값).
export const DEFENSE_DAMAGE_REDUCTION_CAP = 0.8;
// 가정: 피해감소율 = defense / (defense + K), K=100(임시값).
export const DEFENSE_REDUCTION_K = 100;

// === v1.2b 회피·가드·카운터 (가정: 임시값, TASK-013 확정) ===
// 가정: 판정 순서 회피 → 가드 → 피격. 카운터는 회피(아웃복서)·가드(인파이터) 성공의 부수효과.
export const DODGE_PER_LEVEL = 0.01;
export const DODGE_RATE_CAP = 0.6;
export const COUNTER_PER_LEVEL = 0.04;
export const COUNTER_RATE_CAP = 5.0;
export const COUNTER_BASE_DAMAGE_RATE = 0.8;
export const GUARD_DAMAGE_REDUCTION = 0.25;
export const GUARD_DAMAGE_REDUCTION_TOTAL_CAP = 0.9;
export const INFIGHTER_GUARD_COUNTER_RATE = 0.3;

// 가정: 1장 1스테이지 몬스터 기본 공격력 8(임시값).
export const MONSTER_BASE_ATTACK_POWER = 8;
// 가정: 몬스터 공격 쿨타임 2000ms(임시값).
export const MONSTER_ATTACK_INTERVAL_MS = 2_000;
// 가정: 몬스터 공격력 장 배율 1.5^(chapter-1)(임시값).
export const MONSTER_ATTACK_CHAPTER_MULTIPLIER = 1.5;
// 가정: 스테이지 내 공격력 배율(임시값).
export const MONSTER_ATTACK_STAGE_MULTIPLIERS = [1.0, 1.05, 1.1, 1.2, 1.6] as const;
// 가정: 넉다운 시 현재 스테이지 골드의 20% 부분 지급(임시값).
export const KNOCKDOWN_PARTIAL_GOLD_RATE = 0.2;
// 가정: 몬스터 공격 예고 600ms(TASK-012용, 미사용, 임시값).
export const MONSTER_ATTACK_PREP_MS = 600;

export const BOSS_TIME_LIMIT_MS = 30_000;
export const OFFLINE_MAX_DURATION_MS = 8 * 60 * 60 * 1_000;
// v4(TASK-005): HP·방어 강화 추가 → SCHEMA 3→4, 몬스터 공격·HP/방어 곡선·타입 maxHp/defense 계수 → BALANCE 2→3.
// v5(TASK-006): 회피·카운터 강화 추가 → SCHEMA 4→5, 회피·가드·카운터 수식·타입 evasion/counter/damageReduction 계수 → BALANCE 3→4.
export const SCHEMA_VERSION = 5;
export const BALANCE_VERSION = 4;
export const MAX_SAFE_GAME_INTEGER = Number.MAX_SAFE_INTEGER;

export const BOXER_TYPES = ["INFIGHTER", "OUT_BOXER"] as const satisfies readonly BoxerType[];
export const GENDERS = ["MALE", "FEMALE"] as const satisfies readonly Gender[];

export const DEFAULT_BOXER_TYPE: BoxerType = "INFIGHTER";
export const DEFAULT_GENDER: Gender = "MALE";

export const BOXER_TYPE_META: Readonly<
  Record<BoxerType, { label: string; tagline: string }>
> = {
  INFIGHTER: { label: "인파이터", tagline: "압박·탱커 — 맞으며 버티고 몰아붙인다" },
  OUT_BOXER: { label: "아웃복서", tagline: "회피·카운터 — 거리를 두고 받아친다" },
};

export const GENDER_META: Readonly<Record<Gender, { label: string }>> = {
  MALE: { label: "남자" },
  FEMALE: { label: "여자" },
};

// 가정: 타입별 전투 보정. 인파이터=체력·방어·가드 높음/회피·카운터 낮음, 아웃복서=회피·카운터 높음/체력·방어 낮음.
export type BoxerTypeModifiers = {
  maxHpMultiplier: number;
  defenseMultiplier: number;
  damageReductionMultiplier: number;
  evasionMultiplier: number;
  counterMultiplier: number;
};

export const BOXER_TYPE_MODIFIERS: Readonly<Record<BoxerType, BoxerTypeModifiers>> = {
  INFIGHTER: {
    // 가정: 체력·방어 +30%, 가드 피해감소 +20%, 회피 -40%, 카운터 -50%(임시값).
    maxHpMultiplier: 1.3,
    defenseMultiplier: 1.3,
    damageReductionMultiplier: 1.2,
    evasionMultiplier: 0.6,
    counterMultiplier: 0.5,
  },
  OUT_BOXER: {
    // 가정: 체력·방어 -20%, 가드 피해감소 -10%, 회피 +60%, 카운터 +60%(임시값).
    maxHpMultiplier: 0.8,
    defenseMultiplier: 0.8,
    damageReductionMultiplier: 0.9,
    evasionMultiplier: 1.6,
    counterMultiplier: 1.6,
  },
};
