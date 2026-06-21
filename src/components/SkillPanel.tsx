import { getSkill, getSkillsForType } from "../data/skills";
import { ACTIVE_SKILL_SLOT_MAX } from "../game/constants";
import type { Boxer, SkillId } from "../game/types";
import { useGameStore } from "../stores/gameStore";
import styles from "./GamePanel.module.css";

type SkillPanelProps = {
  boxer: Boxer;
};

// 하단 전용 스킬 슬롯: 액티브 3슬롯 + 패시브 1슬롯. 표시는 스킬 표시명(getSkill().name)으로,
//   장착/해제는 TASK-010 액션(equipSkill/unequipSkill/equipPassive)을 그대로 사용한다.
//   data-testid(skill-slot-*/skill-equip-*/skill-unequip-*/skill-passive-*)는 기존 E2E 호환을 위해 보존한다.
export function SkillPanel({ boxer }: SkillPanelProps) {
  const equipSkill = useGameStore((state) => state.equipSkill);
  const unequipSkill = useGameStore((state) => state.unequipSkill);
  const equipPassive = useGameStore((state) => state.equipPassive);

  const available = getSkillsForType(boxer.boxerType);
  const activeSkills = available.filter((skill) => skill.kind === "ACTIVE");
  const passiveSkills = available.filter((skill) => skill.kind === "PASSIVE");
  const equipped = boxer.equippedSkills;

  // 빈 슬롯에 채울 다음 후보(아직 장착하지 않은 첫 액티브 스킬).
  const nextActiveCandidate = (): SkillId | null => {
    const found = activeSkills.find((skill) => !equipped.active.includes(skill.id));
    return found ? found.id : null;
  };

  return (
    <section className={styles.panel} aria-labelledby="skill-title" data-testid="skill-panel">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>SKILLS</p>
          <h2 className={styles.title} id="skill-title">전용 스킬</h2>
          <p className={styles.description}>
            기본 4종은 항상 사용합니다. 전용 스킬을 슬롯에 장착하면 쿨타임마다 자동 발동합니다.
          </p>
        </div>
      </div>

      <div className={styles.upgradeList}>
        {Array.from({ length: ACTIVE_SKILL_SLOT_MAX }).map((_, slot) => {
          const equippedId = equipped.active[slot] ?? null;
          const candidate = nextActiveCandidate();
          return (
            <div className={styles.upgradeRow} key={`active-slot-${slot}`} data-testid={`skill-slot-${slot}`}>
              <div>
                <strong>Slot {slot + 1}</strong>
                <span>{equippedId ? getSkill(equippedId).name : "비어 있음"}</span>
              </div>
              {equippedId ? (
                <button
                  className={styles.upgradeButton}
                  data-testid={`skill-unequip-${slot}`}
                  type="button"
                  onClick={() => unequipSkill(slot)}
                >
                  해제
                </button>
              ) : (
                <button
                  className={styles.upgradeButton}
                  data-testid={`skill-equip-${slot}`}
                  type="button"
                  disabled={candidate === null}
                  onClick={() => {
                    if (candidate) equipSkill(slot, candidate);
                  }}
                >
                  {candidate ? `장착 (${getSkill(candidate).name})` : "장착"}
                </button>
              )}
            </div>
          );
        })}

        <div className={styles.upgradeRow} data-testid="skill-passive-slot">
          <div>
            <strong>패시브</strong>
            <span>{equipped.passive ? getSkill(equipped.passive).name : "비어 있음"}</span>
          </div>
          <div className={styles.passiveButtons}>
            {passiveSkills.map((skill) => (
              <button
                key={skill.id}
                className={styles.upgradeButton}
                data-testid={`skill-passive-${skill.id}`}
                type="button"
                onClick={() => equipPassive(equipped.passive === skill.id ? null : skill.id)}
              >
                {equipped.passive === skill.id ? "해제" : skill.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
