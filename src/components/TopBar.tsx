import { useEffect, useState } from "react";
import { formatCountdown } from "../game/format";
import type { Boxer } from "../game/types";
import {
  selectDailyResetRemainingMs,
  selectExpProgress,
  selectExpToNext,
  useGameStore,
} from "../stores/gameStore";
import styles from "./TopBar.module.css";

type TopBarProps = {
  boxer: Boxer;
};

// 일일 리셋 타이머 표시 갱신 주기(ms). React 리렌더 트리거 전용 — 게임 로직/저장과 무관하다.
const TIMER_TICK_MS = 1_000;

// 프로필 아바타 이니셜(이모지/한 글자). 이름 첫 글자를 그대로 쓴다(공백이면 🥊).
function avatarGlyph(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? Array.from(trimmed)[0] : "🥊";
}

// TASK-020(P3): 모든 화면 공통 상단 바. 프레젠테이셔널 — 스토어 셀렉터/주입 now로만 구동한다.
//   좌측: 프로필·복서 이름·플레이어 레벨(Lv)·경험치 바(%). 우측 재화: [🪙골드][💎다이아][⏱일일리셋].
//   일일 타이머는 주입 now(getNow) 기반 순수 파생(selectDailyResetRemainingMs)을 1초 간격으로 다시 읽어
//   표시만 갱신한다(Date.now 직접 호출 금지 — getNow는 가짜 클럭/실시계를 동일하게 따른다).
export function TopBar({ boxer }: TopBarProps) {
  const getNow = useGameStore((state) => state.getNow);

  const expToNext = selectExpToNext(boxer);
  const expProgress = selectExpProgress(boxer);
  const expPercent = Math.round(expProgress * 100);

  // 표시 갱신용 now. 1초마다 주입 now를 다시 읽어 타이머만 리렌더한다(게임 상태 변경 없음).
  const [now, setNow] = useState(() => getNow());
  useEffect(() => {
    setNow(getNow());
    const id = setInterval(() => setNow(getNow()), TIMER_TICK_MS);
    return () => clearInterval(id);
  }, [getNow]);

  const dailyResetRemainingMs = selectDailyResetRemainingMs(now);
  const dailyResetLabel = formatCountdown(dailyResetRemainingMs);

  return (
    <header className={styles.topBar} data-testid="top-bar">
      <div className={styles.profile}>
        <span className={styles.avatar} aria-hidden="true">
          {avatarGlyph(boxer.name)}
        </span>
        <div className={styles.identity}>
          <span className={styles.name}>{boxer.name}</span>
          <div className={styles.levelRow}>
            <span className={styles.level} data-testid="player-level">
              Lv.{boxer.playerLevel.toLocaleString()}
            </span>
            <div
              className={styles.expTrack}
              data-testid="player-exp-bar"
              role="progressbar"
              aria-label="플레이어 경험치"
              aria-valuemin={0}
              aria-valuemax={expToNext}
              aria-valuenow={Math.min(boxer.playerExp, expToNext)}
            >
              <div className={styles.expFill} style={{ width: `${expPercent}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.wallet}>
        <span className={styles.currency} data-testid="currency-gold">
          <span aria-hidden="true">🪙</span>
          {boxer.gold.toLocaleString()}
        </span>
        <span className={styles.currency} data-testid="currency-diamond">
          <span aria-hidden="true">💎</span>
          {boxer.diamond.toLocaleString()}
        </span>
        <span
          className={styles.currency}
          data-testid="daily-reset-timer"
          title="일일 리셋까지 남은 시간"
        >
          <span aria-hidden="true">⏱</span>
          {dailyResetLabel}
        </span>
      </div>
    </header>
  );
}
