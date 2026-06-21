import { useState } from "react";
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

// TASK-016: 9종 그대로 유지하고 표현만 공격/방어 두 그룹으로 정돈한다.
// 키·순서는 기존 UPGRADE_LABELS 정의 순서와 동일(수식·저장 불변, BALANCE/SCHEMA 범프 없음).
// (브랜치 009~013의 OFFENSE_KEYS/DEFENSE_KEYS 분류와 동일한 9종 그룹핑을 main의 탭 구조로 흡수한다.)
const UPGRADE_GROUPS = {
  attack: ["attackPower", "attackSpeed", "critRate", "critDamage", "goldBonus"],
  defense: ["maxHp", "defense", "dodge", "counter"],
} as const satisfies Record<string, readonly UpgradeKey[]>;

type UpgradeGroup = keyof typeof UPGRADE_GROUPS;

const GROUP_TABS: { group: UpgradeGroup; label: string }[] = [
  { group: "attack", label: "공격 계열" },
  { group: "defense", label: "방어 계열" },
];

// 표시 전용: 현재 표시 문자열과 다음 레벨 표시 문자열에서 증가량(+델타) 텍스트를 만든다.
// 단위(회/초·%·배·정수)가 스탯마다 다르므로 두 표시값의 숫자 부분 차이로 계산하고 단위 접미사를 보존한다.
// MAX(상한) 또는 다음값=현재값이면 null을 반환해 증가량 표기를 생략한다.
function formatDelta(current: string, next: string | null): string | null {
  if (next === null) {
    return null;
  }
  const currentNum = parseLeadingNumber(current);
  const nextNum = parseLeadingNumber(next);
  if (currentNum === null || nextNum === null) {
    return null;
  }
  const delta = nextNum - currentNum;
  if (delta <= 0) {
    return null;
  }
  // 소수 자릿수는 다음값 표시 포맷을 따른다(예: 1.0회/초 → 0.1, 2.0배 → 0.2).
  const decimals = decimalPlaces(next);
  const suffix = unitSuffix(next);
  const deltaText = decimals > 0 ? delta.toFixed(decimals) : Math.round(delta).toLocaleString();
  return `+${deltaText}${suffix}`;
}

function parseLeadingNumber(text: string): number | null {
  const match = text.match(/-?[\d,]+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function decimalPlaces(text: string): number {
  const match = text.match(/\.(\d+)/);
  return match ? match[1].length : 0;
}

function unitSuffix(text: string): string {
  // 선두의 '+'와 숫자 부분을 제거한 나머지를 단위로 본다("1.0회/초"→"회/초", "5%"→"%", "2.0배"→"배").
  return text.replace(/^\+/, "").replace(/-?[\d,]+(?:\.\d+)?/, "").trim();
}

export function UpgradePanel({ boxer }: UpgradePanelProps) {
  const upgrade = useGameStore((state) => state.upgrade);
  const [activeGroup, setActiveGroup] = useState<UpgradeGroup>("attack");

  return (
    <section className={styles.panel} aria-labelledby="upgrade-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>POWER UP</p>
          <h2 className={styles.title} id="upgrade-title">강화</h2>
          <p className={styles.description}>몬스터를 쓰러뜨려 번 골드로 더 빠르게 강해지세요.</p>
        </div>
      </div>

      <div className={styles.upgradeTabs} role="tablist" aria-label="강화 계열">
        {GROUP_TABS.map(({ group, label }) => {
          const isActive = group === activeGroup;
          return (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-pressed={isActive}
              className={`${styles.upgradeTab} ${isActive ? styles.upgradeTabActive : ""}`}
              data-testid={`upgrade-tab-${group}`}
              onClick={() => setActiveGroup(group)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {GROUP_TABS.map(({ group }) => (
        <div
          key={group}
          className={styles.upgradeList}
          data-testid={`upgrade-group-${group}`}
          hidden={group !== activeGroup}
        >
          {UPGRADE_GROUPS[group].map((key) => {
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
            const delta = formatDelta(currentValue, nextValue);
            return (
              <div className={styles.upgradeRow} key={key} data-testid={`upgrade-row-${key}`}>
                <div>
                  <strong>{label.name} <small>Lv. {level}</small></strong>
                  <span>
                    {currentValue} {nextValue ? `→ ${nextValue}` : "· MAX"}
                  </span>
                  {delta ? (
                    <span className={styles.upgradeDelta} data-testid={`upgrade-delta-${key}`}>
                      다음 레벨 {delta}
                    </span>
                  ) : null}
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
      ))}
    </section>
  );
}
