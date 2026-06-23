import { SPEED_MULTIPLIERS } from "../game/constants";
import type { SpeedMultiplier } from "../game/types";
import { useGameStore } from "../stores/gameStore";
import styles from "./CombatControls.module.css";

// 전투 컨트롤(프레젠테이셔널). 자동 전투가 기본이므로 사용자 컨트롤은 배속 하나만 노출한다.
//  - 배속 토글: x1 ↔ x2(게임 시간 가속, 보스 타임아웃은 게임 시간 기준 → 밸런스 불변).
//  (AUTO 토글·수동 탭 공격·수동 스킬 UI는 제거됨. 스토어 로직/액션은 보존하되 화면에 노출하지 않는다.)
type CombatControlsProps = {
  // CombatStage 무대 위 오버레이로 배치할 때 자체 테두리/배경/그림자를 벗긴다(액션·상태·testid 불변).
  bare?: boolean;
};

export function CombatControls({ bare = false }: CombatControlsProps = {}) {
  const combat = useGameStore((state) => state.combat);
  const speedMultiplier = useGameStore((state) => state.speedMultiplier);
  const setSpeedMultiplier = useGameStore((state) => state.setSpeedMultiplier);

  if (!combat) return null;

  // 배속 토글: 현재 다음 배율(순환). x1→x2→x1.
  const currentIndex = SPEED_MULTIPLIERS.indexOf(speedMultiplier);
  const nextSpeed: SpeedMultiplier =
    SPEED_MULTIPLIERS[(currentIndex + 1) % SPEED_MULTIPLIERS.length];

  return (
    <section className={`${styles.controls} ${bare ? styles.bare : ""}`} aria-label="전투 컨트롤">
      <button
        type="button"
        className={styles.speedToggle}
        data-testid="speed-toggle"
        aria-label={`배속 x${speedMultiplier} (탭하면 x${nextSpeed})`}
        onClick={() => setSpeedMultiplier(nextSpeed)}
      >
        ▶▶ x{speedMultiplier}
      </button>
    </section>
  );
}
