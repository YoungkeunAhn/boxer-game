import { useEffect } from "react";
import { CombatPanel } from "../components/CombatPanel";
import { BoxerCreation } from "../components/BoxerCreation";
import { BoxerStatus } from "../components/BoxerStatus";
import { SkillCooldownBar } from "../components/SkillCooldownBar";
import { UpgradePanel } from "../components/UpgradePanel";
import { SkillPanel } from "../components/SkillPanel";
import { useGameStore } from "../stores/gameStore";
import styles from "./HomePage.module.css";

export function HomePage() {
  const boxer = useGameStore((state) => state.boxer);
  const combat = useGameStore((state) => state.combat);
  // 기본 공격 쿨타임 진행도 표시용 기준 시각. 스토어가 틱마다 set하여 리렌더되면 함께 갱신된다.
  //   표시 전용이며 UI에 별도 타이머/로직을 추가하지 않는다(프레젠테이셔널 원칙).
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

      <div className={styles.screen}>
        <div className={styles.top}>
          <BoxerStatus boxer={boxer} />
        </div>
        <div className={styles.center}>
          <CombatPanel />
        </div>
        <div className={styles.bottom}>
          {combat && <SkillCooldownBar boxer={boxer} combat={combat} now={Date.now()} />}
          <SkillPanel boxer={boxer} />
          <UpgradePanel boxer={boxer} />
        </div>
      </div>
    </main>
  );
}
