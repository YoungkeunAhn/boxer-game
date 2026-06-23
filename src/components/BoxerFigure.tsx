import {
  POSE_MAP,
  poseForKey,
  resolveAnimationKey,
  type AnimationKey,
} from "../game/animation";
import { BOXER_TYPE_META, GENDER_META, TYPE_TONE } from "../game/constants";
import type { BoxerType, Gender } from "../game/types";
import { useGameStore } from "../stores/gameStore";
import styles from "./BoxerFigure.module.css";

// 캐릭터 정지 아트(타입×성별 4종). 현재는 idle 1컷이라 포즈와 무관하게 같은 캐릭터 이미지를 보여주고,
//   동작 연출은 기존 포즈 트랜스폼(.sprite)·포즈 라벨·카운터 버스트로 표현한다.
//   포즈별 스프라이트 시트가 확정되면 data-animation-key/data-pose 기준으로 프레임을 교체한다(TODO: 아트 교체 태스크).
const BOXER_IMAGE: Readonly<Record<BoxerType, Record<Gender, string>>> = {
  INFIGHTER: {
    MALE: "/sprites/boxer_infighter_male.png",
    FEMALE: "/sprites/boxer_infighter_female.png",
  },
  OUT_BOXER: {
    MALE: "/sprites/boxer_outboxer_male.png",
    FEMALE: "/sprites/boxer_outboxer_female.png",
  },
};

// 스프라이트 시트 레이아웃: 1448×1086 = 4열 × 2행 = 8프레임(프레임 ≈ 362×543).
//   시트를 통째로 그리면 8캐릭터가 격자로 보이므로, 애니 키마다 한 프레임만 잘라 한 캐릭터로 보이게 한다.
//   프레임 배치(좌→우, 위→아래): 0 기본스탠스 · 1 스텝/풋워크 · 2 가드 · 3 스트레이트 /
//   4 잽 · 5 훅 · 6 어퍼 · 7 카운터.
const SHEET_COLS = 4;
const SHEET_ROWS = 2;
const KEY_FRAME: Readonly<Record<AnimationKey, number>> = {
  boxer_idle: 0,
  boxer_dodge: 1,
  boxer_guard: 2,
  boxer_right_straight: 3,
  boxer_left_jab: 4,
  boxer_left_hook: 5,
  boxer_right_hook: 6,
  boxer_left_upper: 6,
  boxer_right_upper: 6,
  boxer_counter: 7,
};

// 프레임 인덱스 → background-position(%) 문자열. background-size 400% 200%와 짝을 이뤄 한 칸만 노출한다.
function frameBackgroundPosition(index: number): string {
  const col = index % SHEET_COLS;
  const row = Math.floor(index / SHEET_COLS);
  const x = SHEET_COLS > 1 ? (col / (SHEET_COLS - 1)) * 100 : 0;
  const y = SHEET_ROWS > 1 ? (row / (SHEET_ROWS - 1)) * 100 : 0;
  return `${x}% ${y}%`;
}

// 타입/성별 4종 × 6포즈 스프라이트 플레이스홀더(아트 미확정). 키별 이모지로 매핑 구조만 시각화한다.
//   캐릭터 이미지가 없을 때(에셋 누락)만 이모지로 폴백한다.
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
type BoxerFigureProps = {
  // CombatStage 링 좌측 슬롯에 끼울 때 자체 테두리/배경/그림자를 벗긴다(표시 전용 — 합성 시 단일 무대 박스 유지).
  bare?: boolean;
};

export function BoxerFigure({ bare = false }: BoxerFigureProps = {}) {
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
  const spriteImage = BOXER_IMAGE[boxer.boxerType]?.[boxer.gender];

  return (
    <section
      className={`${styles.figure} ${bare ? styles.bare : ""}`}
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
        <span
          className={styles.sprite}
          aria-hidden="true"
          data-testid="boxer-figure-sprite"
          data-frame={spriteImage ? KEY_FRAME[animationKey] : undefined}
        >
          {spriteImage ? (
            // 시트에서 현재 애니 키에 해당하는 한 프레임만 크롭해 노출(통짜 렌더 금지).
            <span
              className={styles.spriteFrame}
              style={{
                backgroundImage: `url("${spriteImage}")`,
                backgroundPosition: frameBackgroundPosition(KEY_FRAME[animationKey]),
              }}
            />
          ) : (
            KEY_EMOJI[animationKey] ?? "🥊"
          )}
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
