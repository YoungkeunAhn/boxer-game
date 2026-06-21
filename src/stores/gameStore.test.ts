import { describe, expect, it, vi } from "vitest";
import { createCombatRuntime } from "../game/combat";
import {
  BALANCE_VERSION,
  DEFAULT_EQUIPPED_SKILLS,
  INITIAL_UPGRADE_LEVELS,
  SCHEMA_VERSION,
} from "../game/constants";
import type { SaveSnapshot } from "../game/save";
import type { Boxer, SaveDataV6 } from "../game/types";
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
    equippedSkills: { ...DEFAULT_EQUIPPED_SKILLS.INFIGHTER },
    ...overrides,
  };
}

function savedData(
  clock: FakeClock,
  overrides: Partial<SaveDataV6> = {},
): SaveDataV6 {
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
