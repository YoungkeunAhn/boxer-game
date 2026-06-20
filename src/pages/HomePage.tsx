import { useEffect, useState, type FormEvent } from "react";
import { CombatPanel } from "../components/CombatPanel";
import { BoxerStatus } from "../components/BoxerStatus";
import { UpgradePanel } from "../components/UpgradePanel";
import { useGameStore } from "../stores/gameStore";
import styles from "./HomePage.module.css";

export function HomePage() {
  const boxer = useGameStore((state) => state.boxer);
  const offlineSummary = useGameStore((state) => state.offlineSummary);
  const message = useGameStore((state) => state.message);
  const storageWarning = useGameStore((state) => state.storageWarning);
  const legacySaveDetected = useGameStore((state) => state.legacySaveDetected);
  const createBoxer = useGameStore((state) => state.createBoxer);
  const pause = useGameStore((state) => state.pause);
  const resume = useGameStore((state) => state.resume);
  const reset = useGameStore((state) => state.reset);
  const [name, setName] = useState("");

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

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createBoxer(name);
  }

  if (!boxer) {
    return (
      <main className={styles.page}>
        <section className={styles.creation}>
          <p className={styles.kicker}>BOXER GROWTH PROJECT</p>
          <h1 className={styles.title}>복서키우기</h1>
          <p className={styles.subtitle}>
            자동으로 몬스터를 쓰러뜨리고 강해져 보스에게 도전하세요.
          </p>
          {legacySaveDetected && (
            <p className={styles.warning} role="alert">
              이전 버전 저장 데이터는 새 전투 방식과 호환되지 않습니다. 기존 저장은
              보존되며, 새 복서를 만들면 v2 진행이 시작됩니다.
            </p>
          )}
          {storageWarning && (
            <p className={styles.warning} role="alert">
              {storageWarning}
            </p>
          )}
          <form onSubmit={handleCreate}>
            <label className={styles.label} htmlFor="boxer-name">
              복서 이름
            </label>
            <input
              className={styles.input}
              id="boxer-name"
              maxLength={16}
              onChange={(event) => setName(event.target.value)}
              placeholder="무명 복서"
              value={name}
            />
            <button className={styles.submit} type="submit">
              커리어 시작하기
            </button>
          </form>
        </section>
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
        <CombatPanel />
        <UpgradePanel boxer={boxer} />
      </div>
    </main>
  );
}
