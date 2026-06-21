import { describe, expect, it } from "vitest";
import { formatCountdown } from "./format";

describe("formatCountdown", () => {
  it("0ms는 00:00을 반환한다", () => {
    expect(formatCountdown(0)).toBe("00:00");
  });

  it("음수/비유한 입력은 00:00으로 안전 처리한다", () => {
    expect(formatCountdown(-5_000)).toBe("00:00");
    expect(formatCountdown(Number.NaN)).toBe("00:00");
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBe("00:00");
  });

  it("1분 미만은 MM:SS로 초를 내림한다", () => {
    expect(formatCountdown(999)).toBe("00:00");
    expect(formatCountdown(1_000)).toBe("00:01");
    expect(formatCountdown(59_000)).toBe("00:59");
    expect(formatCountdown(59_999)).toBe("00:59");
  });

  it("1분 경계는 01:00", () => {
    expect(formatCountdown(60_000)).toBe("01:00");
  });

  it("1시간 직전은 MM:SS, 1시간 경계는 HH:MM으로 전환된다", () => {
    expect(formatCountdown(3_599_000)).toBe("59:59");
    expect(formatCountdown(3_600_000)).toBe("01:00");
  });

  it("시간 단위는 HH:MM으로 분을 내림한다", () => {
    // 2시간 15분 30초 → 02:15
    expect(formatCountdown((2 * 3600 + 15 * 60 + 30) * 1_000)).toBe("02:15");
  });

  it("24시간 직전 큰 값도 HH:MM으로 표시한다", () => {
    // 23시간 59분 59초
    expect(formatCountdown((23 * 3600 + 59 * 60 + 59) * 1_000)).toBe("23:59");
  });
});
