import { BOXER_TYPE_META, GENDER_META } from "../game/constants";
import { getStageDefinition, STAGES_PER_CHAPTER } from "../data/stages";
import { calculateCombatStats, calculateMonsterAttackPower } from "../game/formulas";
import { useGameStore } from "../stores/gameStore";
import styles from "./CombatHeader.module.css";

// TASK-014: 표시 전용 전투 헤더. 월드맵 표기 + 5칸 스테이지 진행바 + 복서/몬스터 대결 카드.
// 모든 수치는 기존 스토어 셀렉터·stages.ts/formulas.ts/combat.ts에서 파생한다(신규 로직·저장 필드 없음).
export function CombatHeader() {
  const boxer = useGameStore((state) => state.boxer);
  const combat = useGameStore((state) => state.combat);

  if (!boxer || !combat) return null;

  const stage = getStageDefinition(combat.position);
  const monsterAttack = calculateMonsterAttackPower(combat.position);
  const stats = calculateCombatStats(boxer.upgradeLevels);

  const currentStage = combat.position.stage; // 1~5
  // 진행바 점: 인덱스 0~3 = 일반 stage 1~4, 인덱스 4 = 보스 stage 5.
  const dots = Array.from({ length: STAGES_PER_CHAPTER }, (_, index) => {
    const stageNumber = index + 1;
    return {
      stageNumber,
      isBoss: stageNumber === STAGES_PER_CHAPTER,
      isCurrent: stageNumber === currentStage,
    };
  });

  const stageLabel = `STAGE ${combat.position.chapter}-${combat.position.stage}`;

  return (
    <section
      className={styles.header}
      data-testid="combat-header"
      aria-label="전투 헤더"
    >
      <div className={styles.topRow}>
        {/* TODO(TASK 후속): 월드맵 선택/재방문 화면. 이번 태스크는 표기만(비활성). */}
        <button
          type="button"
          className={styles.worldMapButton}
          data-testid="world-map-button"
          disabled
          aria-disabled="true"
          title="월드맵 (준비 중)"
        >
          🗺 월드맵
        </button>
        <span className={styles.stageLabel} data-testid="stage-label">
          {stageLabel}
        </span>
      </div>

      <div
        className={styles.progress}
        data-testid="stage-progress"
        role="img"
        aria-label={`${stageLabel}, ${currentStage}/${STAGES_PER_CHAPTER}`}
      >
        {dots.map((dot) => (
          <span
            key={dot.stageNumber}
            className={[
              styles.dot,
              dot.isCurrent ? styles.dotCurrent : "",
              dot.isBoss ? styles.dotBoss : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-testid="stage-dot"
            data-stage={dot.stageNumber}
            data-current={dot.isCurrent ? "true" : "false"}
            data-boss={dot.isBoss ? "true" : "false"}
          >
            {dot.isBoss ? "👹" : ""}
          </span>
        ))}
      </div>

      <div className={styles.cards}>
        {/* 복서 대결 카드(좌) */}
        <div className={styles.card} data-testid="boxer-card">
          <p className={styles.cardEyebrow}>BOXER</p>
          <p className={styles.cardName} data-testid="boxer-card-name">
            {boxer.name}
          </p>
          <p className={styles.cardSub} data-testid="boxer-card-type">
            {BOXER_TYPE_META[boxer.boxerType].label} · {GENDER_META[boxer.gender].label}
          </p>
          <p className={styles.cardHp} data-testid="boxer-card-hp">
            ❤ {combat.boxerHp.toLocaleString()} / {combat.boxerMaxHp.toLocaleString()}
          </p>
          <p className={styles.cardAttack} data-testid="boxer-card-attack">
            🔥 {stats.attackPower.toLocaleString()}
          </p>
        </div>

        <span className={styles.versus} aria-hidden="true">
          VS
        </span>

        {/* 몬스터 대결 카드(우) */}
        <div
          className={`${styles.card} ${stage.isBoss ? styles.cardBoss : ""}`}
          data-testid="monster-card"
        >
          <p className={styles.cardEyebrow}>{stage.isBoss ? "BOSS" : "ENEMY"}</p>
          <p className={styles.cardName} data-testid="monster-card-name">
            {stage.monsterName}
          </p>
          <p className={styles.cardSub}>{stage.chapterName}</p>
          <p className={styles.cardHp} data-testid="monster-card-hp">
            ❤ {combat.monsterHp.toLocaleString()} / {stage.maxHp.toLocaleString()}
          </p>
          <p className={styles.cardAttack} data-testid="monster-card-attack">
            🔥 {monsterAttack.toLocaleString()}
          </p>
        </div>
      </div>
    </section>
  );
}
