// TASK-021(P3): 퀘스트 진행 추적·리셋·수령·마일스톤 — 순수 로직(주입 now, Date.now 금지).
//   정의(QuestDef)는 정적 카탈로그(constants.QUEST_CATALOG), 상태(QuestState)는 저장 대상이다.
//   진행값 모델:
//     - 이벤트형 목표(stageClear/bossClear/upgradeStat/claimFreeChest/playerLevelUp/autoBattleMinutes):
//       이벤트 발생 시 progress[questId]를 직접 증가시킨다(progress에 저장 → 라운드트립 보존).
//       autoBattleMinutes는 스토어가 온라인 게임시간을 분으로 환산해 addQuestProgress로 증가시킨다(오프라인 제외 — 가정).
//     - 누적형 목표(killMonster): boxer.totalKills 같은 비리셋 누적값을 일일 시작 스냅샷(dailySnapshot)
//       기준 증분으로 파생한다(progress에 저장하지 않음 — totalKills는 boxer에 이미 저장돼 라운드트립됨).
//   보상은 골드·다이아만. 중복 수령은 claimed로, 마일스톤은 milestonesClaimed로 막는다.

import {
  MAX_SAFE_GAME_INTEGER,
  QUEST_CATALOG,
  QUEST_MILESTONE_REWARDS,
  QUEST_MILESTONE_THRESHOLDS,
} from "./constants";
import { nextDailyResetAt, nextWeeklyResetAt } from "./progress";
import type {
  QuestCategory,
  QuestDef,
  QuestGoalType,
  QuestReward,
  QuestState,
} from "./types";

// 누적형 목표(killMonster)가 참조하는 외부 누적값(스냅샷 기준 증분 계산용).
export type QuestCumulativeSource = {
  killMonster: number; // boxer.totalKills.
};

const DAILY_CATEGORY: QuestCategory = "daily";
const WEEKLY_CATEGORY: QuestCategory = "weekly";

function clampNonNegInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_SAFE_GAME_INTEGER, Math.max(0, Math.floor(value)));
}

// 카탈로그 조회 헬퍼.
export function getQuestDef(id: string): QuestDef | undefined {
  return QUEST_CATALOG.find((q) => q.id === id);
}

export function questsByCategory(category: QuestCategory): readonly QuestDef[] {
  return QUEST_CATALOG.filter((q) => q.category === category);
}

// 누적형(스냅샷 증분) 목표 여부. 일일 killMonster만 boxer.totalKills의 일일 시작 스냅샷 기준 증분으로 파생한다.
//   주간/도전/업적의 killMonster는 progress에 직접 누적(addQuestProgress)해 카테고리 리셋이 정확히 동작하게 한다.
export function isCumulativeGoal(def: QuestDef): boolean {
  return def.goalType === "killMonster" && def.category === DAILY_CATEGORY;
}

// 스냅샷의 키별 "현재 누적값"을 만든다(일일 시작 기준점 저장용).
//   autoBattleMinutes는 progress에 직접 누적하므로 스냅샷 차감은 안 하지만, 형 안정/구버전 호환을 위해 0으로 둔다.
function cumulativeSnapshot(source: QuestCumulativeSource): QuestState["dailySnapshot"] {
  return {
    killMonster: clampNonNegInt(source.killMonster),
    autoBattleMinutes: 0,
  };
}

// 퀘스트 한 개의 현재 진행값(0~target 클램프 전 원시값). 완료/표시는 이 값을 target과 비교한다.
export function questProgress(
  state: QuestState,
  def: QuestDef,
  source: QuestCumulativeSource,
): number {
  if (isCumulativeGoal(def)) {
    // 일일 killMonster: 일일 시작 스냅샷 기준 증분.
    const raw = clampNonNegInt(source.killMonster);
    return Math.max(0, raw - (state.dailySnapshot.killMonster ?? 0));
  }
  return clampNonNegInt(state.progress[def.id] ?? 0);
}

export function isQuestComplete(
  state: QuestState,
  def: QuestDef,
  source: QuestCumulativeSource,
): boolean {
  return questProgress(state, def, source) >= def.target;
}

export function isQuestClaimable(
  state: QuestState,
  def: QuestDef,
  source: QuestCumulativeSource,
): boolean {
  return isQuestComplete(state, def, source) && !state.claimed[def.id];
}

// === 초기화·리셋 ===

// 리셋 시각만 가진 빈 상태를 만든다(주입 now·누적 소스 기준 일일 스냅샷 포함).
export function createInitialQuestState(
  now: number,
  source: QuestCumulativeSource,
): QuestState {
  return {
    progress: {},
    claimed: {},
    dailyPoints: 0,
    milestonesClaimed: [],
    dailySnapshot: cumulativeSnapshot(source),
    resetAt: {
      daily: nextDailyResetAt(now),
      weekly: nextWeeklyResetAt(now),
    },
  };
}

// 카테고리별 progress·claimed만 비우고 다른 카테고리는 보존한다.
function clearCategory(
  record: Record<string, boolean | number>,
  category: QuestCategory,
): Record<string, never> {
  const next: Record<string, never> = {} as Record<string, never>;
  for (const [id, value] of Object.entries(record)) {
    const def = getQuestDef(id);
    if (def && def.category === category) continue;
    (next as Record<string, unknown>)[id] = value;
  }
  return next;
}

// now가 일일/주간 리셋 시각을 지났으면 해당 카테고리를 초기화하고 다음 리셋 시각을 갱신한다.
//   순수 함수: 같은 (state, now, source)면 항상 같은 결과. 변경이 없으면 동일 객체를 반환한다.
export function applyQuestResets(
  state: QuestState,
  now: number,
  source: QuestCumulativeSource,
): QuestState {
  let next = state;

  if (now >= state.resetAt.daily) {
    const progress = clearCategory(next.progress, DAILY_CATEGORY) as Record<string, number>;
    const claimed = clearCategory(next.claimed, DAILY_CATEGORY) as Record<string, boolean>;
    next = {
      ...next,
      progress,
      claimed,
      dailyPoints: 0,
      milestonesClaimed: [],
      // 일일 시작 스냅샷을 현재 누적값으로 재설정(이후 증분이 0부터 시작).
      dailySnapshot: cumulativeSnapshot(source),
      resetAt: { ...next.resetAt, daily: nextDailyResetAt(now) },
    };
  }

  if (now >= state.resetAt.weekly) {
    const progress = clearCategory(next.progress, WEEKLY_CATEGORY) as Record<string, number>;
    const claimed = clearCategory(next.claimed, WEEKLY_CATEGORY) as Record<string, boolean>;
    next = {
      ...next,
      progress,
      claimed,
      resetAt: { ...next.resetAt, weekly: nextWeeklyResetAt(now) },
    };
  }

  return next;
}

// === 이벤트 진행 ===

// 목표 타입의 progress 저장형 퀘스트를 amount만큼 증가시킨다(target 클램프).
//   대상: stageClear/bossClear/upgradeStat/claimFreeChest/playerLevelUp/autoBattleMinutes,
//         그리고 비일일 killMonster(주간/도전/업적).
//   제외: 일일 killMonster(isCumulativeGoal=true)는 스냅샷 증분으로 파생하므로 progress에 쓰지 않는다.
export function addQuestProgress(
  state: QuestState,
  goalType: QuestGoalType,
  amount = 1,
): QuestState {
  const inc = clampNonNegInt(amount);
  if (inc <= 0) return state;

  let progress = state.progress;
  let changed = false;
  for (const def of QUEST_CATALOG) {
    if (def.goalType !== goalType || isCumulativeGoal(def)) continue;
    // 이미 완료(=target 도달)면 더 증가시키지 않는다(불필요한 증가 방지·표시 안정).
    const current = clampNonNegInt(progress[def.id] ?? 0);
    if (current >= def.target) continue;
    if (!changed) {
      progress = { ...progress };
      changed = true;
    }
    progress[def.id] = Math.min(def.target, current + inc);
  }

  return changed ? { ...state, progress } : state;
}

// === 수령 ===

export type ClaimQuestResult = {
  state: QuestState;
  reward: QuestReward;
  claimed: boolean;
};

// 퀘스트 보상 수령. 완료·미수령일 때만 보상을 지급하고 claimed=true + 일일 점수(points) 가산.
//   순수 함수: 다이아/골드 가산은 호출 측(스토어)이 boxer에 적용한다(이 함수는 reward만 반환).
export function claimQuest(
  state: QuestState,
  questId: string,
  source: QuestCumulativeSource,
): ClaimQuestResult {
  const def = getQuestDef(questId);
  if (!def || !isQuestClaimable(state, def, source)) {
    return { state, reward: {}, claimed: false };
  }
  // 일일 진행 점수는 일일 퀘스트만 마일스톤에 기여한다(주간/도전/업적의 points는 0).
  const dailyPoints =
    def.category === DAILY_CATEGORY
      ? clampNonNegInt(state.dailyPoints + def.points)
      : state.dailyPoints;
  return {
    state: {
      ...state,
      claimed: { ...state.claimed, [questId]: true },
      dailyPoints,
    },
    reward: { ...def.reward },
    claimed: true,
  };
}

// === 마일스톤 ===

// 누적 점수로 수령 가능한 마일스톤 구간 목록(미수령 + dailyPoints 도달).
export function claimableMilestones(state: QuestState): number[] {
  return QUEST_MILESTONE_THRESHOLDS.filter(
    (threshold) =>
      state.dailyPoints >= threshold && !state.milestonesClaimed.includes(threshold),
  );
}

export type ClaimMilestoneResult = {
  state: QuestState;
  reward: QuestReward;
  claimed: boolean;
};

// 마일스톤 상자 수령(구간별 별도). 점수 도달·미수령일 때만 보상 지급 + milestonesClaimed 기록.
export function claimMilestone(state: QuestState, threshold: number): ClaimMilestoneResult {
  const reward = QUEST_MILESTONE_REWARDS[threshold];
  if (
    !reward ||
    state.dailyPoints < threshold ||
    state.milestonesClaimed.includes(threshold)
  ) {
    return { state, reward: {}, claimed: false };
  }
  return {
    state: {
      ...state,
      milestonesClaimed: [...state.milestonesClaimed, threshold].sort((a, b) => a - b),
    },
    reward: { ...reward },
    claimed: true,
  };
}

// === 뱃지 ===

// 완료·미수령 퀘스트가 하나라도 있거나 수령 가능한 마일스톤이 있으면 true(하단 네비 뱃지).
export function hasClaimableQuest(state: QuestState, source: QuestCumulativeSource): boolean {
  if (claimableMilestones(state).length > 0) return true;
  return QUEST_CATALOG.some((def) => isQuestClaimable(state, def, source));
}
