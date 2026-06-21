import { describe, expect, it } from "vitest";
import {
  COMBO_GAUGE_MAX,
  COMBO_GAUGE_PER_JAB,
  OFFLINE_MAX_DURATION_MS,
} from "./constants";
import {
  calculateOfflineProgress,
  createCombatRuntime,
  matchCombination,
  nextComboBeat,
  resolveAttack,
  resolveBossTimeout,
  resolveMonsterAttack,
  retryBoss,
  selectAttackType,
  selectHand,
  stepCombat,
  switchFighterType,
} from "./combat";
import { calculateCombatStats } from "./formulas";
import type { AttackBeat, AttackType, Boxer, CombatRuntime, UpgradeLevels } from "./types";

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
  diamond: 0,
  playerLevel: 1,
  playerExp: 0,
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
    // t=1000에는 잽만 ready → 잽 데미지 floor(10×0.3)=3. HP 3으로 두어 한 방에 처치한다.
    const combat = {
      ...createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0),
      monsterHp: 3,
    };
    const outcome = resolveAttack(boxer, combat, 0.5, 1_000);
    expect(outcome.attack).toMatchObject({
      killed: true,
      goldReward: 5,
      attackType: "JAB",
      hand: "LEFT",
    });
    expect(outcome.boxer).toMatchObject({ gold: 5, totalKills: 1 });
    expect(outcome.combat.position).toEqual({ chapter: 1, stage: 2 });
    expect(boxer).toMatchObject({ gold: 0, totalKills: 0 });
  });

  it("파밍 중에는 처치 후 같은 일반 스테이지를 반복한다", () => {
    const combat = {
      ...createCombatRuntime(boxer, { chapter: 1, stage: 4 }, 0, true),
      monsterHp: 3,
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

describe("기본 공격 4종·손·쿨타임", () => {
  it("ready 공격 중 우선순위(어퍼>훅>스트레이트>잽)대로 고른다", () => {
    const now = 100_000;
    const all = { JAB: 0, STRAIGHT: 0, HOOK: 0, UPPER: 0 };
    expect(selectAttackType(all, now)).toBe("UPPER");
    expect(selectAttackType({ ...all, UPPER: now + 1 }, now)).toBe("HOOK");
    expect(selectAttackType({ ...all, UPPER: now + 1, HOOK: now + 1 }, now)).toBe("STRAIGHT");
    // 잽만 ready.
    expect(
      selectAttackType({ JAB: now, STRAIGHT: now + 1, HOOK: now + 1, UPPER: now + 1 }, now),
    ).toBe("JAB");
  });

  it("손 규칙: 잽=왼손·스트레이트=오른손 고정, 훅·어퍼는 직전과 반대 손", () => {
    expect(selectHand("JAB", "RIGHT")).toBe("LEFT");
    expect(selectHand("STRAIGHT", "LEFT")).toBe("RIGHT");
    expect(selectHand("HOOK", "LEFT")).toBe("RIGHT");
    expect(selectHand("HOOK", "RIGHT")).toBe("LEFT");
    expect(selectHand("UPPER", null)).toBe("LEFT");
    expect(selectHand("HOOK", null)).toBe("LEFT");
  });

  it("잽이 가장 자주, 어퍼가 가장 드물게 발동한다(30초 결정적 시뮬레이션)", () => {
    // 처치되지 않도록 HP를 크게 두고, 치명타가 없도록 random=0.99 고정.
    let combat = { ...createCombatRuntime(boxer, { chapter: 1, stage: 4 }, 0), monsterHp: 1_000_000 };
    const counts: Record<AttackType, number> = { JAB: 0, STRAIGHT: 0, HOOK: 0, UPPER: 0 };
    while (combat.nextAttackAt <= 30_000) {
      const step = resolveAttack(boxer, combat, 0.99, combat.nextAttackAt);
      if (step.attack) counts[step.attack.attackType] += 1;
      combat = step.combat;
    }
    expect(counts).toEqual({ JAB: 30, STRAIGHT: 6, HOOK: 3, UPPER: 2 });
    expect(counts.JAB).toBeGreaterThan(counts.STRAIGHT);
    expect(counts.STRAIGHT).toBeGreaterThan(counts.HOOK);
    expect(counts.HOOK).toBeGreaterThan(counts.UPPER);
  });

  it("콤보 미발동 타격의 기본 데미지 계수가 유지된다(잽 3 < 어퍼 30)", () => {
    // v1.3b: 콤보 진행 우선 정책에서 스트레이트는 원투 마무리로, 훅은 원투훅 마무리로 자주 소비되므로
    //   여기서는 콤보 보너스가 붙지 않는(combo===null) 잽·어퍼의 기본 계수가 그대로인지 확인한다.
    let combat = { ...createCombatRuntime(boxer, { chapter: 1, stage: 4 }, 0), monsterHp: 1_000_000 };
    const baseDamageByType: Partial<Record<AttackType, number>> = {};
    while (combat.nextAttackAt <= 30_000) {
      const step = resolveAttack(boxer, combat, 0.99, combat.nextAttackAt);
      if (step.attack && step.attack.combo === null) {
        baseDamageByType[step.attack.attackType] ??= step.attack.damage;
      }
      combat = step.combat;
    }
    // 공격력 10 기준: 잽 3, 어퍼 30(콤보 보너스 없는 타격).
    expect(baseDamageByType.JAB).toBe(3);
    expect(baseDamageByType.UPPER).toBe(30);
    expect(baseDamageByType.JAB).toBeLessThan(baseDamageByType.UPPER!);
  });

  it("처치·골드 정산은 어떤 공격으로 처치하든 동일하다(어퍼 한 방 처치)", () => {
    // t=15000에는 어퍼가 ready(우선순위 최상) → 어퍼로 처치. 보상은 잽 처치와 동일하게 1회·계수 무관.
    const combat = { ...createCombatRuntime(boxer, { chapter: 1, stage: 4 }, 0), monsterHp: 5 };
    const outcome = resolveAttack(boxer, combat, 0.99, 15_000);
    expect(outcome.attack?.attackType).toBe("UPPER");
    expect(outcome.attack).toMatchObject({ killed: true, goldReward: 15 });
    expect(outcome.boxer).toMatchObject({ gold: 15, totalKills: 1 });
  });
});

describe("콤비네이션·콤보 게이지", () => {
  const NEVER_KILL_HP = 1_000_000;

  // 직전까지의 콤보 진행(history)과 손을 심고, 다음에 칠 공격만 ready로 만든 런타임을 만든다.
  // history는 콤보 prefix(예: [JAB,LEFT])로 두고 finisher만 ready로 열어 결정적으로 콤보를 마무리시킨다.
  function withHistory(
    history: AttackBeat[],
    readyTypes: AttackType[],
    lastHand: "LEFT" | "RIGHT" | null = null,
    now = 100_000,
  ): CombatRuntime {
    const base = createCombatRuntime(boxer, { chapter: 1, stage: 4 }, 0, true);
    const FAR = now + 1_000_000;
    const nextReadyAt: Record<AttackType, number> = {
      JAB: FAR,
      STRAIGHT: FAR,
      HOOK: FAR,
      UPPER: FAR,
    };
    for (const t of readyTypes) nextReadyAt[t] = now;
    return {
      ...base,
      monsterHp: NEVER_KILL_HP,
      attackHistory: history,
      lastHand,
      nextReadyAt,
      nextAttackAt: now,
    };
  }

  const now = 100_000;
  // 치명타가 절대 나지 않도록 random=0.99 고정(원투훅 치명타 보너스 검증 케이스는 별도 random 사용).
  const NO_CRIT = 0.99;

  it("원투 발동: left_jab → right_straight 시 스트레이트에 ONE_TWO와 데미지 증가가 붙는다", () => {
    const combat = withHistory([{ attackType: "JAB", hand: "LEFT" }], ["STRAIGHT"], "LEFT", now);
    const step = resolveAttack(boxer, combat, NO_CRIT, now);
    expect(step.attack?.attackType).toBe("STRAIGHT");
    expect(step.attack?.hand).toBe("RIGHT");
    expect(step.attack?.combo).toBe("ONE_TWO");
    // 기본 스트레이트 15 × 1.3 = 19.5 → floor 19.
    expect(step.attack?.damage).toBe(19);
  });

  it("원투 훅 발동: …→ left_hook 시 ONE_TWO_HOOK과 훅 치명타 확률 증가가 적용된다", () => {
    const history: AttackBeat[] = [
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
    ];
    const combat = withHistory(history, ["HOOK"], "RIGHT", now);
    // 기본 치명타율 인파이터 0.05 + 보너스 0.2 = 0.25. random=0.1 < 0.25 → 치명타(보너스 없으면 미발생).
    const step = resolveAttack(boxer, combat, 0.1, now);
    expect(step.attack?.attackType).toBe("HOOK");
    expect(step.attack?.hand).toBe("LEFT");
    expect(step.attack?.combo).toBe("ONE_TWO_HOOK");
    expect(step.attack?.isCritical).toBe(true);
    // 훅 20 × 치명타 배수 2 = 40.
    expect(step.attack?.damage).toBe(40);
  });

  it("풀 콤보 발동: …→ right_upper 시 FULL_COMBO와 어퍼 데미지 증가가 적용된다", () => {
    const history: AttackBeat[] = [
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
      { attackType: "HOOK", hand: "LEFT" },
    ];
    const combat = withHistory(history, ["UPPER"], "LEFT", now);
    const step = resolveAttack(boxer, combat, NO_CRIT, now);
    expect(step.attack?.attackType).toBe("UPPER");
    expect(step.attack?.hand).toBe("RIGHT");
    expect(step.attack?.combo).toBe("FULL_COMBO");
    // 기본 어퍼 30 × 1.5 = 45.
    expect(step.attack?.damage).toBe(45);
  });

  it("손 불일치 미발동: right_hook으로 마무리하면 ONE_TWO_HOOK이 발동하지 않는다", () => {
    const history: AttackBeat[] = [
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
    ];
    // 직전 손을 LEFT로 두면 selectHand가 HOOK을 RIGHT로 고른다(콤보 지정 LEFT와 어긋남).
    const combat = withHistory(history, ["HOOK"], "LEFT", now);
    const step = resolveAttack(boxer, combat, NO_CRIT, now);
    expect(step.attack?.attackType).toBe("HOOK");
    expect(step.attack?.hand).toBe("RIGHT");
    expect(step.attack?.combo).toBeNull();
    // 보너스 없는 기본 훅 20.
    expect(step.attack?.damage).toBe(20);
  });

  it("순서 불일치 미발동: 스트레이트 단독(잽 선행 없음)은 콤보가 발동하지 않는다", () => {
    const combat = withHistory([], ["STRAIGHT"], null, now);
    const step = resolveAttack(boxer, combat, NO_CRIT, now);
    expect(step.attack?.attackType).toBe("STRAIGHT");
    expect(step.attack?.combo).toBeNull();
    expect(step.attack?.damage).toBe(15);
  });

  it("콤보 끊김: prefix 도중 다른 공격이 끼면 콤비네이션이 발동하지 않는다", () => {
    // [JAB,STRAIGHT] 뒤에 어퍼가 끼면 history 끝이 [JAB,STRAIGHT,UPPER]가 되어 어떤 콤보 suffix와도 불일치.
    const history: AttackBeat[] = [
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
      { attackType: "UPPER", hand: "LEFT" },
    ];
    // 이제 left_hook을 쳐도 suffix는 [STRAIGHT,UPPER,HOOK] → 콤보 아님.
    const combat = withHistory(history, ["HOOK"], "RIGHT", now);
    const step = resolveAttack(boxer, combat, NO_CRIT, now);
    expect(step.attack?.attackType).toBe("HOOK");
    expect(step.attack?.combo).toBeNull();
  });

  it("킬·스테이지 전이 시 attackHistory·comboStep·comboGauge가 초기화된다", () => {
    const combat: CombatRuntime = {
      ...withHistory([{ attackType: "JAB", hand: "LEFT" }], ["STRAIGHT"], "LEFT", now),
      monsterHp: 1, // 한 방에 처치 → createCombatRuntime로 리셋.
      comboGauge: 50,
      comboStep: 2,
    };
    const step = resolveAttack(boxer, combat, NO_CRIT, now);
    expect(step.attack?.killed).toBe(true);
    expect(step.combat.attackHistory).toEqual([]);
    expect(step.combat.comboStep).toBe(0);
    expect(step.combat.comboGauge).toBe(0);
  });

  it("넉다운·보스 타임아웃 후 런타임도 콤보 상태가 초기화된다", () => {
    // 넉다운: 낮은 HP에서 몬스터 공격으로 넉다운 → resolveKnockdown이 createCombatRuntime 사용.
    const start = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    const lowHp: CombatRuntime = {
      ...start,
      boxerHp: 1,
      attackHistory: [{ attackType: "JAB", hand: "LEFT" }],
      comboGauge: 30,
      comboStep: 1,
      nextMonsterAttackAt: 100,
      nextAttackAt: 10_000,
    };
    const ko = stepCombat(boxer, lowHp, 0.9, 100);
    expect(ko.knockedDown).toBe(true);
    expect(ko.combat.attackHistory).toEqual([]);
    expect(ko.combat.comboGauge).toBe(0);
    expect(ko.combat.comboStep).toBe(0);

    // 보스 타임아웃: 제한 시각 경과 후 파밍 전환 시에도 초기화.
    const boss: CombatRuntime = {
      ...createCombatRuntime(boxer, { chapter: 1, stage: 5 }, 0),
      attackHistory: [{ attackType: "JAB", hand: "LEFT" }],
      comboGauge: 40,
      comboStep: 1,
    };
    const timedOut = resolveBossTimeout(boxer, boss, 31_000);
    expect(timedOut.attackHistory).toEqual([]);
    expect(timedOut.comboGauge).toBe(0);
    expect(timedOut.comboStep).toBe(0);
  });

  it("콤보 게이지: 잽 1회당 +COMBO_GAUGE_PER_JAB, COMBO_GAUGE_MAX에서 클램프된다", () => {
    let combat = withHistory([], ["JAB"], null, now);
    combat = { ...combat, comboGauge: 0 };
    // 잽을 한 번 친 뒤 게이지가 증가한다(잽만 ready로 두고 매번 잽 재오픈).
    const reopenJab = (c: CombatRuntime, t: number): CombatRuntime => ({
      ...c,
      nextReadyAt: { ...c.nextReadyAt, JAB: t },
      nextAttackAt: t,
    });
    const step1 = resolveAttack(boxer, combat, NO_CRIT, now);
    expect(step1.attack?.attackType).toBe("JAB");
    expect(step1.combat.comboGauge).toBe(COMBO_GAUGE_PER_JAB);

    // 상한까지 반복.
    let c = step1.combat;
    let t = now;
    for (let i = 0; i < 50; i += 1) {
      t += 1;
      c = reopenJab(c, t);
      c = resolveAttack(boxer, c, NO_CRIT, t).combat;
    }
    expect(c.comboGauge).toBe(COMBO_GAUGE_MAX);
  });

  it("콤보 게이지: 잽 외 공격은 게이지를 올리지 않는다", () => {
    const combat = { ...withHistory([], ["STRAIGHT"], null, now), comboGauge: 20 };
    const step = resolveAttack(boxer, combat, NO_CRIT, now);
    expect(step.attack?.attackType).toBe("STRAIGHT");
    expect(step.combat.comboGauge).toBe(20);
  });

  it("공격 선택 정책: 콤보 다음 단계가 ready면 우선순위 폴백보다 우선된다", () => {
    const now2 = 100_000;
    // 원투 진행 중([JAB]) 스트레이트·어퍼·훅이 모두 ready여도 콤보 다음 단계인 스트레이트를 우선한다.
    const allReady: Record<AttackType, number> = { JAB: now2, STRAIGHT: now2, HOOK: now2, UPPER: now2 };
    expect(selectAttackType(allReady, now2, [{ attackType: "JAB", hand: "LEFT" }])).toBe("STRAIGHT");
    // 콤보 진행이 없으면(history 비어있음) 기존 우선순위(어퍼 최우선).
    expect(selectAttackType(allReady, now2, [])).toBe("UPPER");
    // 콤보 다음 단계(스트레이트)가 ready가 아니면 폴백(어퍼).
    expect(
      selectAttackType({ ...allReady, STRAIGHT: now2 + 1 }, now2, [{ attackType: "JAB", hand: "LEFT" }]),
    ).toBe("UPPER");
  });

  it("nextComboBeat/matchCombination 순수 함수가 손까지 일치를 요구한다", () => {
    expect(nextComboBeat([{ attackType: "JAB", hand: "LEFT" }])).toEqual({
      attackType: "STRAIGHT",
      hand: "RIGHT",
    });
    // 진행 중 콤보가 없으면(빈 history) null → 콤보 시작은 selectAttackType의 우선순위 폴백이 맡는다.
    expect(nextComboBeat([])).toBeNull();
    expect(
      matchCombination([
        { attackType: "JAB", hand: "LEFT" },
        { attackType: "STRAIGHT", hand: "RIGHT" },
      ]),
    ).toBe("ONE_TWO");
    // 손 불일치(right_straight 대신 left).
    expect(
      matchCombination([
        { attackType: "JAB", hand: "LEFT" },
        { attackType: "STRAIGHT", hand: "LEFT" },
      ]),
    ).toBeNull();
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

  it("오프라인 처치도 온라인과 동일하게 경험치를 부여한다(킬당 EXP_PER_KILL)", () => {
    const progress = calculateOfflineProgress(boxer, { chapter: 1, stage: 1 }, 10_000);
    // 10초 = 3킬, EXP_PER_KILL=1 → 경험치 3. 임계(62) 미만이라 레벨업 없음.
    expect(progress.kills).toBe(3);
    expect(progress.boxer.playerExp).toBe(boxer.playerExp + 3);
    expect(progress.boxer.playerLevel).toBe(boxer.playerLevel);
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

describe("타입 전환(switchFighterType)", () => {
  // 강화 레벨이 섞인 복서(maxHp 차이를 만들기 위해 체력 레벨을 충분히 둔다).
  const leveled: Boxer = {
    ...boxer,
    gold: 12_345,
    totalKills: 7,
    upgradeLevels: { ...zeroLevels, maxHp: 10, dodge: 20, counter: 20, defense: 5 },
  };

  it("강화 레벨·골드·진행 위치·monsterHp를 보존한다", () => {
    const combat = createCombatRuntime(leveled, { chapter: 2, stage: 3 }, 1_000);
    const damaged = { ...combat, monsterHp: 42 };
    const result = switchFighterType(leveled, damaged, "OUT_BOXER", "FEMALE", 2_000);
    expect(result.boxer.gold).toBe(12_345);
    expect(result.boxer.totalKills).toBe(7);
    expect(result.boxer.upgradeLevels).toEqual(leveled.upgradeLevels);
    expect(result.combat.position).toEqual({ chapter: 2, stage: 3 });
    expect(result.combat.monsterHp).toBe(42);
  });

  it("INFIGHTER→OUT_BOXER 전환 시 maxHp/defense/dodge/counter가 typeMultiplier로 재계산된다", () => {
    const combat = createCombatRuntime(leveled, { chapter: 1, stage: 1 }, 0);
    const result = switchFighterType(leveled, combat, "OUT_BOXER", "MALE", 1_000);
    const expected = calculateCombatStats(leveled.upgradeLevels, "OUT_BOXER");
    const infighter = calculateCombatStats(leveled.upgradeLevels, "INFIGHTER");
    expect(result.boxer.boxerType).toBe("OUT_BOXER");
    expect(result.combat.boxerMaxHp).toBe(expected.maxHp);
    // 타입 보정이 실제로 달라졌는지(아웃복서는 maxHp/defense 낮음, dodge/counter 높음).
    expect(expected.maxHp).toBeLessThan(infighter.maxHp);
    expect(expected.defense).toBeLessThan(infighter.defense);
    expect(expected.dodge).toBeGreaterThan(infighter.dodge);
    expect(expected.counter).toBeGreaterThan(infighter.counter);
  });

  it("현재 boxerHp가 새 maxHp를 초과하면 클램프하고, 미만이면 유지한다(풀충전 아님)", () => {
    const combat = createCombatRuntime(leveled, { chapter: 1, stage: 1 }, 0);
    const infighterMaxHp = combat.boxerMaxHp;
    // 아웃복서로 전환하면 maxHp가 줄어 현재 HP가 새 최대치로 클램프된다.
    const fullHp = { ...combat, boxerHp: infighterMaxHp };
    const shrunk = switchFighterType(leveled, fullHp, "OUT_BOXER", "MALE", 1_000);
    expect(shrunk.combat.boxerHp).toBe(shrunk.combat.boxerMaxHp);
    expect(shrunk.combat.boxerMaxHp).toBeLessThan(infighterMaxHp);
    // HP가 새 maxHp 미만이면 그대로 유지(자동 보충 없음).
    const lowHp = { ...combat, boxerHp: 10 };
    const kept = switchFighterType(leveled, lowHp, "OUT_BOXER", "MALE", 1_000);
    expect(kept.combat.boxerHp).toBe(10);
  });

  it("gender만 바뀌면 능력치는 동일하다(타입 보정 불변)", () => {
    const combat = createCombatRuntime(leveled, { chapter: 1, stage: 1 }, 0);
    const result = switchFighterType(leveled, combat, "INFIGHTER", "FEMALE", 1_000);
    expect(result.boxer.gender).toBe("FEMALE");
    expect(result.boxer.boxerType).toBe("INFIGHTER");
    expect(result.combat.boxerMaxHp).toBe(combat.boxerMaxHp);
  });

  it("보스 진행 중(bossDeadlineAt) 데드라인을 보존한다", () => {
    const combat = createCombatRuntime(leveled, { chapter: 1, stage: 5 }, 0);
    expect(combat.bossDeadlineAt).not.toBeNull();
    const result = switchFighterType(leveled, combat, "OUT_BOXER", "MALE", 1_000);
    expect(result.combat.bossDeadlineAt).toBe(combat.bossDeadlineAt);
    expect(result.combat.position).toEqual({ chapter: 1, stage: 5 });
  });

  it("입력 boxer/combat 객체를 변이하지 않는다", () => {
    const combat = createCombatRuntime(leveled, { chapter: 1, stage: 1 }, 0);
    const boxerSnapshot = JSON.parse(JSON.stringify(leveled));
    const combatSnapshot = JSON.parse(JSON.stringify(combat));
    switchFighterType(leveled, combat, "OUT_BOXER", "FEMALE", 1_000);
    expect(leveled).toEqual(boxerSnapshot);
    expect(combat).toEqual(combatSnapshot);
  });
});
