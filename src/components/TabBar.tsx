import styles from "./TabBar.module.css";

// TASK-020(P3): 하단 5탭 네비게이션 식별자. 중앙 파이터가 홈/기본 탭이다.
export type TabId = "shop" | "bag" | "fighter" | "quest" | "arena";

type TabDef = {
  id: TabId;
  label: string;
  icon: string;
  // locked=true면 진입 차단(비활성·잠금 표시). 자리는 유지한다(향후 해제 대비).
  //   보류: 상점(TASK-023 골격)·가방(P4)·경기장(P5). 진입 가능: 파이터·퀘스트(TASK-021).
  locked: boolean;
};

// 표시 순서(좌→우). 중앙(index 2)이 파이터.
const TABS: readonly TabDef[] = [
  { id: "shop", label: "상점", icon: "🛒", locked: true },
  { id: "bag", label: "가방", icon: "🎒", locked: true },
  { id: "fighter", label: "파이터", icon: "🥊", locked: false },
  { id: "quest", label: "퀘스트", icon: "📋", locked: false },
  { id: "arena", label: "경기장", icon: "🏟️", locked: true },
];

type TabBarProps = {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
  // 알림 뱃지 표시 여부(탭별). 수령 가능한 보상/신규가 있을 때만 true(현재 backing state 부재로 전부 false).
  //   보류 탭(가방·경기장)은 뱃지 없음 — 키가 없으면 미표시.
  badges?: Partial<Record<TabId, boolean>>;
};

export function TabBar({ activeTab, onSelect, badges }: TabBarProps) {
  return (
    <nav className={styles.tabBar} data-testid="tab-bar" aria-label="메인 탭">
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        const showBadge = !tab.locked && Boolean(badges?.[tab.id]);
        return (
          <button
            key={tab.id}
            type="button"
            className={styles.tab}
            data-testid={`tab-${tab.id}`}
            data-active={isActive ? "true" : undefined}
            data-locked={tab.locked ? "true" : undefined}
            data-center={tab.id === "fighter" ? "true" : undefined}
            disabled={tab.locked}
            aria-disabled={tab.locked || undefined}
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              // 잠금 탭은 진입 차단(상태 변경 안 함). disabled로도 막히지만 방어적으로 가드한다.
              if (tab.locked) return;
              onSelect(tab.id);
            }}
          >
            <span className={styles.iconWrap}>
              <span className={styles.icon} aria-hidden="true">
                {tab.icon}
              </span>
              {tab.locked && (
                <span className={styles.lock} aria-hidden="true">
                  🔒
                </span>
              )}
              {showBadge && (
                <span
                  className={styles.badge}
                  data-testid={`tab-badge-${tab.id}`}
                  aria-label="알림"
                />
              )}
            </span>
            <span className={styles.label}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
