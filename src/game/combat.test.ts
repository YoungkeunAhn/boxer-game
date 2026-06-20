import { describe, expect, it } from "vitest";
import { OFFLINE_MAX_DURATION_MS } from "./constants";
import {
  calculateOfflineProgress,
  createCombatRuntime,
  resolveAttack,
  resolveBossTimeout,
  retryBoss,
} from "./combat";
import type { Boxer } from "./types";

const boxer: Boxer = {
  id: "player",
  name: "테스트 복서",
  boxerType: "INFIGHTER",
  gender: "MALE",
  gold: 0,
  totalKills: 0,
  upgradeLevels: {
    attackPower: 0,
    attackSpeed: 0,
    critRate: 0,
    critDamage: 0,
    goldBonus: 0,
  },
};

describe("자동 전투", () => {
  it("첫 공격을 한 공격 간격 뒤에 예약한다", () => {
    const combat = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 5_000);
    expect(combat.nextAttackAt).toBe(6_000);
    expect(combat.monsterHp).toBe(30);
  });

  it("일반 몬스터 처치 시 보상을 한 번 지급하고 다음 스테이지로 간다", () => {
    const combat = {
      ...createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0),
      monsterHp: 10,
    };
    const outcome = resolveAttack(boxer, combat, 0.5, 1_000);
    expect(outcome.attack).toMatchObject({ killed: true, goldReward: 5 });
    expect(outcome.boxer).toMatchObject({ gold: 5, totalKills: 1 });
    expect(outcome.combat.position).toEqual({ chapter: 1, stage: 2 });
    expect(boxer).toMatchObject({ gold: 0, totalKills: 0 });
  });

  it("초과 피해를 다음 몬스터에 넘기지 않는다", () => {
    const strong = {
      ...boxer,
      upgradeLevels: { ...boxer.upgradeLevels, attackPower: 20 },
    };
    const combat = createCombatRuntime(strong, { chapter: 1, stage: 1 }, 0);
    const outcome = resolveAttack(strong, combat, 0.5, 1_000);
    expect(outcome.combat.position).toEqual({ chapter: 1, stage: 2 });
    expect(outcome.combat.monsterHp).toBe(45);
  });

  it("처치 전이를 이어서 처리해도 이전 몬스터 보상을 중복 지급하지 않는다", () => {
    const combat = {
      ...createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0),
      monsterHp: 10,
    };
    const killed = resolveAttack(boxer, combat, 0.5, 1_000);
    const nextAttack = resolveAttack(killed.boxer, killed.combat, 0.5, 2_000);

    expect(killed.boxer).toMatchObject({ gold: 5, totalKills: 1 });
    expect(nextAttack.attack).toMatchObject({ killed: false, goldReward: 0 });
    expect(nextAttack.boxer).toMatchObject({ gold: 5, totalKills: 1 });
  });

  it("파밍 중에는 처치 후 같은 일반 스테이지를 반복한다", () => {
    const combat = {
      ...createCombatRuntime(boxer, { chapter: 1, stage: 4 }, 0, true),
      monsterHp: 10,
    };
    const outcome = resolveAttack(boxer, combat, 0.5, 1_000);
    expect(outcome.combat.position).toEqual({ chapter: 1, stage: 4 });
    expect(outcome.combat.monsterHp).toBe(105);
    expect(outcome.combat.isFarming).toBe(true);
  });

  it("보스를 제한 시각에 처치하면 다음 장으로 이동한다", () => {
    const combat = {
      ...createCombatRuntime(boxer, { chapter: 1, stage: 5 }, 0),
      monsterHp: 10,
    };
    const outcome = resolveAttack(boxer, combat, 0.5, 30_000);
    expect(outcome.bossTimedOut).toBe(false);
    expect(outcome.combat.position).toEqual({ chapter: 2, stage: 1 });
  });

  it("제한 시각 공격으로 처치하지 못하면 직전 일반 스테이지 파밍으로 전환한다", () => {
    const combat = createCombatRuntime(boxer, { chapter: 1, stage: 5 }, 0);
    const outcome = resolveAttack(boxer, combat, 0.5, 30_000);
    expect(outcome.attack).not.toBeNull();
    expect(outcome.bossTimedOut).toBe(true);
    expect(outcome.combat.position).toEqual({ chapter: 1, stage: 4 });
    expect(outcome.combat.isFarming).toBe(true);
  });

  it("제한 시각이 지난 보스는 공격하지 않고 파밍으로 전환한다", () => {
    const combat = createCombatRuntime(boxer, { chapter: 2, stage: 5 }, 100);
    const outcome = resolveAttack(boxer, combat, 0.5, 30_101);
    expect(outcome.attack).toBeNull();
    expect(outcome.bossTimedOut).toBe(true);
    expect(outcome.combat.position).toEqual({ chapter: 2, stage: 4 });
    expect(resolveBossTimeout(boxer, outcome.combat, 40_000)).toBe(outcome.combat);
  });

  it("파밍 중 재도전하면 현재 HP를 버리고 보스를 새로 시작한다", () => {
    const farming = {
      ...createCombatRuntime(boxer, { chapter: 3, stage: 4 }, 0, true),
      monsterHp: 1,
    };
    const boss = retryBoss(boxer, farming, 5_000);
    expect(boss.position).toEqual({ chapter: 3, stage: 5 });
    expect(boss.monsterHp).toBe(1_069);
    expect(boss.bossDeadlineAt).toBe(35_000);
    expect(boss.isFarming).toBe(false);
  });
});

describe("오프라인 정산", () => {
  it("현재 일반 스테이지만 반복 파밍하고 진행 위치를 유지한다", () => {
    const progress = calculateOfflineProgress(boxer, { chapter: 1, stage: 1 }, 10_000);
    expect(progress).toMatchObject({
      position: { chapter: 1, stage: 1 },
      elapsedMs: 10_000,
      kills: 3,
      gold: 15,
    });
    expect(progress.boxer).toMatchObject({ totalKills: 3, gold: 15 });
    expect(boxer).toMatchObject({ totalKills: 0, gold: 0 });
  });

  it("보스에서 이탈하면 직전 일반 스테이지를 정산한다", () => {
    const progress = calculateOfflineProgress(boxer, { chapter: 1, stage: 5 }, 10_500);
    expect(progress.position).toEqual({ chapter: 1, stage: 4 });
    expect(progress.kills).toBe(1);
    expect(progress.gold).toBe(15);
  });

  it("오프라인 시간을 8시간으로 제한한다", () => {
    const capped = calculateOfflineProgress(
      boxer,
      { chapter: 1, stage: 1 },
      OFFLINE_MAX_DURATION_MS * 2,
    );
    expect(capped.elapsedMs).toBe(OFFLINE_MAX_DURATION_MS);
    expect(capped.kills).toBe(10_080);
  });
});
