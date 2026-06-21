import { describe, expect, it } from "vitest";
import {
  addQuestProgress,
  applyQuestResets,
  claimMilestone,
  claimQuest,
  claimableMilestones,
  createInitialQuestState,
  getQuestDef,
  hasClaimableQuest,
  isQuestClaimable,
  isQuestComplete,
  questProgress,
  questsByCategory,
  type QuestCumulativeSource,
} from "./quests";
import { QUEST_CATALOG } from "./constants";
import { nextDailyResetAt, nextWeeklyResetAt } from "./progress";

const NOW = new Date(2026, 5, 21, 12, 0, 0, 0).getTime(); // 로컬 정오.
const SRC0: QuestCumulativeSource = { killMonster: 0 };

function src(killMonster: number): QuestCumulativeSource {
  return { killMonster };
}

describe("TASK-021 퀘스트 초기화·리셋", () => {
  it("초기 상태는 빈 진행 + 주입 now 기준 일일/주간 리셋 시각을 가진다", () => {
    const state = createInitialQuestState(NOW, src(7));
    expect(state.progress).toEqual({});
    expect(state.claimed).toEqual({});
    expect(state.dailyPoints).toBe(0);
    expect(state.milestonesClaimed).toEqual([]);
    // 일일 killMonster 스냅샷은 현재 누적값으로 잡힌다(이후 증분 0부터).
    expect(state.dailySnapshot.killMonster).toBe(7);
    expect(state.resetAt.daily).toBe(nextDailyResetAt(NOW));
    expect(state.resetAt.weekly).toBe(nextWeeklyResetAt(NOW));
  });

  it("같은 (now, source)면 항상 같은 초기 상태를 만든다(순수성·Date.now 미사용)", () => {
    expect(createInitialQuestState(NOW, src(3))).toEqual(createInitialQuestState(NOW, src(3)));
  });

  it("리셋 시각 전이면 진행을 보존한다(변경 없으면 동일 객체 반환)", () => {
    const state = addQuestProgress(createInitialQuestState(NOW, SRC0), "stageClear", 2);
    const after = applyQuestResets(state, NOW + 1_000, SRC0);
    expect(after).toBe(state);
    expect(after.progress.daily_stage_3).toBe(2);
  });

  it("일일 리셋 시각을 지나면 일일 진행/점수/마일스톤/스냅샷을 초기화하고 다음 리셋을 잡는다", () => {
    let state = createInitialQuestState(NOW, src(10));
    state = addQuestProgress(state, "stageClear", 3); // 일일 daily_stage_3.
    state = addQuestProgress(state, "upgradeStat", 50); // 일일+도전 동시.
    state = { ...state, dailyPoints: 40, milestonesClaimed: [20, 40] };
    const past = state.resetAt.daily + 1;
    const after = applyQuestResets(state, past, src(25));
    // 일일 퀘스트 진행은 비워지고, 도전(challenge_upgrade_50)은 보존된다.
    expect(after.progress.daily_stage_3).toBeUndefined();
    expect(after.progress.daily_upgrade_5).toBeUndefined();
    expect(after.progress.challenge_upgrade_50).toBe(50);
    expect(after.dailyPoints).toBe(0);
    expect(after.milestonesClaimed).toEqual([]);
    // 일일 스냅샷이 현재 누적값(25)으로 재설정된다(방치 자동 달성 방지 — 가정).
    expect(after.dailySnapshot.killMonster).toBe(25);
    expect(after.resetAt.daily).toBe(nextDailyResetAt(past));
  });

  it("주간 리셋만 지나면(일일 리셋 전) 주간 진행만 초기화하고 일일/업적은 보존한다", () => {
    let state = createInitialQuestState(NOW, SRC0);
    state = addQuestProgress(state, "bossClear", 3); // weekly_boss_5 + achievement_boss_20.
    state = addQuestProgress(state, "stageClear", 2); // daily_stage_3.
    // 주간 리셋만 지나고 일일 리셋은 아직 미래인 상황을 만든다(일일 resetAt를 충분히 미래로 둠).
    const past = state.resetAt.weekly + 1;
    state = { ...state, resetAt: { daily: past + 60_000, weekly: state.resetAt.weekly } };
    const after = applyQuestResets(state, past, SRC0);
    expect(after.progress.weekly_boss_5).toBeUndefined();
    // 업적·일일은 보존(주간 리셋만).
    expect(after.progress.achievement_boss_20).toBe(3);
    expect(after.progress.daily_stage_3).toBe(2);
    expect(after.resetAt.weekly).toBe(nextWeeklyResetAt(past));
  });
});

describe("TASK-021 진행 증분(스냅샷 기준)", () => {
  it("일일 killMonster는 일일 시작 스냅샷 기준 증분으로 파생한다(progress에 저장 안 함)", () => {
    const state = createInitialQuestState(NOW, src(100)); // 스냅샷 100.
    const def = getQuestDef("daily_kill_30")!;
    // 현재 누적 100이면 증분 0.
    expect(questProgress(state, def, src(100))).toBe(0);
    // 누적 120이면 증분 20.
    expect(questProgress(state, def, src(120))).toBe(20);
    // 누적 135면 target(30) 도달 → 완료.
    expect(isQuestComplete(state, def, src(135))).toBe(true);
  });

  it("addQuestProgress는 일일 killMonster(스냅샷형)는 건너뛰고 비일일 killMonster만 누적한다", () => {
    let state = createInitialQuestState(NOW, src(0));
    state = addQuestProgress(state, "killMonster", 5);
    // 일일 daily_kill_30은 progress에 쓰이지 않는다.
    expect(state.progress.daily_kill_30).toBeUndefined();
    // 주간/업적 killMonster는 progress에 누적된다.
    expect(state.progress.weekly_kill_500).toBe(5);
    expect(state.progress.achievement_kill_1000).toBe(5);
  });

  it("이벤트 진행은 target에서 클램프되고 0/음수 증분은 무시한다", () => {
    let state = createInitialQuestState(NOW, SRC0);
    state = addQuestProgress(state, "stageClear", 100); // target 3.
    expect(state.progress.daily_stage_3).toBe(3);
    const same = addQuestProgress(state, "stageClear", 0);
    expect(same).toBe(state);
    const neg = addQuestProgress(state, "stageClear", -5);
    expect(neg).toBe(state);
  });
});

describe("TASK-021 수령·중복 방지·보상", () => {
  it("완료 퀘스트만 수령 가능하고 보상을 반환한다(가산은 호출 측)", () => {
    let state = createInitialQuestState(NOW, SRC0);
    state = addQuestProgress(state, "stageClear", 3); // daily_stage_3 완료.
    const def = getQuestDef("daily_stage_3")!;
    expect(isQuestClaimable(state, def, SRC0)).toBe(true);
    const result = claimQuest(state, "daily_stage_3", SRC0);
    expect(result.claimed).toBe(true);
    expect(result.reward).toEqual(def.reward);
    expect(result.state.claimed.daily_stage_3).toBe(true);
    // 일일 퀘스트는 points만큼 마일스톤 점수 가산.
    expect(result.state.dailyPoints).toBe(def.points);
  });

  it("미완료 또는 이미 수령한 퀘스트는 보상 없이 거부한다(중복 수령 방지)", () => {
    let state = createInitialQuestState(NOW, SRC0);
    // 미완료.
    expect(claimQuest(state, "daily_stage_3", SRC0).claimed).toBe(false);
    state = addQuestProgress(state, "stageClear", 3);
    const first = claimQuest(state, "daily_stage_3", SRC0);
    expect(first.claimed).toBe(true);
    // 두 번째 수령 시도는 거부.
    const second = claimQuest(first.state, "daily_stage_3", SRC0);
    expect(second.claimed).toBe(false);
    expect(second.reward).toEqual({});
  });

  it("존재하지 않는 퀘스트 id는 거부한다", () => {
    const state = createInitialQuestState(NOW, SRC0);
    expect(claimQuest(state, "no_such_quest", SRC0).claimed).toBe(false);
  });
});

describe("TASK-021 마일스톤", () => {
  it("누적 점수 구간 도달 시 마일스톤을 수령하고 중복을 막는다", () => {
    const state = { ...createInitialQuestState(NOW, SRC0), dailyPoints: 45 };
    // 20·40은 수령 가능, 60 이상은 불가.
    expect(claimableMilestones(state)).toEqual([20, 40]);
    const r20 = claimMilestone(state, 20);
    expect(r20.claimed).toBe(true);
    expect(r20.reward.diamond).toBeGreaterThan(0);
    expect(r20.state.milestonesClaimed).toContain(20);
    // 같은 구간 재수령 거부.
    expect(claimMilestone(r20.state, 20).claimed).toBe(false);
    // 점수 미달 구간 거부.
    expect(claimMilestone(state, 60).claimed).toBe(false);
    // 정의되지 않은 구간 거부.
    expect(claimMilestone(state, 33).claimed).toBe(false);
  });
});

describe("TASK-021 뱃지·카탈로그", () => {
  it("완료·미수령 퀘스트나 수령 가능 마일스톤이 있으면 뱃지가 켜진다", () => {
    const empty = createInitialQuestState(NOW, SRC0);
    expect(hasClaimableQuest(empty, SRC0)).toBe(false);
    const withQuest = addQuestProgress(empty, "stageClear", 3);
    expect(hasClaimableQuest(withQuest, SRC0)).toBe(true);
    const withMilestone = { ...empty, dailyPoints: 20 };
    expect(hasClaimableQuest(withMilestone, SRC0)).toBe(true);
  });

  it("일일 퀘스트 points 합계는 마일스톤 만점(100)과 일치한다", () => {
    const dailyPoints = questsByCategory("daily").reduce((sum, q) => sum + q.points, 0);
    expect(dailyPoints).toBe(100);
  });

  it("카탈로그는 보류 목표(enhanceEquip/enhanceTraining)를 채택하지 않는다", () => {
    const goalTypes = QUEST_CATALOG.map((q) => q.goalType);
    expect(goalTypes).not.toContain("enhanceEquip");
    expect(goalTypes).not.toContain("enhanceTraining");
  });

  it("모든 보상은 골드·다이아만 사용한다(아이템·에너지 제외)", () => {
    for (const q of QUEST_CATALOG) {
      const keys = Object.keys(q.reward);
      expect(keys.every((k) => k === "gold" || k === "diamond")).toBe(true);
    }
  });
});
