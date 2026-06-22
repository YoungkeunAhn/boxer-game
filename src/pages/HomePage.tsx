import { useEffect, useState } from "react";
import { CombatStage } from "../components/CombatStage";
import { BoxerCreation } from "../components/BoxerCreation";
import { QuestPanel } from "../components/QuestPanel";
import { SkillPanel } from "../components/SkillPanel";
import { TabBar, type TabId } from "../components/TabBar";
import { TopBar } from "../components/TopBar";
import { TypeSwitchPanel } from "../components/TypeSwitchPanel";
import { UpgradePanel } from "../components/UpgradePanel";
import {
  selectQuestBadge,
  selectShopBadge,
  useGameStore,
} from "../stores/gameStore";
import styles from "./HomePage.module.css";

export function HomePage() {
  const boxer = useGameStore((state) => state.boxer);
  const offlineSummary = useGameStore((state) => state.offlineSummary);
  const message = useGameStore((state) => state.message);
  const storageWarning = useGameStore((state) => state.storageWarning);
  const pause = useGameStore((state) => state.pause);
  const resume = useGameStore((state) => state.resume);
  const reset = useGameStore((state) => state.reset);

  // TASK-020(P3): 휘발 탭 상태(라우터 미도입 — 가정). 기본=파이터(중앙 홈). 새로고침 시 파이터로 리셋(저장 안 함).
  const [activeTab, setActiveTab] = useState<TabId>("fighter");

  // 하단 탭 알림 뱃지. 현재 backing state 부재로 항상 false(상점=TASK-023·퀘스트=TASK-021에서 연결).
  const shopBadge = useGameStore(selectShopBadge);
  const questBadge = useGameStore(selectQuestBadge);

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
      <TopBar boxer={boxer} />

      {storageWarning && (
        <p className={styles.warning} role="alert">
          {storageWarning}
        </p>
      )}

      {message && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}

      {offlineSummary && offlineSummary.kills > 0 && (
        <p className={styles.offline} role="status">
          자리를 비운 동안 몬스터 {offlineSummary.kills.toLocaleString()}마리를 처치하고{" "}
          {offlineSummary.gold.toLocaleString()} 골드를 획득했습니다.
        </p>
      )}

      {/* 파이터 탭(홈): 기존 전투 화면 전체. 상단 바와 정보 중복을 줄이려 hero(타이틀·'처음부터')는 파이터 탭 내부로 옮겼다(표현만, 로직 불변). */}
      {activeTab === "fighter" && (
        <>
          <header className={styles.hero}>
            <div>
              <p className={styles.kicker}>ROAD TO CHAMPION</p>
              <h1 className={styles.title}>복서키우기</h1>
              <p className={styles.subtitle}>
                자동 전투로 골드를 모아 강화하고, 더 깊은 챕터로 전진하세요.
              </p>
            </div>
            <button
              className={styles.reset}
              type="button"
              onClick={() => {
                if (window.confirm("저장된 진행도를 지우고 처음부터 시작할까요?")) {
                  reset();
                }
              }}
            >
              처음부터
            </button>
          </header>

          {/* TASK-026: 흩어진 6개 전투 박스(헤더·상태·패널·포즈·컨트롤·쿨)를 단일 무대로 합성.
              BoxerStatus는 파이터 탭에서 미호출(파일은 보존). 데이터·로직·저장 무변경. */}
          <CombatStage />
          {/* TASK-017: 파이터 타입 외형 전환 패널(4종 카드). boxer/combat null이면 내부에서 null 가드. */}
          <TypeSwitchPanel />
          <UpgradePanel boxer={boxer} />
          {/* TASK-026 결정(무대 아래 재배치): 스킬 슬롯 장착/해제 진입점을 무대 아래 별도 섹션으로 유지. */}
          <SkillPanel boxer={boxer} />
        </>
      )}

      {/* 퀘스트 탭(TASK-021): 4탭·리스트·마일스톤 바. [이동]은 파이터 탭으로 라우팅. */}
      {activeTab === "quest" && (
        <QuestPanel boxer={boxer} onNavigateFighter={() => setActiveTab("fighter")} />
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
