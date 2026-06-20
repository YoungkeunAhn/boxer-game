import { describe, expect, it } from "vitest";
import {
  getNextStagePosition,
  getPreviousNormalStagePosition,
  getStageDefinition,
} from "./stages";

describe("스테이지 생성", () => {
  it("1장의 일반/보스 데이터와 ID를 생성한다", () => {
    expect(getStageDefinition({ chapter: 1, stage: 1 })).toMatchObject({
      id: "1-1",
      chapterName: "숲 입구",
      monsterName: "앤트",
      isBoss: false,
      maxHp: 30,
      goldReward: 5,
      bossTimeLimitMs: null,
    });
    expect(getStageDefinition({ chapter: 1, stage: 5 })).toMatchObject({
      id: "1-5",
      monsterName: "앤트 보스",
      isBoss: true,
      maxHp: 330,
      goldReward: 50,
      bossTimeLimitMs: 30_000,
    });
  });

  it("챕터 배율을 내림해 적용한다", () => {
    expect(getStageDefinition({ chapter: 2, stage: 1 })).toMatchObject({
      maxHp: 54,
      goldReward: 8,
    });
  });

  it("세 테마를 순환해 4장부터 재사용한다", () => {
    expect(getStageDefinition({ chapter: 2, stage: 1 }).chapterName).toBe("늑대 숲");
    expect(getStageDefinition({ chapter: 3, stage: 1 }).chapterName).toBe("바위 협곡");
    expect(getStageDefinition({ chapter: 4, stage: 1 }).themeId).toBe("forest_entrance");
    expect(getStageDefinition({ chapter: 5, stage: 1 }).themeId).toBe("wolf_forest");
    expect(getStageDefinition({ chapter: 6, stage: 1 }).themeId).toBe("rock_canyon");
  });

  it("일반, 보스, 다음 장의 스테이지 전이를 계산한다", () => {
    expect(getNextStagePosition({ chapter: 1, stage: 1 })).toEqual({ chapter: 1, stage: 2 });
    expect(getNextStagePosition({ chapter: 1, stage: 5 })).toEqual({ chapter: 2, stage: 1 });
    expect(getPreviousNormalStagePosition(7)).toEqual({ chapter: 7, stage: 4 });
  });

  it("잘못된 위치는 거부한다", () => {
    expect(() => getStageDefinition({ chapter: 0, stage: 1 })).toThrow(RangeError);
    expect(() => getStageDefinition({ chapter: 1, stage: 6 })).toThrow(RangeError);
  });
});
