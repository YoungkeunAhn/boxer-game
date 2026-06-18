import { calculateCombatPower } from "../game/formulas";
import type { Boxer } from "../game/types";
import styles from "./GamePanel.module.css";

type BoxerStatusProps = {
  boxer: Boxer;
};

const STAT_LABELS = {
  health: "체력",
  attack: "공격력",
  defense: "방어력",
  speed: "스피드",
} as const;

export function BoxerStatus({ boxer }: BoxerStatusProps) {
  const combatPower = calculateCombatPower(boxer.stats);

  return (
    <section className={styles.panel} aria-labelledby="boxer-status-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>My boxer</p>
          <h2 className={styles.title} id="boxer-status-title">
            {boxer.name}
          </h2>
        </div>
        <span className={styles.badge}>Lv. {boxer.level}</span>
      </div>

      <dl className={styles.stats}>
        {Object.entries(boxer.stats).map(([key, value]) => (
          <div className={styles.stat} key={key}>
            <dt>{STAT_LABELS[key as keyof typeof STAT_LABELS]}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div className={styles.stat}>
          <dt>전투력</dt>
          <dd>{combatPower.toFixed(1)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>전적</dt>
          <dd>{boxer.defeatedOpponentIds.length}승</dd>
        </div>
      </dl>

      <div className={styles.reward} aria-label="보유 재화">
        <span>💰 {boxer.money.toLocaleString()}원</span>
        <span>★ 명성 {boxer.fame.toLocaleString()}</span>
      </div>
    </section>
  );
}

