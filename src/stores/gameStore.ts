import { create, type StoreApi, type UseBoundStore } from "zustand";
import { getStageDefinition } from "../data/stages";
import {
  calculateOfflineProgress,
  createCombatRuntime,
  resolveAttack,
  resolveBossTimeout,
  retryBoss as createBossRetry,
} from "../game/combat";
import { DEFAULT_BOXER_TYPE, DEFAULT_GENDER, INITIAL_UPGRADE_LEVELS } from "../game/constants";
import { calculateAttackIntervalMs, calculateCombatStats, purchaseUpgrade } from "../game/formulas";
import { clearGame, loadGame, saveGame, type LoadGameResult, type SaveSnapshot } from "../game/save";
import type { Boxer, BoxerType, CombatRuntime, GameState, Gender, UpgradeKey } from "../game/types";

type GameActions = {
  createBoxer: (name: string, boxerType?: BoxerType, gender?: Gender) => void;
  upgrade: (key: UpgradeKey) => void;
  retryBoss: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
};

export type GameStore = GameState & GameActions;

export type GameStoreDependencies = {
  load: () => LoadGameResult;
  save: (snapshot: SaveSnapshot, now?: Date) => boolean;
  clear: () => boolean;
  now: () => number;
  random: () => number;
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancelSchedule: (handle: unknown) => void;
};

const STORAGE_UNAVAILABLE_WARNING =
  "저장소를 사용할 수 없습니다. 새로고침하면 진행 상황이 사라질 수 있습니다.";
const SAVE_FAILED_WARNING =
  "저장에 실패했습니다. 현재 진행은 유지되지만 새로고침하면 사라질 수 있습니다.";
const RESET_FAILED_WARNING = "저장 데이터 삭제에 실패해 현재 진행을 유지했습니다.";
const SAVE_THROTTLE_MS = 1_000;

const EMPTY_STATE: GameState = {
  boxer: null,
  combat: null,
  lastAttack: null,
  offlineSummary: null,
  message: null,
  storageWarning: null,
  isRunning: false,
  legacySaveDetected: false,
  bossRemainingMs: 0,
};

const DEFAULT_DEPENDENCIES: GameStoreDependencies = {
  load: loadGame,
  save: (snapshot, now) => saveGame(snapshot, undefined, now),
  clear: clearGame,
  now: Date.now,
  random: Math.random,
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type InitialStoreState = {
  state: GameState;
  shouldPersistOffline: boolean;
  savedAt: number;
};

function getBossRemainingMs(combat: CombatRuntime | null, now: number): number {
  return combat?.bossDeadlineAt === null || !combat
    ? 0
    : Math.max(0, combat.bossDeadlineAt - now);
}

function getInitialState(result: LoadGameResult, now: number): InitialStoreState {
  if (result.status === "loaded") {
    const savedAt = Date.parse(result.data.savedAt);
    const elapsedMs = Math.max(0, now - savedAt);
    const offline = calculateOfflineProgress(result.data.boxer, result.data.position, elapsedMs);
    const savedAtBoss = getStageDefinition(result.data.position).isBoss;
    const isFarming = result.data.isFarming || savedAtBoss;
    const combat = createCombatRuntime(offline.boxer, offline.position, now, isFarming);
    return {
      savedAt,
      shouldPersistOffline: savedAt !== now,
      state: {
        ...EMPTY_STATE,
        boxer: offline.boxer,
        combat,
        offlineSummary: elapsedMs > 0 ? offline : null,
        message: "저장된 복서를 불러왔습니다.",
        bossRemainingMs: getBossRemainingMs(combat, now),
      },
    };
  }

  return {
    savedAt: 0,
    shouldPersistOffline: false,
    state: {
      ...EMPTY_STATE,
      storageWarning: result.status === "unavailable" ? STORAGE_UNAVAILABLE_WARNING : null,
      legacySaveDetected: result.status === "legacy",
    },
  };
}

function createDefaultBoxer(
  name: string,
  boxerType: BoxerType,
  gender: Gender,
): Boxer {
  return {
    id: "player_boxer",
    name: name.trim() || "무명 복서",
    boxerType,
    gender,
    gold: 0,
    totalKills: 0,
    upgradeLevels: { ...INITIAL_UPGRADE_LEVELS },
  };
}

export function createGameStore(
  dependencyOverrides: Partial<GameStoreDependencies> = {},
): UseBoundStore<StoreApi<GameStore>> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  const initialNow = dependencies.now();
  const initial = getInitialState(dependencies.load(), initialNow);
  let timerHandle: unknown = null;
  let pausedAt: number | null = null;
  let lastSavedAt = initial.savedAt;
  let shouldPersistOffline = initial.shouldPersistOffline;

  return create<GameStore>((set, get) => {
    const clearTimer = () => {
      if (timerHandle !== null) dependencies.cancelSchedule(timerHandle);
      timerHandle = null;
    };

    const persist = (force: boolean) => {
      const state = get();
      if (!state.boxer || !state.combat) return false;
      const now = dependencies.now();
      if (!force && now - lastSavedAt < SAVE_THROTTLE_MS) return true;
      const saved = dependencies.save(
        {
          boxer: state.boxer,
          position: state.combat.position,
          isFarming: state.combat.isFarming,
        },
        new Date(now),
      );
      if (saved) lastSavedAt = now;
      set({ storageWarning: saved ? null : SAVE_FAILED_WARNING });
      return saved;
    };

    const advanceCombat = (now: number) => {
      let { boxer, combat } = get();
      if (!boxer || !combat) return { killed: false, bossTimedOut: false, bossDefeated: false };

      let lastAttack = get().lastAttack;
      let killed = false;
      let bossTimedOut = false;
      let bossDefeated = false;

      while (combat.nextAttackAt <= now) {
        if (
          combat.bossDeadlineAt !== null &&
          combat.nextAttackAt > combat.bossDeadlineAt
        ) {
          combat = resolveBossTimeout(boxer, combat, combat.bossDeadlineAt + 1);
          bossTimedOut = true;
          continue;
        }

        const attackedStageWasBoss = getStageDefinition(combat.position).isBoss;
        const step = resolveAttack(boxer, combat, dependencies.random(), combat.nextAttackAt);
        boxer = step.boxer;
        combat = step.combat;
        if (step.attack) {
          lastAttack = step.attack;
          killed ||= step.attack.killed;
          bossDefeated ||= attackedStageWasBoss && step.attack.killed;
        }
        bossTimedOut ||= step.bossTimedOut;
      }

      if (combat.bossDeadlineAt !== null && now > combat.bossDeadlineAt) {
        const timedOut = resolveBossTimeout(boxer, combat, now);
        if (timedOut !== combat) {
          combat = timedOut;
          bossTimedOut = true;
        }
      }

      set({
        boxer,
        combat,
        lastAttack,
        bossRemainingMs: getBossRemainingMs(combat, now),
        message: bossTimedOut
          ? "보스 공략에 실패했습니다. 직전 스테이지에서 골드를 모아 다시 도전하세요."
          : bossDefeated
            ? "보스를 쓰러뜨렸습니다! 다음 챕터로 이동합니다."
            : get().message,
      });
      return { killed, bossTimedOut, bossDefeated };
    };

    const scheduleNext = () => {
      clearTimer();
      const state = get();
      if (!state.isRunning || !state.boxer || !state.combat) return;
      const now = dependencies.now();
      const timeoutAt = state.combat.bossDeadlineAt === null
        ? Number.POSITIVE_INFINITY
        : state.combat.bossDeadlineAt + 1;
      const dueAt = Math.min(state.combat.nextAttackAt, timeoutAt);
      timerHandle = dependencies.schedule(() => {
        timerHandle = null;
        const result = advanceCombat(dependencies.now());
        if (result.bossTimedOut || result.bossDefeated) persist(true);
        else if (result.killed) persist(false);
        scheduleNext();
      }, Math.max(0, dueAt - now));
    };

    return {
      ...initial.state,

      createBoxer: (name, boxerType = DEFAULT_BOXER_TYPE, gender = DEFAULT_GENDER) => {
        clearTimer();
        const now = dependencies.now();
        const boxer = createDefaultBoxer(name, boxerType, gender);
        const combat = createCombatRuntime(boxer, { chapter: 1, stage: 1 }, now);
        pausedAt = null;
        shouldPersistOffline = false;
        set({
          ...EMPTY_STATE,
          boxer,
          combat,
          message: "첫 몬스터를 향한 자동 공격을 시작합니다.",
          isRunning: true,
          bossRemainingMs: getBossRemainingMs(combat, now),
        });
        persist(true);
        scheduleNext();
      },

      upgrade: (key) => {
        const state = get();
        if (!state.boxer || !state.combat) return;
        const result = purchaseUpgrade(state.boxer, key);
        if (!result.purchased) return;
        const now = dependencies.now();
        const stats = calculateCombatStats(result.boxer.upgradeLevels);
        set({
          boxer: result.boxer,
          combat: {
            ...state.combat,
            nextAttackAt: now + calculateAttackIntervalMs(stats.attackSpeed),
          },
          message: `강화 완료! ${result.cost.toLocaleString()} 골드를 사용했습니다.`,
        });
        persist(true);
        scheduleNext();
      },

      retryBoss: () => {
        const state = get();
        if (!state.boxer || !state.combat || !state.combat.isFarming) return;
        const now = dependencies.now();
        const combat = createBossRetry(state.boxer, state.combat, now);
        set({
          combat,
          lastAttack: null,
          message: "보스에게 다시 도전합니다.",
          bossRemainingMs: getBossRemainingMs(combat, now),
        });
        persist(true);
        scheduleNext();
      },

      pause: () => {
        const state = get();
        if (!state.boxer || !state.combat || !state.isRunning) return;
        const now = dependencies.now();
        advanceCombat(now);
        clearTimer();
        pausedAt = now;
        set({ isRunning: false, bossRemainingMs: getBossRemainingMs(get().combat, now) });
        persist(true);
      },

      resume: () => {
        const state = get();
        if (!state.boxer || !state.combat) return;
        if (state.isRunning) {
          scheduleNext();
          return;
        }

        const now = dependencies.now();
        let boxer = state.boxer;
        let combat = state.combat;
        let offlineSummary = state.offlineSummary;
        if (pausedAt !== null) {
          const progress = calculateOfflineProgress(boxer, combat.position, Math.max(0, now - pausedAt));
          const wasBoss = getStageDefinition(combat.position).isBoss;
          boxer = progress.boxer;
          combat = createCombatRuntime(
            boxer,
            progress.position,
            now,
            combat.isFarming || wasBoss,
          );
          offlineSummary = progress.elapsedMs > 0 ? progress : null;
          pausedAt = null;
          shouldPersistOffline = true;
        }

        set({
          boxer,
          combat,
          offlineSummary,
          isRunning: true,
          bossRemainingMs: getBossRemainingMs(combat, now),
        });
        if (shouldPersistOffline) {
          persist(true);
          shouldPersistOffline = false;
        }
        scheduleNext();
      },

      reset: () => {
        const state = get();
        clearTimer();
        if (!dependencies.clear()) {
          set({ storageWarning: RESET_FAILED_WARNING });
          if (state.isRunning) scheduleNext();
          return;
        }
        pausedAt = null;
        lastSavedAt = 0;
        shouldPersistOffline = false;
        set({ ...EMPTY_STATE });
      },
    };
  });
}

export const useGameStore = createGameStore();
