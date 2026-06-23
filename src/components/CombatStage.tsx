import { useRef } from "react";
import { BoxerFigure } from "./BoxerFigure";
import { CombatControls } from "./CombatControls";
import {
  BOSS_TIME_LIMIT_MS,
  BOXER_TYPE_META,
  GENDER_META,
} from "../game/constants";
import { getSkill } from "../data/skills";
import {
  getStageDefinition,
  STAGES_PER_CHAPTER,
} from "../data/stages";
import {
  FX_COUNTER,
  FX_GROGGY,
  FX_HIT,
  monsterImageForStage,
  ringImageForStage,
} from "../data/assets";
import {
  calculateCombatStats,
  calculateMonsterAttackPower,
} from "../game/formulas";
import { formatCompactNumber } from "../game/format";
import type {
  AttackType,
  ComboId,
  DefenseOutcome,
  Hand,
} from "../game/types";
import { useGameStore } from "../stores/gameStore";
import gameStyles from "./GamePanel.module.css";
import styles from "./CombatStage.module.css";

// 전투 화면(목업 메인ui1 기준): 헤더(월드맵·진행·카드) → 링 무대(파이터 대치 + 플로팅 데미지/골드 + 코너 컨트롤).
//   표시 전용 — 데이터는 기존 셀렉터·순수 함수에서 파생한다. e2e 앵커는 같은 의미의 노드에 보존/이전한다.

function formatSeconds(milliseconds: number): string {
  return (Math.max(0, milliseconds) / 1_000).toFixed(1);
}

const COMBO_LABELS: Record<ComboId, string> = {
  ONE_TWO: "원투",
  ONE_TWO_HOOK: "원투 훅",
  FULL_COMBO: "풀 콤비네이션",
};

// 표시 계층 전용 (combo): (공격 종류·손) → 애니메이션 키. 손 선택 규칙(TASK-007)은 스토어가 결정하고,
// 여기서는 그 결과(lastAttack.attackType/hand)를 그대로 키로 매핑만 한다(로직·난수 없음).
function getAttackAnimKey(attackType: AttackType, hand: Hand): string {
  const side = hand === "LEFT" ? "left" : "right";
  switch (attackType) {
    case "JAB":
      return `boxer_${side}_jab`;
    case "STRAIGHT":
      return `boxer_${side}_straight`;
    case "HOOK":
      return `boxer_${side}_hook`;
    case "UPPER":
      return `boxer_${side}_upper`;
    default:
      return "boxer_idle";
  }
}

const ATTACK_MOTION: Record<AttackType, string> = {
  JAB: gameStyles.motionJab,
  STRAIGHT: gameStyles.motionStraight,
  HOOK: gameStyles.motionHook,
  UPPER: gameStyles.motionUpper,
};

const DEFENSE_MOTION: Record<DefenseOutcome, string> = {
  MISS: gameStyles.motionDodge,
  COUNTER: gameStyles.motionCounter,
  GUARD: gameStyles.motionGuard,
  HIT: gameStyles.motionHurt,
};

export function CombatStage() {
  const boxer = useGameStore((state) => state.boxer);
  const runtime = useGameStore((state) => state.combat);
  const bossRemainingMs = useGameStore((state) => state.bossRemainingMs);
  const lastAttack = useGameStore((state) => state.lastAttack);
  const lastCombo = useGameStore((state) => state.lastCombo);
  const lastSkill = useGameStore((state) => state.lastSkill);
  const recentDefense = useGameStore((state) => state.recentDefense);
  const lastKillReward = useGameStore((state) => state.lastKillReward);
  const retryBoss = useGameStore((state) => state.retryBoss);

  // 같은 결과가 연속될 때도 CSS 플로팅 애니메이션을 재시동하기 위한 단조 카운터(객체 식별자 변경 시 증가).
  const attackSeqRef = useRef(0);
  const lastAttackIdRef = useRef<typeof lastAttack>(null);
  if (lastAttack !== lastAttackIdRef.current) {
    lastAttackIdRef.current = lastAttack;
    attackSeqRef.current += 1;
  }
  const defenseSeqRef = useRef(0);
  const lastDefenseIdRef = useRef<typeof recentDefense>(null);
  if (recentDefense !== lastDefenseIdRef.current) {
    lastDefenseIdRef.current = recentDefense;
    defenseSeqRef.current += 1;
  }

  if (!boxer || !runtime) return null;

  const stage = getStageDefinition(runtime.position);
  const ringImage = ringImageForStage(stage);
  const monsterImage = monsterImageForStage(stage);
  const monsterAttack = calculateMonsterAttackPower(runtime.position);
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);

  const monsterHpPercent = Math.max(0, Math.min(100, (runtime.monsterHp / stage.maxHp) * 100));
  const boxerHpPercent =
    runtime.boxerMaxHp > 0
      ? Math.max(0, Math.min(100, (runtime.boxerHp / runtime.boxerMaxHp) * 100))
      : 0;
  const groggyActive = runtime.groggyMax > 0;
  const groggyPercent = groggyActive
    ? Math.max(0, Math.min(100, (runtime.groggyGauge / runtime.groggyMax) * 100))
    : 0;
  const isGroggy = runtime.groggyUntil !== null;
  const boxerKnockedDown = runtime.boxerHp <= 0;

  const toneClass =
    boxer.boxerType === "OUT_BOXER"
      ? gameStyles.toneOutboxer
      : boxer.boxerType === "INFIGHTER"
        ? gameStyles.toneInfighter
        : "";

  let avatarMotionClass = "";
  let attackKey = "boxer_idle";
  let animSeq = 0;
  if (boxerKnockedDown) {
    avatarMotionClass = gameStyles.motionDown;
    attackKey = "boxer_down";
  } else if (recentDefense && recentDefense.outcome !== "HIT") {
    avatarMotionClass = DEFENSE_MOTION[recentDefense.outcome];
    attackKey = `boxer_${recentDefense.outcome.toLowerCase()}`;
    animSeq = defenseSeqRef.current;
  } else if (lastAttack) {
    avatarMotionClass = ATTACK_MOTION[lastAttack.attackType];
    attackKey = getAttackAnimKey(lastAttack.attackType, lastAttack.hand);
    animSeq = attackSeqRef.current;
  }
  const skillEmphasis = lastAttack?.skillTriggered ? gameStyles.motionSkill : "";
  const groggyEmphasis = lastAttack?.groggyBonusApplied ? gameStyles.motionGroggyHit : "";

  const bossWarning = stage.isBoss && runtime.monsterAttackPrep !== null;

  // 타격 FX(접촉부): 카운터 > 일반 타격. key로 매 이벤트마다 애니 재시동.
  const isCounterFx = recentDefense?.outcome === "COUNTER";
  const contactFxSrc = isCounterFx ? FX_COUNTER : lastAttack ? FX_HIT : null;
  const contactFxKey = isCounterFx
    ? `c${defenseSeqRef.current}`
    : `h${attackSeqRef.current}`;

  // 몬스터가 복서에게 입힌 피해(피격 데미지) — HIT/GUARD에서 damage>0일 때 복서 위로 띄운다.
  const boxerTookDamage =
    recentDefense && recentDefense.damage > 0 ? recentDefense.damage : null;

  // 진행바 점: 인덱스 0~3 = 일반 stage 1~4, 인덱스 4 = 보스 stage 5.
  const currentStage = runtime.position.stage;
  const dots = Array.from({ length: STAGES_PER_CHAPTER }, (_, index) => {
    const stageNumber = index + 1;
    return {
      stageNumber,
      isBoss: stageNumber === STAGES_PER_CHAPTER,
      isCurrent: stageNumber === currentStage,
    };
  });
  const stageLabel = `STAGE ${runtime.position.chapter}-${runtime.position.stage}`;

  return (
    <div className={`${styles.stage} ${toneClass}`}>
      <section
        className={styles.combat}
        data-testid="combat-header"
        aria-labelledby="combat-title"
        data-boxer-type={boxer.boxerType}
      >
        {/* 링 무대(단일 합성, 목업 메인ui1): 아레나 배경 위에 헤더·HP카드·파이터·컨트롤을 모두 오버레이한다.
            헤더/카드는 별도 박스가 아니라 무대 상단에 얹는다 → 전투 영역 하나로 합쳐 세로를 최소화. */}
        <div className={`${styles.ring} ${boxer.boxerType === "INFIGHTER" ? gameStyles.arenaShake : ""}`}>
          <div
            className={styles.ringBg}
            style={{ backgroundImage: `url("${ringImage}")` }}
            aria-hidden="true"
          />

          {/* 상단 오버레이: 최소화한 챕터/스테이지 헤더 + 진행 점 + HP 카드(반투명, 아레나 위). */}
          <div className={styles.topOverlay}>
        {/* 헤더 줄: 월드맵 · 스테이지 · 처치수 · 처음부터 · 배지 */}
        <div className={styles.worldRow}>
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
          <span className={styles.kills}>
            처치 <strong data-testid="stat-totalKills">{formatCompactNumber(boxer.totalKills)}마리</strong>
          </span>
          {/* 배속 토글(작게) — 헤더 줄 우측에 배치. */}
          <CombatControls bare />
          {/* 전투 상태 배지: 화면에는 숨기되(요청) data-testid·텍스트는 보존 — E2E가 toHaveText로 의존. */}
          <span className={styles.badge} data-testid="combat-badge">
            {stage.isBoss ? "BOSS" : runtime.isFarming ? "파밍 중" : "자동 전투"}
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

        <div className={styles.combatTitleRow}>
          <p className={gameStyles.eyebrow}>
            CHAPTER {runtime.position.chapter} · STAGE {runtime.position.stage}
          </p>
          <h2 className={styles.combatTitle} id="combat-title">
            {stage.monsterName}
          </h2>
        </div>

        {/* 파이터 정보 카드(맵 상단): 이름·타입·HP바·공격력. HP 게이지(boxer-hp/monster-hp)를 카드로 이전. */}
        <div className={styles.cards}>
          <div className={styles.card} data-testid="boxer-card">
            <p className={styles.cardEyebrow}>BOXER</p>
            <p className={styles.cardName} id="boxer-status-title" data-testid="boxer-card-name">
              {boxer.name}
            </p>
            <p className={styles.cardSub} data-testid="boxer-card-type">
              {BOXER_TYPE_META[boxer.boxerType].label} · {GENDER_META[boxer.gender].label}
            </p>
            <div
              className={styles.cardHpBar}
              role="progressbar"
              data-testid="boxer-hp"
              aria-label="복서 체력"
              aria-valuemin={0}
              aria-valuemax={Math.round(runtime.boxerMaxHp)}
              aria-valuenow={Math.max(0, Math.round(runtime.boxerHp))}
            >
              <div
                className={`${styles.cardHpFill} ${styles.cardHpFillBoxer}`}
                style={{ width: `${boxerHpPercent}%` }}
              />
            </div>
            <p className={styles.cardHp} data-testid="boxer-card-hp">
              ❤ {formatCompactNumber(Math.max(0, Math.round(runtime.boxerHp)))} /{" "}
              {formatCompactNumber(Math.round(runtime.boxerMaxHp))}
            </p>
            <p className={styles.cardAttack} data-testid="boxer-card-attack">
              🔥 {formatCompactNumber(stats.attackPower)}
            </p>
          </div>

          <span className={styles.versus} aria-hidden="true">
            VS
          </span>

          <div
            className={`${styles.card} ${stage.isBoss ? styles.cardBoss : ""}`}
            data-testid="monster-card"
          >
            <p className={styles.cardEyebrow}>{stage.isBoss ? "BOSS" : "ENEMY"}</p>
            <p className={styles.cardName} data-testid="monster-card-name">
              {stage.monsterName}
            </p>
            <p className={styles.cardSub}>{stage.chapterName}</p>
            <div
              className={styles.cardHpBar}
              role="progressbar"
              data-testid="monster-hp"
              aria-label={`${stage.monsterName} 체력`}
              aria-valuemin={0}
              aria-valuemax={stage.maxHp}
              aria-valuenow={runtime.monsterHp}
            >
              <div className={styles.cardHpFill} style={{ width: `${monsterHpPercent}%` }} />
            </div>
            <p className={styles.cardHp} data-testid="monster-card-hp">
              ❤ {formatCompactNumber(runtime.monsterHp)} / {formatCompactNumber(stage.maxHp)}
            </p>
            <p className={styles.cardAttack} data-testid="monster-card-attack">
              🔥 {formatCompactNumber(monsterAttack)}
            </p>
          </div>
        </div>
          </div>
          {/* ── 상단 오버레이 끝 ── */}

          {/* 보스 제한시간 · 그로기 게이지: 무대 상단 오버레이. */}
          {stage.isBoss && (
            <div className={styles.bossOverlay}>
              <strong
                className={styles.bossTimer}
                data-testid="boss-timer"
                aria-label={`보스 제한 시간 ${formatSeconds(bossRemainingMs)}초`}
              >
                {formatSeconds(bossRemainingMs)}초
              </strong>
              {groggyActive && (
                <div
                  className={styles.groggyBar}
                  role="progressbar"
                  data-testid="groggy-bar"
                  aria-label="보스 그로기"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(runtime.groggyMax)}
                  aria-valuenow={Math.round(runtime.groggyGauge)}
                >
                  <div
                    className={`${styles.groggyFill} ${isGroggy ? styles.groggyActive : ""}`}
                    style={{ width: `${groggyPercent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <div className={styles.ringRow}>
            <div className={styles.figureSlot} data-testid="arena-boxer">
              <BoxerFigure bare />
              <span
                key={`boxer-anim-${animSeq}`}
                className={`${gameStyles.srOnly} ${avatarMotionClass} ${skillEmphasis} ${groggyEmphasis}`}
                aria-hidden="true"
                data-attack-key={attackKey}
                data-anim-seq={animSeq}
                data-down={boxerKnockedDown ? "true" : undefined}
              >
                🥊
              </span>
              {/* 복서 피격 데미지(잠깐 떴다 사라짐). */}
              {boxerTookDamage !== null && (
                <span
                  key={`bdmg-${defenseSeqRef.current}`}
                  className={`${styles.floatDamage} ${styles.floatDamageBoxer}`}
                  aria-hidden="true"
                >
                  -{formatCompactNumber(boxerTookDamage)}
                </span>
              )}
            </div>

            <div className={styles.monsterSlot} data-testid="arena-monster">
              <img
                className={`${styles.monsterImg} ${stage.isBoss ? styles.monsterBoss : ""} ${isGroggy ? gameStyles.avatarGroggy : ""}`}
                src={monsterImage}
                alt=""
                draggable={false}
                aria-hidden="true"
              />
              {/* 몬스터 피격 데미지(복서의 타격) — 잠깐 떴다 사라짐. */}
              {lastAttack && (
                <span
                  key={`mdmg-${attackSeqRef.current}`}
                  className={`${styles.floatDamage} ${lastAttack.isCritical ? styles.floatCrit : ""}`}
                  data-testid="feed-damage"
                >
                  -{formatCompactNumber(lastAttack.damage)}
                </span>
              )}
              {/* 처치 시 획득 골드(몬스터 위로 떠오름) — 잠깐 떴다 사라짐. */}
              {lastKillReward && (
                <span
                  key={`gold-${lastKillReward.seq}`}
                  className={styles.floatGold}
                  aria-hidden="true"
                >
                  +{formatCompactNumber(lastKillReward.gold)} G
                </span>
              )}
            </div>
          </div>

          {contactFxSrc && (
            <img
              key={`fx-${contactFxKey}`}
              className={`${styles.fx} ${isCounterFx ? styles.fxCounter : styles.fxHit}`}
              src={contactFxSrc}
              alt=""
              draggable={false}
              aria-hidden="true"
            />
          )}
          {isGroggy && (
            <img
              className={`${styles.fx} ${styles.fxGroggy}`}
              src={FX_GROGGY}
              alt=""
              draggable={false}
              aria-hidden="true"
            />
          )}

          {/* 콤보·스킬 텍스트 피드(연출용, 상단 중앙). 데미지 숫자는 파이터 위로 분리됐다. */}
          <div className={styles.overlayFeed} data-testid="combat-feed" aria-live="polite">
            {lastCombo && (
              <span className={`${gameStyles.feedCombo} ${gameStyles.feedPop}`} data-testid="feed-combo">
                {COMBO_LABELS[lastCombo]}
              </span>
            )}
            {lastSkill && (
              <span className={`${gameStyles.feedSkill} ${gameStyles.feedPop}`} data-testid="feed-skill">
                {getSkill(lastSkill).name}
              </span>
            )}
          </div>

          {bossWarning && (
            <div className={gameStyles.bossWarning} data-testid="boss-warning" role="status">
              ⚠ WARNING
            </div>
          )}

          {/* 무대 우하단 코너: 보스 재도전 버튼(파밍 중에만). */}
          {runtime.isFarming && (
            <div className={styles.controlsBar}>
              <button
                type="button"
                className={styles.retryButtonFarming}
                onClick={retryBoss}
                aria-label={`보스 다시 도전하기 (${Math.round(BOSS_TIME_LIMIT_MS / 1_000)}초)`}
              >
                보스 재도전
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
