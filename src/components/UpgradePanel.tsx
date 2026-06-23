import { useCallback, useEffect, useRef, useState } from "react";
import {
  calculateCombatStats,
  calculateUpgradeCost,
  isUpgradeAtMaxLevel,
} from "../game/formulas";
import type { Boxer, UpgradeKey } from "../game/types";
import { formatCompactNumber } from "../game/format";
import { UPGRADE_COIN, upgradeIconForKey } from "../data/assets";
import { useGameStore } from "../stores/gameStore";
import styles from "./GamePanel.module.css";

// 강화 버튼을 길게 누르면 연속 강화. 첫 1회는 onClick(탭·키보드)이 처리하고,
// 누르고 있는 동안 초기 지연 후 점점 빨라지며 반복한다.
const HOLD_INITIAL_DELAY_MS = 350;
const HOLD_START_INTERVAL_MS = 180;
const HOLD_MIN_INTERVAL_MS = 50;
const HOLD_ACCEL = 0.85;

// 포인터를 누르는 동안 action을 반복 실행한다. 버튼 밖에서 손을 떼거나
// 비활성화되어도 멈추도록 release는 window에서 듣는다.
function useHoldRepeat(action: () => void) {
  const actionRef = useRef(action);
  actionRef.current = action;
  const timerRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (timerRef.current !== null) return; // 이미 진행 중
    let interval = HOLD_START_INTERVAL_MS;
    const tick = () => {
      actionRef.current();
      interval = Math.max(HOLD_MIN_INTERVAL_MS, interval * HOLD_ACCEL);
      timerRef.current = window.setTimeout(tick, interval);
    };
    timerRef.current = window.setTimeout(tick, HOLD_INITIAL_DELAY_MS);
  }, []);

  useEffect(() => {
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      stop();
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [stop]);

  return start;
}

type UpgradePanelProps = {
  boxer: Boxer;
};

const UPGRADE_LABELS: Record<UpgradeKey, { name: string; value: (boxer: Boxer) => string }> = {
  attackPower: {
    name: "공격력",
    value: (boxer) => formatCompactNumber(calculateCombatStats(boxer.upgradeLevels).attackPower),
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
      formatCompactNumber(calculateCombatStats(boxer.upgradeLevels, boxer.boxerType).maxHp),
  },
  defense: {
    name: "방어",
    value: (boxer) =>
      formatCompactNumber(calculateCombatStats(boxer.upgradeLevels, boxer.boxerType).defense),
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
  const deltaText = decimals > 0 ? delta.toFixed(decimals) : formatCompactNumber(Math.round(delta));
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

// 강화별 아이콘 폴백 이모지. 전용 아트(upgradeIconForKey)가 있으면 이미지가 우선한다.
const UPGRADE_ICONS: Record<UpgradeKey, string> = {
  attackPower: "🥊",
  attackSpeed: "⚡",
  critRate: "🎯",
  critDamage: "💥",
  goldBonus: "🪙",
  maxHp: "❤️",
  defense: "🛡️",
  dodge: "💨",
  counter: "↩️",
};

type UpgradeCardProps = {
  boxer: Boxer;
  upgradeKey: UpgradeKey;
  onUpgrade: (key: UpgradeKey) => void;
};

// 카드 영역 전체가 강화 버튼이다(별도 버튼 없음 — 영역을 누르면 강화). 목업의 카드 그리드 구성.
function UpgradeCard({ boxer, upgradeKey, onUpgrade }: UpgradeCardProps) {
  const level = boxer.upgradeLevels[upgradeKey];
  const cost = calculateUpgradeCost(upgradeKey, level);
  const isMax = isUpgradeAtMaxLevel(upgradeKey, level);
  const label = UPGRADE_LABELS[upgradeKey];
  const currentValue = label.value(boxer);
  const nextValue = isMax
    ? null
    : label.value({
        ...boxer,
        upgradeLevels: { ...boxer.upgradeLevels, [upgradeKey]: level + 1 },
      });
  const delta = formatDelta(currentValue, nextValue);
  const disabled = isMax || boxer.gold < cost;
  const iconSrc = upgradeIconForKey(upgradeKey);

  // 길게 누르면 반복 강화. 첫 1회는 onClick이 처리한다(탭·키보드 모두 지원).
  const startHold = useHoldRepeat(() => onUpgrade(upgradeKey));

  const [pressed, setPressed] = useState(false);
  const handlePointerDown = () => {
    if (disabled) return;
    setPressed(true);
    startHold();
  };

  return (
    <div className={styles.upgradeCell} data-testid={`upgrade-row-${upgradeKey}`}>
      <button
        className={`${styles.upgradeCard} ${pressed ? styles.upgradeButtonPressed : ""}`}
        data-testid={`upgrade-button-${upgradeKey}`}
        disabled={disabled}
        type="button"
        onClick={() => onUpgrade(upgradeKey)}
        onPointerDown={handlePointerDown}
        onAnimationEnd={() => setPressed(false)}
      >
        <span className={styles.upgradeCardName}>
          {label.name} <small>Lv. {level}</small>
        </span>
        {iconSrc ? (
          <img className={styles.upgradeCardIconImg} src={iconSrc} alt="" aria-hidden="true" />
        ) : (
          <span className={styles.upgradeCardIcon} aria-hidden="true">
            {UPGRADE_ICONS[upgradeKey]}
          </span>
        )}
        <span className={styles.upgradeCardValue}>
          {/* 능력치 표시 앵커(stat-*): 현재값만 감싸 정확히 매칭(다음값 '→ N'은 바깥). */}
          <span data-testid={`stat-${upgradeKey}`}>{currentValue}</span>{" "}
          {nextValue ? `→ ${nextValue}` : "· MAX"}
        </span>
        {delta ? (
          <span className={styles.upgradeDelta} data-testid={`upgrade-delta-${upgradeKey}`}>
            {delta}
          </span>
        ) : null}
        <span className={`${styles.upgradeCardCost} ${isMax ? styles.upgradeCardCostMax : ""}`}>
          {isMax ? (
            "MAX"
          ) : (
            <>
              <img className={styles.upgradeCoin} src={UPGRADE_COIN} alt="" aria-hidden="true" />
              {`${formatCompactNumber(cost)} G`}
            </>
          )}
        </span>
      </button>
    </div>
  );
}

export function UpgradePanel({ boxer }: UpgradePanelProps) {
  const upgrade = useGameStore((state) => state.upgrade);
  const [activeGroup, setActiveGroup] = useState<UpgradeGroup>("attack");

  return (
    <section className={styles.panel} aria-labelledby="upgrade-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>POWER UP</p>
          {/* 제목 "강화"는 화면에서 숨기되(요청) 노드·id는 보존 — aria-labelledby·E2E(#upgrade-title toBeVisible)가 의존. */}
          <h2 className={styles.srOnly} id="upgrade-title">강화</h2>
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
          className={styles.upgradeGrid}
          data-testid={`upgrade-group-${group}`}
          hidden={group !== activeGroup}
        >
          {UPGRADE_GROUPS[group].map((key) => (
            <UpgradeCard key={key} boxer={boxer} upgradeKey={key} onUpgrade={upgrade} />
          ))}
        </div>
      ))}
    </section>
  );
}
