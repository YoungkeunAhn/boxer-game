import { describe, expect, it } from "vitest";
import { formatCompactNumber, formatCountdown } from "./format";

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

describe("formatCompactNumber", () => {
  it("1,000 미만은 정수 그대로", () => {
    expect(formatCompactNumber(0)).toBe("0");
    expect(formatCompactNumber(999)).toBe("999");
  });

  it("1,000 이상은 K/M/B/T 단위로 축약(항상 소수 1자리)", () => {
    expect(formatCompactNumber(1_000)).toBe("1.0K");
    expect(formatCompactNumber(8_000)).toBe("8.0K");
    expect(formatCompactNumber(2_350)).toBe("2.3K");
    expect(formatCompactNumber(10_000)).toBe("10.0K");
    expect(formatCompactNumber(128_400)).toBe("128.4K");
    expect(formatCompactNumber(1_000_000)).toBe("1.0M");
    expect(formatCompactNumber(363_376_080)).toBe("363.3M");
    expect(formatCompactNumber(1_000_000_000)).toBe("1.0B");
    expect(formatCompactNumber(1_000_000_000_000)).toBe("1.0T");
  });

  it("자리 올림 경계에서 단위가 넘치지 않는다(floor)", () => {
    expect(formatCompactNumber(9_999)).toBe("9.9K");
    expect(formatCompactNumber(999_999)).toBe("999.9K");
    expect(formatCompactNumber(999_999_999)).toBe("999.9M");
  });

  it("음수/비유한 입력은 안전 처리한다", () => {
    expect(formatCompactNumber(-5)).toBe("0");
    expect(formatCompactNumber(Number.NaN)).toBe("0");
    expect(formatCompactNumber(Number.POSITIVE_INFINITY)).toBe("0");
  });
});
