import {
  FARMING_STAGE_NUMBER,
  getNextStagePosition,
  getPreviousNormalStagePosition,
  getStageDefinition,
} from "../data/stages";
import {
  ATTACK_COOLDOWN_MS,
  ATTACK_FIXED_HAND,
  ATTACK_HISTORY_LIMIT,
  ATTACK_PRIORITY,
  ATTACK_TYPES,
  BOSS_TIME_LIMIT_MS,
  COMBINATIONS,
  COMBO_GAUGE_MAX,
  COMBO_GAUGE_PER_JAB,
  COUNTER_BASE_DAMAGE_RATE,
  EXP_PER_KILL,
  INFIGHTER_GUARD_COUNTER_RATE,
  KNOCKDOWN_PARTIAL_GOLD_RATE,
  MAX_SAFE_GAME_INTEGER,
  MONSTER_ATTACK_INTERVAL_MS,
  OFFLINE_MAX_DURATION_MS,
} from "./constants";
import {
  addExpToBoxer,
  addProgressToBoxer,
  calculateCombatStats,
  calculateComboAdjustedDamage,
  calculateCounterDamage,
  calculateExpectedHitDamage,
  calculateGoldReward,
  calculateGuardedDamage,
  calculateMonsterAttackPower,
} from "./formulas";
import type {
  AttackBeat,
  AttackType,
  Boxer,
  BoxerType,
  CombatRuntime,
  CombatStepResult,
  ComboId,
  Gender,
  Hand,
  MonsterAttackResult,
  OfflineProgress,
  StagePosition,
} from "./types";

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name}은 0 이상의 유한한 수여야 합니다.`);
  }
}

// 실효 쿨타임 = 문서 쿨타임 / attackSpeed. attackSpeed가 오를수록 모든 공격이 더 자주 나간다.
function effectiveCooldownMs(attackType: AttackType, attackSpeed: number): number {
  return ATTACK_COOLDOWN_MS[attackType] / attackSpeed;
}

function minReadyAt(nextReadyAt: Record<AttackType, number>): number {
  let min = Number.POSITIVE_INFINITY;
  for (const type of ATTACK_TYPES) {
    if (nextReadyAt[type] < min) min = nextReadyAt[type];
  }
  return min;
}

// 전투 시작·스테이지 전이·강화(공격 속도 변동) 시 4종 공격 쿨타임을 now 기준으로 재설정한다.
// 가정: 새 전투/강화 시 콤보 진행(직전 손)을 초기화한다(lastHand는 호출부가 정함).
function createAttackSchedule(
  attackSpeed: number,
  now: number,
): { nextReadyAt: Record<AttackType, number>; nextAttackAt: number } {
  const nextReadyAt = {
    JAB: now + effectiveCooldownMs("JAB", attackSpeed),
    STRAIGHT: now + effectiveCooldownMs("STRAIGHT", attackSpeed),
    HOOK: now + effectiveCooldownMs("HOOK", attackSpeed),
    UPPER: now + effectiveCooldownMs("UPPER", attackSpeed),
  };
  return { nextReadyAt, nextAttackAt: minReadyAt(nextReadyAt) };
}

// 두 타격이 (공격 종류·손)까지 같은지.
function beatsEqual(a: AttackBeat, b: AttackBeat): boolean {
  return a.attackType === b.attackType && a.hand === b.hand;
}

// v1.3b: attackHistory가 어떤 콤보의 "진행 중 prefix"라면, 그 콤보의 다음 단계 타격(공격 종류·손)을 돌려준다.
//   더 긴 콤보를 우선(FULL_COMBO > ONE_TWO_HOOK > ONE_TWO; COMBINATIONS 정렬 순)해 풀콤보 진행을 끝까지 노린다.
//   진행 prefix = history의 끝부분이 콤보 시퀀스의 앞 k(1≤k<len)개와 정확히 일치.
//   진행 중 콤보가 없으면(빈 history 포함) null. 콤보 시작(잽)은 호출부의 우선순위 폴백에 맡긴다.
export function nextComboBeat(history: readonly AttackBeat[]): AttackBeat | null {
  for (const combo of COMBINATIONS) {
    const seq = combo.sequence;
    for (let k = seq.length - 1; k >= 1; k -= 1) {
      if (history.length < k) continue;
      const tail = history.slice(history.length - k);
      let matches = true;
      for (let i = 0; i < k; i += 1) {
        if (!beatsEqual(tail[i], seq[i])) {
          matches = false;
          break;
        }
      }
      if (matches) return seq[k];
    }
  }
  return null;
}

// v1.3b: 콤보 진행을 우선하는 공격 선택 정책(정책을 한 곳에 모음).
//   ① 진행 중 콤보의 다음 단계 공격이 ready면 그 공격을 친다(콤보 이어가기).
//   ② 아니면 기존 우선순위(어퍼>훅>스트레이트>잽) 폴백.
//   콤보 시작(잽)은 별도로 강제하지 않는다. 잽은 우선순위 최하위라 다른 ready 공격이 있으면 그쪽이 먼저 나가고,
//   콤보는 자연스레 잽만 ready인 순간에 열린다(문서 발동 정책과 일치).
export function selectAttackType(
  nextReadyAt: Record<AttackType, number>,
  now: number,
  history: readonly AttackBeat[] = [],
): AttackType {
  // nextComboBeat는 진행 중 콤보가 있을 때만 다음 단계를 돌려준다(없으면 null → 폴백).
  const next = nextComboBeat(history);
  if (next && nextReadyAt[next.attackType] <= now) {
    return next.attackType;
  }
  for (const type of ATTACK_PRIORITY) {
    if (nextReadyAt[type] <= now) return type;
  }
  // 방어적 처리: ready가 없으면 가장 빨리 준비되는 공격을 고른다(정상 호출에선 도달하지 않음).
  return ATTACK_TYPES.reduce((soonest, type) =>
    nextReadyAt[type] < nextReadyAt[soonest] ? type : soonest,
  );
}

// v1.3b: 이번 타격을 history에 더한 뒤 끝부분(suffix)이 어떤 콤비네이션 시퀀스와 정확히 일치하면 그 식별자를 돌려준다.
//   더 긴 콤보 우선(COMBINATIONS 정렬). 순서+손이 모두 일치해야 발동한다.
export function matchCombination(history: readonly AttackBeat[]): ComboId | null {
  for (const combo of COMBINATIONS) {
    const seq = combo.sequence;
    if (history.length < seq.length) continue;
    const tail = history.slice(history.length - seq.length);
    let matches = true;
    for (let i = 0; i < seq.length; i += 1) {
      if (!beatsEqual(tail[i], seq[i])) {
        matches = false;
        break;
      }
    }
    if (matches) return combo.id;
  }
  return null;
}

// v1.3b: attackHistory에 한 타격을 더하고 길이 상한을 적용한다(불변).
function pushHistory(history: readonly AttackBeat[], beat: AttackBeat): AttackBeat[] {
  const next = [...history, beat];
  return next.length > ATTACK_HISTORY_LIMIT
    ? next.slice(next.length - ATTACK_HISTORY_LIMIT)
    : next;
}

// 손 선택 규칙(문서): 잽=왼손/스트레이트=오른손 고정. 훅·어퍼는 직전 손과 반대 손 우선(없으면 왼손).
export function selectHand(attackType: AttackType, lastHand: Hand | null): Hand {
  const fixed = ATTACK_FIXED_HAND[attackType];
  if (fixed) return fixed;
  if (lastHand === "LEFT") return "RIGHT";
  if (lastHand === "RIGHT") return "LEFT";
  return "LEFT";
}

export function createCombatRuntime(
  boxer: Boxer,
  position: StagePosition = { chapter: 1, stage: 1 },
  now = 0,
  isFarming = false,
): CombatRuntime {
  assertTimestamp(now, "now");
  const stage = getStageDefinition(position);
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  const schedule = createAttackSchedule(stats.attackSpeed, now);
  // 전투 시작·스테이지 전이 시 복서 HP를 최대치로 충전한다.
  return {
    position: { ...position },
    monsterHp: stage.maxHp,
    bossDeadlineAt: stage.isBoss ? now + BOSS_TIME_LIMIT_MS : null,
    nextAttackAt: schedule.nextAttackAt,
    isFarming: isFarming && !stage.isBoss,
    nextReadyAt: schedule.nextReadyAt,
    lastHand: null,
    // v1.3b: 콤보 진행 상태를 초기화한다(킬·스테이지 전이·넉다운·보스 타임아웃 시 이 함수로 리셋).
    attackHistory: [],
    comboGauge: 0,
    comboStep: 0,
    boxerHp: stats.maxHp,
    boxerMaxHp: stats.maxHp,
    nextMonsterAttackAt: now + MONSTER_ATTACK_INTERVAL_MS,
    monsterAttackPrep: null,
  };
}

// TASK-017: 단일 캐릭터의 타입/성별을 런타임 전환한다(4캐릭터 보유 아님).
//   강화 레벨·골드·진행 위치·monsterHp·콤보/쿨타임 진행·보스 데드라인은 모두 유지하고,
//   boxer를 새 type/gender로 교체한 뒤 calculateCombatStats의 typeMultiplier로 새 maxHp를 재계산한다.
// 가정(HP 처리): 풀충전이 아니라 강화(upgrade)와 동일 규칙 — boxerMaxHp를 새 타입 최대치로 갱신하고
//   현재 boxerHp를 새 최대치로 클램프한다(인파이터→아웃복서로 maxHp가 줄면 현재 HP도 줄 수 있음).
//   maxHp가 늘어도 부족분을 자동 보충하지 않는다(가정 — 기획이 '풀충전'을 원하면 변경).
// 가정: attackSpeed는 타입 무관이라 공격 쿨타임은 그대로 둔다(콤보 진행도 보존). 변이 금지·새 객체 반환.
export function switchFighterType(
  boxer: Boxer,
  combat: CombatRuntime,
  boxerType: BoxerType,
  gender: Gender,
  now: number,
): { boxer: Boxer; combat: CombatRuntime } {
  assertTimestamp(now, "now");
  const nextBoxer: Boxer = { ...boxer, boxerType, gender };
  const stats = calculateCombatStats(nextBoxer.upgradeLevels, boxerType);
  const boxerMaxHp = stats.maxHp;
  const boxerHp = Math.min(boxerMaxHp, combat.boxerHp);
  return {
    boxer: nextBoxer,
    combat: { ...combat, boxerHp, boxerMaxHp },
  };
}

// 강화 등으로 공격 속도가 바뀌었을 때 공격 쿨타임만 now 기준으로 재설정한 새 런타임을 만든다(HP·진행 유지).
export function rescheduleAttacks(combat: CombatRuntime, attackSpeed: number, now: number): CombatRuntime {
  assertTimestamp(now, "now");
  const schedule = createAttackSchedule(attackSpeed, now);
  return { ...combat, nextReadyAt: schedule.nextReadyAt, nextAttackAt: schedule.nextAttackAt };
}

// v1.2a/v1.2b: 몬스터 공격 한 번. 회피 → 가드 → 피격 순으로 판정한다.
// 가정(한 공격에 배타적): ① 회피 롤 random < dodgeRate → MISS. 아웃복서면 COUNTER(monsterHp만 깎음).
//   ② 회피 실패 → 가드 적용 피해로 boxerHp 감소. 가드 감소가 있으면 GUARD, 없으면 HIT.
//      인파이터는 가드 성공 시 약한 근접 반격(counterDamage > 0, monsterHp만 깎음).
// 가정: 카운터/가드 반격은 몬스터를 처치하지 않는다(monsterHp만 0 이상으로 감소, 보상·전이 경로 미사용).
//   보스 그로기 누적은 TASK-009. knockedDown은 피격 분기에서만 발생한다. 모든 분기는 주입된 random으로 결정적.
export function resolveMonsterAttack(
  boxer: Boxer,
  combat: CombatRuntime,
  randomValue: number,
  now: number,
): { combat: CombatRuntime; result: MonsterAttackResult; knockedDown: boolean } {
  assertTimestamp(now, "now");
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("randomValue는 0 이상 1 미만이어야 합니다.");
  }
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  const attackPower = calculateMonsterAttackPower(combat.position);
  const baseCombat = {
    ...combat,
    nextMonsterAttackAt: now + MONSTER_ATTACK_INTERVAL_MS,
  };

  // ① 회피 판정.
  const dodged = randomValue < stats.dodge;
  if (dodged) {
    const isOutBoxer = boxer.boxerType === "OUT_BOXER";
    const counterDamage = isOutBoxer
      ? calculateCounterDamage(stats, COUNTER_BASE_DAMAGE_RATE)
      : 0;
    const monsterHp =
      counterDamage > 0 ? Math.max(0, combat.monsterHp - counterDamage) : combat.monsterHp;
    return {
      combat: { ...baseCombat, monsterHp },
      result: {
        outcome: isOutBoxer ? "COUNTER" : "MISS",
        damage: 0,
        counterDamage,
      },
      knockedDown: false,
    };
  }

  // ② 가드 적용 피격.
  const { damage, guarded } = calculateGuardedDamage(
    attackPower,
    stats.defense,
    boxer.boxerType,
  );
  const boxerHp = Math.max(0, combat.boxerHp - damage);
  const knockedDown = boxerHp <= 0;
  // 인파이터는 가드 성공(피해 감소 발생) 시 약한 근접 반격. 넉다운하면 반격은 의미 없으므로 0.
  const guardCounter =
    !knockedDown && guarded && boxer.boxerType === "INFIGHTER"
      ? calculateCounterDamage(stats, INFIGHTER_GUARD_COUNTER_RATE)
      : 0;
  const monsterHp =
    guardCounter > 0 ? Math.max(0, combat.monsterHp - guardCounter) : combat.monsterHp;
  return {
    combat: { ...baseCombat, boxerHp, monsterHp },
    result: {
      outcome: guarded ? "GUARD" : "HIT",
      damage,
      counterDamage: guardCounter,
    },
    knockedDown,
  };
}

// v1.2a: 넉다운(복서 HP 0) 처리. 진행 위치는 잃지 않는다.
// 가정: 현재 스테이지 유지(보스는 직전 일반 스테이지 파밍으로 전환)하고, 현재 스테이지 골드 ×
//   KNOCKDOWN_PARTIAL_GOLD_RATE를 1회 부분 지급한 뒤 HP를 채워 자동 재시작한다.
export function resolveKnockdown(
  boxer: Boxer,
  combat: CombatRuntime,
  now: number,
): { boxer: Boxer; combat: CombatRuntime; partialGold: number } {
  assertTimestamp(now, "now");
  const stage = getStageDefinition(combat.position);
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  const partialGold = Math.min(
    MAX_SAFE_GAME_INTEGER,
    Math.floor(
      calculateGoldReward(stage.goldReward, stats.goldBonus) *
        KNOCKDOWN_PARTIAL_GOLD_RATE,
    ),
  );
  const nextBoxer = addProgressToBoxer(boxer, 0, partialGold);
  const nextPosition = stage.isBoss
    ? getPreviousNormalStagePosition(combat.position.chapter)
    : combat.position;
  const nextCombat = createCombatRuntime(
    nextBoxer,
    nextPosition,
    now,
    stage.isBoss ? true : combat.isFarming,
  );
  return { boxer: nextBoxer, combat: nextCombat, partialGold };
}

export function resolveBossTimeout(
  boxer: Boxer,
  combat: CombatRuntime,
  now: number,
): CombatRuntime {
  assertTimestamp(now, "now");
  const stage = getStageDefinition(combat.position);
  if (
    !stage.isBoss ||
    combat.bossDeadlineAt === null ||
    now <= combat.bossDeadlineAt
  ) {
    return combat;
  }

  return createCombatRuntime(
    boxer,
    getPreviousNormalStagePosition(combat.position.chapter),
    now,
    true,
  );
}

export function retryBoss(
  boxer: Boxer,
  combat: CombatRuntime,
  now: number,
): CombatRuntime {
  assertTimestamp(now, "now");
  return createCombatRuntime(
    boxer,
    { chapter: combat.position.chapter, stage: FARMING_STAGE_NUMBER + 1 },
    now,
  );
}

export function resolveAttack(
  boxer: Boxer,
  combat: CombatRuntime,
  randomValue: number,
  now: number,
): CombatStepResult {
  assertTimestamp(now, "now");
  const timedOutCombat = resolveBossTimeout(boxer, combat, now);
  if (timedOutCombat !== combat) {
    return {
      boxer,
      combat: timedOutCombat,
      attack: null,
      bossTimedOut: true,
      monsterAttack: null,
      knockedDown: false,
    };
  }

  const stage = getStageDefinition(combat.position);
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  // 이번 틱에 칠 공격(콤보 진행 우선 정책)과 손을 고른다.
  const attackType = selectAttackType(combat.nextReadyAt, now, combat.attackHistory);
  const hand = selectHand(attackType, combat.lastHand);
  // 이번 타격을 history에 더한 뒤 콤비네이션(순서+손) 매칭 → 발동 시 보너스를 데미지/치명타에 반영한다.
  const nextHistory = pushHistory(combat.attackHistory, { attackType, hand });
  const combo = matchCombination(nextHistory);
  const { damage, isCritical } = calculateComboAdjustedDamage(stats, attackType, combo, randomValue);
  const killed = damage >= combat.monsterHp;
  // 잽은 콤보 게이지를 누적한다(상한 클램프). 잽 외 공격은 게이지를 올리지 않는다.
  const comboGauge =
    attackType === "JAB"
      ? Math.min(COMBO_GAUGE_MAX, combat.comboGauge + COMBO_GAUGE_PER_JAB)
      : combat.comboGauge;
  // comboStep: 발동한 콤보의 시퀀스 길이(없으면 0). 연출용.
  const comboStep = combo
    ? (COMBINATIONS.find((c) => c.id === combo)?.sequence.length ?? 0)
    : 0;
  const goldReward = killed
    ? calculateGoldReward(stage.goldReward, stats.goldBonus)
    : 0;
  const nextBoxer = killed
    ? addProgressToBoxer(boxer, 1, goldReward)
    : boxer;

  let nextCombat: CombatRuntime;
  const timedOutAfterAttack =
    !killed &&
    stage.isBoss &&
    combat.bossDeadlineAt !== null &&
    now >= combat.bossDeadlineAt;

  if (timedOutAfterAttack) {
    nextCombat = createCombatRuntime(
      nextBoxer,
      getPreviousNormalStagePosition(combat.position.chapter),
      now,
      true,
    );
  } else if (!killed) {
    // 친 공격만 쿨타임을 갱신하고 직전 손을 기록한다. 다른 공격의 준비 시각은 그대로 둔다.
    const nextReadyAt = {
      ...combat.nextReadyAt,
      [attackType]: now + effectiveCooldownMs(attackType, stats.attackSpeed),
    };
    nextCombat = {
      ...combat,
      monsterHp: Math.max(0, combat.monsterHp - damage),
      nextReadyAt,
      nextAttackAt: minReadyAt(nextReadyAt),
      lastHand: hand,
      // v1.3b: 콤보 진행 상태를 갱신한다. 콤보 끊김(시퀀스 이탈)은 nextComboBeat/matchCombination이
      //   suffix 일치로만 발동하므로 별도 리셋 없이 자연스레 처리된다(이탈한 타격은 새 history 끝에 남아 prefix 불일치).
      attackHistory: nextHistory,
      comboGauge,
      comboStep,
    };
  } else if (combat.isFarming) {
    nextCombat = createCombatRuntime(nextBoxer, combat.position, now, true);
  } else {
    nextCombat = createCombatRuntime(
      nextBoxer,
      getNextStagePosition(combat.position),
      now,
    );
  }

  return {
    boxer: nextBoxer,
    combat: nextCombat,
    attack: {
      stageId: stage.id,
      damage,
      isCritical,
      killed,
      goldReward,
      attackType,
      hand,
      combo,
    },
    bossTimedOut: timedOutAfterAttack,
    monsterAttack: null,
    knockedDown: false,
  };
}

// v1.2a: 복서 공격(nextAttackAt)과 몬스터 공격(nextMonsterAttackAt)을 now 기준 시간순으로 한 스텝씩
// 인터리브한다. 더 이른 이벤트를 처리한다. random은 복서 치명타 또는 몬스터 회피/가드/카운터 판정에 쓰인다.
// 넉다운 발생 시 resolveKnockdown까지 적용해 돌려준다.
export function stepCombat(
  boxer: Boxer,
  combat: CombatRuntime,
  randomValue: number,
  now: number,
): CombatStepResult {
  assertTimestamp(now, "now");

  const boxerDue = combat.nextAttackAt <= now;
  const monsterDue = combat.nextMonsterAttackAt <= now;

  // 몬스터 공격이 복서 공격보다 (엄격히) 이르면 몬스터 공격을 먼저 처리한다. 같은 시각이면 복서 우선.
  const monsterFirst =
    monsterDue && (!boxerDue || combat.nextMonsterAttackAt < combat.nextAttackAt);

  if (monsterFirst) {
    const monster = resolveMonsterAttack(
      boxer,
      combat,
      randomValue,
      combat.nextMonsterAttackAt,
    );
    if (monster.knockedDown) {
      const knockdown = resolveKnockdown(boxer, monster.combat, combat.nextMonsterAttackAt);
      return {
        boxer: knockdown.boxer,
        combat: knockdown.combat,
        attack: null,
        bossTimedOut: false,
        monsterAttack: monster.result,
        knockedDown: true,
      };
    }
    return {
      boxer,
      combat: monster.combat,
      attack: null,
      bossTimedOut: false,
      monsterAttack: monster.result,
      knockedDown: false,
    };
  }

  return resolveAttack(boxer, combat, randomValue, combat.nextAttackAt);
}

export function calculateOfflineProgress(
  boxer: Boxer,
  position: StagePosition,
  elapsedMs: number,
): OfflineProgress {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError("elapsedMs는 0 이상의 유한한 수여야 합니다.");
  }

  const clampedElapsedMs = Math.min(elapsedMs, OFFLINE_MAX_DURATION_MS);
  const offlinePosition = getStageDefinition(position).isBoss
    ? getPreviousNormalStagePosition(position.chapter)
    : { ...position };
  const stage = getStageDefinition(offlinePosition);
  // 가정: 오프라인 정산은 피격(회피/가드/카운터 포함)을 모델링하지 않고 기존 파밍 정산을 그대로 유지한다.
  // v1.3a: 4종 공격을 평균 효율로 일반화한다. 계수 가중합 Σ(계수/쿨타임초)=1.0 이라
  //   base-rate(attackSpeed) 한 틱당 평균 피해 = 기대 타격 피해이므로(= calculateAttackDps),
  //   기존 정산식을 그대로 쓴다. 공격 횟수를 먼저 내림해 1초 미만 이탈은 0처치로 둔다.
  // 복귀 시 createCombatRuntime이 boxerHp를 최대치로 채운다(TASK-013에서 재검토).
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  const elapsedSeconds = clampedElapsedMs / 1_000;
  const attacks = Math.floor(elapsedSeconds * stats.attackSpeed);
  const kills = Math.min(
    MAX_SAFE_GAME_INTEGER,
    Math.floor((attacks * calculateExpectedHitDamage(stats)) / stage.maxHp),
  );
  const rewardPerKill = calculateGoldReward(stage.goldReward, stats.goldBonus);
  const gold = Math.min(MAX_SAFE_GAME_INTEGER, kills * rewardPerKill);

  // 오프라인 정산도 온라인 처치와 동일하게 경험치를 부여한다(동작 일관성).
  //   오프라인 위치는 항상 일반 스테이지로 강제되므로 보스 클리어 보너스는 없고 EXP_PER_KILL만 적용.
  const exp = Math.min(MAX_SAFE_GAME_INTEGER, kills * EXP_PER_KILL);
  const progressed = addExpToBoxer(addProgressToBoxer(boxer, kills, gold), exp);

  return {
    boxer: progressed,
    position: offlinePosition,
    elapsedMs: clampedElapsedMs,
    kills,
    gold,
  };
}
