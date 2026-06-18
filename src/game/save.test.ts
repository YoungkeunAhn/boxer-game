import { describe, expect, it } from "vitest";
import type { GameState } from "./types";
import { loadGame, SAVE_KEY, saveGame, type StorageAdapter } from "./save";

function createMemoryStorage(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const state: GameState = {
  boxer: {
    id: "player",
    name: "저장 복서",
    level: 1,
    stats: { health: 10, attack: 12, defense: 10, speed: 10 },
    money: 50,
    fame: 5,
    defeatedOpponentIds: ["street_thug"],
  },
  lastBattleResult: null,
  message: null,
};

describe("저장과 불러오기", () => {
  it("저장한 복서 진행도를 복원한다", () => {
    const storage = createMemoryStorage();
    expect(saveGame(state, storage, new Date("2026-01-01T00:00:00.000Z"))).toBe(true);

    const loaded = loadGame(storage);
    expect(loaded?.boxer).toEqual(state.boxer);
  });

  it("손상된 저장 데이터에는 안전하게 null을 반환한다", () => {
    const storage = createMemoryStorage();
    storage.setItem(SAVE_KEY, "{not-json");
    expect(loadGame(storage)).toBeNull();
  });

  it("지원하지 않는 스키마 버전을 불러오지 않는다", () => {
    const storage = createMemoryStorage();
    saveGame(state, storage);
    const serialized = storage.getItem(SAVE_KEY);
    if (!serialized) throw new Error("저장 데이터가 없습니다.");
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...JSON.parse(serialized), schemaVersion: 999 }),
    );

    expect(loadGame(storage)).toBeNull();
  });
});

