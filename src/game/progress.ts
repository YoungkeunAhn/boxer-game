import { DAILY_RESET_HOUR } from "./constants";

// TASK-019(P3): 일일 콘텐츠 리셋 타이머 — 순수 시간 로직.
//   상단 바의 ⏱ 표시는 (에너지 미채택이므로) 에너지 회복이 아니라 "다음 일일 리셋까지 남은 시간"이다.
//   모든 함수는 주입 now(epoch ms) 기준 순수 함수이며 Date.now를 직접 호출하지 않는다(프로젝트 규칙).
//   가정: 리셋 기준은 실행 환경의 로컬 자정(DAILY_RESET_HOUR=0). WebView(앱인토스) 로컬 타임존에 의존한다.
//   UTC 고정 여부는 TASK-021 일일 리셋과 동일 기준으로 맞춰야 한다(가정). 로컬 기준이라
//   new Date(now)로부터 로컬 시/분/초를 읽어 다음 리셋 시각을 만든다.

// 주입 now 기준 "다음 로컬 DAILY_RESET_HOUR시(=다음 자정)" epoch ms.
//   now가 정확히 리셋 시각이면 다음 리셋(=다음 날 자정)을 반환한다(경계에서 0이 되지 않게 +1일).
export function nextDailyResetAt(now: number): number {
  if (!Number.isFinite(now)) {
    throw new RangeError("now는 유한한 epoch ms여야 합니다.");
  }
  const date = new Date(now);
  // 오늘 로컬 자정(리셋 시각)을 만든다. 같은 날의 리셋 시각이 now 이하이면 다음 날로 넘긴다.
  const reset = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    DAILY_RESET_HOUR,
    0,
    0,
    0,
  );
  if (reset.getTime() <= now) {
    reset.setDate(reset.getDate() + 1);
  }
  return reset.getTime();
}

// 주입 now 기준 다음 일일 리셋까지 남은 ms(항상 0 이상). 표시 타이머 = dailyResetRemainingMs(now).
export function dailyResetRemainingMs(now: number): number {
  return Math.max(0, nextDailyResetAt(now) - now);
}
