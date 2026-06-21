import { calculateCombatStats } from "../game/formulas";
import { ATTACK_COOLDOWN_MS, ATTACK_TYPES } from "../game/constants";
import type { AttackType, Boxer, CombatRuntime } from "../game/types";
import styles from "./GamePanel.module.css";

type SkillCooldownBarProps = {
  boxer: Boxer;
  combat: CombatRuntime;
  // 표시 전용 기준 시각(스토어 틱마다 갱신되는 상태에서 파생). 로직/타이머를 새로 만들지 않는다.
  now: number;
};

const ATTACK_LABELS: Record<AttackType, string> = {
  JAB: "잽",
  STRAIGHT: "스트레이트",
  HOOK: "훅",
  UPPER: "어퍼",
};

// 기본 공격 4종(잽/스트레이트/훅/어퍼)의 쿨타임 진행도를 표시한다.
//   실효 쿨타임 = ATTACK_COOLDOWN_MS / attackSpeed(constants·formulas와 동일 규칙).
//   진행도 = clamp((실효쿨 - 남은시간) / 실효쿨, 0~1). 남은시간 = nextReadyAt - now.
//   프레젠테이셔널: now는 인자로 받고 여기서 시간을 흐르게 하지 않는다.
export function SkillCooldownBar({ boxer, combat, now }: SkillCooldownBarProps) {
  const attackSpeed = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType).attackSpeed;

  return (
    <section className={styles.panel} aria-labelledby="skill-cooldown-title" data-testid="skill-cooldown-panel">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>BASIC</p>
          <h2 className={styles.title} id="skill-cooldown-title">기본 공격</h2>
          <p className={styles.description}>잽·스트레이트·훅·어퍼가 각자 쿨타임으로 자동 발동합니다.</p>
        </div>
      </div>

      <div className={styles.cooldownList}>
        {ATTACK_TYPES.map((type) => {
          const effectiveCooldown = attackSpeed > 0 ? ATTACK_COOLDOWN_MS[type] / attackSpeed : ATTACK_COOLDOWN_MS[type];
          const remaining = Math.max(0, combat.nextReadyAt[type] - now);
          const ready = remaining <= 0;
          const progress = effectiveCooldown > 0
            ? Math.max(0, Math.min(100, ((effectiveCooldown - remaining) / effectiveCooldown) * 100))
            : 100;
          return (
            <div className={styles.cooldownRow} key={type} data-testid={`cooldown-${type}`}>
              <div className={styles.cooldownLabel}>
                <strong>{ATTACK_LABELS[type]}</strong>
                <span>{ready ? "준비됨" : `${(remaining / 1_000).toFixed(1)}초`}</span>
              </div>
              <div
                className={styles.cooldownTrack}
                role="progressbar"
                aria-label={`${ATTACK_LABELS[type]} 쿨타임`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <div
                  className={`${styles.cooldownFill} ${ready ? styles.cooldownReady : ""}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
