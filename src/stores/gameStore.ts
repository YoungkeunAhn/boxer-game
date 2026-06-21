import { create, type StoreApi, type UseBoundStore } from "zustand";
import { getStageDefinition } from "../data/stages";
import {
  calculateOfflineProgress,
  createCombatRuntime,
  rescheduleAttacks,
  resolveBossTimeout,
  retryBoss as createBossRetry,
  stepCombat,
} from "../game/combat";
import {
  ACTIVE_SKILL_SLOT_MAX,
  DEFAULT_BOXER_TYPE,
  DEFAULT_EQUIPPED_SKILLS,
  DEFAULT_GENDER,
  INITIAL_UPGRADE_LEVELS,
} from "../game/constants";
import { isPassiveSkill, isSkillEquippableFor } from "../data/skills";
import { mergeSkillCooldowns } from "../game/skills";
import { calculateCombatStats, purchaseUpgrade } from "../game/formulas";
import { clearGame, loadGame, saveGame, type LoadGameResult, type SaveSnapshot } from "../game/save";
import type {
  Boxer,
  BoxerType,
  ComboId,
  CombatRuntime,
  GameState,
  Gender,
  MonsterAttackResult,
  SkillId,
  UpgradeKey,
} from "../game/types";

type GameActions = {
  createBoxer: (name: string, boxerType?: BoxerType, gender?: Gender) => void;
  upgrade: (key: UpgradeKey) => void;
  retryBoss: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  // v1.3d: 전용 스킬 장착. 타입 제약·중복 방지·슬롯 수 검증 후 boxer.equippedSkills를 갱신한다.
  equipSkill: (slot: number, skillId: SkillId) => void;
  unequipSkill: (slot: number) => void;
  equipPassive: (skillId: SkillId | null) => void;
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
  recentDefense: null,
  comboGauge: 0,
  comboStep: 0,
  lastCombo: null,
  groggyGauge: 0,
  groggyMax: 0,
  isGroggy: false,
  lastSkill: null,
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

// v1.3c: 보스 그로기 UI 상태를 combat 런타임 필드에서 파생한다(주입된 now 기준). 로직은 combat.ts에만 둔다.
function getGroggyView(
  combat: CombatRuntime | null,
  now: number,
): { groggyGauge: number; groggyMax: number; isGroggy: boolean } {
  if (!combat) return { groggyGauge: 0, groggyMax: 0, isGroggy: false };
  return {
    groggyGauge: combat.groggyGauge,
    groggyMax: combat.groggyMax,
    isGroggy: combat.groggyUntil !== null && now < combat.groggyUntil,
  };
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
        ...getGroggyView(combat, now),
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
    // v1.3d: 타입별 기본 장착 스킬(액티브 3 + 패시브 1)로 초기화한다.
    equippedSkills: {
      active: [...DEFAULT_EQUIPPED_SKILLS[boxerType].active],
      passive: DEFAULT_EQUIPPED_SKILLS[boxerType].passive,
    },
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
      if (!boxer || !combat) {
        return { killed: false, bossTimedOut: false, bossDefeated: false, knockedDown: false };
      }

      let lastAttack = get().lastAttack;
      let recentDefense: MonsterAttackResult | null = get().recentDefense;
      let lastCombo: ComboId | null = get().lastCombo;
      let lastSkill: SkillId | null = get().lastSkill;
      let killed = false;
      let bossTimedOut = false;
      let bossDefeated = false;
      let knockedDown = false;

      // 복서 공격·몬스터 공격·보스 타임아웃 중 now까지 도달한 이벤트를 시간순으로 인터리브한다.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const boxerDue = combat.nextAttackAt <= now;
        const monsterDue = combat.nextMonsterAttackAt <= now;
        if (!boxerDue && !monsterDue) break;

        const nextEventAt = Math.min(
          boxerDue ? combat.nextAttackAt : Number.POSITIVE_INFINITY,
          monsterDue ? combat.nextMonsterAttackAt : Number.POSITIVE_INFINITY,
        );
        if (
          combat.bossDeadlineAt !== null &&
          nextEventAt > combat.bossDeadlineAt
        ) {
          combat = resolveBossTimeout(boxer, combat, combat.bossDeadlineAt + 1);
          bossTimedOut = true;
          continue;
        }

        const attackedStageWasBoss = getStageDefinition(combat.position).isBoss;
        const step = stepCombat(boxer, combat, dependencies.random(), now);
        boxer = step.boxer;
        combat = step.combat;
        if (step.attack) {
          lastAttack = step.attack;
          killed ||= step.attack.killed;
          bossDefeated ||= attackedStageWasBoss && step.attack.killed;
          // v1.3b: 발동한 콤비네이션이 있으면 직전 발동 콤보로 갱신(연출용). null이면 직전 값 유지.
          if (step.attack.combo) lastCombo = step.attack.combo;
          // v1.3d: 발동한 액티브 스킬이 있으면 직전 발동 스킬로 갱신(연출용). null이면 직전 값 유지.
          if (step.attack.skillTriggered) lastSkill = step.attack.skillTriggered;
        }
        if (step.monsterAttack) recentDefense = step.monsterAttack;
        bossTimedOut ||= step.bossTimedOut;
        knockedDown ||= step.knockedDown;
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
        recentDefense,
        // v1.3b: 콤보 연출 상태를 노출(combat 런타임 필드에서 파생). 로직 추가 없이 표시용.
        comboGauge: combat.comboGauge,
        comboStep: combat.comboStep,
        lastCombo,
        lastSkill,
        bossRemainingMs: getBossRemainingMs(combat, now),
        // v1.3c: 보스 그로기 게이지·상태를 노출(combat 런타임에서 파생). 로직 추가 없이 표시용.
        ...getGroggyView(combat, now),
        message: knockedDown
          ? "KNOCK DOWN"
          : bossTimedOut
            ? "보스 공략에 실패했습니다. 직전 스테이지에서 골드를 모아 다시 도전하세요."
            : bossDefeated
              ? "보스를 쓰러뜨렸습니다! 다음 챕터로 이동합니다."
              : get().message,
      });
      return { killed, bossTimedOut, bossDefeated, knockedDown };
    };

    const scheduleNext = () => {
      clearTimer();
      const state = get();
      if (!state.isRunning || !state.boxer || !state.combat) return;
      const now = dependencies.now();
      const timeoutAt = state.combat.bossDeadlineAt === null
        ? Number.POSITIVE_INFINITY
        : state.combat.bossDeadlineAt + 1;
      const dueAt = Math.min(
        state.combat.nextAttackAt,
        state.combat.nextMonsterAttackAt,
        timeoutAt,
      );
      timerHandle = dependencies.schedule(() => {
        timerHandle = null;
        const result = advanceCombat(dependencies.now());
        if (result.bossTimedOut || result.bossDefeated || result.knockedDown) persist(true);
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
          ...getGroggyView(combat, now),
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
        const stats = calculateCombatStats(result.boxer.upgradeLevels, result.boxer.boxerType);
        // 가정: 체력 강화 시 최대 HP가 늘어난 만큼 현재 HP도 가산(풀충전 아님). 현재 HP는 새 최대치 클램프.
        const hpDelta = Math.max(0, stats.maxHp - state.combat.boxerMaxHp);
        const boxerHp = Math.min(stats.maxHp, state.combat.boxerHp + hpDelta);
        // 변경된 공격 속도를 반영해 4종 공격 쿨타임을 now 기준으로 재설정한다(가정: 콤보 진행 초기화).
        const rescheduled = rescheduleAttacks(state.combat, stats.attackSpeed, now);
        const upgradedCombat = {
          ...rescheduled,
          boxerHp,
          boxerMaxHp: stats.maxHp,
        };
        set({
          boxer: result.boxer,
          combat: upgradedCombat,
          message: `강화 완료! ${result.cost.toLocaleString()} 골드를 사용했습니다.`,
          ...getGroggyView(upgradedCombat, now),
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
          ...getGroggyView(combat, now),
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
        set({
          isRunning: false,
          bossRemainingMs: getBossRemainingMs(get().combat, now),
          ...getGroggyView(get().combat, now),
        });
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
          ...getGroggyView(combat, now),
        });
        if (shouldPersistOffline) {
          persist(true);
          shouldPersistOffline = false;
        }
        scheduleNext();
      },

      equipSkill: (slot, skillId) => {
        const state = get();
        if (!state.boxer || !state.combat) return;
        if (slot < 0 || slot >= ACTIVE_SKILL_SLOT_MAX) return;
        // 액티브 슬롯에는 이 타입의 액티브 스킬만(패시브·교차 타입 거부).
        if (isPassiveSkill(skillId)) return;
        if (!isSkillEquippableFor(skillId, state.boxer.boxerType)) return;
        const active = [...state.boxer.equippedSkills.active];
        // 중복 방지: 같은 스킬이 다른 슬롯에 있으면 그 슬롯을 비운다.
        const existing = active.indexOf(skillId);
        if (existing !== -1 && existing !== slot) active.splice(existing, 1);
        // 슬롯에 배치(빈 슬롯을 채우기 위해 길이를 맞춘다).
        const next = [...active];
        next[slot] = skillId;
        const trimmed = next.filter((id): id is SkillId => Boolean(id)).slice(0, ACTIVE_SKILL_SLOT_MAX);
        const now = dependencies.now();
        const boxer = { ...state.boxer, equippedSkills: { ...state.boxer.equippedSkills, active: trimmed } };
        // v1.3d: 새 액티브 슬롯에 맞춰 진행 중 전투의 쿨타임 키를 재정합한다(없으면 새 스킬이 영영 미발동).
        const combat = { ...state.combat, skillCooldowns: mergeSkillCooldowns(trimmed, state.combat.skillCooldowns, now) };
        set({ boxer, combat, message: "스킬을 장착했습니다." });
        persist(true);
        scheduleNext();
      },

      unequipSkill: (slot) => {
        const state = get();
        if (!state.boxer || !state.combat) return;
        if (slot < 0 || slot >= ACTIVE_SKILL_SLOT_MAX) return;
        const active = [...state.boxer.equippedSkills.active];
        if (slot >= active.length) return;
        active.splice(slot, 1);
        const now = dependencies.now();
        const boxer = { ...state.boxer, equippedSkills: { ...state.boxer.equippedSkills, active } };
        // v1.3d: 해제된 스킬의 쿨타임 키를 버리고 남은 슬롯의 진행 중 쿨타임은 보존한다.
        const combat = { ...state.combat, skillCooldowns: mergeSkillCooldowns(active, state.combat.skillCooldowns, now) };
        set({ boxer, combat, message: "스킬을 해제했습니다." });
        persist(true);
        scheduleNext();
      },

      equipPassive: (skillId) => {
        const state = get();
        if (!state.boxer || !state.combat) return;
        if (skillId !== null) {
          // 패시브 슬롯에는 이 타입의 패시브 스킬만.
          if (!isPassiveSkill(skillId)) return;
          if (!isSkillEquippableFor(skillId, state.boxer.boxerType)) return;
        }
        const boxer = {
          ...state.boxer,
          equippedSkills: { ...state.boxer.equippedSkills, passive: skillId },
        };
        set({ boxer, message: skillId ? "패시브를 장착했습니다." : "패시브를 해제했습니다." });
        persist(true);
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
