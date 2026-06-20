import { describe, expect, it, vi } from "vitest";
import { createCombatRuntime } from "../game/combat";
import { BALANCE_VERSION, INITIAL_UPGRADE_LEVELS, SCHEMA_VERSION } from "../game/constants";
import type { SaveSnapshot } from "../game/save";
import type { Boxer, SaveDataV2 } from "../game/types";
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
    gold: 0,
    totalKills: 0,
    upgradeLevels: { ...INITIAL_UPGRADE_LEVELS },
    ...overrides,
  };
}

function savedData(
  clock: FakeClock,
  overrides: Partial<SaveDataV2> = {},
): SaveDataV2 {
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
    const save = vi.fn((_snapshot: SaveSnapshot, _now?: Date) => true);
    const store = createGameStore(dependencies(clock, { save }));
    store.getState().createBoxer("자동 복서");

    expect(clock.timers.size).toBe(1);
    clock.advanceTo(999);
    expect(store.getState().combat?.monsterHp).toBe(30);
    clock.advanceTo(1_000);
    expect(store.getState().combat?.monsterHp).toBe(20);
    expect(clock.timers.size).toBe(1);

    clock.advanceTo(3_000);
    expect(store.getState().boxer).toEqual(expect.objectContaining({ gold: 5, totalKills: 1 }));
    expect(store.getState().combat?.position).toEqual({ chapter: 1, stage: 2 });
    expect(save).toHaveBeenCalledTimes(2);
    expect(clock.timers.size).toBe(1);
  });

  it("공격속도 강화 시 현재 시각부터 새 공격 간격으로 단일 타이머를 다시 예약한다", () => {
    const clock = new FakeClock();
    const data = savedData(clock, { boxer: boxer({ gold: 100 }) });
    const store = createGameStore(dependencies(clock, { load: () => ({ status: "loaded", data }) }));
    store.getState().resume();
    store.getState().upgrade("attackSpeed");

    expect(store.getState().boxer?.upgradeLevels.attackSpeed).toBe(1);
    expect(store.getState().combat?.nextAttackAt).toBeCloseTo(1_000 / 1.1);
    expect(clock.timers.size).toBe(1);
  });

  it("보스 제한 시각과 같은 공격을 먼저 처리해 처치하면 다음 챕터로 이동한다", () => {
    const clock = new FakeClock();
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
    const weakBoxer = boxer();
    const store = createGameStore(dependencies(clock));
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
      monsterHp: 330,
    }));
    expect(clock.timers.size).toBe(1);
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
    expect(save).toHaveBeenCalledTimes(1);
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

  it("저장 시각이 미래여도 첫 재개에서 현재 시각으로 다시 저장한다", () => {
    const clock = new FakeClock();
    clock.now = 1_000;
    const save = vi.fn((_snapshot: SaveSnapshot, _now?: Date) => true);
    const data = savedData(clock, {
      savedAt: new Date(clock.now + 60 * 60 * 1_000).toISOString(),
    });
    const store = createGameStore(dependencies(clock, {
      load: () => ({ status: "loaded", data }),
      save,
    }));
    expect(store.getState().offlineSummary).toBeNull();
    store.getState().resume();
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[1]?.getTime()).toBe(clock.now);
  });

  it("백그라운드에서는 즉시 저장하고 복귀 시 같은 일반 스테이지만 정산한다", () => {
    const clock = new FakeClock();
    const save = vi.fn(() => true);
    const store = createGameStore(dependencies(clock, { save }));
    store.getState().createBoxer("복귀 복서");
    store.getState().pause();
    expect(store.getState().isRunning).toBe(false);
    expect(clock.timers.size).toBe(0);

    clock.now = 10_000;
    store.getState().resume();
    expect(store.getState().combat?.position).toEqual({ chapter: 1, stage: 1 });
    expect(store.getState().offlineSummary?.kills).toBe(3);
    expect(store.getState().isRunning).toBe(true);
    expect(clock.timers.size).toBe(1);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("보스에서 백그라운드로 가면 복귀 시 직전 일반 스테이지 파밍으로 전환한다", () => {
    const clock = new FakeClock();
    const player = boxer();
    const store = createGameStore(dependencies(clock));
    store.setState({
      boxer: player,
      combat: createCombatRuntime(player, { chapter: 2, stage: 5 }, clock.now),
      isRunning: true,
    });
    store.getState().pause();
    clock.now = 5_000;
    store.getState().resume();
    expect(store.getState().combat).toEqual(expect.objectContaining({
      position: { chapter: 2, stage: 4 },
      isFarming: true,
    }));
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
    clock.advanceTo(10_000);
    expect(store.getState().boxer).toBeNull();
  });

  it("legacy와 저장소 접근 불가 상태를 서로 다른 안내로 노출한다", () => {
    const clock = new FakeClock();
    const legacy = createGameStore(dependencies(clock, { load: () => ({ status: "legacy" }) }));
    const unavailable = createGameStore(dependencies(clock, { load: () => ({ status: "unavailable" }) }));
    expect(legacy.getState().legacySaveDetected).toBe(true);
    expect(unavailable.getState().storageWarning).toContain("저장소");
  });
});
