import type { Boxer, GameState, SaveData, Stats } from "./types";

export const SAVE_KEY = "boxer-game.save.v1";
const TEMP_SAVE_KEY = `${SAVE_KEY}.temp`;
export const SCHEMA_VERSION = 1;
export const BALANCE_VERSION = 1;

export type StorageAdapter = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

function getBrowserStorage(): StorageAdapter | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isStats(value: unknown): value is Stats {
  if (typeof value !== "object" || value === null) return false;
  const stats = value as Record<string, unknown>;
  return ["health", "attack", "defense", "speed"].every((key) =>
    isFiniteNonNegativeNumber(stats[key]),
  );
}

function isBoxer(value: unknown): value is Boxer {
  if (typeof value !== "object" || value === null) return false;
  const boxer = value as Record<string, unknown>;

  return (
    typeof boxer.id === "string" &&
    typeof boxer.name === "string" &&
    boxer.name.trim().length > 0 &&
    isFiniteNonNegativeNumber(boxer.level) &&
    isStats(boxer.stats) &&
    isFiniteNonNegativeNumber(boxer.money) &&
    isFiniteNonNegativeNumber(boxer.fame) &&
    Array.isArray(boxer.defeatedOpponentIds) &&
    boxer.defeatedOpponentIds.every((id) => typeof id === "string")
  );
}

function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Record<string, unknown>;

  return (
    save.schemaVersion === SCHEMA_VERSION &&
    isFiniteNonNegativeNumber(save.balanceVersion) &&
    typeof save.savedAt === "string" &&
    !Number.isNaN(Date.parse(save.savedAt)) &&
    isBoxer(save.boxer)
  );
}

export function saveGame(
  state: GameState,
  storage: StorageAdapter | null = getBrowserStorage(),
  now: Date = new Date(),
): boolean {
  if (!storage || !state.boxer) return false;

  const saveData: SaveData = {
    schemaVersion: SCHEMA_VERSION,
    balanceVersion: BALANCE_VERSION,
    savedAt: now.toISOString(),
    boxer: state.boxer,
  };

  try {
    const serialized = JSON.stringify(saveData);
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
): GameState | null {
  if (!storage) return null;

  try {
    const serialized = storage.getItem(SAVE_KEY);
    if (!serialized) return null;
    const parsed: unknown = JSON.parse(serialized);
    if (!isSaveData(parsed)) return null;

    return {
      boxer: parsed.boxer,
      lastBattleResult: null,
      message: "저장된 복서를 불러왔습니다.",
    };
  } catch {
    return null;
  }
}

export function clearGame(
  storage: StorageAdapter | null = getBrowserStorage(),
): boolean {
  if (!storage) return false;

  try {
    storage.removeItem(SAVE_KEY);
    storage.removeItem(TEMP_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

