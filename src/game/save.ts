import { getStageDefinition } from "../data/stages";
import { isSkillEquippableFor, isPassiveSkill, SKILLS_BY_ID } from "../data/skills";
import {
  ACTIVE_SKILL_SLOT_MAX,
  BALANCE_VERSION,
  BOXER_TYPES,
  GENDERS,
  QUEST_MILESTONE_THRESHOLDS,
  SCHEMA_VERSION,
  UPGRADE_MAX_LEVELS,
} from "./constants";
import type {
  Boxer,
  BoxerType,
  EquippedSkills,
  Gender,
  QuestState,
  SaveDataV8,
  SkillId,
  StagePosition,
  UpgradeKey,
  UpgradeLevels,
} from "./types";

export const SAVE_KEY = "boxer-game.save.v8";
// 가정: 통합 이전 두 라인의 구버전 저장(v7=재화·레벨·퀘스트, v6=스킬, v5~v1)은 자동 마이그레이션하지 않고
// 삭제·덮어쓰기 없이 legacy로만 안내한다. 마이그레이션을 택한다면 누락 필드(equippedSkills/questState 등)에
// 초기값을 부여해 v8로 승격하는 방안이 가능하지만, 개발 중 스키마 변동이 잦아 새 게임 진입을 기본으로 둔다.
export const LEGACY_SAVE_KEYS = [
  "boxer-game.save.v7",
  "boxer-game.save.v6",
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
  // TASK-021(P3): 퀘스트 진행 상태(저장 대상). 미존재 저장(레거시)이나 로드 중 누락은 isQuestState로 거부한다.
  questState: QuestState;
};

export type LoadGameResult =
  | { status: "loaded"; data: SaveDataV8 }
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

// TASK-019: 플레이어 레벨은 1 이상의 안전한 정수(0/음수/비정수/비유한 거부).
function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
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
    // TASK-019(P3): 재화·플레이어 레벨/경험치. 유한·세이프정수 범위 검증(누락/NaN/Infinity/음수/playerLevel<1 거부).
    isSafeNonNegativeInteger(boxer.diamond) &&
    isSafePositiveInteger(boxer.playerLevel) &&
    isSafeNonNegativeInteger(boxer.playerExp) &&
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

function isNonNegIntRecord(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).every(isSafeNonNegativeInteger);
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === "boolean");
}

// TASK-021(P3): 퀘스트 상태 타입가드. 누락/형 불일치/NaN/음수는 거부(로드 시 invalid).
function isQuestState(value: unknown): value is QuestState {
  if (typeof value !== "object" || value === null) return false;
  const q = value as Record<string, unknown>;
  if (!isNonNegIntRecord(q.progress)) return false;
  if (!isBooleanRecord(q.claimed)) return false;
  if (!isSafeNonNegativeInteger(q.dailyPoints)) return false;
  if (
    !Array.isArray(q.milestonesClaimed) ||
    !q.milestonesClaimed.every(
      (m) => isSafeNonNegativeInteger(m) && (QUEST_MILESTONE_THRESHOLDS as readonly number[]).includes(m),
    )
  ) {
    return false;
  }
  const snapshot = q.dailySnapshot as Record<string, unknown> | undefined;
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    !isSafeNonNegativeInteger(snapshot.killMonster) ||
    !isSafeNonNegativeInteger(snapshot.autoBattleMinutes)
  ) {
    return false;
  }
  const resetAt = q.resetAt as Record<string, unknown> | undefined;
  return (
    typeof resetAt === "object" &&
    resetAt !== null &&
    isSafeNonNegativeInteger(resetAt.daily) &&
    isSafeNonNegativeInteger(resetAt.weekly)
  );
}

function isSaveData(value: unknown): value is SaveDataV8 {
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
    (!save.isFarming || (save.position as StagePosition).stage === 4) &&
    isQuestState(save.questState)
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
    (snapshot.isFarming && snapshot.position.stage !== 4) ||
    !isQuestState(snapshot.questState)
  ) {
    return false;
  }

  const data: SaveDataV8 = {
    schemaVersion: SCHEMA_VERSION,
    balanceVersion: BALANCE_VERSION,
    savedAt: now.toISOString(),
    boxer: snapshot.boxer,
    position: snapshot.position,
    isFarming: snapshot.isFarming,
    questState: snapshot.questState,
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
