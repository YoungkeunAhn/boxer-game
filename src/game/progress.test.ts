import { describe, expect, it } from "vitest";
import { dailyResetRemainingMs, nextDailyResetAt, nextWeeklyResetAt } from "./progress";

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

// 동어반복(self-comparison) 대신 고정 epoch 기대값으로 요일 오프셋·경계 산술을 직접 검증한다.
//   기준: WEEKLY_RESET_DAY=1(월요일), DAILY_RESET_HOUR=0(로컬 자정).
//   2026-06-21은 일요일, 2026-06-22가 월요일, 2026-06-29가 그 다음 월요일이다.
describe("TASK-021 주간 리셋(주입 now 순수 함수)", () => {
  const MON_0622 = new Date(2026, 5, 22, 0, 0, 0, 0).getTime();
  const MON_0629 = new Date(2026, 5, 29, 0, 0, 0, 0).getTime();

  it("2026-06-22는 실제 월요일이다(기준 전제 가드)", () => {
    expect(new Date(MON_0622).getDay()).toBe(1);
  });

  it("일요일 정오면 다가오는 월요일 자정을 반환한다", () => {
    const sunNoon = new Date(2026, 5, 21, 12, 0, 0, 0).getTime();
    expect(nextWeeklyResetAt(sunNoon)).toBe(MON_0622);
  });

  it("주중(수요일)이면 다가오는 월요일 자정을 반환한다", () => {
    const wed = new Date(2026, 5, 24, 9, 30, 0, 0).getTime();
    expect(nextWeeklyResetAt(wed)).toBe(MON_0629);
  });

  it("정확히 월요일 자정이면 경계에서 다음 주 월요일을 반환한다(+7일, 0이 되지 않게)", () => {
    expect(nextWeeklyResetAt(MON_0622)).toBe(MON_0629);
  });

  it("월요일 자정 직후도 다음 주 월요일을 반환한다", () => {
    const justAfterMon = new Date(2026, 5, 22, 0, 0, 1, 0).getTime();
    expect(nextWeeklyResetAt(justAfterMon)).toBe(MON_0629);
  });

  it("비유한 now는 거부한다", () => {
    expect(() => nextWeeklyResetAt(Number.NaN)).toThrow(RangeError);
  });
});
