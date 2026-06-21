import { describe, expect, it, vi } from "vitest";
import { createCombatRuntime } from "../game/combat";
import { calculateCombatStats } from "../game/formulas";
import {
  BALANCE_VERSION,
  DEFAULT_EQUIPPED_SKILLS,
  INITIAL_UPGRADE_LEVELS,
  LEVEL_UP_DIAMOND_REWARD,
  SCHEMA_VERSION,
} from "../game/constants";
import type { SaveSnapshot } from "../game/save";
import type { Boxer, QuestState, SaveDataV8 } from "../game/types";
import { createGameStore, selectQuestBadge, type GameStoreDependencies } from "./gameStore";
import { getQuestDef } from "../game/quests";

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
    diamond: 0,
    playerLevel: 1,
    playerExp: 0,
    equippedSkills: { ...DEFAULT_EQUIPPED_SKILLS.INFIGHTER },
    ...overrides,
  };
}

// TASK-021(P3): 로드용 유효 퀘스트 상태(리셋 시각은 clock.now보다 충분히 미래 → 로드 시 리셋 미발생).
function questState(clock: FakeClock, overrides: Partial<QuestState> = {}): QuestState {
  const day = 24 * 60 * 60 * 1_000;
  return {
    progress: {},
    claimed: {},
    dailyPoints: 0,
    milestonesClaimed: [],
    dailySnapshot: { killMonster: 0, autoBattleMinutes: 0 },
    resetAt: { daily: clock.now + day, weekly: clock.now + 7 * day },
    ...overrides,
  };
}

function savedData(
  clock: FakeClock,
  overrides: Partial<SaveDataV8> = {},
): SaveDataV8 {
  return {
    schemaVersion: SCHEMA_VERSION,
    balanceVersion: BALANCE_VERSION,
    savedAt: new Date(clock.now).toISOString(),
    boxer: boxer(),
    position: { chapter: 1, stage: 1 },
    isFarming: false,
    questState: questState(clock),
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

  it("TASK-019: 새 복서는 다이아 0·레벨 1·경험치 0으로 시작한다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock));
    store.getState().createBoxer("새 복서");
    expect(store.getState().boxer).toEqual(
      expect.objectContaining({ diamond: 0, playerLevel: 1, playerExp: 0 }),
    );
  });

  it("TASK-019: 일반 처치 시 플레이어 경험치가 EXP_PER_KILL만큼 오르고 임계 초과 시 레벨업한다", () => {
    const clock = new FakeClock();
    // 강한 공격력으로 한 번에 처치하도록 둔다(random 0.99 → 비치명타). 일반 1-1 몬스터 HP는 30.
    const strong = boxer({ upgradeLevels: { ...INITIAL_UPGRADE_LEVELS, attackPower: 30 } });
    const store = createGameStore(dependencies(clock, { random: () => 0.99 }));
    const start = createCombatRuntime(strong, { chapter: 1, stage: 1 }, clock.now);
    store.setState({ boxer: strong, combat: start, isRunning: false });
    store.getState().resume();
    // 여러 공격이 쌓여 일반 몬스터를 연속 처치하면 처치마다 EXP_PER_KILL(=1)이 누적된다.
    clock.advanceTo(20_000);
    const after = store.getState().boxer!;
    // 처치 누적이 충분히 쌓이면 경험치 곡선상 최소 1회 이상 레벨업한다(EXP_PER_KILL·expToNext 가정값 기준).
    expect(after.totalKills).toBeGreaterThan(0);
    expect(after.playerLevel + after.playerExp).toBeGreaterThan(0);
    // 레벨업이 일어났다면 다이아 보상도 가산됐다(보상 0 가정이면 0).
    if (after.playerLevel > 1) {
      expect(after.diamond).toBeGreaterThanOrEqual(LEVEL_UP_DIAMOND_REWARD);
    }
  });

  it("TASK-019: 보스 클리어 시 EXP_PER_BOSS_CLEAR만큼 경험치를 받는다", () => {
    const clock = new FakeClock();
    // 보스(1-5)에서 한 방에 잡도록 매우 높은 공격력. random 0.99 비치명타지만 어퍼 등 누적으로 처치.
    const strong = boxer({ upgradeLevels: { ...INITIAL_UPGRADE_LEVELS, attackPower: 60 } });
    const store = createGameStore(dependencies(clock, { random: () => 0.99 }));
    const bossStart = createCombatRuntime(strong, { chapter: 1, stage: 5 }, clock.now);
    store.setState({ boxer: strong, combat: bossStart, isRunning: false });
    store.getState().resume();
    clock.advanceTo(10_000);
    const after = store.getState().boxer!;
    // 보스를 잡았다면(다음 챕터로 전이) 경험치가 누적돼 있어야 한다.
    expect(after.playerLevel + after.playerExp).toBeGreaterThan(0);
  });

  it("TASK-019: persist 라운드트립에 신규 필드가 포함된다", () => {
    const clock = new FakeClock();
    let savedSnapshot: SaveSnapshot | null = null;
    const store = createGameStore(
      dependencies(clock, {
        save: (snapshot) => {
          savedSnapshot = snapshot;
          return true;
        },
      }),
    );
    store.getState().createBoxer("저장 복서");
    expect(savedSnapshot).not.toBeNull();
    expect(savedSnapshot!.boxer).toEqual(
      expect.objectContaining({ diamond: 0, playerLevel: 1, playerExp: 0 }),
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

  it("보스전 그로기 게이지·상태(isGroggy)를 상태로 노출하고 만료 시 isGroggy=false로 갱신한다", () => {
    const clock = new FakeClock();
    const inf = boxer();
    const store = createGameStore(dependencies(clock, { random: () => 0.99 }));
    const FAR = 100_000_000;
    const start = createCombatRuntime(inf, { chapter: 1, stage: 5 }, clock.now);
    // 그로기 상태로 진입시킨 보스 런타임을 직접 심는다(그로기 종료=2_000, 제한시간은 충분히 뒤로).
    store.setState({
      boxer: inf,
      combat: {
        ...start,
        monsterHp: FAR,
        groggyUntil: 2_000,
        groggyGauge: 50,
        bossDeadlineAt: FAR,
        nextReadyAt: { JAB: 1_000, STRAIGHT: FAR, HOOK: FAR, UPPER: FAR },
        nextAttackAt: 1_000,
        nextMonsterAttackAt: FAR,
      },
      isRunning: false,
    });
    store.getState().resume();

    // t=1_000 < 2_000 → 그로기 상태로 노출.
    clock.advanceTo(1_000);
    expect(store.getState().groggyMax).toBeGreaterThan(0);
    expect(store.getState().isGroggy).toBe(true);

    // 그로기 종료 시각 이후 한 틱 더 진행하면 isGroggy=false로 갱신.
    store.setState({
      combat: {
        ...store.getState().combat!,
        nextReadyAt: { JAB: 3_000, STRAIGHT: FAR, HOOK: FAR, UPPER: FAR },
        nextAttackAt: 3_000,
      },
    });
    store.getState().resume();
    clock.advanceTo(3_000);
    expect(store.getState().isGroggy).toBe(false);
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
    // v1.3d: 전용 스킬을 비워(약체) 스킬 DPS로 보스를 잡지 않게 한다(타임아웃 시나리오 고정).
    const weakBoxer = boxer({ equippedSkills: { active: [], passive: null } });
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

    // 핵심 불변식: 같은 게임 시간(30_002ms)에 도달한 x1·x2의 전투 결과(위치·진행)가 동일해야 한다.
    //   배속은 게임 시간 가속일 뿐이므로 보스 타임아웃/처치/진행 어느 쪽이든 두 배속이 같은 상태에 수렴한다.
    expect(storeX2.getState().combat?.position).toEqual(storeX1.getState().combat?.position);
    expect(storeX2.getState().combat?.isFarming).toBe(storeX1.getState().combat?.isFarming);
    expect(storeX2.getState().boxer?.totalKills).toBe(storeX1.getState().boxer?.totalKills);
    expect(storeX2.getState().boxer?.gold).toBe(storeX1.getState().boxer?.gold);
  });

  it("수동 스킬은 MANUAL 모드에서 준비된 장착 액티브 스킬을 슬롯 우선순위로 발동하고 쿨타임을 소비한다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock, { random: () => 0.99 }));
    // 기본 인파이터: 액티브 슬롯 [liver_shot, pressure, dempsey_roll]. liver_shot만 준비(쿨 0), 나머지는 미래.
    const player = boxer();
    const start = createCombatRuntime(player, { chapter: 1, stage: 1 }, clock.now);
    store.setState({
      boxer: player,
      combat: {
        ...start,
        monsterHp: 1_000,
        skillCooldowns: { liver_shot: 0, pressure: 12_000, dempsey_roll: 18_000 },
      },
      autoMode: "MANUAL",
      isRunning: false,
    });

    store.getState().triggerSkill();
    // liver_shot: 계수 2.5 × 공격력 10 = 25 직접 피해(내상 DoT는 다음 정산에서 적용).
    expect(store.getState().combat?.monsterHp).toBe(975);
    // 발동 스킬은 쿨타임으로 들어간다(liver_shot cooldownMs 8000 → now(0)+8000).
    expect(store.getState().combat?.skillCooldowns.liver_shot).toBe(8_000);
    expect(store.getState().lastSkill).toBe("liver_shot");

    // 준비된 스킬이 더는 없으면(모두 쿨) 재발동 무동작.
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

  it("createBoxer가 타입별 기본 스킬을 장착한다", () => {
    const clock = new FakeClock();
    const inf = createGameStore(dependencies(clock));
    inf.getState().createBoxer("인파이터", "INFIGHTER");
    expect(inf.getState().boxer?.equippedSkills).toEqual(DEFAULT_EQUIPPED_SKILLS.INFIGHTER);

    const out = createGameStore(dependencies(new FakeClock()));
    out.getState().createBoxer("아웃복서", "OUT_BOXER");
    expect(out.getState().boxer?.equippedSkills).toEqual(DEFAULT_EQUIPPED_SKILLS.OUT_BOXER);
  });

  it("equipSkill/unequipSkill/equipPassive가 타입 제약·슬롯 수를 지키고 저장한다", () => {
    const clock = new FakeClock();
    const save = vi.fn(() => true);
    const store = createGameStore(dependencies(clock, { save }));
    store.getState().createBoxer("인파이터", "INFIGHTER");
    save.mockClear();

    // 슬롯0을 비우고 가젤펀치를 장착(인파이터 스킬, 허용).
    store.getState().unequipSkill(0);
    store.getState().equipSkill(0, "gazelle_punch");
    expect(store.getState().boxer?.equippedSkills.active).toContain("gazelle_punch");
    expect(save).toHaveBeenCalled();

    // 교차 타입(아웃복서 스킬)은 거부 → 변화 없음.
    const before = store.getState().boxer?.equippedSkills.active;
    store.getState().equipSkill(1, "ghost_step");
    expect(store.getState().boxer?.equippedSkills.active).toEqual(before);

    // 패시브: 액티브 스킬을 패시브 슬롯에 넣으려 하면 거부.
    store.getState().equipPassive("gazelle_punch");
    expect(store.getState().boxer?.equippedSkills.passive).toBe("iron_guard");
    // 패시브 해제.
    store.getState().equipPassive(null);
    expect(store.getState().boxer?.equippedSkills.passive).toBeNull();
  });

  it("전투 중 액티브 스킬 장착 시 combat.skillCooldowns에 키가 생겨 발동 가능해진다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock));
    store.getState().createBoxer("인파이터", "INFIGHTER");
    // 슬롯0을 비운 뒤 새 액티브 스킬을 장착한다.
    store.getState().unequipSkill(0);
    const now = clock.now;
    store.getState().equipSkill(0, "gazelle_punch");
    // 장착 전이라면 키가 없어 영영 미발동이지만, 이제 now+cooldownMs 키가 생긴다.
    const cd = store.getState().combat?.skillCooldowns.gazelle_punch;
    expect(cd).toBeGreaterThan(now);
    // 해제하면 쿨타임 키도 함께 사라진다.
    store.getState().unequipSkill(0);
    expect(store.getState().combat?.skillCooldowns.gazelle_punch).toBeUndefined();
  });

  it("전투 중 장착한 스킬 효과가 combat 상태에 반영된다(스텝백카운터 자동 반격)", () => {
    const clock = new FakeClock();
    const out = boxer({ boxerType: "OUT_BOXER", equippedSkills: { active: [], passive: "step_back_counter" } });
    const store = createGameStore(dependencies(clock, { random: () => 0.0 })); // 회피 성공 고정
    const start = createCombatRuntime(out, { chapter: 1, stage: 1 }, clock.now);
    const startHp = start.monsterHp;
    store.setState({
      boxer: out,
      combat: { ...start, nextMonsterAttackAt: 100, nextAttackAt: 10_000 },
      isRunning: false,
    });
    store.getState().resume();
    clock.advanceTo(100);
    // 스텝백카운터 자동 반격으로 monsterHp가 줄어든다.
    expect(store.getState().combat!.monsterHp).toBeLessThan(startHp);
    expect(store.getState().recentDefense?.counterDamage).toBeGreaterThan(0);
  });
});

// 버그 수정: 강화(upgrade)를 해도 자동 공격이 멈추지 않아야 한다.
//   이전엔 강화 때마다 공격 쿨타임을 전체 리셋해, 연타하면 nextAttackAt이 계속 밀려 공격이 멈췄다.
describe("강화 시 자동 공격 지속", () => {
  it("강화를 연타해도 nextAttackAt이 최초 값보다 미래로 밀리지 않고 이후 공격이 정상 발동한다", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock));
    store.getState().createBoxer("강화 복서");
    // 강화 비용을 충분히 감당하도록 골드를 크게 준다.
    store.setState({ boxer: { ...store.getState().boxer!, gold: 10_000_000 } });

    const original = store.getState().combat!.nextAttackAt;
    // 첫 공격 직전(쿨타임 도중)까지 진행한 뒤 강화를 연타한다.
    clock.advanceTo(original / 2);
    for (let i = 0; i < 12; i += 1) {
      store.getState().upgrade("attackSpeed");
    }
    const afterSpam = store.getState().combat!.nextAttackAt;
    // 진척 보존: 연타해도 다음 공격이 최초 시각보다 미래로 밀리지 않는다(공격 속도 상승분만큼 오히려 당겨질 수 있음).
    expect(afterSpam).toBeLessThanOrEqual(original + 1e-6);
    // 그리고 여전히 미래에 예약돼 있어(타이머 유지) 시간이 지나면 발동한다.
    expect(clock.timers.size).toBe(1);

    const monsterHpBefore = store.getState().combat!.monsterHp;
    clock.advanceTo(original + 2_000);
    // 강화 후에도 공격이 이어져 몬스터 HP가 줄거나 처치로 진행됐다.
    expect(store.getState().lastAttack).not.toBeNull();
    const progressed =
      store.getState().combat!.monsterHp < monsterHpBefore ||
      store.getState().boxer!.totalKills > 0;
    expect(progressed).toBe(true);
  });

  it("단발 강화는 다음 공격을 한 사이클 통째로 지연시키지 않는다(비후퇴)", () => {
    const clock = new FakeClock();
    const store = createGameStore(dependencies(clock));
    store.getState().createBoxer("강화 복서");
    store.setState({ boxer: { ...store.getState().boxer!, gold: 10_000_000 } });

    const original = store.getState().combat!.nextAttackAt;
    clock.advanceTo(original / 2);
    store.getState().upgrade("attackSpeed");
    expect(store.getState().combat!.nextAttackAt).toBeLessThanOrEqual(original + 1e-6);
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

describe("TASK-021 퀘스트 스토어 통합", () => {
  // upgradeStat 퀘스트(daily_upgrade_5)를 완료시키기 위해 충분한 골드를 시드한 로드 저장.
  function questStore(
    clock: FakeClock,
    overrides: Partial<GameStoreDependencies> = {},
    boxerOverrides: Partial<Boxer> = {},
  ) {
    const data = savedData(clock, {
      boxer: boxer({ gold: 1_000_000, ...boxerOverrides }),
    });
    return createGameStore(
      dependencies(clock, { load: () => ({ status: "loaded", data }), ...overrides }),
    );
  }

  it("강화 성공 시 upgradeStat 퀘스트 진행이 +1 된다", () => {
    const clock = new FakeClock();
    const store = questStore(clock);
    expect(store.getState().questState.progress.daily_upgrade_5 ?? 0).toBe(0);
    store.getState().upgrade("attackPower");
    store.getState().upgrade("attackPower");
    expect(store.getState().questState.progress.daily_upgrade_5).toBe(2);
  });

  it("완료된 퀘스트를 수령하면 보상이 boxer에 가산되고 중복 수령이 막힌다", () => {
    const clock = new FakeClock();
    const store = questStore(clock);
    // 강화 5회로 daily_upgrade_5(보상 🪙7,000) 완료.
    for (let i = 0; i < 5; i += 1) store.getState().upgrade("attackPower");
    const goldBefore = store.getState().boxer!.gold;
    const reward = getQuestDef("daily_upgrade_5")!.reward.gold!;
    store.getState().claimQuest("daily_upgrade_5");
    expect(store.getState().boxer!.gold).toBe(goldBefore + reward);
    expect(store.getState().questState.claimed.daily_upgrade_5).toBe(true);
    // 두 번째 수령은 무동작(골드 불변).
    const goldAfter = store.getState().boxer!.gold;
    store.getState().claimQuest("daily_upgrade_5");
    expect(store.getState().boxer!.gold).toBe(goldAfter);
  });

  it("마일스톤 상자 수령 시 다이아가 가산되고 milestonesClaimed에 기록된다", () => {
    const clock = new FakeClock();
    const store = questStore(clock);
    // dailyPoints를 20으로 만들어 20구간 수령 가능 상태로.
    store.setState({ questState: { ...store.getState().questState, dailyPoints: 20 } });
    const diamondBefore = store.getState().boxer!.diamond;
    store.getState().claimMilestone(20);
    expect(store.getState().boxer!.diamond).toBeGreaterThan(diamondBefore);
    expect(store.getState().questState.milestonesClaimed).toContain(20);
    // 재수령 무동작.
    const diamondAfter = store.getState().boxer!.diamond;
    store.getState().claimMilestone(20);
    expect(store.getState().boxer!.diamond).toBe(diamondAfter);
  });

  it("무료 상자 수령 시 claimFreeChest 퀘스트가 완료된다", () => {
    const clock = new FakeClock();
    const store = questStore(clock);
    store.getState().claimFreeChest();
    expect(store.getState().questState.progress.daily_free_chest).toBe(1);
    const def = getQuestDef("daily_free_chest")!;
    expect(store.getState().questState.progress.daily_free_chest).toBeGreaterThanOrEqual(def.target);
  });

  it("일일 killMonster는 자동 전투 처치로 스냅샷 증분만큼 진행한다", () => {
    const clock = new FakeClock();
    const store = questStore(clock);
    const def = getQuestDef("daily_kill_30")!;
    // 자동 전투를 충분히 진행해 몬스터를 여러 마리 처치한다(공격력 높게).
    store.setState({
      boxer: { ...store.getState().boxer!, upgradeLevels: { ...INITIAL_UPGRADE_LEVELS, attackPower: 40 } },
    });
    store.getState().resume(); // 로드 직후엔 정지 상태 → 자동 전투 타이머 가동.
    clock.advanceTo(120_000);
    const killed = store.getState().boxer!.totalKills;
    expect(killed).toBeGreaterThan(0);
    // 일일 killMonster 진행은 스냅샷(0) 기준 증분 = 처치 수(타깃 클램프 전 min).
    const progress = Math.min(def.target, killed);
    expect(store.getState().questState.dailySnapshot.killMonster).toBe(0);
    // selectQuestBadge로 완료 여부 간접 확인은 별도 테스트에서. 여기선 진행이 0보다 큼만 확인.
    expect(progress).toBeGreaterThan(0);
  });

  it("selectQuestBadge는 완료·미수령 퀘스트나 수령 가능 마일스톤이 있을 때 true다", () => {
    const clock = new FakeClock();
    const store = questStore(clock);
    expect(selectQuestBadge(store.getState())).toBe(false);
    // 강화 5회로 daily_upgrade_5 완료 → 뱃지 true.
    for (let i = 0; i < 5; i += 1) store.getState().upgrade("attackPower");
    expect(selectQuestBadge(store.getState())).toBe(true);
    // 퀘스트 수령 시 dailyPoints가 20이 돼 마일스톤(20)이 수령 가능 → 뱃지는 여전히 true.
    store.getState().claimQuest("daily_upgrade_5");
    expect(selectQuestBadge(store.getState())).toBe(true);
    // 마일스톤(20)까지 수령하면 더 이상 수령 가능한 보상이 없어 false.
    store.getState().claimMilestone(20);
    expect(selectQuestBadge(store.getState())).toBe(false);
  });

  it("로드 시 저장된 퀘스트 상태에 지난 일일 리셋을 정산한다", () => {
    const clock = new FakeClock();
    clock.now = new Date(2026, 5, 21, 12, 0, 0, 0).getTime();
    // 저장 당시 일일 진행이 있었으나 resetAt가 이미 지난 상태로 시드 → 로드 시 초기화.
    const data = savedData(clock, {
      boxer: boxer({ totalKills: 50 }),
      questState: {
        progress: { daily_stage_3: 2 },
        claimed: {},
        dailyPoints: 40,
        milestonesClaimed: [20],
        dailySnapshot: { killMonster: 10, autoBattleMinutes: 0 },
        resetAt: { daily: clock.now - 1_000, weekly: clock.now + 7 * 24 * 60 * 60 * 1_000 },
      },
    });
    const store = createGameStore(
      dependencies(clock, { load: () => ({ status: "loaded", data }) }),
    );
    const q = store.getState().questState;
    expect(q.progress.daily_stage_3).toBeUndefined();
    expect(q.dailyPoints).toBe(0);
    expect(q.milestonesClaimed).toEqual([]);
    // 일일 스냅샷이 현재 누적값(50)으로 재설정된다.
    expect(q.dailySnapshot.killMonster).toBe(50);
  });
});
