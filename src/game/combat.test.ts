import { describe, expect, it } from "vitest";
import { OFFLINE_MAX_DURATION_MS } from "./constants";
import {
  calculateOfflineProgress,
  createCombatRuntime,
  resolveAttack,
  resolveBossTimeout,
  resolveMonsterAttack,
  retryBoss,
  stepCombat,
} from "./combat";
import { calculateCombatStats } from "./formulas";
import type { Boxer, UpgradeLevels } from "./types";

const zeroLevels: UpgradeLevels = {
  attackPower: 0,
  attackSpeed: 0,
  critRate: 0,
  critDamage: 0,
  goldBonus: 0,
  maxHp: 0,
  defense: 0,
  dodge: 0,
  counter: 0,
};

const boxer: Boxer = {
  id: "player",
  name: "테스트 복서",
  boxerType: "INFIGHTER",
  gender: "MALE",
  gold: 0,
  totalKills: 0,
  upgradeLevels: { ...zeroLevels },
};

const outBoxer: Boxer = { ...boxer, boxerType: "OUT_BOXER" };

describe("자동 전투", () => {
  it("첫 공격을 한 공격 간격 뒤에 예약하고 복서 HP를 채운다", () => {
    const combat = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 5_000);
    expect(combat.nextAttackAt).toBe(6_000);
    expect(combat.monsterHp).toBe(30);
    expect(combat.boxerHp).toBe(130);
    expect(combat.boxerMaxHp).toBe(130);
    expect(combat.nextMonsterAttackAt).toBe(7_000);
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

  it("파밍 중에는 처치 후 같은 일반 스테이지를 반복한다", () => {
    const combat = {
      ...createCombatRuntime(boxer, { chapter: 1, stage: 4 }, 0, true),
      monsterHp: 10,
    };
    const outcome = resolveAttack(boxer, combat, 0.5, 1_000);
    expect(outcome.combat.position).toEqual({ chapter: 1, stage: 4 });
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
    expect(outcome.bossTimedOut).toBe(true);
    expect(outcome.combat.position).toEqual({ chapter: 1, stage: 4 });
    expect(outcome.combat.isFarming).toBe(true);
  });

  it("제한 시각이 지난 보스는 공격하지 않고 파밍으로 전환한다", () => {
    const combat = createCombatRuntime(boxer, { chapter: 2, stage: 5 }, 100);
    const outcome = resolveAttack(boxer, combat, 0.5, 30_101);
    expect(outcome.attack).toBeNull();
    expect(outcome.bossTimedOut).toBe(true);
    expect(resolveBossTimeout(boxer, outcome.combat, 40_000)).toBe(outcome.combat);
  });

  it("파밍 중 재도전하면 현재 HP를 버리고 보스를 새로 시작한다", () => {
    const farming = {
      ...createCombatRuntime(boxer, { chapter: 3, stage: 4 }, 0, true),
      monsterHp: 1,
    };
    const boss = retryBoss(boxer, farming, 5_000);
    expect(boss.position).toEqual({ chapter: 3, stage: 5 });
    expect(boss.bossDeadlineAt).toBe(35_000);
    expect(boss.isFarming).toBe(false);
  });
});

describe("몬스터 공격·회피·가드·카운터", () => {
  // 인파이터 dodge = 0.05×0.6 = 0.03. 아웃복서 dodge = 0.05×1.6 = 0.08.
  it("회피 실패(random ≥ dodge) 시 인파이터는 가드 적용 피해로 HP가 줄고 GUARD로 분류된다", () => {
    const combat = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    const r = resolveMonsterAttack(boxer, combat, 0.9, 2_000);
    expect(r.result.outcome).toBe("GUARD");
    expect(r.result.damage).toBeGreaterThan(0);
    expect(r.result.counterDamage).toBeGreaterThan(0);
    expect(r.combat.boxerHp).toBe(130 - r.result.damage);
    expect(r.combat.monsterHp).toBe(30 - r.result.counterDamage);
    expect(r.knockedDown).toBe(false);
  });

  it("인파이터는 회피율보다 작은 random에서 MISS(피해 없음, 카운터 없음)", () => {
    const combat = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    const r = resolveMonsterAttack(boxer, combat, 0.0, 2_000);
    expect(r.result.outcome).toBe("MISS");
    expect(r.result.damage).toBe(0);
    expect(r.result.counterDamage).toBe(0);
    expect(r.combat.boxerHp).toBe(130);
  });

  it("아웃복서는 회피 성공 시 COUNTER로 분류되고 카운터가 monsterHp를 깎는다", () => {
    const combat = createCombatRuntime(outBoxer, { chapter: 1, stage: 1 }, 0);
    const r = resolveMonsterAttack(outBoxer, combat, 0.0, 2_000);
    expect(r.result.outcome).toBe("COUNTER");
    expect(r.result.damage).toBe(0);
    expect(r.result.counterDamage).toBeGreaterThan(0);
    expect(r.combat.monsterHp).toBe(combat.monsterHp - r.result.counterDamage);
  });

  it("동일 random 시퀀스에서 아웃복서가 인파이터보다 MISS/COUNTER가 더 많다", () => {
    const seq = [0.01, 0.04, 0.07, 0.09, 0.5, 0.02, 0.06];
    const countDodges = (b: Boxer) => {
      const combat = createCombatRuntime(b, { chapter: 1, stage: 1 }, 0);
      let dodges = 0;
      for (const rnd of seq) {
        const r = resolveMonsterAttack(b, combat, rnd, 2_000);
        if (r.result.outcome === "MISS" || r.result.outcome === "COUNTER") dodges += 1;
      }
      return dodges;
    };
    expect(countDodges(outBoxer)).toBeGreaterThan(countDodges(boxer));
  });

  it("회피 실패가 누적되면 boxerHp 0에서 넉다운하고 진행 위치는 유지된다", () => {
    let combat = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    let now = 2_000;
    let knockedDown = false;
    for (let i = 0; i < 200 && !knockedDown; i += 1) {
      const r = resolveMonsterAttack(boxer, combat, 0.9, now);
      combat = r.combat;
      knockedDown = r.knockedDown;
      now += 2_000;
    }
    expect(knockedDown).toBe(true);

    const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
    const start = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    const lowHp = { ...start, boxerHp: 1, nextMonsterAttackAt: 100, nextAttackAt: 10_000 };
    const step = stepCombat(boxer, lowHp, 0.9, 100);
    expect(step.knockedDown).toBe(true);
    expect(step.combat.position).toEqual({ chapter: 1, stage: 1 });
    expect(step.combat.boxerHp).toBe(stats.maxHp);
    expect(step.monsterAttack?.outcome).toBe("GUARD");
  });

  it("stepCombat은 더 이른 이벤트(몬스터)를 골라 방어 결과를 노출한다", () => {
    const combat = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    const monsterEarly = { ...combat, nextMonsterAttackAt: 500, nextAttackAt: 1_000 };
    const step = stepCombat(boxer, monsterEarly, 0.9, 800);
    expect(step.monsterAttack).not.toBeNull();
    expect(step.attack).toBeNull();
  });
});

describe("오프라인 정산", () => {
  it("현재 일반 스테이지만 반복 파밍하고 진행 위치를 유지한다(피격 미모델링)", () => {
    const progress = calculateOfflineProgress(boxer, { chapter: 1, stage: 1 }, 10_000);
    expect(progress).toMatchObject({
      position: { chapter: 1, stage: 1 },
      elapsedMs: 10_000,
      kills: 3,
      gold: 15,
    });
    expect(boxer).toMatchObject({ totalKills: 0, gold: 0 });
  });

  it("회피·카운터는 오프라인 수익에 영향을 주지 않는다(타입 무관 동일 정산)", () => {
    const inf = calculateOfflineProgress(boxer, { chapter: 1, stage: 1 }, 10_000);
    const out = calculateOfflineProgress(outBoxer, { chapter: 1, stage: 1 }, 10_000);
    expect(inf.kills).toBe(out.kills);
    expect(inf.gold).toBe(out.gold);
  });

  it("보스에서 이탈하면 직전 일반 스테이지를 정산한다", () => {
    const progress = calculateOfflineProgress(boxer, { chapter: 1, stage: 5 }, 10_500);
    expect(progress.position).toEqual({ chapter: 1, stage: 4 });
  });

  it("오프라인 시간을 8시간으로 제한한다", () => {
    const capped = calculateOfflineProgress(
      boxer,
      { chapter: 1, stage: 1 },
      OFFLINE_MAX_DURATION_MS * 2,
    );
    expect(capped.elapsedMs).toBe(OFFLINE_MAX_DURATION_MS);
  });
});
