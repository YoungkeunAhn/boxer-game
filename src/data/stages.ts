import {
  BALANCE_VERSION,
  BOSS_TIME_LIMIT_MS,
  MAX_SAFE_GAME_INTEGER,
} from "../game/constants";
import type { StageDefinition, StagePosition } from "../game/types";

export const STAGES_BALANCE_VERSION = BALANCE_VERSION;
export const STAGES_PER_CHAPTER = 5;
export const BOSS_STAGE_NUMBER = 5;
export const FARMING_STAGE_NUMBER = 4;

export type StageTheme = {
  id: string;
  chapterName: string;
  monsters: readonly [string, string, string, string, string];
};

export const STAGE_THEMES: readonly StageTheme[] = [
  {
    id: "forest_entrance",
    chapterName: "숲 입구",
    monsters: ["앤트", "앤트", "거대 앤트", "수호 앤트", "앤트 보스"],
  },
  {
    id: "wolf_forest",
    chapterName: "늑대 숲",
    monsters: ["울프", "울프", "울프 전사", "울프 대장", "울프 보스"],
  },
  {
    id: "rock_canyon",
    chapterName: "바위 협곡",
    monsters: ["바위 정령", "바위 정령", "골렘", "철갑 골렘", "거대 골렘"],
  },
] as const;

const BASE_HP = [30, 45, 68, 105, 330] as const;
const BASE_GOLD = [5, 7, 10, 15, 50] as const;

function assertPosition(position: StagePosition): void {
  if (!Number.isSafeInteger(position.chapter) || position.chapter < 1) {
    throw new RangeError("챕터는 1 이상의 안전한 정수여야 합니다.");
  }
  if (
    !Number.isSafeInteger(position.stage) ||
    position.stage < 1 ||
    position.stage > STAGES_PER_CHAPTER
  ) {
    throw new RangeError("스테이지는 1 이상 5 이하여야 합니다.");
  }
}

function scale(base: number, multiplier: number, chapter: number): number {
  const value = base * multiplier ** (chapter - 1);
  return Number.isFinite(value)
    ? Math.min(MAX_SAFE_GAME_INTEGER, Math.floor(value))
    : MAX_SAFE_GAME_INTEGER;
}

export function getStageDefinition(position: StagePosition): StageDefinition {
  assertPosition(position);
  const theme = STAGE_THEMES[(position.chapter - 1) % STAGE_THEMES.length];
  const hp = BASE_HP[position.stage - 1];
  const gold = BASE_GOLD[position.stage - 1];
  if (!theme || hp === undefined || gold === undefined) {
    throw new Error("스테이지 데이터를 찾을 수 없습니다.");
  }
  const isBoss = position.stage === BOSS_STAGE_NUMBER;

  return {
    ...position,
    id: `${position.chapter}-${position.stage}`,
    themeId: theme.id,
    chapterName: theme.chapterName,
    monsterName: theme.monsters[position.stage - 1],
    isBoss,
    maxHp: scale(hp, 1.8, position.chapter),
    goldReward: scale(gold, 1.6, position.chapter),
    bossTimeLimitMs: isBoss ? BOSS_TIME_LIMIT_MS : null,
  };
}

export function getNextStagePosition(position: StagePosition): StagePosition {
  assertPosition(position);
  return position.stage === STAGES_PER_CHAPTER
    ? { chapter: position.chapter + 1, stage: 1 }
    : { chapter: position.chapter, stage: position.stage + 1 };
}

export function getPreviousNormalStagePosition(chapter: number): StagePosition {
  assertPosition({ chapter, stage: FARMING_STAGE_NUMBER });
  return { chapter, stage: FARMING_STAGE_NUMBER };
}
