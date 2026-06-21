import { useRef } from "react";
import { BOSS_TIME_LIMIT_MS } from "../game/constants";
import { getSkill } from "../data/skills";
import { getStageDefinition } from "../data/stages";
import type {
  AttackType,
  BoxerType,
  ComboId,
  DefenseOutcome,
  Hand,
} from "../game/types";
import { useGameStore } from "../stores/gameStore";
import styles from "./GamePanel.module.css";

function formatSeconds(milliseconds: number): string {
  return (Math.max(0, milliseconds) / 1_000).toFixed(1);
}

const COMBO_LABELS: Record<ComboId, string> = {
  ONE_TWO: "원투",
  ONE_TWO_HOOK: "원투 훅",
  FULL_COMBO: "풀 콤비네이션",
};

const DEFENSE_LABELS: Record<DefenseOutcome, string> = {
  HIT: "피격",
  GUARD: "GUARD",
  MISS: "MISS",
  COUNTER: "COUNTER",
};

// 표시 계층 전용: (공격 종류·손) → 애니메이션 키. 손 선택 규칙(TASK-007)은 스토어가 결정하고,
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

// 표시 계층 전용: 공격 종류 → CSS 모션 클래스. 데미지/콤보 로직과 무관한 순수 표시 매핑.
const ATTACK_MOTION: Record<AttackType, string> = {
  JAB: styles.motionJab,
  STRAIGHT: styles.motionStraight,
  HOOK: styles.motionHook,
  UPPER: styles.motionUpper,
};

// 표시 계층 전용: 방어 결과(몬스터 공격 판정) → 복서 회피/피격 모션 클래스.
//  - MISS: 더킹/위빙류 회피, COUNTER: 스웨이 후 카운터, GUARD/HIT: 짧은 흔들림.
const DEFENSE_MOTION: Record<DefenseOutcome, string> = {
  MISS: styles.motionDodge,
  COUNTER: styles.motionCounter,
  GUARD: styles.motionGuard,
  HIT: styles.motionHurt,
};

export function CombatPanel() {
  const runtime = useGameStore((state) => state.combat);
  const boxerType = useGameStore((state) => state.boxer?.boxerType);
  const bossRemainingMs = useGameStore((state) => state.bossRemainingMs);
  const lastAttack = useGameStore((state) => state.lastAttack);
  const lastCombo = useGameStore((state) => state.lastCombo);
  const lastSkill = useGameStore((state) => state.lastSkill);
  const recentDefense = useGameStore((state) => state.recentDefense);
  const retryBoss = useGameStore((state) => state.retryBoss);

  // 같은 공격/방어 결과가 연속될 때도 CSS 애니메이션을 재시동하기 위한 단조 카운터.
  //  객체 식별자(스토어가 매 틱 새 객체를 set)가 바뀔 때만 증가시킨다. setState/타이머/난수 없음 — 순수 표시 파생.
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

  if (!runtime) return null;

  const stage = getStageDefinition(runtime.position);
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

  // 타입 톤: 인파이터=묵직/붉은 압박, 아웃복서=경쾌/잔상. data-boxer-type으로도 노출(E2E 시각 구분 검증용).
  const toneClass =
    boxerType === "OUT_BOXER"
      ? styles.toneOutboxer
      : boxerType === "INFIGHTER"
        ? styles.toneInfighter
        : "";

  // 복서 avatar 모션: 사망(넉다운) > 회피/피격(직전 방어 결과) > 공격(직전 타격) 우선순위.
  //  data-attack-key는 애니메이션 키 매핑 검증용(E2E). data-anim-seq로 연속 동일 동작도 재시동한다.
  let avatarMotionClass = "";
  let attackKey = "boxer_idle";
  let animSeq = 0;
  if (boxerKnockedDown) {
    avatarMotionClass = styles.motionDown;
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
  // 스킬 발동/그로기 강타는 공격 모션 위에 강조 클래스로 덧입힌다(연출용).
  const skillEmphasis = lastAttack?.skillTriggered ? styles.motionSkill : "";
  const groggyEmphasis = lastAttack?.groggyBonusApplied ? styles.motionGroggyHit : "";

  // 보스 강공격 WARNING: 기존 상태(monsterAttackPrep)가 세팅될 때만 표시(신규 로직 없음).
  //  가정: 현재 combat.ts는 monsterAttackPrep을 항상 null로 둬서 WARNING은 표시되지 않는다.
  //  강공격 예고 상태가 도입되면 자동으로 노출된다(표시 계층은 준비만 한다). 자세한 내용은 TODO.
  const bossWarning = stage.isBoss && runtime.monsterAttackPrep !== null;

  return (
    <section
      className={`${styles.combatPanel} ${toneClass}`}
      aria-labelledby="combat-title"
      data-boxer-type={boxerType ?? ""}
    >
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

      <div className={`${styles.arena} ${boxerType === "INFIGHTER" ? styles.arenaShake : ""}`}>
        <div className={styles.fighter} data-testid="arena-boxer">
          <div
            key={`boxer-anim-${animSeq}`}
            className={`${styles.avatar} ${styles.avatarBoxer} ${avatarMotionClass} ${skillEmphasis} ${groggyEmphasis}`}
            aria-hidden="true"
            data-attack-key={attackKey}
            data-anim-seq={animSeq}
            data-down={boxerKnockedDown ? "true" : undefined}
          >
            🥊
          </div>
          <span className={styles.fighterName}>나의 복서</span>
        </div>
        <span className={styles.versus} aria-hidden="true">VS</span>
        <div className={styles.fighter} data-testid="arena-monster">
          <div
            className={`${styles.avatar} ${styles.avatarMonster} ${isGroggy ? styles.avatarGroggy : ""}`}
            aria-hidden="true"
          >
            {stage.isBoss ? "👹" : "👾"}
          </div>
          <span className={styles.fighterName}>{stage.monsterName}</span>
        </div>
      </div>

      <div className={styles.health}>
        <div className={styles.healthLabel}>
          <span>복서 HP</span>
          <strong>
            {Math.max(0, Math.round(runtime.boxerHp)).toLocaleString()} /{" "}
            {Math.round(runtime.boxerMaxHp).toLocaleString()}
          </strong>
        </div>
        <div
          className={styles.healthTrack}
          role="progressbar"
          data-testid="boxer-hp"
          aria-label="복서 체력"
          aria-valuemin={0}
          aria-valuemax={Math.round(runtime.boxerMaxHp)}
          aria-valuenow={Math.max(0, Math.round(runtime.boxerHp))}
        >
          <div className={`${styles.healthFill} ${styles.boxerHpFill}`} style={{ width: `${boxerHpPercent}%` }} />
        </div>
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
          data-testid="monster-hp"
          aria-label={`${stage.monsterName} 체력`}
          aria-valuemin={0}
          aria-valuemax={stage.maxHp}
          aria-valuenow={runtime.monsterHp}
        >
          <div className={styles.healthFill} style={{ width: `${monsterHpPercent}%` }} />
        </div>
      </div>

      {groggyActive && (
        <div className={styles.health} data-testid="groggy">
          <div className={styles.healthLabel}>
            <span>{isGroggy ? "그로기!" : "그로기 게이지"}</span>
            <strong>
              {Math.round(runtime.groggyGauge).toLocaleString()} /{" "}
              {Math.round(runtime.groggyMax).toLocaleString()}
            </strong>
          </div>
          <div
            className={styles.healthTrack}
            role="progressbar"
            data-testid="groggy-bar"
            aria-label="보스 그로기"
            aria-valuemin={0}
            aria-valuemax={Math.round(runtime.groggyMax)}
            aria-valuenow={Math.round(runtime.groggyGauge)}
          >
            <div
              className={`${styles.healthFill} ${styles.groggyFill} ${isGroggy ? styles.groggyActive : ""}`}
              style={{ width: `${groggyPercent}%` }}
            />
          </div>
        </div>
      )}

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
      </div>

      {bossWarning && (
        <div className={styles.bossWarning} data-testid="boss-warning" role="status">
          ⚠ WARNING
        </div>
      )}

      <div className={styles.feed} data-testid="combat-feed" aria-live="polite">
        {lastAttack && (
          <span
            key={`dmg-${attackSeqRef.current}`}
            className={`${lastAttack.isCritical ? styles.critical : styles.feedDamage} ${styles.feedPop}`}
            data-testid="feed-damage"
          >
            {lastAttack.isCritical ? "치명타! " : "타격 "}
            {lastAttack.damage.toLocaleString()}
          </span>
        )}
        {lastCombo && (
          <span className={`${styles.feedCombo} ${styles.feedPop}`} data-testid="feed-combo">
            {COMBO_LABELS[lastCombo]}
          </span>
        )}
        {lastSkill && (
          <span className={`${styles.feedSkill} ${styles.feedPop}`} data-testid="feed-skill">
            {getSkill(lastSkill).name}
          </span>
        )}
        {recentDefense && recentDefense.outcome !== "HIT" && (
          <span
            key={`def-${defenseSeqRef.current}`}
            className={`${styles.feedDefense} ${styles.feedPop} ${styles[`defense_${recentDefense.outcome}`] ?? ""}`}
            data-testid="feed-defense"
            data-outcome={recentDefense.outcome}
          >
            {DEFENSE_LABELS[recentDefense.outcome]}
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
