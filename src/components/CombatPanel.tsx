import { BOSS_TIME_LIMIT_MS } from "../game/constants";
import { getStageDefinition } from "../data/stages";
import { useGameStore } from "../stores/gameStore";
import styles from "./GamePanel.module.css";

function formatSeconds(milliseconds: number): string {
  return (Math.max(0, milliseconds) / 1_000).toFixed(1);
}

export function CombatPanel() {
  const runtime = useGameStore((state) => state.combat);
  const bossRemainingMs = useGameStore((state) => state.bossRemainingMs);
  const lastAttack = useGameStore((state) => state.lastAttack);
  const retryBoss = useGameStore((state) => state.retryBoss);

  if (!runtime) return null;

  const stage = getStageDefinition(runtime.position);
  const hpPercent = Math.max(0, Math.min(100, (runtime.monsterHp / stage.maxHp) * 100));

  return (
    <section className={styles.panel} aria-labelledby="combat-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>
            CHAPTER {runtime.position.chapter} · STAGE {runtime.position.stage}
          </p>
          <h2 className={styles.title} id="combat-title">
            {stage.monsterName}
          </h2>
          <p className={styles.description}>{stage.chapterName}</p>
        </div>
        <span
          className={`${styles.badge} ${stage.isBoss ? styles.bossBadge : ""}`}
          data-testid="combat-badge"
        >
          {stage.isBoss ? "BOSS" : runtime.isFarming ? "파밍 중" : "자동 전투"}
        </span>
      </div>

      <div className={styles.health}>
        <div className={styles.healthLabel}>
          <span>몬스터 HP</span>
          <strong>
            {runtime.monsterHp.toLocaleString()} / {stage.maxHp.toLocaleString()}
          </strong>
        </div>
        <div
          className={styles.healthTrack}
          role="progressbar"
          aria-label={`${stage.monsterName} 체력`}
          aria-valuemin={0}
          aria-valuemax={stage.maxHp}
          aria-valuenow={runtime.monsterHp}
        >
          <div className={styles.healthFill} style={{ width: `${hpPercent}%` }} />
        </div>
      </div>

      <div className={styles.combatMeta}>
        <span>기본 보상 {stage.goldReward.toLocaleString()} 골드</span>
        {stage.isBoss && (
          <strong
            data-testid="boss-timer"
            aria-label={`보스 제한 시간 ${formatSeconds(bossRemainingMs)}초`}
          >
            {formatSeconds(bossRemainingMs)}초
          </strong>
        )}
        {lastAttack && (
          <span className={lastAttack.isCritical ? styles.critical : undefined}>
            {lastAttack.isCritical ? "치명타! " : "타격 "}
            {lastAttack.damage.toLocaleString()}
          </span>
        )}
      </div>

      {runtime.isFarming && (
        <button className={styles.button} type="button" onClick={retryBoss}>
          보스 다시 도전하기 ({Math.round(BOSS_TIME_LIMIT_MS / 1_000)}초)
        </button>
      )}
    </section>
  );
}
