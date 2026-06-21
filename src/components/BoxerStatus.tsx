import { BOXER_TYPE_META, GENDER_META } from "../game/constants";
import { getStageDefinition } from "../data/stages";
import { calculateCombatStats } from "../game/formulas";
import type { Boxer } from "../game/types";
import { useGameStore } from "../stores/gameStore";
import styles from "./GamePanel.module.css";

type BoxerStatusProps = {
  boxer: Boxer;
};

// 상단 정보 패널: 현재 스테이지/챕터 이름/복서 타입/골드/보스 여부 + 능력치 요약.
export function BoxerStatus({ boxer }: BoxerStatusProps) {
  const combat = useGameStore((state) => state.combat);
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  const stage = combat ? getStageDefinition(combat.position) : null;

  return (
    <section className={styles.topPanel} aria-labelledby="boxer-status-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>My boxer</p>
          <h2 className={styles.title} id="boxer-status-title">
            {boxer.name}
          </h2>
          <p className={styles.subtitle} data-testid="boxer-identity">
            {BOXER_TYPE_META[boxer.boxerType].label} · {GENDER_META[boxer.gender].label}
          </p>
        </div>
        <span className={styles.badge}>{boxer.gold.toLocaleString()} G</span>
      </div>

      {stage && (
        <div className={styles.topMeta} data-testid="stage-meta">
          <div className={styles.topMetaItem}>
            <span>스테이지</span>
            <strong data-testid="stage-position">
              {stage.chapter}-{stage.stage}
            </strong>
          </div>
          <div className={styles.topMetaItem}>
            <span>챕터</span>
            <strong>{stage.chapterName}</strong>
          </div>
          <div className={styles.topMetaItem}>
            <span>진행</span>
            <strong data-testid="stage-mode">
              {stage.isBoss ? "보스전" : combat?.isFarming ? "파밍" : "전투"}
            </strong>
          </div>
        </div>
      )}

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
