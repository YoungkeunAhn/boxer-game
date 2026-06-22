import { useRef } from "react";
import { BoxerFigure } from "./BoxerFigure";
import { CombatControls } from "./CombatControls";
import { SkillCooldownBar } from "./SkillCooldownBar";
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
  calculateCombatStats,
  calculateMonsterAttackPower,
} from "../game/formulas";
import type {
  AttackType,
  ComboId,
  DefenseOutcome,
  Hand,
} from "../game/types";
import { useGameStore } from "../stores/gameStore";
import gameStyles from "./GamePanel.module.css";
import styles from "./CombatStage.module.css";

// TASK-026: 파이터 메인화면 최종 합성.
//   기존 6개 전투 박스(CombatHeader·BoxerStatus·CombatPanel·BoxerFigure·CombatControls·SkillCooldownBar)를
//   단일 테두리 <CombatStage> 한 박스로 합성한다. 표시 전용 — 데이터는 전부 기존 셀렉터·순수 함수에서
//   파생하며 새 계산/로직/타이머를 만들지 않는다. e2e가 의존하는 data-testid·aria 앵커는 같은 의미의
//   노드에 그대로 보존한다(combat-title 섹션·boxer-status-title 섹션·combat-badge 등).

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
  const retryBoss = useGameStore((state) => state.retryBoss);
  const getNow = useGameStore((state) => state.getNow);

  // CombatPanel와 동일: 같은 공격/방어 결과가 연속될 때도 CSS 애니메이션을 재시동하기 위한 단조 카운터.
  //   객체 식별자(스토어가 매 틱 새 객체를 set)가 바뀔 때만 증가시킨다. setState/타이머/난수 없음.
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
  const monsterAttack = calculateMonsterAttackPower(runtime.position);
  // TASK-017: 타입 전환이 표시 능력치에 반영되도록 boxerType을 전달한다(typeMultiplier 정합).
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

  // 보스 강공격 WARNING: 기존 상태(monsterAttackPrep)가 세팅될 때만 표시(신규 로직 없음).
  const bossWarning = stage.isBoss && runtime.monsterAttackPrep !== null;

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
      {/* 정체성 스트립: 기존 BoxerStatus의 정보를 단일 무대 상단으로 흡수(중복 박스 제거).
          e2e 앵커 보존: boxer-status-title 섹션·#boxer-status-title(이름)·골드 'N G'·boxer-identity·
          stage-meta/stage-position/stage-mode·stat-* 전부 같은 의미 노드에 유지. */}
      <section className={styles.identity} aria-labelledby="boxer-status-title">
        <div className={styles.identityHead}>
          <div className={styles.identityName}>
            <p className={gameStyles.eyebrow}>My boxer</p>
            <h2 className={gameStyles.title} id="boxer-status-title">
              {boxer.name}
            </h2>
            <p className={styles.identitySub} data-testid="boxer-identity">
              {BOXER_TYPE_META[boxer.boxerType].label} · {GENDER_META[boxer.gender].label}
            </p>
          </div>
          <span className={gameStyles.badge}>{boxer.gold.toLocaleString()} G</span>
        </div>

        <div className={gameStyles.topMeta} data-testid="stage-meta">
          <div className={gameStyles.topMetaItem}>
            <span>스테이지</span>
            <strong data-testid="stage-position">
              {stage.chapter}-{stage.stage}
            </strong>
          </div>
          <div className={gameStyles.topMetaItem}>
            <span>챕터</span>
            <strong>{stage.chapterName}</strong>
          </div>
          <div className={gameStyles.topMetaItem}>
            <span>진행</span>
            <strong data-testid="stage-mode">
              {stage.isBoss ? "보스전" : runtime.isFarming ? "파밍" : "전투"}
            </strong>
          </div>
        </div>

        <dl className={styles.stats}>
          <div className={gameStyles.stat}>
            <dt>공격력</dt>
            <dd data-testid="stat-attackPower">{stats.attackPower.toLocaleString()}</dd>
          </div>
          <div className={gameStyles.stat}>
            <dt>공격속도</dt>
            <dd data-testid="stat-attackSpeed">{stats.attackSpeed.toFixed(1)}회/초</dd>
          </div>
          <div className={gameStyles.stat}>
            <dt>치명타율</dt>
            <dd data-testid="stat-critRate">{Math.round(stats.critRate * 100)}%</dd>
          </div>
          <div className={gameStyles.stat}>
            <dt>치명타 피해</dt>
            <dd data-testid="stat-critDamage">{stats.critDamage.toFixed(1)}배</dd>
          </div>
          <div className={gameStyles.stat}>
            <dt>골드 보너스</dt>
            <dd data-testid="stat-goldBonus">+{Math.round(stats.goldBonus * 100)}%</dd>
          </div>
          <div className={gameStyles.stat}>
            <dt>총 처치</dt>
            <dd data-testid="stat-totalKills">{boxer.totalKills.toLocaleString()}마리</dd>
          </div>
        </dl>
      </section>

      {/* A. 월드맵 바 + 5칸 진행바 (CombatHeader topRow/progress 흡수). */}
      <section
        className={styles.combat}
        data-testid="combat-header"
        aria-labelledby="combat-title"
        data-boxer-type={boxer.boxerType}
      >
        <div className={styles.worldRow}>
          {/* TODO(후속): 월드맵 선택/재방문 화면. 이번 태스크는 표기만(비활성). */}
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
          <span
            className={`${gameStyles.badge} ${stage.isBoss ? gameStyles.bossBadge : ""} ${styles.badge}`}
            data-testid="combat-badge"
          >
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

        {/* combat-title 앵커(섹션 라벨). 현재 상대 몬스터명을 무대 제목으로 노출한다(가시 노드 — 탭 판정/E2E 의존).
            챕터 테마명은 아래 몬스터 카드(cardSub)에서 한 번만 노출한다(중복 텍스트 → strict-mode 위반 방지). */}
        <div className={styles.combatTitleRow}>
          <p className={gameStyles.eyebrow}>
            CHAPTER {runtime.position.chapter} · STAGE {runtime.position.stage}
          </p>
          <h2 className={styles.combatTitle} id="combat-title">
            {stage.monsterName}
          </h2>
        </div>

        {/* B. 파이터 카드(좌) VS 몬스터 카드(우) (CombatHeader cards 흡수). */}
        <div className={styles.cards}>
          <div className={styles.card} data-testid="boxer-card">
            <p className={styles.cardEyebrow}>BOXER</p>
            <p className={styles.cardName} data-testid="boxer-card-name">
              {boxer.name}
            </p>
            <p className={styles.cardSub} data-testid="boxer-card-type">
              {BOXER_TYPE_META[boxer.boxerType].label} · {GENDER_META[boxer.gender].label}
            </p>
            <p className={styles.cardHp} data-testid="boxer-card-hp">
              ❤ {runtime.boxerHp.toLocaleString()} / {runtime.boxerMaxHp.toLocaleString()}
            </p>
            <p className={styles.cardAttack} data-testid="boxer-card-attack">
              🔥 {stats.attackPower.toLocaleString()}
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
            <p className={styles.cardHp} data-testid="monster-card-hp">
              ❤ {runtime.monsterHp.toLocaleString()} / {stage.maxHp.toLocaleString()}
            </p>
            <p className={styles.cardAttack} data-testid="monster-card-attack">
              🔥 {monsterAttack.toLocaleString()}
            </p>
          </div>
        </div>

        {/* C. 링 무대: BoxerFigure(좌) · 몬스터 아바타(우) + 무대 위 오버레이. */}
        <div className={`${styles.ring} ${boxer.boxerType === "INFIGHTER" ? gameStyles.arenaShake : ""}`}>
          {/* 우상단 오버레이: AUTO/배속/수동 컨트롤. */}
          <div className={styles.overlayControls}>
            <CombatControls bare />
          </div>

          <div className={styles.ringRow}>
            <div className={styles.figureSlot} data-testid="arena-boxer">
              {/* 좌측 슬롯: 타입별 6포즈 스프라이트(아트 끼울 자리: data-animation-key/data-pose 유지). */}
              <BoxerFigure bare />
              {/* CombatPanel가 노출하던 avatar 모션 키 노드를 보존한다(presentation/animation spec의
                  arena-boxer 하위 [data-attack-key] 매핑 검증용). 시각적으로는 숨김. */}
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
            </div>

            <span className={styles.ringVersus} aria-hidden="true">VS</span>

            <div className={styles.monsterSlot} data-testid="arena-monster">
              <div
                className={`${gameStyles.avatar} ${gameStyles.avatarMonster} ${isGroggy ? gameStyles.avatarGroggy : ""}`}
                aria-hidden="true"
              >
                {stage.isBoss ? "👹" : "👾"}
              </div>
              <span className={styles.fighterName}>{stage.monsterName}</span>
            </div>
          </div>

          {/* 중앙 오버레이: 데미지/콤보/스킬/방어 피드. */}
          <div className={styles.overlayFeed} data-testid="combat-feed" aria-live="polite">
            {lastAttack && (
              <span
                key={`dmg-${attackSeqRef.current}`}
                className={`${lastAttack.isCritical ? gameStyles.critical : gameStyles.feedDamage} ${gameStyles.feedPop}`}
                data-testid="feed-damage"
              >
                {lastAttack.isCritical ? "치명타! " : "타격 "}
                {lastAttack.damage.toLocaleString()}
              </span>
            )}
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
            {recentDefense && recentDefense.outcome !== "HIT" && (
              <span
                key={`def-${defenseSeqRef.current}`}
                className={`${gameStyles.feedDefense} ${gameStyles.feedPop} ${gameStyles[`defense_${recentDefense.outcome}`] ?? ""}`}
                data-testid="feed-defense"
                data-outcome={recentDefense.outcome}
              >
                {DEFENSE_LABELS[recentDefense.outcome]}
              </span>
            )}
          </div>

          {/* 우하단 오버레이: 기본 공격 4종 쿨타임(원형/바). now는 주입 시계에서 읽는다. */}
          <div className={styles.overlayCooldown}>
            <SkillCooldownBar boxer={boxer} combat={runtime} now={getNow()} bare />
          </div>
        </div>

        {bossWarning && (
          <div className={gameStyles.bossWarning} data-testid="boss-warning" role="status">
            ⚠ WARNING
          </div>
        )}

        {/* HP/그로기 상태 바: 링 하단. */}
        <div className={gameStyles.health}>
          <div className={gameStyles.healthLabel}>
            <span>복서 HP</span>
            <strong>
              {Math.max(0, Math.round(runtime.boxerHp)).toLocaleString()} /{" "}
              {Math.round(runtime.boxerMaxHp).toLocaleString()}
            </strong>
          </div>
          <div
            className={gameStyles.healthTrack}
            role="progressbar"
            data-testid="boxer-hp"
            aria-label="복서 체력"
            aria-valuemin={0}
            aria-valuemax={Math.round(runtime.boxerMaxHp)}
            aria-valuenow={Math.max(0, Math.round(runtime.boxerHp))}
          >
            <div className={`${gameStyles.healthFill} ${gameStyles.boxerHpFill}`} style={{ width: `${boxerHpPercent}%` }} />
          </div>
        </div>

        <div className={gameStyles.health}>
          <div className={gameStyles.healthLabel}>
            <span>몬스터 HP</span>
            <strong>
              {runtime.monsterHp.toLocaleString()} / {stage.maxHp.toLocaleString()}
            </strong>
          </div>
          <div
            className={gameStyles.healthTrack}
            role="progressbar"
            data-testid="monster-hp"
            aria-label={`${stage.monsterName} 체력`}
            aria-valuemin={0}
            aria-valuemax={stage.maxHp}
            aria-valuenow={runtime.monsterHp}
          >
            <div className={gameStyles.healthFill} style={{ width: `${monsterHpPercent}%` }} />
          </div>
        </div>

        {groggyActive && (
          <div className={gameStyles.health} data-testid="groggy">
            <div className={gameStyles.healthLabel}>
              <span>{isGroggy ? "그로기!" : "그로기 게이지"}</span>
              <strong>
                {Math.round(runtime.groggyGauge).toLocaleString()} /{" "}
                {Math.round(runtime.groggyMax).toLocaleString()}
              </strong>
            </div>
            <div
              className={gameStyles.healthTrack}
              role="progressbar"
              data-testid="groggy-bar"
              aria-label="보스 그로기"
              aria-valuemin={0}
              aria-valuemax={Math.round(runtime.groggyMax)}
              aria-valuenow={Math.round(runtime.groggyGauge)}
            >
              <div
                className={`${gameStyles.healthFill} ${gameStyles.groggyFill} ${isGroggy ? gameStyles.groggyActive : ""}`}
                style={{ width: `${groggyPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* 하단 상태줄: 기본 보상 + 보스 타이머. */}
        <div className={gameStyles.combatMeta}>
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

        {runtime.isFarming && (
          <button className={gameStyles.button} type="button" onClick={retryBoss}>
            보스 다시 도전하기 ({Math.round(BOSS_TIME_LIMIT_MS / 1_000)}초)
          </button>
        )}
      </section>
    </div>
  );
}
