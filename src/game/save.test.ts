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

// TASK-021(P3): isQuestState를 통과하는 유효한 퀘스트 상태(라운드트립·유효 케이스용).
const validQuestState = {
  progress: { daily_stage_3: 1 },
  claimed: { daily_stage_3: false },
  dailyPoints: 20,
  milestonesClaimed: [20],
  dailySnapshot: { killMonster: 5, autoBattleMinutes: 0 },
  resetAt: { daily: 1_900_000_000_000, weekly: 1_900_600_000_000 },
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
    diamond: 250,
    playerLevel: 3,
    playerExp: 17,
  },
  position: { chapter: 4, stage: 2 },
  isFarming: false,
  questState: validQuestState,
};

describe("v7 저장과 불러오기", () => {
  it("저장 데이터를 v7 키에 기록하고 재화·플레이어 레벨·퀘스트까지 복원한다", () => {
    const storage = createMemoryStorage();
    const now = new Date("2026-01-01T00:00:00.000Z");
    // TASK-021: SAVE_KEY는 boxer-game.save.v7, SCHEMA 7.
    expect(SAVE_KEY).toBe("boxer-game.save.v7");
    expect(SCHEMA_VERSION).toBe(7);
    expect(saveGame(snapshot, storage, now)).toBe(true);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    expect(loadGame(storage)).toEqual({
      status: "loaded",
      data: expect.objectContaining({
        schemaVersion: SCHEMA_VERSION,
        balanceVersion: BALANCE_VERSION,
        savedAt: now.toISOString(),
        // diamond/playerLevel/playerExp 포함 boxer 라운드트립 복원.
        boxer: snapshot.boxer,
        position: snapshot.position,
        isFarming: false,
      }),
    });
    // 라운드트립으로 신규 필드가 그대로 복원되는지 명시 검증.
    const loaded = loadGame(storage);
    if (loaded.status !== "loaded") throw new Error("loaded 상태여야 합니다.");
    expect(loaded.data.boxer.diamond).toBe(250);
    expect(loaded.data.boxer.playerLevel).toBe(3);
    expect(loaded.data.boxer.playerExp).toBe(17);
    // TASK-021(P3): 퀘스트 상태 라운드트립 복원.
    expect(loaded.data.questState).toEqual(validQuestState);
  });

  it.each(LEGACY_SAVE_KEYS)(
    "v7이 없고 구버전(%s)이 있으면 삭제하지 않고 legacy로 분류한다",
    (legacyKey) => {
      const storage = createMemoryStorage();
      storage.setItem(legacyKey, "legacy-data");
      expect(loadGame(storage)).toEqual({ status: "legacy" });
      expect(storage.getItem(legacyKey)).toBe("legacy-data");
    },
  );

  it("v6(=LEGACY 최상위)가 LEGACY_SAVE_KEYS 맨 앞에 추가됐고, v6만 있으면 legacy로 안내한다", () => {
    // TASK-021: 옛 v6 저장(questState 없음)은 삭제하지 않고 legacy로 안내한다.
    expect(LEGACY_SAVE_KEYS[0]).toBe("boxer-game.save.v6");
    expect(LEGACY_SAVE_KEY).toBe("boxer-game.save.v6");
    const storage = createMemoryStorage();
    storage.setItem("boxer-game.save.v6", JSON.stringify({
      schemaVersion: 6, balanceVersion: 7, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: { chapter: 1, stage: 1 }, isFarming: false,
    }));
    expect(loadGame(storage)).toEqual({ status: "legacy" });
    expect(storage.getItem("boxer-game.save.v6")).not.toBeNull();
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
    ["지원하지 않는 스키마(v6)", JSON.stringify({
      schemaVersion: 6, balanceVersion: 7, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["지원하지 않는 밸런스", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: 999, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["잘못된 골드", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, gold: Number.POSITIVE_INFINITY }, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["회피 강화 누락", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, upgradeLevels: { ...INITIAL_UPGRADE_LEVELS, dodge: undefined } },
      position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["음수 처치 수", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, totalKills: -1 }, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["알 수 없는 복서 타입", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, boxerType: "SLUGGER" }, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["잘못된 스테이지", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: { chapter: 1, stage: 6 }, isFarming: false, questState: validQuestState,
    })],
    // TASK-019(P3): 신규 필드 검증.
    ["다이아 누락(옛 형태)", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, diamond: undefined }, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["음수 다이아", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, diamond: -1 }, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["비유한 경험치", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, playerExp: Number.POSITIVE_INFINITY }, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["세이프정수 초과 경험치", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, playerExp: Number.MAX_SAFE_INTEGER + 2 }, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["플레이어 레벨 0(1 미만)", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, playerLevel: 0 }, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    ["플레이어 레벨 누락(옛 형태)", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: { ...snapshot.boxer, playerLevel: undefined }, position: snapshot.position, isFarming: false, questState: validQuestState,
    })],
    // TASK-021(P3): 퀘스트 상태 검증.
    ["퀘스트 상태 누락(옛 v6 형태)", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: snapshot.position, isFarming: false,
    })],
    ["퀘스트 진행 음수", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: snapshot.position, isFarming: false,
      questState: { ...validQuestState, progress: { daily_stage_3: -1 } },
    })],
    ["알 수 없는 마일스톤 구간", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: snapshot.position, isFarming: false,
      questState: { ...validQuestState, milestonesClaimed: [33] },
    })],
    ["리셋 시각 누락", JSON.stringify({
      schemaVersion: SCHEMA_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(),
      boxer: snapshot.boxer, position: snapshot.position, isFarming: false,
      questState: { ...validQuestState, resetAt: { daily: 1 } },
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

  it("v7을 삭제해도 구버전(v6/v5/v4/v3/v2/v1)은 보존한다", () => {
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
