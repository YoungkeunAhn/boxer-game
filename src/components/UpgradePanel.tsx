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
  maxHp: {
    name: "체력",
    value: (boxer) =>
      calculateCombatStats(boxer.upgradeLevels, boxer.boxerType).maxHp.toLocaleString(),
  },
  defense: {
    name: "방어",
    value: (boxer) =>
      calculateCombatStats(boxer.upgradeLevels, boxer.boxerType).defense.toLocaleString(),
  },
  dodge: {
    name: "회피",
    value: (boxer) =>
      `${Math.round(calculateCombatStats(boxer.upgradeLevels, boxer.boxerType).dodge * 100)}%`,
  },
  counter: {
    name: "카운터",
    value: (boxer) =>
      `${calculateCombatStats(boxer.upgradeLevels, boxer.boxerType).counter.toFixed(2)}배`,
  },
};

// 기본 계열(공격) / 방어 계열로 그룹핑한다. UpgradeKey 9종은 그대로 노출한다.
const OFFENSE_KEYS: UpgradeKey[] = ["attackPower", "attackSpeed", "critRate", "critDamage", "goldBonus"];
const DEFENSE_KEYS: UpgradeKey[] = ["maxHp", "defense", "dodge", "counter"];

export function UpgradePanel({ boxer }: UpgradePanelProps) {
  const upgrade = useGameStore((state) => state.upgrade);

  const renderRow = (key: UpgradeKey) => {
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
  };

  return (
    <section className={styles.panel} aria-labelledby="upgrade-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>POWER UP</p>
          <h2 className={styles.title} id="upgrade-title">강화</h2>
          <p className={styles.description}>몬스터를 쓰러뜨려 번 골드로 더 빠르게 강해지세요.</p>
        </div>
      </div>

      <p className={styles.groupLabel}>공격 계열</p>
      <div className={styles.upgradeList}>{OFFENSE_KEYS.map(renderRow)}</div>

      <p className={styles.groupLabel}>방어 계열</p>
      <div className={styles.upgradeList}>{DEFENSE_KEYS.map(renderRow)}</div>
    </section>
  );
}
