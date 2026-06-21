import { POSE_MAP, poseForKey, resolveAnimationKey } from "../game/animation";
import { BOXER_TYPE_META, GENDER_META, TYPE_TONE } from "../game/constants";
import { useGameStore } from "../stores/gameStore";
import styles from "./BoxerFigure.module.css";

// 타입/성별 4종 × 6포즈 스프라이트 플레이스홀더(아트 미확정). 키별 이모지로 매핑 구조만 시각화한다.
//   아트 확정 시 data-animation-key / data-pose 기반으로 실제 스프라이트 시트로 교체한다(TODO).
const KEY_EMOJI: Readonly<Record<string, string>> = {
  boxer_idle: "🧍",
  boxer_guard: "🛡️",
  boxer_dodge: "💨",
  boxer_left_jab: "👊",
  boxer_right_straight: "🥊",
  boxer_left_hook: "🤜",
  boxer_right_hook: "🤛",
  boxer_left_upper: "⬆️",
  boxer_right_upper: "⤴️",
  boxer_counter: "💥",
};

// TASK-018: 타입별 6포즈 애니메이션 — 표시 전용 프레젠테이셔널 컴포넌트.
//   스토어 상태(boxer.boxerType/gender, lastAttack, recentDefense)에서 resolveAnimationKey/POSE_MAP으로
//   현재 애니 키·포즈·리치·타입 톤을 도출해 data-속성 + 플레이스홀더 스프라이트를 렌더한다(로직 없음).
//   타입 전환(TASK-017) 시 boxerType이 바뀌면 6포즈 세트(POSE_MAP)와 톤이 함께 교체된다.
export function BoxerFigure() {
  const boxer = useGameStore((state) => state.boxer);
  const combat = useGameStore((state) => state.combat);
  const lastAttack = useGameStore((state) => state.lastAttack);
  const recentDefense = useGameStore((state) => state.recentDefense);

  if (!boxer || !combat) return null;

  // TODO(TASK-018 후속): 현재는 시각 인자를 주지 않아 모션 홀드 윈도우가 작동하지 않는다.
  //   store가 lastAttack/recentDefense를 틱마다 리셋하지 않고 유지하므로, 한 번 방어 이벤트가
  //   나면 우선순위상 방어 분기가 이후 공격을 가린다(resolveAnimationKey 주석 참조). 실제 스프라이트
  //   아트 도입 시 store에 비저장 lastAttackAt/lastDefenseAt를 노출하고 now와 함께 주입해
  //   '최근 이벤트' 기준으로 도출하도록 보정한다. 플레이스홀더 단계에선 현 동작을 그대로 둔다.
  const animationKey = resolveAnimationKey({ lastAttack, recentDefense });
  const pose = poseForKey(boxer.boxerType, animationKey);
  const descriptor = POSE_MAP[boxer.boxerType][pose];
  const tone = TYPE_TONE[boxer.boxerType];
  const isCounter = animationKey === "boxer_counter";

  return (
    <section
      className={styles.figure}
      data-testid="boxer-figure"
      data-boxer-type={boxer.boxerType}
      data-gender={boxer.gender}
      data-animation-key={animationKey}
      data-pose={pose}
      data-reach={descriptor.reach}
      data-effect={tone.effect}
      data-counter={isCounter ? "true" : "false"}
      style={{ ["--type-accent" as string]: tone.accentColor }}
      aria-label={`${BOXER_TYPE_META[boxer.boxerType].label} ${GENDER_META[boxer.gender].label} · ${descriptor.labelKo}`}
    >
      <div className={styles.stage}>
        <span className={styles.sprite} aria-hidden="true" data-testid="boxer-figure-sprite">
          {KEY_EMOJI[animationKey] ?? "🥊"}
        </span>
        {isCounter && (
          <span className={styles.counterBurst} aria-hidden="true" data-testid="boxer-figure-counter">
            COUNTER!
          </span>
        )}
      </div>
      <p className={styles.poseLabel} data-testid="boxer-figure-pose-label">
        {descriptor.labelKo}
      </p>
    </section>
  );
}
