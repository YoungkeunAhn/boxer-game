import { useState, type FormEvent } from "react";
import { BattlePanel } from "../components/BattlePanel";
import { BoxerStatus } from "../components/BoxerStatus";
import { TrainingPanel } from "../components/TrainingPanel";
import { useGameStore } from "../stores/gameStore";
import styles from "./HomePage.module.css";

export function HomePage() {
  const boxer = useGameStore((state) => state.boxer);
  const result = useGameStore((state) => state.lastBattleResult);
  const message = useGameStore((state) => state.message);
  const createBoxer = useGameStore((state) => state.createBoxer);
  const reset = useGameStore((state) => state.reset);
  const [name, setName] = useState("");

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
            이름 없는 신인에서 챔피언까지. 첫 복서를 링에 올려보세요.
          </p>
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
            훈련으로 강해지고, 링 위의 승리로 이름을 알리세요.
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

      {message && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}

      <div className={styles.grid}>
        <div className={styles.status}>
          <BoxerStatus boxer={boxer} />
        </div>
        <TrainingPanel />
        <BattlePanel boxer={boxer} result={result} />
      </div>
    </main>
  );
}

