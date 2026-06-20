import {
  FARMING_STAGE_NUMBER,
  getNextStagePosition,
  getPreviousNormalStagePosition,
  getStageDefinition,
} from "../data/stages";
import {
  BOSS_TIME_LIMIT_MS,
  MAX_SAFE_GAME_INTEGER,
  OFFLINE_MAX_DURATION_MS,
} from "./constants";
import {
  addProgressToBoxer,
  calculateAttackDamage,
  calculateAttackIntervalMs,
  calculateCombatStats,
  calculateExpectedHitDamage,
  calculateGoldReward,
} from "./formulas";
import type {
  Boxer,
  CombatRuntime,
  CombatStepResult,
  OfflineProgress,
  StagePosition,
} from "./types";

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name}은 0 이상의 유한한 수여야 합니다.`);
  }
}

function nextAttackAt(boxer: Boxer, now: number): number {
  const stats = calculateCombatStats(boxer.upgradeLevels);
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
  return {
    position: { ...position },
    monsterHp: stage.maxHp,
    bossDeadlineAt: stage.isBoss ? now + BOSS_TIME_LIMIT_MS : null,
    nextAttackAt: nextAttackAt(boxer, now),
    isFarming: isFarming && !stage.isBoss,
  };
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
    };
  }

  const stage = getStageDefinition(combat.position);
  const stats = calculateCombatStats(boxer.upgradeLevels);
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
  };
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
  const stats = calculateCombatStats(boxer.upgradeLevels);
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
