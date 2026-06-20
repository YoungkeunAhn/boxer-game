import type { BoxerType, CombatStats, Gender, UpgradeKey, UpgradeLevels } from "./types";

export const INITIAL_UPGRADE_LEVELS: Readonly<UpgradeLevels> = {
  attackPower: 0,
  attackSpeed: 0,
  critRate: 0,
  critDamage: 0,
  goldBonus: 0,
};

export const INITIAL_COMBAT_STATS: Readonly<CombatStats> = {
  attackPower: 10,
  attackSpeed: 1,
  critRate: 0.05,
  critDamage: 2,
  goldBonus: 0,
};

export const UPGRADE_BASE_COSTS: Readonly<Record<UpgradeKey, number>> = {
  attackPower: 10,
  attackSpeed: 25,
  critRate: 40,
  critDamage: 50,
  goldBonus: 30,
};

export const UPGRADE_MAX_LEVELS: Readonly<Record<UpgradeKey, number | null>> = {
  attackPower: null,
  attackSpeed: 40,
  critRate: 45,
  critDamage: 30,
  goldBonus: 100,
};

export const BOSS_TIME_LIMIT_MS = 30_000;
export const OFFLINE_MAX_DURATION_MS = 8 * 60 * 60 * 1_000;
// v3: 복서 타입·성별 추가. 성별은 외형 전용이라 전투 보정이 없으므로 BALANCE_VERSION은
// 타입 보정을 실제로 적용하는 후속 태스크에서 올린다.
export const SCHEMA_VERSION = 3;
export const BALANCE_VERSION = 2;
export const MAX_SAFE_GAME_INTEGER = Number.MAX_SAFE_INTEGER;

export const BOXER_TYPES = ["INFIGHTER", "OUT_BOXER"] as const satisfies readonly BoxerType[];
export const GENDERS = ["MALE", "FEMALE"] as const satisfies readonly Gender[];

export const DEFAULT_BOXER_TYPE: BoxerType = "INFIGHTER";
export const DEFAULT_GENDER: Gender = "MALE";

// UI 표기용 라벨·한 줄 설명(생성 화면·상태창).
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

// 가정: 타입별 전투 보정 골격. 인파이터=체력·방어·피해감소 높음 / 회피·카운터 낮음,
// 아웃복서=회피·카운터 높음 / 체력·방어 낮음(docs/기획/boxer/types.md).
// 실제 계수는 HP/회피/카운터를 도입하는 후속 태스크에서 확정·적용하며 그때 BALANCE_VERSION을
// 올린다. 지금은 전투에 영향이 없도록 모두 중립(1.0)으로 자리만 잡는다.
export type BoxerTypeModifiers = {
  maxHpMultiplier: number;
  defenseMultiplier: number;
  damageReductionMultiplier: number;
  evasionMultiplier: number;
  counterMultiplier: number;
};

export const BOXER_TYPE_MODIFIERS: Readonly<Record<BoxerType, BoxerTypeModifiers>> = {
  INFIGHTER: {
    maxHpMultiplier: 1.0,
    defenseMultiplier: 1.0,
    damageReductionMultiplier: 1.0,
    evasionMultiplier: 1.0,
    counterMultiplier: 1.0,
  },
  OUT_BOXER: {
    maxHpMultiplier: 1.0,
    defenseMultiplier: 1.0,
    damageReductionMultiplier: 1.0,
    evasionMultiplier: 1.0,
    counterMultiplier: 1.0,
  },
};
