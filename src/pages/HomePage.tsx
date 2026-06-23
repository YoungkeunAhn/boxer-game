import { useEffect, useState } from "react";
import { CombatStage } from "../components/CombatStage";
import { BoxerCreation } from "../components/BoxerCreation";
import { QuestPanel } from "../components/QuestPanel";
import { TabBar, type TabId } from "../components/TabBar";
import { TopBar } from "../components/TopBar";
import { UpgradePanel } from "../components/UpgradePanel";
import { formatCompactNumber } from "../game/format";
import {
  selectQuestBadge,
  selectShopBadge,
  useGameStore,
} from "../stores/gameStore";
import styles from "./HomePage.module.css";

export function HomePage() {
  const boxer = useGameStore((state) => state.boxer);
  const offlineSummary = useGameStore((state) => state.offlineSummary);
  const storageWarning = useGameStore((state) => state.storageWarning);
  const pause = useGameStore((state) => state.pause);
  const resume = useGameStore((state) => state.resume);

  // TASK-020(P3): 휘발 탭 상태(라우터 미도입 — 가정). 기본=파이터(중앙 홈). 새로고침 시 파이터로 리셋(저장 안 함).
  const [activeTab, setActiveTab] = useState<TabId>("fighter");

  // 하단 탭 알림 뱃지. 현재 backing state 부재로 항상 false(상점=TASK-023·퀘스트=TASK-021에서 연결).
  const shopBadge = useGameStore(selectShopBadge);
  const questBadge = useGameStore(selectQuestBadge);

  // 상단 바 재화 '+' → 상점 진입 시도. 상점 보류·잠금 상태라 진입은 차단하고 안내만 띄운다.
  const [shopNotice, setShopNotice] = useState(false);
  useEffect(() => {
    if (!shopNotice) return;
    const id = window.setTimeout(() => setShopNotice(false), 2_500);
    return () => window.clearTimeout(id);
  }, [shopNotice]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") pause();
      else resume();
    };
    const handlePageHide = () => pause();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    if (document.visibilityState !== "hidden") resume();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [pause, resume]);

  if (!boxer) {
    return (
      <main className={styles.page}>
        <BoxerCreation />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {/* TASK-020(P3): 모든 화면 공통 상단 바(프로필·레벨·경험치·재화·일일 타이머). */}
      <TopBar boxer={boxer} onOpenShop={() => setShopNotice(true)} />

      {shopNotice && (
        <p className={styles.notice} role="status">
          상점은 준비 중입니다.
        </p>
      )}

      {storageWarning && (
        <p className={styles.warning} role="alert">
          {storageWarning}
        </p>
      )}

      {offlineSummary && offlineSummary.kills > 0 && (
        <p className={styles.offline} role="status">
          자리를 비운 동안 몬스터 {formatCompactNumber(offlineSummary.kills)}마리를 처치하고{" "}
          {formatCompactNumber(offlineSummary.gold)} 골드를 획득했습니다.
        </p>
      )}

      {/* 파이터 탭(홈): 목업(예시이미지/메인ui1.png)에 맞춰 상단 히어로 타이틀을 제거하고
          상단 바 → 전투 무대 → 타입 → 강화 순서만 남긴다. '처음부터'는 무대 요약 칩으로 이동. */}
      {activeTab === "fighter" && (
        <>
          {/* TASK-026: 흩어진 6개 전투 박스(헤더·상태·패널·포즈·컨트롤·쿨)를 단일 무대로 합성.
              BoxerStatus는 파이터 탭에서 미호출(파일은 보존). 데이터·로직·저장 무변경.
              고정 높이 셸: 상단 바 + 전투 무대는 항상 보이게 고정하고, 타입·강화는 아래 스크롤 영역에 둔다. */}
          <CombatStage />
          <div className={styles.tabScroll}>
            {/* 파이터 타입은 생성 시 선택 고정(런타임 전환 패널 제거). */}
            <UpgradePanel boxer={boxer} />
            {/* 전용 스킬(SkillPanel) 섹션은 제거. 스킬은 경기장 하단 배치 + 발동 표시로 재구성 예정이나
                스킬 시스템이 미구현이라 본 작업에서는 UI를 만들지 않는다.
                상세: docs/ui/02-파이터-메인화면.md §6 "전용 스킬 경기장 하단 배치(미구현·TODO)". */}
          </div>
        </>
      )}

      {/* 퀘스트 탭(TASK-021): 4탭·리스트·마일스톤 바. [이동]은 파이터 탭으로 라우팅. */}
      {activeTab === "quest" && (
        <div className={styles.tabScroll}>
          <QuestPanel boxer={boxer} onNavigateFighter={() => setActiveTab("fighter")} />
        </div>
      )}

      {/* TASK-020(P3): 하단 5탭 네비. 보류 탭(상점·가방·경기장)은 잠금·진입 차단(자리 유지). */}
      <TabBar
        activeTab={activeTab}
        onSelect={setActiveTab}
        badges={{ shop: shopBadge, quest: questBadge }}
      />
    </main>
  );
}
