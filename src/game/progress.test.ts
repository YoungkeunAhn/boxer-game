import { describe, expect, it } from "vitest";
import { dailyResetRemainingMs, nextDailyResetAt } from "./progress";

// 주의: progress.ts는 로컬 타임존(new Date(now)의 로컬 시/분) 기준이므로, 테스트도 로컬 기준으로
//   "다음 로컬 자정"을 직접 계산해 비교한다(특정 타임존 가정 없이 실행 환경 로컬과 정합).
function expectedNextLocalMidnight(now: number): number {
  const date = new Date(now);
  const reset = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
  if (reset.getTime() <= now) reset.setDate(reset.getDate() + 1);
  return reset.getTime();
}

describe("TASK-019 일일 리셋 타이머(주입 now 순수 함수)", () => {
  it("nextDailyResetAt은 주입 now 기준 다음 로컬 자정을 반환한다", () => {
    // 로컬 정오 가정 시각: 자정이 아니므로 다음(또는 같은 날) 자정이 now보다 미래여야 한다.
    const noon = new Date(2026, 5, 21, 12, 0, 0, 0).getTime();
    expect(nextDailyResetAt(noon)).toBe(expectedNextLocalMidnight(noon));
    expect(nextDailyResetAt(noon)).toBeGreaterThan(noon);
  });

  it("같은 now면 항상 같은 값을 반환한다(순수성, Date.now 미사용)", () => {
    const now = new Date(2026, 0, 15, 8, 30, 0, 0).getTime();
    expect(nextDailyResetAt(now)).toBe(nextDailyResetAt(now));
    expect(dailyResetRemainingMs(now)).toBe(dailyResetRemainingMs(now));
  });

  it("자정 직전이면 곧 리셋(남은 시간 소량), 자정 직후면 거의 하루가 남는다", () => {
    const justBefore = new Date(2026, 2, 10, 23, 59, 59, 0).getTime();
    expect(dailyResetRemainingMs(justBefore)).toBe(1_000);

    const justAfter = new Date(2026, 2, 10, 0, 0, 1, 0).getTime();
    const dayMs = 24 * 60 * 60 * 1_000;
    expect(dailyResetRemainingMs(justAfter)).toBe(dayMs - 1_000);
  });

  it("정확히 자정이면 다음 날 자정을 반환해 0/음수가 되지 않는다", () => {
    const midnight = new Date(2026, 4, 1, 0, 0, 0, 0).getTime();
    const dayMs = 24 * 60 * 60 * 1_000;
    expect(nextDailyResetAt(midnight)).toBe(midnight + dayMs);
    expect(dailyResetRemainingMs(midnight)).toBe(dayMs);
  });

  it("남은 시간은 항상 0 이상이다(과거/미래 now 모두)", () => {
    for (const now of [0, 1, new Date(1990, 0, 1).getTime(), new Date(2099, 11, 31, 23, 0).getTime()]) {
      expect(dailyResetRemainingMs(now)).toBeGreaterThanOrEqual(0);
    }
  });

  it("비유한 now는 거부한다", () => {
    expect(() => nextDailyResetAt(Number.NaN)).toThrow(RangeError);
    expect(() => nextDailyResetAt(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
