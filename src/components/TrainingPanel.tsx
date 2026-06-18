import { TRAININGS } from "../data/trainings";
import { useGameStore } from "../stores/gameStore";
import styles from "./GamePanel.module.css";

export function TrainingPanel() {
  const train = useGameStore((state) => state.train);
  const training = TRAININGS[0];

  if (!training) return null;

  return (
    <section className={styles.panel} aria-labelledby="training-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Training</p>
          <h2 className={styles.title} id="training-title">
            {training.name}
          </h2>
          <p className={styles.description}>{training.description}</p>
        </div>
        <span className={styles.badge}>공격 +2</span>
      </div>
      <button
        className={styles.button}
        type="button"
        onClick={() => train(training.id)}
      >
        샌드백 치기
      </button>
    </section>
  );
}

