import {
  calculateCombatStats,
  calculateUpgradeCost,
  isUpgradeAtMaxLevel,
} from "../game/formulas";
import type { Boxer, UpgradeKey } from "../game/types";
import { useGameStore } from "../stores/gameStore";
import styles from "./GamePanel.module.css";

type UpgradePanelProps = {
  boxer: Boxer;
};

const UPGRADE_LABELS: Record<UpgradeKey, { name: string; value: (boxer: Boxer) => string }> = {
  attackPower: {
    name: "공격력",
    value: (boxer) => calculateCombatStats(boxer.upgradeLevels).attackPower.toLocaleString(),
  },
  attackSpeed: {
    name: "공격속도",
    value: (boxer) => `${calculateCombatStats(boxer.upgradeLevels).attackSpeed.toFixed(1)}회/초`,
  },
  critRate: {
    name: "치명타율",
    value: (boxer) => `${Math.round(calculateCombatStats(boxer.upgradeLevels).critRate * 100)}%`,
  },
  critDamage: {
    name: "치명타 피해",
    value: (boxer) => `${calculateCombatStats(boxer.upgradeLevels).critDamage.toFixed(1)}배`,
  },
  goldBonus: {
    name: "골드 보너스",
    value: (boxer) => `+${Math.round(calculateCombatStats(boxer.upgradeLevels).goldBonus * 100)}%`,
  },
};

export function UpgradePanel({ boxer }: UpgradePanelProps) {
  const upgrade = useGameStore((state) => state.upgrade);

  return (
    <section className={styles.panel} aria-labelledby="upgrade-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>POWER UP</p>
          <h2 className={styles.title} id="upgrade-title">강화</h2>
          <p className={styles.description}>몬스터를 쓰러뜨려 번 골드로 더 빠르게 강해지세요.</p>
        </div>
      </div>

      <div className={styles.upgradeList}>
        {(Object.keys(UPGRADE_LABELS) as UpgradeKey[]).map((key) => {
          const level = boxer.upgradeLevels[key];
          const cost = calculateUpgradeCost(key, level);
          const isMax = isUpgradeAtMaxLevel(key, level);
          const label = UPGRADE_LABELS[key];
          const currentValue = label.value(boxer);
          const nextValue = isMax
            ? null
            : label.value({
                ...boxer,
                upgradeLevels: { ...boxer.upgradeLevels, [key]: level + 1 },
              });
          return (
            <div className={styles.upgradeRow} key={key} data-testid={`upgrade-row-${key}`}>
              <div>
                <strong>{label.name} <small>Lv. {level}</small></strong>
                <span>
                  {currentValue} {nextValue ? `→ ${nextValue}` : "· MAX"}
                </span>
              </div>
              <button
                className={styles.upgradeButton}
                data-testid={`upgrade-button-${key}`}
                disabled={isMax || boxer.gold < cost}
                type="button"
                onClick={() => upgrade(key)}
              >
                {isMax ? "MAX" : `${cost.toLocaleString()} G`}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
