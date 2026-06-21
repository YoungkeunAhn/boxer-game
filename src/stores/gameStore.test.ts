import { describe, expect, it, vi } from "vitest";
import { createCombatRuntime } from "../game/combat";
import { calculateCombatStats } from "../game/formulas";
import { BALANCE_VERSION, INITIAL_UPGRADE_LEVELS, SCHEMA_VERSION } from "../game/constants";
import type { SaveSnapshot } from "../game/save";
import type { Boxer, SaveDataV5 } from "../game/types";
import { createGameStore, type GameStoreDependencies } from "./gameStore";

class FakeClock {
  now = 0;
  private nextId = 1;
  readonly timers = new Map<number, { at: number; callback: () => void }>();

  schedule = (callback: () => void, delayMs: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + delayMs, callback });
    return id;
  };

  cancel = (handle: unknown): void => {
    this.timers.delete(handle as number);
  };

  advanceTo(target: number): void {
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      this.timers.delete(id);
      this.now = timer.at;
      timer.callback();
    }
    this.now = target;
  }
}

function boxer(overrides: Partial<Boxer> = {}): Boxer {
  return {
    id: "player",
    name: "테스트 복서",
    boxerType: "INFIGHTER",
    gender: "MALE",
    gold: 0,
    totalKills: 0,
    upgradeLevels: { ...INITIAL_UPGRADE_LEVELS },
    ...overrides,
  };
}

function savedData(
  clock: FakeClock,
  overrides: Partial<SaveDataV5> = {},
): SaveDataV5 {
  return {
    schemaVersion: SCHEMA_VERSION,
    balanceVersion: BALANCE_VERSION,
    savedAt: new Date(clock.now).toISOString(),
    boxer: boxer(),
    position: { chapter: 1, stage: 1 },
    isFarming: false,
    ...overrides,
  };
}

function dependencies(
  clock: FakeClock,
  overrides: Partial<GameStoreDependencies> = {},
): GameStoreDependencies {
  return {
    load: () => ({ status: "empty" }),
    save: () => true,
    clear: () => true,
    now: () => clock.now,
    random: () => 0.99,
    schedule: clock.schedule,
    cancelSchedule: clock.cancel,
    ...overrides,
  };
}

describe("자동 전투 게임 스토어", () => {
  it("첫 공격까지 공격 간격을 기다리고 단일 타이머로 일반 스테이지를 진행한다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock));
    store.getState().createBoxer("자동 복서");

    expect(clock.timers.size).toBe(1);
    clock.advanceTo(999);
    expect(store.getState().combat?.monsterHp).toBe(30);
    clock.advanceTo(1_000);
    // 첫 공격은 잽 한 종류 → floor(공격력 10 × 계수 0.3) = 3 피해.
    expect(store.getState().combat?.monsterHp).toBe(27);
    expect(store.getState().lastAttack).toMatchObject({ attackType: "JAB", hand: "LEFT" });
    expect(clock.timers.size).toBe(1);
  });

  it("복서 생성 시 선택한 타입·성별을 저장하고 기본값은 인파이터·남자다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock));
    store.getState().createBoxer("아웃 복서", "OUT_BOXER", "FEMALE");
    expect(store.getState().boxer).toEqual(
      expect.objectContaining({ boxerType: "OUT_BOXER", gender: "FEMALE" }),
    );

    const fallback = createGameStore(dependencies(clock));
    fallback.getState().createBoxer("기본 복서");
    expect(fallback.getState().boxer).toEqual(
      expect.objectContaining({ boxerType: "INFIGHTER", gender: "MALE" }),
    );
  });

  it("몬스터 공격 후 recentDefense가 방어 결과(GUARD/MISS/COUNTER)로 갱신된다", () => {
    // 인파이터 + random 0.99 → 회피 실패 → GUARD. 몬스터 공격만 즉시 닿도록 세팅.
    const clock = new FakeClock();
    const inf = boxer();
    const guardStore = createGameStore(dependencies(clock, { random: () => 0.99 }));
    const start = createCombatRuntime(inf, { chapter: 1, stage: 1 }, clock.now);
    expect(guardStore.getState().recentDefense).toBeNull();
    guardStore.setState({
      boxer: inf,
      combat: { ...start, nextMonsterAttackAt: 100, nextAttackAt: 10_000 },
      isRunning: false,
    });
    guardStore.getState().resume();
    clock.advanceTo(100);
    expect(guardStore.getState().recentDefense?.outcome).toBe("GUARD");
    expect(guardStore.getState().combat?.boxerHp).toBeLessThan(130);

    // 아웃복서 + random 0.0 → 회피 성공 → COUNTER(피해 0).
    const counterClock = new FakeClock();
    const out = boxer({ boxerType: "OUT_BOXER" });
    const counterStore = createGameStore(dependencies(counterClock, { random: () => 0.0 }));
    const outStart = createCombatRuntime(out, { chapter: 1, stage: 1 }, counterClock.now);
    counterStore.setState({
      boxer: out,
      combat: { ...outStart, nextMonsterAttackAt: 100, nextAttackAt: 10_000 },
      isRunning: false,
    });
    counterStore.getState().resume();
    counterClock.advanceTo(100);
    expect(counterStore.getState().recentDefense?.outcome).toBe("COUNTER");
    expect(counterStore.getState().combat?.boxerHp).toBe(outStart.boxerMaxHp); // 피해 없음
  });

  it("콤보 발동 시 lastCombo·comboGauge·comboStep을 상태로 노출한다", () => {
    const clock = new FakeClock();
    const inf = boxer();
    const store = createGameStore(dependencies(clock, { random: () => 0.99 }));
    const start = createCombatRuntime(inf, { chapter: 1, stage: 4 }, clock.now, true);
    // 직전 잽(왼손) 진행 + 스트레이트만 즉시 ready → 원투 마무리가 결정적으로 발동한다(처치 안 되게 HP 큼).
    const FAR = 1_000_000;
    store.setState({
      boxer: inf,
      combat: {
        ...start,
        monsterHp: FAR,
        attackHistory: [{ attackType: "JAB", hand: "LEFT" }],
        lastHand: "LEFT",
        nextReadyAt: { JAB: FAR, STRAIGHT: 100, HOOK: FAR, UPPER: FAR },
        nextAttackAt: 100,
        nextMonsterAttackAt: FAR,
        bossDeadlineAt: null,
      },
      isRunning: false,
    });
    expect(store.getState().lastCombo).toBeNull();
    store.getState().resume();
    clock.advanceTo(100);
    expect(store.getState().lastAttack).toMatchObject({ attackType: "STRAIGHT", combo: "ONE_TWO" });
    expect(store.getState().lastCombo).toBe("ONE_TWO");
    expect(store.getState().comboStep).toBe(2); // 원투 시퀀스 길이.
    expect(store.getState().comboGauge).toBe(0); // 스트레이트는 게이지를 올리지 않는다.
  });

  it("보스 제한 시각과 같은 공격을 먼저 처리해 처치하면 다음 챕터로 이동한다", () => {
    const clock = new FakeClock();
    // 강한 복서: 한 방에 보스를 잡는다. 회피 실패(0.99)여도 14회 가드 피격(8×14=112 < 130)을 버틴다.
    const strongBoxer = boxer({
      upgradeLevels: { ...INITIAL_UPGRADE_LEVELS, attackPower: 30 },
    });
    const store = createGameStore(dependencies(clock));
    const combat = createCombatRuntime(strongBoxer, { chapter: 1, stage: 5 }, clock.now);
    store.setState({
      boxer: strongBoxer,
      combat: { ...combat, nextAttackAt: combat.bossDeadlineAt! },
      isRunning: false,
    });
    store.getState().resume();

    clock.advanceTo(30_000);
    expect(store.getState().combat?.position).toEqual({ chapter: 2, stage: 1 });
    expect(store.getState().message).toContain("보스를 쓰러뜨렸습니다");
  });

  it("보스 시간초과 후 직전 스테이지를 반복 파밍하고 수동 재도전한다", () => {
    const clock = new FakeClock();
    // 기본 인파이터는 보스(HP 큼)를 못 잡고, 14회 가드 피격(8×14=112 < 130 HP)을 버텨 넉다운 없이
    // 보스 시간초과만 발생한다(random 0.99로 회피 실패 고정).
    const weakBoxer = boxer();
    const store = createGameStore(dependencies(clock, { random: () => 0.99 }));
    const combat = createCombatRuntime(weakBoxer, { chapter: 1, stage: 5 }, clock.now);
    store.setState({ boxer: weakBoxer, combat, isRunning: false });
    store.getState().resume();

    clock.advanceTo(30_001);
    expect(store.getState().combat).toEqual(expect.objectContaining({
      position: { chapter: 1, stage: 4 },
      isFarming: true,
    }));
    store.getState().retryBoss();
    expect(store.getState().combat).toEqual(expect.objectContaining({
      position: { chapter: 1, stage: 5 },
      isFarming: false,
    }));
    expect(clock.timers.size).toBe(1);
  });

  it("복서 HP 0 도달 시 KNOCK DOWN 메시지를 노출하고 진행 위치를 유지한다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock, { random: () => 0.99 }));
    const player = boxer();
    const start = createCombatRuntime(player, { chapter: 1, stage: 1 }, clock.now);
    // HP를 1로 두고 즉시 몬스터 공격이 닿게 한다.
    store.setState({
      boxer: player,
      combat: { ...start, boxerHp: 1, nextMonsterAttackAt: 100, nextAttackAt: 10_000 },
      isRunning: false,
    });
    store.getState().resume();
    clock.advanceTo(100);
    expect(store.getState().message).toBe("KNOCK DOWN");
    expect(store.getState().combat?.position).toEqual({ chapter: 1, stage: 1 });
  });

  it("재접속 오프라인 보상은 8시간으로 제한하고 재개를 반복해도 중복 지급하지 않는다", () => {
    const clock = new FakeClock();
    clock.now = 10 * 60 * 60 * 1_000;
    const save = vi.fn(() => true);
    const data = savedData(clock, {
      savedAt: new Date(0).toISOString(),
      boxer: boxer({ upgradeLevels: { ...INITIAL_UPGRADE_LEVELS, attackPower: 5 } }),
    });
    const store = createGameStore(dependencies(clock, {
      load: () => ({ status: "loaded", data }),
      save,
    }));
    const kills = store.getState().boxer?.totalKills;

    expect(store.getState().offlineSummary?.elapsedMs).toBe(8 * 60 * 60 * 1_000);
    expect(kills).toBeGreaterThan(0);
    store.getState().resume();
    store.getState().resume();
    expect(store.getState().boxer?.totalKills).toBe(kills);
    expect(clock.timers.size).toBe(1);
  });

  it("저장된 4스테이지 반복 파밍 모드를 재접속 후에도 유지한다", () => {
    const clock = new FakeClock();
    const data = savedData(clock, {
      position: { chapter: 2, stage: 4 },
      isFarming: true,
    });
    const store = createGameStore(dependencies(clock, {
      load: () => ({ status: "loaded", data }),
    }));
    expect(store.getState().combat).toEqual(expect.objectContaining({
      position: { chapter: 2, stage: 4 },
      isFarming: true,
    }));
  });

  it("legacy와 저장소 접근 불가 상태를 서로 다른 안내로 노출한다", () => {
    const clock = new FakeClock();
    const legacy = createGameStore(dependencies(clock, { load: () => ({ status: "legacy" }) }));
    const unavailable = createGameStore(dependencies(clock, { load: () => ({ status: "unavailable" }) }));
    expect(legacy.getState().legacySaveDetected).toBe(true);
    expect(unavailable.getState().storageWarning).toContain("저장소");
  });

  // === TASK-015 전투 컨트롤(AUTO·배속·수동) ===

  it("AUTO OFF에서는 자동 타이머를 예약하지 않고, 입력 없이 시간만 흘려도 진행하지 않는다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock));
    store.getState().createBoxer("수동 복서");
    expect(clock.timers.size).toBe(1);

    store.getState().toggleAuto(); // AUTO→MANUAL
    expect(store.getState().autoMode).toBe("MANUAL");
    expect(clock.timers.size).toBe(0); // 타이머 정지.

    const hpBefore = store.getState().combat?.monsterHp;
    clock.advanceTo(60_000); // 시간만 흐름.
    expect(clock.timers.size).toBe(0); // 자동 재예약 없음.
    expect(store.getState().combat?.monsterHp).toBe(hpBefore); // 진행 없음.
  });

  it("AUTO OFF에서 manualAttack 1회는 복서 공격 1회만 진행한다(첫 잽 3피해)", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock));
    const player = boxer();
    const start = createCombatRuntime(player, { chapter: 1, stage: 1 }, clock.now);
    // 몬스터 공격을 멀리 둬서 복서 공격만 격리 검증한다(가드 카운터로 인한 추가 피해 배제).
    store.setState({
      boxer: player,
      combat: { ...start, nextMonsterAttackAt: 1_000_000 },
      autoMode: "MANUAL",
      isRunning: false,
    });
    expect(store.getState().combat?.monsterHp).toBe(30);

    store.getState().manualAttack(); // 다음 복서 공격(잽 1000ms)까지 전진 후 1타.
    expect(store.getState().combat?.monsterHp).toBe(27); // 30 - floor(10*0.3)=3.
    expect(store.getState().lastAttack).toMatchObject({ attackType: "JAB", hand: "LEFT" });
    expect(clock.timers.size).toBe(0); // 수동은 타이머를 만들지 않는다.

    store.getState().manualAttack(); // 한 번 더 → 잽 -3.
    expect(store.getState().combat?.monsterHp).toBe(24);
  });

  it("toggleAuto로 MANUAL→AUTO 복귀 시 자동 전투가 정상 재예약·진행된다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock));
    store.getState().createBoxer("복귀 복서");
    store.getState().toggleAuto(); // MANUAL
    expect(clock.timers.size).toBe(0);

    store.getState().toggleAuto(); // AUTO
    expect(store.getState().autoMode).toBe("AUTO");
    expect(clock.timers.size).toBe(1);
    clock.advanceTo(1_000);
    expect(store.getState().combat?.monsterHp).toBe(27); // 자동 잽 1타.
  });

  it("배속 x2는 실시간만 절반으로 단축하고 전투 상태(밸런스)는 x1과 동일하다", () => {
    // x1 스토어: 실시간 2T 동안 자동 전투.
    const clockX1 = new FakeClock();
    const storeX1 = createGameStore(dependencies(clockX1));
    storeX1.getState().createBoxer("x1 복서");
    clockX1.advanceTo(20_000);

    // x2 스토어: 같은 게임 시간을 실시간 T(=절반)에 도달.
    const clockX2 = new FakeClock();
    const storeX2 = createGameStore(dependencies(clockX2));
    storeX2.getState().createBoxer("x2 복서");
    storeX2.getState().setSpeedMultiplier(2);
    clockX2.advanceTo(10_000); // 실시간 절반.

    const a = storeX1.getState().combat;
    const b = storeX2.getState().combat;
    // 게임 시간 진행 결과(위치·몬스터HP·콤보 상태)가 동일해야 한다(밸런스 불변).
    expect(b?.position).toEqual(a?.position);
    expect(b?.monsterHp).toBe(a?.monsterHp);
    expect(storeX2.getState().boxer?.totalKills).toBe(storeX1.getState().boxer?.totalKills);
    expect(storeX2.getState().boxer?.gold).toBe(storeX1.getState().boxer?.gold);
  });

  it("배속 x2여도 보스 타임아웃은 게임 시간 기준으로 동일하게 발생한다(밸런스 불변)", () => {
    const weak = boxer();
    // x1: 실시간 30_001ms에 타임아웃.
    const clockX1 = new FakeClock();
    const storeX1 = createGameStore(dependencies(clockX1, { random: () => 0.99 }));
    const c1 = createCombatRuntime(weak, { chapter: 1, stage: 5 }, clockX1.now);
    storeX1.setState({ boxer: weak, combat: c1, isRunning: false });
    storeX1.getState().resume();
    clockX1.advanceTo(30_001);

    // x2: 실시간 15_001ms(절반)에 같은 게임 시간(30_002) 도달 → 동일 타임아웃.
    const clockX2 = new FakeClock();
    const storeX2 = createGameStore(dependencies(clockX2, { random: () => 0.99 }));
    const c2 = createCombatRuntime(weak, { chapter: 1, stage: 5 }, clockX2.now);
    storeX2.setState({ boxer: weak, combat: c2, isRunning: false });
    storeX2.getState().setSpeedMultiplier(2);
    storeX2.getState().resume();
    clockX2.advanceTo(15_001);

    expect(storeX1.getState().combat).toEqual(
      expect.objectContaining({ position: { chapter: 1, stage: 4 }, isFarming: true }),
    );
    expect(storeX2.getState().combat?.position).toEqual({ chapter: 1, stage: 4 });
    expect(storeX2.getState().combat?.isFarming).toBe(true);
  });

  it("수동 스킬(피니시)은 AUTO OFF + 콤보 게이지 가득일 때만 발동하고 게이지를 소비한다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock, { random: () => 0.99 }));
    const player = boxer();
    const start = createCombatRuntime(player, { chapter: 1, stage: 1 }, clock.now);
    store.setState({
      boxer: player,
      combat: { ...start, monsterHp: 1_000, comboGauge: 100 },
      autoMode: "MANUAL",
      isRunning: false,
    });

    store.getState().triggerSkill();
    // 어퍼 계수 3.0 × 피니시 배수 3 × 공격력 10 = 90 피해.
    expect(store.getState().combat?.monsterHp).toBe(910);
    expect(store.getState().combat?.comboGauge).toBe(0); // 게이지 소비.

    // 게이지 0이면 재발동 무동작.
    const hp = store.getState().combat?.monsterHp;
    store.getState().triggerSkill();
    expect(store.getState().combat?.monsterHp).toBe(hp);
  });

  it("AUTO ON일 때는 수동 입력(manualAttack/triggerSkill)이 무동작이다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock));
    store.getState().createBoxer("자동 복서");
    const hp = store.getState().combat?.monsterHp;
    store.getState().manualAttack();
    store.getState().triggerSkill();
    expect(store.getState().combat?.monsterHp).toBe(hp);
  });

  it("초기화하면 예약 공격을 취소하고 삭제 실패 시 진행과 타이머를 보존한다", () => {
    const clock = new FakeClock();
    const clear = vi.fn(() => false);
    const store = createGameStore(dependencies(clock, { clear }));
    store.getState().createBoxer("보존 복서");
    store.getState().reset();
    expect(store.getState().boxer?.name).toBe("보존 복서");
    expect(store.getState().storageWarning).toContain("삭제에 실패");
    expect(clock.timers.size).toBe(1);

    clear.mockReturnValue(true);
    store.getState().reset();
    expect(store.getState().boxer).toBeNull();
    expect(clock.timers.size).toBe(0);
  });
});

describe("타입 전환(switchType) 액션", () => {
  function loadedStore(
    clock: FakeClock,
    overrides: Partial<GameStoreDependencies> = {},
  ) {
    const data = savedData(clock, {
      boxer: boxer({
        boxerType: "INFIGHTER",
        gender: "MALE",
        gold: 9_999,
        totalKills: 12,
        upgradeLevels: { ...INITIAL_UPGRADE_LEVELS, maxHp: 8, dodge: 10, counter: 10 },
      }),
    });
    return createGameStore(
      dependencies(clock, { load: () => ({ status: "loaded", data }), ...overrides }),
    );
  }

  it("전환 후 골드·강화 레벨을 보존하고 boxer.type/gender를 갱신한다", () => {
    const clock = new FakeClock();
    const store = loadedStore(clock);
    store.getState().switchType("OUT_BOXER", "FEMALE");
    const after = store.getState().boxer;
    expect(after?.gold).toBe(9_999);
    expect(after?.totalKills).toBe(12);
    expect(after?.upgradeLevels).toEqual({
      ...INITIAL_UPGRADE_LEVELS,
      maxHp: 8,
      dodge: 10,
      counter: 10,
    });
    expect(after?.boxerType).toBe("OUT_BOXER");
    expect(after?.gender).toBe("FEMALE");
  });

  it("combat.boxerMaxHp가 새 타입 maxHp와 일치하고 현재 HP를 클램프한다", () => {
    const clock = new FakeClock();
    const store = loadedStore(clock);
    const beforeMaxHp = store.getState().combat?.boxerMaxHp ?? 0;
    const expected = calculateCombatStats(
      store.getState().boxer!.upgradeLevels,
      "OUT_BOXER",
    );
    store.getState().switchType("OUT_BOXER", "MALE");
    const combat = store.getState().combat;
    expect(combat?.boxerMaxHp).toBe(expected.maxHp);
    // 아웃복서는 maxHp가 더 낮으므로 풀 HP였던 현재 HP가 새 최대치로 클램프된다.
    expect(expected.maxHp).toBeLessThan(beforeMaxHp);
    expect(combat?.boxerHp).toBe(expected.maxHp);
  });

  it("persist를 호출해 저장 스냅샷의 boxer.boxerType이 갱신된다", () => {
    const clock = new FakeClock();
    const save = vi.fn<(snapshot: SaveSnapshot, now?: Date) => boolean>(() => true);
    const store = loadedStore(clock, { save });
    save.mockClear();
    store.getState().switchType("OUT_BOXER", "FEMALE");
    expect(save).toHaveBeenCalled();
    const lastCall = save.mock.calls.at(-1)?.[0];
    expect(lastCall?.boxer.boxerType).toBe("OUT_BOXER");
    expect(lastCall?.boxer.gender).toBe("FEMALE");
  });

  it("같은 타입·성별로의 전환은 무동작이다", () => {
    const clock = new FakeClock();
    const save = vi.fn<(snapshot: SaveSnapshot, now?: Date) => boolean>(() => true);
    const store = loadedStore(clock, { save });
    save.mockClear();
    store.getState().switchType("INFIGHTER", "MALE");
    expect(save).not.toHaveBeenCalled();
    expect(store.getState().boxer?.boxerType).toBe("INFIGHTER");
  });

  it("진행 중 전투의 현재 HP가 손상돼 있으면 전환 후에도 클램프 규칙을 따른다", () => {
    const clock = new FakeClock();
    const store = loadedStore(clock);
    // 현재 HP를 새 maxHp보다 낮게 손상시켜 둔다 → 전환 후에도 그대로 유지(자동 보충 없음).
    const combat = store.getState().combat!;
    store.setState({ combat: { ...combat, boxerHp: 5 } });
    store.getState().switchType("OUT_BOXER", "MALE");
    expect(store.getState().combat?.boxerHp).toBe(5);
  });
});
