import { calculateCombatStats } from "../game/formulas";
import type { Boxer } from "../game/types";
import styles from "./GamePanel.module.css";

type BoxerStatusProps = {
  boxer: Boxer;
};

export function BoxerStatus({ boxer }: BoxerStatusProps) {
  const stats = calculateCombatStats(boxer.upgradeLevels);

  return (
    <section className={styles.panel} aria-labelledby="boxer-status-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>My boxer</p>
          <h2 className={styles.title} id="boxer-status-title">
            {boxer.name}
          </h2>
        </div>
        <span className={styles.badge}>{boxer.gold.toLocaleString()} G</span>
      </div>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>공격력</dt>
          <dd data-testid="stat-attackPower">{stats.attackPower.toLocaleString()}</dd>
        </div>
        <div className={styles.stat}>
          <dt>공격속도</dt>
          <dd data-testid="stat-attackSpeed">{stats.attackSpeed.toFixed(1)}회/초</dd>
        </div>
        <div className={styles.stat}>
          <dt>치명타율</dt>
          <dd data-testid="stat-critRate">{Math.round(stats.critRate * 100)}%</dd>
        </div>
        <div className={styles.stat}>
          <dt>치명타 피해</dt>
          <dd data-testid="stat-critDamage">{stats.critDamage.toFixed(1)}배</dd>
        </div>
        <div className={styles.stat}>
          <dt>골드 보너스</dt>
          <dd data-testid="stat-goldBonus">+{Math.round(stats.goldBonus * 100)}%</dd>
        </div>
        <div className={styles.stat}>
          <dt>총 처치</dt>
          <dd data-testid="stat-totalKills">{boxer.totalKills.toLocaleString()}마리</dd>
        </div>
      </dl>
    </section>
  );
}
