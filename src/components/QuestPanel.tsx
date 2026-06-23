import { useEffect, useState } from "react";
import {
  QUEST_CATALOG,
  QUEST_MILESTONE_REWARDS,
  QUEST_MILESTONE_THRESHOLDS,
} from "../game/constants";
import {
  claimableMilestones,
  isQuestClaimable,
  isQuestComplete,
  questProgress,
  type QuestCumulativeSource,
} from "../game/quests";
import { dailyResetRemainingMs, nextWeeklyResetAt } from "../game/progress";
import { formatCompactNumber } from "../game/format";
import type { Boxer, QuestCategory, QuestDef, QuestReward, QuestState } from "../game/types";
import { useGameStore } from "../stores/gameStore";
import styles from "./QuestPanel.module.css";

type QuestPanelProps = {
  boxer: Boxer;
  // 파이터 탭으로 이동하는 라우팅 콜백([이동] 버튼). 강화/스테이지/처치 목표 → 파이터.
  onNavigateFighter: () => void;
};

const CATEGORY_TABS: { id: QuestCategory; label: string }[] = [
  { id: "daily", label: "일일" },
  { id: "weekly", label: "주간" },
  { id: "challenge", label: "도전" },
  { id: "achievement", label: "업적" },
];

const MILESTONE_MAX = QUEST_MILESTONE_THRESHOLDS[QUEST_MILESTONE_THRESHOLDS.length - 1];

function formatReward(reward: QuestReward): string {
  const parts: string[] = [];
  if (reward.gold) parts.push(`🪙${formatCompactNumber(reward.gold)}`);
  if (reward.diamond) parts.push(`💎${formatCompactNumber(reward.diamond)}`);
  return parts.join(" ") || "-";
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1_000));
  const h = Math.floor(total / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function QuestPanel({ boxer, onNavigateFighter }: QuestPanelProps) {
  const questState = useGameStore((state) => state.questState);
  const claimQuest = useGameStore((state) => state.claimQuest);
  const claimMilestone = useGameStore((state) => state.claimMilestone);
  const getNow = useGameStore((state) => state.getNow);

  const [activeCategory, setActiveCategory] = useState<QuestCategory>("daily");
  // 일일 리셋 타이머 1초 갱신(주입 now 기준 — Date.now 직접 호출 안 함).
  const [now, setNow] = useState<number>(() => getNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(getNow()), 1_000);
    return () => window.clearInterval(id);
  }, [getNow]);

  const source: QuestCumulativeSource = { killMonster: boxer.totalKills };
  const quests = QUEST_CATALOG.filter((q) => q.category === activeCategory);
  const milestones = claimableMilestones(questState);

  return (
    <section className={styles.panel} aria-labelledby="quest-title" data-testid="quest-panel">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>QUESTS</p>
          <h2 className={styles.title} id="quest-title">퀘스트</h2>
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className={styles.tabs} role="tablist" aria-label="퀘스트 카테고리">
        {CATEGORY_TABS.map(({ id, label }) => {
          const isActive = id === activeCategory;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
              data-testid={`quest-tab-${id}`}
              onClick={() => setActiveCategory(id)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 일일 마일스톤 진행 바(일일 탭에서만) */}
      {activeCategory === "daily" && (
        <MilestoneBar
          questState={questState}
          claimable={milestones}
          remainingMs={dailyResetRemainingMs(now)}
          onClaim={claimMilestone}
        />
      )}

      {/* 퀘스트 리스트 */}
      <ul className={styles.list} data-testid="quest-list">
        {quests.map((def) => (
          <QuestRow
            key={def.id}
            def={def}
            questState={questState}
            source={source}
            onClaim={() => claimQuest(def.id)}
            onNavigate={onNavigateFighter}
          />
        ))}
      </ul>

      <p className={styles.footnote}>
        {activeCategory === "daily"
          ? "일일 퀘스트는 매일 00:00에 초기화됩니다."
          : activeCategory === "weekly"
            ? `주간 퀘스트는 매주 월요일 00:00에 초기화됩니다. (${formatRemaining(
                Math.max(0, nextWeeklyResetAt(now) - now),
              )} 남음)`
            : "도전·업적 퀘스트는 영구적으로 누적됩니다."}
      </p>
    </section>
  );
}

type MilestoneBarProps = {
  questState: QuestState;
  claimable: number[];
  remainingMs: number;
  onClaim: (threshold: number) => void;
};

function MilestoneBar({ questState, claimable, remainingMs, onClaim }: MilestoneBarProps) {
  const ratio = Math.min(1, questState.dailyPoints / MILESTONE_MAX);
  return (
    <div className={styles.milestone} data-testid="quest-milestone">
      <div className={styles.milestoneHeader}>
        <span>📅 일일 퀘스트 진행도</span>
        <span data-testid="quest-milestone-points">
          {questState.dailyPoints} / {MILESTONE_MAX}
        </span>
        <span className={styles.milestoneTimer} data-testid="quest-daily-timer">
          ⏱ {formatRemaining(remainingMs)}
        </span>
      </div>
      <div
        className={styles.milestoneTrack}
        role="progressbar"
        aria-label="일일 퀘스트 진행도"
        aria-valuemin={0}
        aria-valuemax={MILESTONE_MAX}
        aria-valuenow={questState.dailyPoints}
      >
        <div className={styles.milestoneFill} style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className={styles.milestoneBoxes}>
        {QUEST_MILESTONE_THRESHOLDS.map((threshold) => {
          const claimed = questState.milestonesClaimed.includes(threshold);
          const canClaim = claimable.includes(threshold);
          const reward = QUEST_MILESTONE_REWARDS[threshold];
          return (
            <button
              key={threshold}
              type="button"
              className={`${styles.milestoneBox} ${canClaim ? styles.milestoneBoxReady : ""}`}
              data-testid={`quest-milestone-${threshold}`}
              data-state={claimed ? "claimed" : canClaim ? "ready" : "locked"}
              disabled={!canClaim}
              onClick={() => onClaim(threshold)}
              title={reward ? formatReward(reward) : undefined}
            >
              <span className={styles.milestoneValue}>{threshold}</span>
              <span className={styles.milestoneIcon} aria-hidden="true">
                {claimed ? "✓" : "🎁"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type QuestRowProps = {
  def: QuestDef;
  questState: QuestState;
  source: QuestCumulativeSource;
  onClaim: () => void;
  onNavigate: () => void;
};

function QuestRow({ def, questState, source, onClaim, onNavigate }: QuestRowProps) {
  const current = Math.min(def.target, questProgress(questState, def, source));
  const complete = isQuestComplete(questState, def, source);
  const claimable = isQuestClaimable(questState, def, source);
  const claimed = Boolean(questState.claimed[def.id]);
  const ratio = def.target > 0 ? Math.min(1, current / def.target) : 0;

  // 버튼 3상태: 이동(미완료) / 수령(완료·미수령) / ✓(수령 완료, 비활성).
  let buttonLabel: string;
  let buttonState: "move" | "claim" | "done";
  let onClick: () => void;
  if (claimed) {
    buttonLabel = "✓";
    buttonState = "done";
    onClick = () => undefined;
  } else if (claimable) {
    buttonLabel = "수령";
    buttonState = "claim";
    onClick = onClaim;
  } else {
    buttonLabel = "이동";
    buttonState = "move";
    onClick = onNavigate;
  }

  return (
    <li className={styles.row} data-testid={`quest-row-${def.id}`} data-complete={complete || undefined}>
      <div className={styles.rowMain}>
        <div className={styles.rowHead}>
          <strong className={styles.rowTitle}>{def.title}</strong>
          <span className={styles.rowReward}>{formatReward(def.reward)}</span>
        </div>
        <p className={styles.rowDesc}>{def.description}</p>
        <div className={styles.rowProgress}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${ratio * 100}%` }} />
          </div>
          <span className={styles.progressText} data-testid={`quest-progress-${def.id}`}>
            {formatCompactNumber(current)} / {formatCompactNumber(def.target)}
          </span>
        </div>
      </div>
      <button
        type="button"
        className={styles.rowButton}
        data-testid={`quest-button-${def.id}`}
        data-state={buttonState}
        disabled={buttonState === "done"}
        onClick={onClick}
      >
        {buttonLabel}
      </button>
    </li>
  );
}
