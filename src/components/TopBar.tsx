import { CURRENCY_GOLD } from "../data/assets";
import { formatCompactNumber } from "../game/format";
import type { Boxer } from "../game/types";
import {
  selectExpProgress,
  selectExpToNext,
} from "../stores/gameStore";
import styles from "./TopBar.module.css";

type TopBarProps = {
  boxer: Boxer;
  // 재화 캡슐 '+' 버튼 동작(상점 진입 시도). 상점 보류 상태라 진입은 차단되고 안내만 뜬다.
  onOpenShop?: () => void;
};

// 프로필 아바타 = 현재 복서 스프라이트(타입×성별)의 idle 프레임 머리 부분 크롭(초상).
function avatarSprite(boxer: Boxer): string {
  const type = boxer.boxerType === "OUT_BOXER" ? "outboxer" : "infighter";
  const gender = boxer.gender === "FEMALE" ? "female" : "male";
  return `/sprites/boxer_${type}_${gender}.png`;
}

// TASK-020(P3): 모든 화면 공통 상단 바. 프레젠테이셔널 — 스토어 셀렉터로만 구동한다.
//   좌측: 프로필·복서 이름·플레이어 레벨(Lv)·경험치 바(%). 우측 재화: [🪙골드][💎다이아].
export function TopBar({ boxer, onOpenShop }: TopBarProps) {
  const expToNext = selectExpToNext(boxer);
  const expProgress = selectExpProgress(boxer);
  const expPercent = Math.round(expProgress * 100);

  return (
    <header className={styles.topBar} data-testid="top-bar">
      <div className={styles.profile}>
        <span
          className={styles.avatar}
          style={{ backgroundImage: `url("${avatarSprite(boxer)}")` }}
          aria-hidden="true"
        />
        <div className={styles.identity}>
          <span className={styles.name}>{boxer.name}</span>
          <span className={styles.level} data-testid="player-level">
            Lv.{formatCompactNumber(boxer.playerLevel)}
          </span>
          {/* 경험치는 레벨 아래 줄에 progress bar로 표시. */}
          <div className={styles.expRow}>
            <div
              className={styles.expTrack}
              data-testid="player-exp-bar"
              role="progressbar"
              aria-label="플레이어 경험치"
              aria-valuemin={0}
              aria-valuemax={expToNext}
              aria-valuenow={Math.min(boxer.playerExp, expToNext)}
            >
              <div className={styles.expFill} style={{ width: `${expPercent}%` }} />
            </div>
            <span className={styles.expPercent}>{expPercent}%</span>
          </div>
        </div>
      </div>

      <div className={styles.wallet}>
        {/* 골드·다이아 캡슐은 통째로 '+' 버튼(상점 진입 시도). 44px 터치 영역 보장.
            골드는 좁은 바에 맞춰 축약 표시(128.4K), 다이아는 목업처럼 전체 수 표시. */}
        <div>
          <button
            type="button"
            className={styles.currency}
            data-testid="currency-gold"
            onClick={onOpenShop}
            aria-label={`골드 ${boxer.gold.toLocaleString()} · 더 얻기`}
          >
            <img
              className={styles.currencyIcon}
              src={CURRENCY_GOLD}
              alt=""
              aria-hidden="true"
            />
            <span className={styles.currencyValue}>{formatCompactNumber(boxer.gold)}</span>
            <span className={styles.plus} aria-hidden="true">+</span>
          </button>
        </div>
        <div>
          <button
            type="button"
            className={styles.currency}
            data-testid="currency-diamond"
            onClick={onOpenShop}
            aria-label={`다이아 ${boxer.diamond.toLocaleString()} · 더 얻기`}
          >
            <span aria-hidden="true">💎</span>
            <span className={styles.currencyValue}>{formatCompactNumber(boxer.diamond)}</span>
            <span className={styles.plus} aria-hidden="true">+</span>
          </button>
        </div>
      </div>
    </header>
  );
}
