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
