import { describe, expect, it } from "vitest";
import {
  BOXER_TYPE_MODIFIERS,
  COMBO_GAUGE_MAX,
  COMBO_GAUGE_PER_JAB,
  FULL_COMBO_GROGGY_BONUS,
  GROGGY_DAMAGE_MULT,
  GROGGY_DURATION_MS,
  GROGGY_GAIN_BY_ATTACK,
  GROGGY_MAX_BASE,
  OFFLINE_MAX_DURATION_MS,
} from "./constants";
import {
  calculateOfflineProgress,
  createCombatRuntime,
  matchCombination,
  nextComboBeat,
  resolveAttack,
  rescheduleAttacks,
  resolveBossTimeout,
  resolveGroggy,
  resolveMonsterAttack,
  retryBoss,
  selectAttackType,
  selectHand,
  stepCombat,
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

// 기본 테스트 복서는 전용 스킬을 장착하지 않는다(기본 타격만 검증). 스킬 효과는 아래 별도 describe에서 검증한다.
const boxer: Boxer = {
  id: "player",
  name: "테스트 복서",
  boxerType: "INFIGHTER",
  gender: "MALE",
  gold: 0,
  totalKills: 0,
  upgradeLevels: { ...zeroLevels },
  equippedSkills: { active: [], passive: null },
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

describe("보스 그로기", () => {
  const NO_CRIT = 0.99;
  const BOSS_POS = { chapter: 1, stage: 5 } as const;
  const NORMAL_POS = { chapter: 1, stage: 4 } as const;

  // 보스 런타임에서 특정 공격 1종만 ready로 열고 monsterHp를 크게 둬 처치 없이 그로기만 본다.
  function bossRuntime(
    readyType: AttackType,
    opts: { history?: AttackBeat[]; lastHand?: "LEFT" | "RIGHT" | null; now?: number } = {},
  ): CombatRuntime {
    const now = opts.now ?? 1_000;
    const base = createCombatRuntime(boxer, BOSS_POS, now);
    const FAR = now + 1_000_000;
    const nextReadyAt: Record<AttackType, number> = {
      JAB: FAR,
      STRAIGHT: FAR,
      HOOK: FAR,
      UPPER: FAR,
    };
    nextReadyAt[readyType] = now;
    return {
      ...base,
      monsterHp: 100_000_000,
      bossDeadlineAt: now + 1_000_000, // 그로기 테스트 중 제한시간 만료 방지.
      attackHistory: opts.history ?? [],
      lastHand: opts.lastHand ?? null,
      nextReadyAt,
      nextAttackAt: now,
    };
  }

  const infMult = BOXER_TYPE_MODIFIERS.INFIGHTER.groggyGainMultiplier;

  it("createCombatRuntime: 보스는 그로기 활성(groggyMax>0), 비보스는 비활성(groggyMax=0)", () => {
    expect(createCombatRuntime(boxer, BOSS_POS, 0).groggyMax).toBe(GROGGY_MAX_BASE);
    expect(createCombatRuntime(boxer, NORMAL_POS, 0).groggyMax).toBe(0);
    expect(createCombatRuntime(boxer, BOSS_POS, 0).groggyUntil).toBeNull();
  });

  it("누적: 보스전 훅·어퍼는 그로기를 누적하고 잽·스트레이트는 0이다", () => {
    const hook = resolveAttack(boxer, bossRuntime("HOOK"), NO_CRIT, 1_000);
    expect(hook.attack?.groggyGain).toBe(Math.floor(GROGGY_GAIN_BY_ATTACK.HOOK * infMult));
    expect(hook.combat.groggyGauge).toBe(Math.floor(GROGGY_GAIN_BY_ATTACK.HOOK * infMult));

    const upper = resolveAttack(boxer, bossRuntime("UPPER"), NO_CRIT, 1_000);
    expect(upper.attack?.groggyGain).toBe(Math.floor(GROGGY_GAIN_BY_ATTACK.UPPER * infMult));

    const jab = resolveAttack(boxer, bossRuntime("JAB"), NO_CRIT, 1_000);
    expect(jab.attack?.groggyGain).toBe(0);
    expect(jab.combat.groggyGauge).toBe(0);

    const straight = resolveAttack(boxer, bossRuntime("STRAIGHT"), NO_CRIT, 1_000);
    expect(straight.attack?.groggyGain).toBe(0);
  });

  it("발동: 게이지가 groggyMax에 도달하면 그로기 진입·게이지 0 리셋·groggyTriggered=true", () => {
    // 어퍼 그로기 35(인파이터). 게이지를 상한 직전에 두고 한 방으로 진입시킨다.
    const upperGain = Math.floor(GROGGY_GAIN_BY_ATTACK.UPPER * infMult);
    const combat: CombatRuntime = {
      ...bossRuntime("UPPER"),
      groggyGauge: GROGGY_MAX_BASE - 1,
    };
    const step = resolveAttack(boxer, combat, NO_CRIT, 1_000);
    expect(upperGain).toBeGreaterThan(0);
    expect(step.attack?.groggyTriggered).toBe(true);
    expect(step.combat.groggyGauge).toBe(0);
    expect(step.combat.groggyUntil).toBe(1_000 + GROGGY_DURATION_MS);
  });

  it("만료: groggyUntil 경과 후 다음 공격에서 그로기 해제·누적 재개", () => {
    const enterAt = 1_000;
    const combat: CombatRuntime = {
      ...bossRuntime("HOOK", { now: enterAt }),
      groggyUntil: enterAt + GROGGY_DURATION_MS,
      groggyGauge: 0,
    };
    // 만료 시각 이후 훅 → 추가 피해 없이 누적 재개, groggyUntil=null.
    const afterAt = enterAt + GROGGY_DURATION_MS;
    const next: CombatRuntime = {
      ...combat,
      nextReadyAt: { ...combat.nextReadyAt, HOOK: afterAt },
      nextAttackAt: afterAt,
    };
    const step = resolveAttack(boxer, next, NO_CRIT, afterAt);
    expect(step.attack?.groggyBonusApplied).toBe(false);
    expect(step.combat.groggyUntil).toBeNull();
    expect(step.combat.groggyGauge).toBe(Math.floor(GROGGY_GAIN_BY_ATTACK.HOOK * infMult));
  });

  it("그로기 중 추가 피해: 그로기 상태 공격은 비그로기 대비 GROGGY_DAMAGE_MULT배 피해·groggyBonusApplied", () => {
    const at = 1_000;
    // 비그로기 어퍼(기본 30) vs 그로기 어퍼(30×1.5=45).
    const baseHp = 100_000_000;
    const normal = resolveAttack(boxer, bossRuntime("UPPER", { now: at }), NO_CRIT, at);
    expect(normal.attack?.groggyBonusApplied).toBe(false);
    const normalDamage = baseHp - normal.combat.monsterHp;

    const groggyCombat: CombatRuntime = {
      ...bossRuntime("UPPER", { now: at }),
      groggyUntil: at + GROGGY_DURATION_MS,
    };
    const groggy = resolveAttack(boxer, groggyCombat, NO_CRIT, at);
    expect(groggy.attack?.groggyBonusApplied).toBe(true);
    const groggyDamage = baseHp - groggy.combat.monsterHp;
    expect(groggyDamage).toBe(Math.floor(normalDamage * GROGGY_DAMAGE_MULT));
    // 그로기 중에는 누적하지 않는다.
    expect(groggy.attack?.groggyGain).toBe(0);
  });

  it("그로기 중 추가 피해로 killed 재판정이 일어난다(보상·전이 포함)", () => {
    const at = 1_000;
    // 기본 어퍼 30. monsterHp=40이면 비그로기는 미처치, 그로기(45)면 처치.
    const combat: CombatRuntime = {
      ...bossRuntime("UPPER", { now: at }),
      monsterHp: 40,
      groggyUntil: at + GROGGY_DURATION_MS,
    };
    const step = resolveAttack(boxer, combat, NO_CRIT, at);
    expect(step.attack?.groggyBonusApplied).toBe(true);
    expect(step.attack?.killed).toBe(true);
    expect(step.attack?.goldReward).toBeGreaterThan(0);
    // 보스 처치 → 다음 챕터 1스테이지로 전이, 새 런타임의 그로기 초기화.
    expect(step.combat.position).toEqual({ chapter: 2, stage: 1 });
    expect(step.combat.groggyGauge).toBe(0);
    expect(step.combat.groggyUntil).toBeNull();
  });

  it("비보스 비활성: 일반 스테이지는 훅/어퍼를 쳐도 누적 0·groggyMax 0·발동/추가 피해 없음", () => {
    const now = 1_000;
    const base = createCombatRuntime(boxer, NORMAL_POS, now, true);
    const FAR = now + 1_000_000;
    const combat: CombatRuntime = {
      ...base,
      monsterHp: 100_000_000,
      nextReadyAt: { JAB: FAR, STRAIGHT: FAR, HOOK: now, UPPER: FAR },
      nextAttackAt: now,
    };
    const step = resolveAttack(boxer, combat, NO_CRIT, now);
    expect(step.attack?.attackType).toBe("HOOK");
    expect(step.attack?.groggyGain).toBe(0);
    expect(step.attack?.groggyTriggered).toBe(false);
    expect(step.attack?.groggyBonusApplied).toBe(false);
    expect(step.combat.groggyGauge).toBe(0);
    expect(step.combat.groggyMax).toBe(0);
    expect(step.combat.groggyUntil).toBeNull();
  });

  it("제한시간 우선: 그로기 상태여도 제한 시각 만료 시 파밍으로 전이하고 그로기를 초기화한다", () => {
    const deadline = 30_000;
    const combat: CombatRuntime = {
      ...bossRuntime("UPPER", { now: 0 }),
      bossDeadlineAt: deadline,
      groggyUntil: deadline + 5_000, // 그로기 상태로 두지만 제한시간이 우선해야 한다.
      groggyGauge: 50,
      nextReadyAt: { JAB: 1e9, STRAIGHT: 1e9, HOOK: 1e9, UPPER: deadline + 1 },
      nextAttackAt: deadline + 1,
    };
    // resolveBossTimeout(초입)이 우선해 공격 없이 전이.
    const step = resolveAttack(boxer, combat, NO_CRIT, deadline + 1);
    expect(step.bossTimedOut).toBe(true);
    expect(step.attack).toBeNull();
    expect(step.combat.position).toEqual({ chapter: 1, stage: 4 });
    expect(step.combat.groggyGauge).toBe(0);
    expect(step.combat.groggyUntil).toBeNull();
    expect(step.combat.groggyMax).toBe(0);
  });

  it("타입별 경향: 인파이터가 아웃복서보다 적은 훅 타격으로 그로기를 발동한다", () => {
    function hooksToGroggy(b: Boxer): number {
      const now0 = 1_000;
      const base = createCombatRuntime(b, BOSS_POS, now0);
      let combat: CombatRuntime = {
        ...base,
        monsterHp: 100_000_000,
        bossDeadlineAt: now0 + 1_000_000,
      };
      let t = now0;
      let hits = 0;
      for (let i = 0; i < 100; i += 1) {
        t += 1;
        combat = {
          ...combat,
          nextReadyAt: { JAB: 1e12, STRAIGHT: 1e12, HOOK: t, UPPER: 1e12 },
          nextAttackAt: t,
        };
        const step = resolveAttack(b, combat, NO_CRIT, t);
        combat = step.combat;
        hits += 1;
        if (step.attack?.groggyTriggered) return hits;
      }
      throw new Error("그로기 미발동");
    }
    expect(hooksToGroggy(boxer)).toBeLessThan(hooksToGroggy(outBoxer));
  });

  it("풀콤보 그로기 보너스: 풀콤보 마무리 어퍼는 UPPER 기본 + FULL_COMBO_GROGGY_BONUS만큼 누적한다", () => {
    const now = 1_000;
    // 풀콤보 prefix(JAB→STRAIGHT→HOOK)를 심고 어퍼만 ready로 열어 풀콤보 마무리.
    const history: AttackBeat[] = [
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
      { attackType: "HOOK", hand: "LEFT" },
    ];
    const combat = bossRuntime("UPPER", { history, lastHand: "LEFT", now });
    const step = resolveAttack(boxer, combat, NO_CRIT, now);
    expect(step.attack?.combo).toBe("FULL_COMBO");
    const expected = Math.floor(
      (GROGGY_GAIN_BY_ATTACK.UPPER + FULL_COMBO_GROGGY_BONUS) * infMult,
    );
    expect(step.attack?.groggyGain).toBe(expected);
  });

  it("resolveGroggy 순수 함수: 비보스(groggyMax=0)면 누적·발동·추가 피해 모두 없음", () => {
    const combat: CombatRuntime = { ...createCombatRuntime(boxer, NORMAL_POS, 0), groggyMax: 0 };
    const r = resolveGroggy(combat, "HOOK", null, "INFIGHTER", 0);
    expect(r).toEqual({
      groggyGauge: 0,
      groggyUntil: null,
      gain: 0,
      triggered: false,
      bonusApplied: false,
    });
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

describe("전용 스킬 전투 연결 (v1.3d)", () => {
  // 스킬을 장착한 복서. monsterHp가 큰 스테이지를 골라 한 틱에 죽지 않게 한다.
  const skilled = (active: Boxer["equippedSkills"]["active"], passive: Boxer["equippedSkills"]["passive"] = null): Boxer => ({
    ...boxer,
    equippedSkills: { active, passive },
  });

  it("createCombatRuntime이 스킬 런타임 필드를 초기화한다", () => {
    const combat = createCombatRuntime(skilled(["liver_shot"]), { chapter: 2, stage: 5 }, 0);
    expect(combat.activeBuffs).toEqual([]);
    expect(combat.internalDoT).toBeNull();
    // 액티브 쿨타임이 cooldownMs 후로 초기화된다(AFTER_COOLDOWN).
    expect(combat.skillCooldowns.liver_shot).toBeGreaterThan(0);
  });

  it("미장착 스킬은 발동하지 않는다", () => {
    const combat = createCombatRuntime(boxer, { chapter: 3, stage: 4 }, 0);
    const r = resolveAttack(boxer, combat, 0.99, 20_000);
    expect(r.attack?.skillTriggered).toBeNull();
    expect(r.attack?.skillDamage).toBe(0);
  });

  it("리버샷이 단일 피해와 내상 DoT를 부여하고, 내상이 시간 경과로 monsterHp를 누적 차감한다", () => {
    const b = skilled(["liver_shot"]);
    // 큰 HP 스테이지(보스 아님)에서 진행. 쿨이 도래하도록 충분히 뒤 시점에서 친다.
    const combat = createCombatRuntime(b, { chapter: 5, stage: 4 }, 0);
    const fireAt = combat.skillCooldowns.liver_shot!;
    const r1 = resolveAttack(b, combat, 0.99, fireAt);
    expect(r1.attack?.skillTriggered).toBe("liver_shot");
    expect(r1.attack?.skillDamage).toBeGreaterThan(0);
    expect(r1.combat.internalDoT).not.toBeNull();
    const hpAfterCast = r1.combat.monsterHp;
    // 1초 뒤 다음 복서 공격 틱에 내상 1틱이 정산된다(추가 피해).
    const r2 = resolveAttack(r1.boxer, r1.combat, 0.99, fireAt + 1_000);
    expect(r2.attack?.internalDamage).toBeGreaterThan(0);
    // 내상 + 기본 타격으로 hp가 더 줄어든다.
    expect(r2.combat.monsterHp).toBeLessThan(hpAfterCast);
  });

  it("스킬 쿨타임을 준수해 연속 발동하지 않는다", () => {
    const b = skilled(["liver_shot"]);
    const combat = createCombatRuntime(b, { chapter: 5, stage: 4 }, 0);
    const fireAt = combat.skillCooldowns.liver_shot!;
    const r1 = resolveAttack(b, combat, 0.99, fireAt);
    expect(r1.attack?.skillTriggered).toBe("liver_shot");
    // 바로 다음 틱(쿨 도래 전)에는 발동하지 않는다.
    const r2 = resolveAttack(r1.boxer, r1.combat, 0.99, fireAt + 100);
    expect(r2.attack?.skillTriggered).toBeNull();
  });

  it("뎀프시롤 다단 타격이 monsterHp를 타수만큼 차감하고 그로기를 누적한다(보스)", () => {
    const b = skilled(["dempsey_roll"]);
    const combat = createCombatRuntime(b, { chapter: 1, stage: 5 }, 0);
    const fireAt = combat.skillCooldowns.dempsey_roll!;
    const r = resolveAttack(b, combat, 0.99, fireAt);
    expect(r.attack?.skillTriggered).toBe("dempsey_roll");
    expect(r.attack?.hits).toBeGreaterThan(1);
    expect(r.attack?.skillDamage).toBeGreaterThan(0);
    // 보스라 그로기 게이지가 스킬 그로기만큼(+ 기본 타격) 누적된다.
    expect(r.combat.groggyGauge).toBeGreaterThan(0);
  });

  it("철벽가드(패시브)가 피격 피해를 감소시킨다", () => {
    const guarded = skilled([], "iron_guard");
    const plain = skilled([], null);
    const cg = createCombatRuntime(guarded, { chapter: 1, stage: 1 }, 0);
    const cp = createCombatRuntime(plain, { chapter: 1, stage: 1 }, 0);
    // 회피 실패(0.99)로 피격을 고정한다.
    const rg = resolveMonsterAttack(guarded, cg, 0.99, 2_000);
    const rp = resolveMonsterAttack(plain, cp, 0.99, 2_000);
    expect(rg.result.damage).toBeLessThan(rp.result.damage);
    expect(rg.result.skillTriggered).toBe("iron_guard");
  });

  it("나비스텝 버프가 회피율을 올려 MISS를 만든다", () => {
    // 아웃복서 기본 회피 0.08. randomValue 0.15면 평소 피격이지만, 나비스텝(+0.15)으로 회피한다.
    const b: Boxer = { ...outBoxer, equippedSkills: { active: [], passive: null } };
    const base = createCombatRuntime(b, { chapter: 1, stage: 1 }, 0);
    const noBuff = resolveMonsterAttack(b, base, 0.15, 2_000);
    expect(noBuff.result.outcome).not.toBe("MISS");
    // 나비스텝 버프를 수동 부여.
    const withBuff: CombatRuntime = {
      ...base,
      activeBuffs: [{
        sourceSkill: "navi_step",
        until: 10_000,
        dodgeBonus: 0.15,
        counterBonus: 0.1,
        cooldownSpeedup: 0.2,
        monsterAttackWeaken: 0,
        monsterCooldownDelay: 0,
        hookUpperDamageBonus: 0,
      }],
    };
    const buffed = resolveMonsterAttack(b, withBuff, 0.15, 2_000);
    // 아웃복서는 회피 시 COUNTER. 어쨌든 피격(HIT/GUARD)이 아니다.
    expect(buffed.result.damage).toBe(0);
  });

  it("스텝백카운터(패시브)가 회피 성공 시 자동 반격으로 monsterHp를 깎는다", () => {
    const b: Boxer = { ...outBoxer, equippedSkills: { active: [], passive: "step_back_counter" } };
    const combat = createCombatRuntime(b, { chapter: 1, stage: 1 }, 0);
    // 회피 성공(0.0).
    const r = resolveMonsterAttack(b, combat, 0.0, 2_000);
    expect(r.result.counterDamage).toBeGreaterThan(0);
    expect(r.combat.monsterHp).toBeLessThan(combat.monsterHp);
  });

  it("나비스텝 cooldownSpeedup 버프가 기본 공격 쿨타임을 단축한다", () => {
    // 큰 HP·비보스 스테이지에서 한 틱 친 뒤, 친 공격의 다음 준비 시각을 버프 유무로 비교한다.
    const b: Boxer = { ...outBoxer, equippedSkills: { active: [], passive: null } };
    const base = createCombatRuntime(b, { chapter: 5, stage: 4 }, 0);
    const now = base.nextAttackAt;
    const plain = resolveAttack(b, base, 0.99, now);
    const withBuff: CombatRuntime = {
      ...base,
      activeBuffs: [{
        sourceSkill: "navi_step",
        until: 1_000_000,
        dodgeBonus: 0,
        counterBonus: 0,
        cooldownSpeedup: 0.2,
        monsterAttackWeaken: 0,
        monsterCooldownDelay: 0,
        hookUpperDamageBonus: 0,
      }],
    };
    const buffed = resolveAttack(b, withBuff, 0.99, now);
    // 같은 공격이 선택되고, 버프가 있으면 그 공격의 다음 준비 시각이 더 가깝다(쿨 단축).
    const type = plain.attack!.attackType;
    expect(buffed.attack!.attackType).toBe(type);
    expect(buffed.combat.nextReadyAt[type] - now).toBeLessThan(plain.combat.nextReadyAt[type] - now);
  });

  it("거리조절 버프가 몬스터 공격 간격을 늘린다", () => {
    const b: Boxer = { ...outBoxer, equippedSkills: { active: [], passive: null } };
    const base = createCombatRuntime(b, { chapter: 1, stage: 1 }, 0);
    const withBuff: CombatRuntime = {
      ...base,
      activeBuffs: [{
        sourceSkill: "distance_control",
        until: 100_000,
        dodgeBonus: 0.1,
        counterBonus: 0,
        cooldownSpeedup: 0,
        monsterAttackWeaken: 0,
        monsterCooldownDelay: 0.2,
        hookUpperDamageBonus: 0,
      }],
    };
    const plain = resolveMonsterAttack(b, base, 0.99, 2_000);
    const delayed = resolveMonsterAttack(b, withBuff, 0.99, 2_000);
    expect(delayed.combat.nextMonsterAttackAt).toBeGreaterThan(plain.combat.nextMonsterAttackAt);
  });
});

// 버그 수정: 강화 시 rescheduleAttacks가 공격 쿨타임 진척(progress)을 보존해야 한다.
//   이전엔 전체 리셋이라 강화를 연타하면 nextAttackAt이 계속 미래로 밀려 공격이 멈췄다.
describe("rescheduleAttacks(강화 시 진척 보존)", () => {
  const ATTACK_TYPES: AttackType[] = ["JAB", "STRAIGHT", "HOOK", "UPPER"];
  const baseSpeed = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType).attackSpeed;

  it("같은 공격 속도로 재스케줄하면 다음 공격 시각이 사실상 불변(진척 보존)이다", () => {
    const base = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    // now=200 시점에 같은 속도로 재스케줄 → remaining/oldCd × newCd = remaining → 원래 시각 그대로.
    const r = rescheduleAttacks(base, baseSpeed, baseSpeed, 200);
    for (const type of ATTACK_TYPES) {
      expect(r.nextReadyAt[type]).toBeCloseTo(base.nextReadyAt[type], 6);
    }
    expect(r.nextAttackAt).toBeCloseTo(base.nextAttackAt, 6);
  });

  it("공격 속도가 오르면 다음 공격이 당겨지거나 같고, 절대 더 멀어지지 않는다", () => {
    const base = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    const r = rescheduleAttacks(base, baseSpeed, baseSpeed * 2, 200);
    for (const type of ATTACK_TYPES) {
      expect(r.nextReadyAt[type]).toBeLessThanOrEqual(base.nextReadyAt[type] + 1e-6);
    }
    expect(r.nextAttackAt).toBeLessThan(base.nextAttackAt);
  });

  it("강화를 연타(여러 번 재스케줄)해도 nextAttackAt이 최초 값보다 미래로 밀리지 않는다", () => {
    const base = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    const original = base.nextAttackAt;
    let combat = base;
    let speed = baseSpeed;
    for (let i = 0; i < 10; i += 1) {
      const next = speed * 1.05;
      combat = rescheduleAttacks(combat, speed, next, 200);
      speed = next;
    }
    expect(combat.nextAttackAt).toBeLessThanOrEqual(original + 1e-6);
  });

  it("방금 친 직후(remaining≈oldCd)면 새 쿨타임 한 사이클로 잡힌다(fraction≈1)", () => {
    // now=0에 막 예약된 상태 → remaining = oldCd, fraction=1, 새 nextReadyAt = now + newCd.
    const base = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    const r = rescheduleAttacks(base, baseSpeed, baseSpeed * 2, 0);
    for (const type of ATTACK_TYPES) {
      // newCd = oldCd/2 이므로 새 시각도 절반.
      expect(r.nextReadyAt[type]).toBeCloseTo(base.nextReadyAt[type] / 2, 6);
    }
  });

  it("이미 준비된 공격(remaining=0)이면 즉시(now) 준비된다", () => {
    const base = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, 0);
    // 모든 공격이 now=1000 이전(500)에 ready → remaining 0 → 새 시각 = now.
    const ready: CombatRuntime = {
      ...base,
      nextReadyAt: { JAB: 500, STRAIGHT: 500, HOOK: 500, UPPER: 500 },
      nextAttackAt: 500,
    };
    const r = rescheduleAttacks(ready, baseSpeed, baseSpeed * 2, 1_000);
    expect(r.nextAttackAt).toBe(1_000);
    for (const type of ATTACK_TYPES) {
      expect(r.nextReadyAt[type]).toBe(1_000);
    }
  });

  it("HP·콤보·그로기·스킬 등 진행 상태는 그대로 보존한다", () => {
    const base = createCombatRuntime(boxer, { chapter: 1, stage: 5 }, 0);
    const rich: CombatRuntime = {
      ...base,
      monsterHp: 7,
      boxerHp: 42,
      attackHistory: [{ attackType: "JAB", hand: "LEFT" }],
      comboGauge: 3,
      comboStep: 1,
      groggyGauge: 5,
    };
    const r = rescheduleAttacks(rich, baseSpeed, baseSpeed * 2, 100);
    expect(r.monsterHp).toBe(7);
    expect(r.boxerHp).toBe(42);
    expect(r.attackHistory).toEqual(rich.attackHistory);
    expect(r.comboGauge).toBe(3);
    expect(r.comboStep).toBe(1);
    expect(r.groggyGauge).toBe(5);
    expect(r.boxerMaxHp).toBe(rich.boxerMaxHp);
  });
});
