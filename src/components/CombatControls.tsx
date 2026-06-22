import { COMBO_GAUGE_MAX, SPEED_MULTIPLIERS } from "../game/constants";
import type { SpeedMultiplier } from "../game/types";
import { useGameStore } from "../stores/gameStore";
import styles from "./CombatControls.module.css";

// TASK-015: 전투 컨트롤(프레젠테이셔널). 스토어 상태를 구독하고 액션만 호출한다.
//  - AUTO 토글: ON=자동 전투, OFF(MANUAL)=수동 탭 공격.
//  - 배속 토글: x1 ↔ x2(게임 시간 가속, 보스 타임아웃은 게임 시간 기준 → 밸런스 불변).
//  - 수동 공격 버튼: AUTO OFF에서만 활성.
//  - 수동 스킬(피니시) 버튼: AUTO OFF + 콤보 게이지 가득일 때만 활성(가정/TODO: 임시 스킬 1종).
type CombatControlsProps = {
  // CombatStage 무대 위 오버레이로 배치할 때 자체 테두리/배경/그림자를 벗긴다(액션·상태·testid 불변).
  bare?: boolean;
};

export function CombatControls({ bare = false }: CombatControlsProps = {}) {
  const combat = useGameStore((state) => state.combat);
  const autoMode = useGameStore((state) => state.autoMode);
  const speedMultiplier = useGameStore((state) => state.speedMultiplier);
  const comboGauge = useGameStore((state) => state.comboGauge);
  const toggleAuto = useGameStore((state) => state.toggleAuto);
  const setSpeedMultiplier = useGameStore((state) => state.setSpeedMultiplier);
  const manualAttack = useGameStore((state) => state.manualAttack);
  const triggerSkill = useGameStore((state) => state.triggerSkill);

  if (!combat) return null;

  const isAuto = autoMode === "AUTO";
  // 배속 토글: 현재 다음 배율(순환). x1→x2→x1.
  const currentIndex = SPEED_MULTIPLIERS.indexOf(speedMultiplier);
  const nextSpeed: SpeedMultiplier =
    SPEED_MULTIPLIERS[(currentIndex + 1) % SPEED_MULTIPLIERS.length];
  const skillReady = comboGauge >= COMBO_GAUGE_MAX;

  return (
    <section className={`${styles.controls} ${bare ? styles.bare : ""}`} aria-label="전투 컨트롤">
      <div className={styles.row}>
        <button
          type="button"
          className={`${styles.toggle} ${isAuto ? styles.toggleOn : ""}`}
          data-testid="auto-toggle"
          aria-pressed={isAuto}
          onClick={toggleAuto}
        >
          AUTO {isAuto ? "ON" : "OFF"}
        </button>

        <button
          type="button"
          className={styles.toggle}
          data-testid="speed-toggle"
          aria-label={`배속 x${speedMultiplier} (탭하면 x${nextSpeed})`}
          onClick={() => setSpeedMultiplier(nextSpeed)}
        >
          ▶▶ x{speedMultiplier}
        </button>
      </div>

      <div className={styles.row}>
        <button
          type="button"
          className={styles.action}
          data-testid="manual-attack"
          disabled={isAuto}
          aria-disabled={isAuto}
          onClick={manualAttack}
        >
          탭 공격
        </button>

        <button
          type="button"
          className={`${styles.action} ${styles.skill}`}
          data-testid="skill-button"
          disabled={isAuto || !skillReady}
          aria-disabled={isAuto || !skillReady}
          onClick={triggerSkill}
        >
          피니시{" "}
          <span className={styles.gauge} aria-hidden="true">
            {Math.round((comboGauge / COMBO_GAUGE_MAX) * 100)}%
          </span>
        </button>
      </div>
    </section>
  );
}
