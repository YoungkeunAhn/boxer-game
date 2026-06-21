import { describe, expect, it } from "vitest";
import { BALANCE_VERSION, INITIAL_UPGRADE_LEVELS, SCHEMA_VERSION } from "./constants";
import {
  clearGame,
  LEGACY_SAVE_KEY,
  LEGACY_SAVE_KEYS,
  loadGame,
  SAVE_KEY,
  saveGame,
  type SaveSnapshot,
  type StorageAdapter,
} from "./save";

function createMemoryStorage(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

// 아웃복서 기본 장착 스킬(constants.DEFAULT_EQUIPPED_SKILLS.OUT_BOXER와 동일).
const OUT_BOXER_SKILLS = {
  active: ["phantom_jab", "ghost_step", "navi_step"] as const,
  passive: "step_back_counter" as const,
};

const snapshot: SaveSnapshot = {
  boxer: {
    id: "player",
    name: "저장 복서",
    boxerType: "OUT_BOXER",
    gender: "FEMALE",
    gold: 123,
    totalKills: 9,
    upgradeLevels: { ...INITIAL_UPGRADE_LEVELS, attackPower: 2, dodge: 1, counter: 1 },
    equippedSkills: { active: [...OUT_BOXER_SKILLS.active], passive: OUT_BOXER_SKILLS.passive },
  },
  position: { chapter: 4, stage: 2 },
  isFarming: false,
};

describe("v6 저장과 불러오기", () => {
  it("저장 데이터를 v6 키에 기록하고 장착 스킬까지 복원한다", () => {
    const storage = createMemoryStorage();
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(SAVE_KEY).toBe("boxer-game.save.v6");
    expect(saveGame(snapshot, storage, now)).toBe(true);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    expect(loadGame(storage)).toEqual({
      status: "loaded",
      data: expect.objectContaining({
        schemaVersion: SCHEMA_VERSION,
        balanceVersion: BALANCE_VERSION,
        savedAt: now.toISOString(),
        boxer: snapshot.boxer,
        position: snapshot.position,
        isFarming: false,
      }),
    });
  });

  it.each(LEGACY_SAVE_KEYS)(
    "v6가 없고 구버전(%s)이 있으면 삭제하지 않고 legacy로 분류한다",
    (legacyKey) => {
      const storage = createMemoryStorage();
      storage.setItem(legacyKey, "legacy-data");
      expect(loadGame(storage)).toEqual({ status: "legacy" });
      expect(storage.getItem(legacyKey)).toBe("legacy-data");
    },
  );

  it("equippedSkills가 없는 v5 저장은 마이그레이션하지 않고 legacy로 안내한다", () => {
    const storage = createMemoryStorage();
    // LEGACY_SAVE_KEY는 이제 v5다. v6 활성 키가 없으면 legacy로 분류한다.
    storage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
      schemaVersion: 5, balanceVersion: 7, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: { chapter: 1, stage: 1 }, isFarming: false,
    }));
    expect(loadGame(storage)).toEqual({ status: "legacy" });
    expect(storage.getItem(LEGACY_SAVE_KEY)).not.toBeNull();
  });

  it("4스테이지 반복 파밍 모드를 저장하고 그대로 복원한다", () => {
    const storage = createMemoryStorage();
    const farming = {
      ...snapshot,
      position: { chapter: 3, stage: 4 },
      isFarming: true,
    };
    expect(saveGame(farming, storage)).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded).toEqual({ status: "loaded", data: expect.objectContaining(farming) });
  });

  it.each([
    ["손상된 JSON", "{not-json"],
    ["지원하지 않는 스키마(v5)", JSON.stringify({
      schemaVersion: 5, balanceVersion: 7, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: snapshot.position, isFarming: false,
    })],
    ["지원하지 않는 밸런스", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: 999, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: snapshot.position, isFarming: false,
    })],
    ["잘못된 골드", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, gold: Number.POSITIVE_INFINITY }, position: snapshot.position, isFarming: false,
    })],
    ["회피 강화 누락", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, upgradeLevels: { ...INITIAL_UPGRADE_LEVELS, dodge: undefined } },
      position: snapshot.position, isFarming: false,
    })],
    ["음수 처치 수", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, totalKills: -1 }, position: snapshot.position, isFarming: false,
    })],
    ["알 수 없는 복서 타입", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, boxerType: "SLUGGER" }, position: snapshot.position, isFarming: false,
    })],
    ["잘못된 스테이지", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: { chapter: 1, stage: 6 }, isFarming: false,
    })],
    ["equippedSkills 누락", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, equippedSkills: undefined }, position: snapshot.position, isFarming: false,
    })],
    ["교차 타입 스킬 장착(아웃복서에 인파이터 스킬)", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, equippedSkills: { active: ["liver_shot"], passive: null } },
      position: snapshot.position, isFarming: false,
    })],
    ["액티브 슬롯 초과(4종)", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: {
        ...snapshot.boxer,
        equippedSkills: { active: ["phantom_jab", "ghost_step", "navi_step", "distance_control"], passive: null },
      },
      position: snapshot.position, isFarming: false,
    })],
    ["패시브 슬롯에 액티브 스킬", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, equippedSkills: { active: [], passive: "phantom_jab" } },
      position: snapshot.position, isFarming: false,
    })],
  ])("%s 저장을 invalid로 분류하고 원문을 유지한다", (_name, serialized) => {
    const storage = createMemoryStorage();
    storage.setItem(SAVE_KEY, serialized);
    expect(loadGame(storage)).toEqual({ status: "invalid" });
    expect(storage.getItem(SAVE_KEY)).toBe(serialized);
  });

  it("저장소 접근이나 쓰기 실패를 안전하게 보고한다", () => {
    expect(loadGame(null)).toEqual({ status: "unavailable" });
    expect(saveGame(snapshot, null)).toBe(false);
    expect(saveGame(snapshot, {
      getItem: () => null,
      setItem: () => { throw new Error("쓰기 실패"); },
      removeItem: () => undefined,
    })).toBe(false);
  });

  it("4스테이지 외 파밍 상태나 잘못된 파밍 값을 저장하지 않는다", () => {
    const storage = createMemoryStorage();
    expect(saveGame({
      ...snapshot,
      position: { chapter: 1, stage: 5 },
      isFarming: true,
    }, storage)).toBe(false);
    expect(saveGame({
      ...snapshot,
      isFarming: "yes" as unknown as boolean,
    }, storage)).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });

  it("v6를 삭제해도 구버전(v5/v4/v3/v2/v1)은 보존한다", () => {
    const storage = createMemoryStorage();
    for (const legacyKey of LEGACY_SAVE_KEYS) storage.setItem(legacyKey, "legacy-data");
    saveGame(snapshot, storage);
    expect(clearGame(storage)).toBe(true);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    for (const legacyKey of LEGACY_SAVE_KEYS) {
      expect(storage.getItem(legacyKey)).toBe("legacy-data");
    }
  });

  it("활성 저장 삭제 실패 시 false를 반환한다", () => {
    const storage = createMemoryStorage();
    saveGame(snapshot, storage);
    expect(clearGame({
      getItem: storage.getItem,
      setItem: storage.setItem,
      removeItem: (key) => {
        if (key === SAVE_KEY) throw new Error("삭제 실패");
        storage.removeItem(key);
      },
    })).toBe(false);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
  });
});
