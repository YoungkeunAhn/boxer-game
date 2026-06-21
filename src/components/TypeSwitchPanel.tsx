import {
  BOXER_TYPES,
  BOXER_TYPE_META,
  GENDERS,
  GENDER_META,
  TYPE_SKILLS,
} from "../game/constants";
import { useGameStore } from "../stores/gameStore";
import styles from "./TypeSwitchPanel.module.css";

// TASK-017: 파이터 타입 외형 전환 패널(프레젠테이셔널). 4종(타입×성별) 카드를 가로 스크롤로 렌더하고
//   현재 boxer.boxerType/gender 카드를 강조한다. 카드 클릭 시 switchType(type, gender)만 호출한다.
//   타입별 전용 스킬(TYPE_SKILLS)은 카드용 표시 라벨이다. 실제 슬롯 시스템(TASK-010)은 SkillPanel에 있고
//   TYPE_SKILLS는 그와 중복이라 정리 후보(constants.ts TODO 참조). combat/boxer null 가드.
type TypeGender = {
  boxerType: (typeof BOXER_TYPES)[number];
  gender: (typeof GENDERS)[number];
};

const CARDS: readonly TypeGender[] = BOXER_TYPES.flatMap((boxerType) =>
  GENDERS.map((gender) => ({ boxerType, gender })),
);

export function TypeSwitchPanel() {
  const boxer = useGameStore((state) => state.boxer);
  const combat = useGameStore((state) => state.combat);
  const switchType = useGameStore((state) => state.switchType);

  if (!boxer || !combat) return null;

  return (
    <section
      className={styles.panel}
      data-testid="type-switch-panel"
      aria-label="파이터 타입 전환"
    >
      <div className={styles.heading}>
        <p className={styles.eyebrow}>FIGHTER TYPE</p>
        <p className={styles.current} data-testid="type-switch-current">
          현재: {BOXER_TYPE_META[boxer.boxerType].label} · {GENDER_META[boxer.gender].label}
        </p>
      </div>

      <div className={styles.track} role="list">
        {CARDS.map(({ boxerType, gender }) => {
          const isCurrent =
            boxer.boxerType === boxerType && boxer.gender === gender;
          const skills = TYPE_SKILLS[boxerType];
          return (
            <button
              key={`${boxerType}-${gender}`}
              type="button"
              role="listitem"
              className={`${styles.card} ${isCurrent ? styles.cardCurrent : ""}`}
              data-testid={`type-switch-card-${boxerType}-${gender}`}
              data-current={isCurrent ? "true" : "false"}
              aria-pressed={isCurrent}
              onClick={() => switchType(boxerType, gender)}
            >
              <span className={styles.cardTitle}>
                {BOXER_TYPE_META[boxerType].label} · {GENDER_META[gender].label}
              </span>
              <span className={styles.cardTagline}>
                {BOXER_TYPE_META[boxerType].tagline}
              </span>
              <span className={styles.skills} data-testid={`type-switch-skills-${boxerType}-${gender}`}>
                <span className={styles.skillsLabel}>전용 스킬</span>
                <span className={styles.skillList}>
                  {skills.active.join(" · ")}
                </span>
                <span className={styles.passive}>패시브: {skills.passive}</span>
              </span>
              {isCurrent && (
                <span className={styles.badge} aria-hidden="true">
                  선택됨
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
