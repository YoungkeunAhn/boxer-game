import {
  FARMING_STAGE_NUMBER,
  getNextStagePosition,
  getPreviousNormalStagePosition,
  getStageDefinition,
} from "../data/stages";
import {
  BOSS_TIME_LIMIT_MS,
  COUNTER_BASE_DAMAGE_RATE,
  INFIGHTER_GUARD_COUNTER_RATE,
  KNOCKDOWN_PARTIAL_GOLD_RATE,
  MAX_SAFE_GAME_INTEGER,
  MONSTER_ATTACK_INTERVAL_MS,
  OFFLINE_MAX_DURATION_MS,
} from "./constants";
import {
  addProgressToBoxer,
  calculateAttackDamage,
  calculateAttackIntervalMs,
  calculateCombatStats,
  calculateCounterDamage,
  calculateExpectedHitDamage,
  calculateGoldReward,
  calculateGuardedDamage,
  calculateMonsterAttackPower,
} from "./formulas";
import type {
  Boxer,
  CombatRuntime,
  CombatStepResult,
  MonsterAttackResult,
  OfflineProgress,
  StagePosition,
} from "./types";

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name}은 0 이상의 유한한 수여야 합니다.`);
  }
}

function nextAttackAt(boxer: Boxer, now: number): number {
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  return now + calculateAttackIntervalMs(stats.attackSpeed);
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
  // 전투 시작·스테이지 전이 시 복서 HP를 최대치로 충전한다.
  return {
    position: { ...position },
    monsterHp: stage.maxHp,
    bossDeadlineAt: stage.isBoss ? now + BOSS_TIME_LIMIT_MS : null,
    nextAttackAt: nextAttackAt(boxer, now),
    isFarming: isFarming && !stage.isBoss,
    boxerHp: stats.maxHp,
    boxerMaxHp: stats.maxHp,
    nextMonsterAttackAt: now + MONSTER_ATTACK_INTERVAL_MS,
    monsterAttackPrep: null,
  };
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
  const { damage, isCritical } = calculateAttackDamage(stats, randomValue);
  const killed = damage >= combat.monsterHp;
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
    nextCombat = {
      ...combat,
      monsterHp: Math.max(0, combat.monsterHp - damage),
      nextAttackAt: nextAttackAt(nextBoxer, now),
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

  return {
    boxer: addProgressToBoxer(boxer, kills, gold),
    position: offlinePosition,
    elapsedMs: clampedElapsedMs,
    kills,
    gold,
  };
}
