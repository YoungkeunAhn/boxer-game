import { useEffect } from "react";
import { CombatControls } from "../components/CombatControls";
import { CombatHeader } from "../components/CombatHeader";
import { CombatPanel } from "../components/CombatPanel";
import { BoxerCreation } from "../components/BoxerCreation";
import { BoxerStatus } from "../components/BoxerStatus";
import { UpgradePanel } from "../components/UpgradePanel";
import { useGameStore } from "../stores/gameStore";
import styles from "./HomePage.module.css";

export function HomePage() {
  const boxer = useGameStore((state) => state.boxer);
  const offlineSummary = useGameStore((state) => state.offlineSummary);
  const message = useGameStore((state) => state.message);
  const storageWarning = useGameStore((state) => state.storageWarning);
  const pause = useGameStore((state) => state.pause);
  const resume = useGameStore((state) => state.resume);
  const reset = useGameStore((state) => state.reset);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") pause();
      else resume();
    };
    const handlePageHide = () => pause();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    if (document.visibilityState !== "hidden") resume();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [pause, resume]);

  if (!boxer) {
    return (
      <main className={styles.page}>
        <BoxerCreation />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>ROAD TO CHAMPION</p>
          <h1 className={styles.title}>복서키우기</h1>
          <p className={styles.subtitle}>
            자동 전투로 골드를 모아 강화하고, 더 깊은 챕터로 전진하세요.
          </p>
        </div>
        <button
          className={styles.reset}
          type="button"
          onClick={() => {
            if (window.confirm("저장된 진행도를 지우고 처음부터 시작할까요?")) {
              reset();
            }
          }}
        >
          처음부터
        </button>
      </header>

      {storageWarning && (
        <p className={styles.warning} role="alert">
          {storageWarning}
        </p>
      )}

      {message && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}

      {offlineSummary && offlineSummary.kills > 0 && (
        <p className={styles.offline} role="status">
          자리를 비운 동안 몬스터 {offlineSummary.kills.toLocaleString()}마리를 처치하고{" "}
          {offlineSummary.gold.toLocaleString()} 골드를 획득했습니다.
        </p>
      )}

      <div className={styles.grid}>
        <div className={styles.status}>
          <BoxerStatus boxer={boxer} />
        </div>
        {/* TASK-014: 표시 전용 전투 헤더. 헤더와 BoxerStatus/CombatPanel은 일부 정보가 중복되나,
            중복 정리는 후속 태스크(강화 패널 정리)로 미룬다. combat이 null이면 내부에서 null 가드. */}
        <CombatHeader />
        <CombatPanel />
        {/* TASK-015: 전투 컨트롤(AUTO 토글·배속·수동 공격·수동 스킬). combat null이면 내부에서 null 가드. */}
        <CombatControls />
        <UpgradePanel boxer={boxer} />
      </div>
    </main>
  );
}
