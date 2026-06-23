// TASK-020(P3): 표시 포맷 순수 함수. 게임 로직 없음(전투·보상·전이와 무관) — 상단 바 등 표현 전용.
//   Date.now/Math.random/타이머를 쓰지 않고 입력 ms만 포맷한다(프로젝트 규칙: 표시 파생도 순수 유지).

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

// 잔여 ms를 카운트다운 문자열로 포맷한다.
//   - 1시간 이상: "HH:MM" (시:분)
//   - 1시간 미만: "MM:SS" (분:초)
// 음수/비유한 입력은 0으로 간주한다(표시 안전). 초 단위는 내림(floor)해 "남은 시간"이 0이 되기 전엔 00:00을 보이지 않게 한다.
export function formatCountdown(remainingMs: number): string {
  const safeMs = Number.isFinite(remainingMs) && remainingMs > 0 ? remainingMs : 0;
  const totalSeconds = Math.floor(safeMs / MS_PER_SECOND);

  if (totalSeconds >= SECONDS_PER_HOUR) {
    const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    return `${pad2(hours)}:${pad2(minutes)}`;
  }

  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

// 수치 표시 공통 약어 포맷(골드·다이아·경험치·강화·HP·데미지 등 전부 동일 규칙).
//   - 1,000 미만: 정수 그대로(예: 0 · 999).
//   - 1,000 이상: K(천)·M(백만)·B(십억)·T(조) 단위, 항상 소수 1자리(예: 1,000 → 1.0K, 8,000 → 8.0K).
//     자리 올림으로 단위가 넘치지 않게 floor한다(999,999 → 999.9K, 1000.0K 같은 경계 오류 방지).
// 음수/비유한 입력은 0으로 안전 처리한다(표시 전용 순수 함수 — Date.now/Math.random 미사용).
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const n = Math.max(0, Math.floor(value));
  if (n < 1_000) {
    return n.toLocaleString();
  }
  const units = [
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];
  for (const { threshold, suffix } of units) {
    if (n >= threshold) {
      const scaled = Math.floor((n / threshold) * 10) / 10;
      return `${scaled.toFixed(1)}${suffix}`;
    }
  }
  return n.toLocaleString();
}
