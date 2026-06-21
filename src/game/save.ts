import { getStageDefinition } from "../data/stages";
import { isSkillEquippableFor, isPassiveSkill, SKILLS_BY_ID } from "../data/skills";
import {
  ACTIVE_SKILL_SLOT_MAX,
  BALANCE_VERSION,
  BOXER_TYPES,
  GENDERS,
  SCHEMA_VERSION,
  UPGRADE_MAX_LEVELS,
} from "./constants";
import type {
  Boxer,
  BoxerType,
  EquippedSkills,
  Gender,
  SaveDataV6,
  SkillId,
  StagePosition,
  UpgradeKey,
  UpgradeLevels,
} from "./types";

export const SAVE_KEY = "boxer-game.save.v6";
// 가정: equippedSkills(또는 회피/카운터·HP/방어 강화)가 없는 구버전 저장(v5~v1)은 자동 마이그레이션하지
// 않고 삭제·덮어쓰기 없이 legacy로만 안내한다. 마이그레이션을 택한다면 누락 필드를 기본값으로 부여해
// v6로 승격하는 방안이 가능하지만, 개발 중 스키마 변동이 잦아 새 게임 진입을 기본으로 둔다(tasks/README 공통 규칙).
export const LEGACY_SAVE_KEYS = [
  "boxer-game.save.v5",
  "boxer-game.save.v4",
  "boxer-game.save.v3",
  "boxer-game.save.v2",
  "boxer-game.save.v1",
] as const;
export const LEGACY_SAVE_KEY = LEGACY_SAVE_KEYS[0];
const TEMP_SAVE_KEY = `${SAVE_KEY}.temp`;

export { BALANCE_VERSION, SCHEMA_VERSION } from "./constants";

export type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SaveSnapshot = {
  boxer: Boxer;
  position: StagePosition;
  isFarming: boolean;
};

export type LoadGameResult =
  | { status: "loaded"; data: SaveDataV6 }
  | { status: "empty" }
  | { status: "legacy" }
  | { status: "invalid" }
  | { status: "unavailable" };

const UPGRADE_KEYS: UpgradeKey[] = [
  "attackPower",
  "attackSpeed",
  "critRate",
  "critDamage",
  "goldBonus",
  // v1.2a: HP/방어 강화 레벨도 검증한다(누락 시 isUpgradeLevels가 false → invalid).
  "maxHp",
  "defense",
  // v1.2b: 회피/카운터 강화 레벨도 검증한다.
  "dodge",
  "counter",
];

function getBrowserStorage(): StorageAdapter | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isUpgradeLevels(value: unknown): value is UpgradeLevels {
  if (typeof value !== "object" || value === null) return false;
  const levels = value as Record<string, unknown>;
  return UPGRADE_KEYS.every((key) => {
    const level = levels[key];
    const max = UPGRADE_MAX_LEVELS[key];
    return isSafeNonNegativeInteger(level) && (max === null || level <= max);
  });
}

function isBoxerType(value: unknown): value is BoxerType {
  return BOXER_TYPES.includes(value as BoxerType);
}

function isGender(value: unknown): value is Gender {
  return GENDERS.includes(value as Gender);
}

function isSkillId(value: unknown): value is SkillId {
  return typeof value === "string" && value in SKILLS_BY_ID;
}

// v1.3d: equippedSkills 검증. 액티브는 이 타입의 액티브 스킬만(슬롯 수 상한·교차 타입·중복 거부),
//   패시브는 null 또는 이 타입의 패시브 스킬 1개만 허용한다. 형태가 어긋나면 false → 저장 invalid.
function isEquippedSkills(value: unknown, boxerType: BoxerType): value is EquippedSkills {
  if (typeof value !== "object" || value === null) return false;
  const equipped = value as Record<string, unknown>;
  const active = equipped.active;
  if (!Array.isArray(active)) return false;
  if (active.length > ACTIVE_SKILL_SLOT_MAX) return false;
  const seen = new Set<SkillId>();
  for (const id of active) {
    if (!isSkillId(id)) return false;
    if (isPassiveSkill(id)) return false; // 액티브 슬롯에 패시브 불가
    if (!isSkillEquippableFor(id, boxerType)) return false; // 교차 타입 불가
    if (seen.has(id)) return false; // 중복 불가
    seen.add(id);
  }
  const passive = equipped.passive;
  if (passive !== null) {
    if (!isSkillId(passive)) return false;
    if (!isPassiveSkill(passive)) return false; // 패시브 슬롯엔 패시브만
    if (!isSkillEquippableFor(passive, boxerType)) return false; // 교차 타입 불가
  }
  return true;
}

function isBoxer(value: unknown): value is Boxer {
  if (typeof value !== "object" || value === null) return false;
  const boxer = value as Record<string, unknown>;
  return (
    typeof boxer.id === "string" &&
    boxer.id.length > 0 &&
    typeof boxer.name === "string" &&
    boxer.name.trim().length > 0 &&
    boxer.name.trim().length <= 16 &&
    isBoxerType(boxer.boxerType) &&
    isGender(boxer.gender) &&
    isSafeNonNegativeInteger(boxer.gold) &&
    isSafeNonNegativeInteger(boxer.totalKills) &&
    isUpgradeLevels(boxer.upgradeLevels) &&
    // v1.3d: equippedSkills 누락·형태 오류·교차타입·슬롯초과는 invalid 처리.
    isEquippedSkills(boxer.equippedSkills, boxer.boxerType as BoxerType)
  );
}

function isStagePosition(value: unknown): value is StagePosition {
  if (typeof value !== "object" || value === null) return false;
  const position = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(position.chapter) ||
    (position.chapter as number) < 1 ||
    !Number.isSafeInteger(position.stage) ||
    (position.stage as number) < 1
  ) return false;

  try {
    getStageDefinition(position as StagePosition);
    return true;
  } catch {
    return false;
  }
}

function isSaveData(value: unknown): value is SaveDataV6 {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Record<string, unknown>;
  return (
    save.schemaVersion === SCHEMA_VERSION &&
    save.balanceVersion === BALANCE_VERSION &&
    typeof save.savedAt === "string" &&
    !Number.isNaN(Date.parse(save.savedAt)) &&
    isBoxer(save.boxer) &&
    isStagePosition(save.position) &&
    typeof save.isFarming === "boolean" &&
    (!save.isFarming || save.position.stage === 4)
  );
}

export function saveGame(
  snapshot: SaveSnapshot,
  storage: StorageAdapter | null = getBrowserStorage(),
  now: Date = new Date(),
): boolean {
  if (
    !storage ||
    !isBoxer(snapshot.boxer) ||
    !isStagePosition(snapshot.position) ||
    typeof snapshot.isFarming !== "boolean" ||
    (snapshot.isFarming && snapshot.position.stage !== 4)
  ) {
    return false;
  }

  const data: SaveDataV6 = {
    schemaVersion: SCHEMA_VERSION,
    balanceVersion: BALANCE_VERSION,
    savedAt: now.toISOString(),
    boxer: snapshot.boxer,
    position: snapshot.position,
    isFarming: snapshot.isFarming,
  };

  try {
    const serialized = JSON.stringify(data);
    storage.setItem(TEMP_SAVE_KEY, serialized);
    storage.setItem(SAVE_KEY, serialized);
    storage.removeItem(TEMP_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadGame(
  storage: StorageAdapter | null = getBrowserStorage(),
): LoadGameResult {
  if (!storage) return { status: "unavailable" };

  try {
    const serialized = storage.getItem(SAVE_KEY);
    if (serialized === null) {
      // 누락 강화가 있는 구버전(v4/v3/v2/v1) 저장은 자동 마이그레이션 불가 → 삭제 없이 legacy로만 안내.
      const hasLegacy = LEGACY_SAVE_KEYS.some((key) => storage.getItem(key) !== null);
      return hasLegacy ? { status: "legacy" } : { status: "empty" };
    }

    const parsed: unknown = JSON.parse(serialized);
    return isSaveData(parsed) ? { status: "loaded", data: parsed } : { status: "invalid" };
  } catch (error) {
    return error instanceof SyntaxError ? { status: "invalid" } : { status: "unavailable" };
  }
}

export function clearGame(
  storage: StorageAdapter | null = getBrowserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(TEMP_SAVE_KEY);
    storage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
