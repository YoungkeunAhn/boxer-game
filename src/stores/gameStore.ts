import { create, type StoreApi, type UseBoundStore } from "zustand";
import { getStageDefinition } from "../data/stages";
import {
  calculateOfflineProgress,
  createCombatRuntime,
  rescheduleAttacks,
  resolveBossTimeout,
  retryBoss as createBossRetry,
  stepCombat,
  switchFighterType,
} from "../game/combat";
import {
  COMBO_GAUGE_MAX,
  DEFAULT_AUTO_MODE,
  DEFAULT_BOXER_TYPE,
  DEFAULT_GENDER,
  DEFAULT_SPEED_MULTIPLIER,
  EXP_PER_BOSS_CLEAR,
  EXP_PER_KILL,
  FINISHER_DAMAGE_MULT,
  INITIAL_DIAMOND,
  INITIAL_PLAYER_EXP,
  INITIAL_PLAYER_LEVEL,
  INITIAL_UPGRADE_LEVELS,
  MAX_SAFE_GAME_INTEGER,
  TYPE_SWITCH_COOLDOWN_MS,
} from "../game/constants";
import {
  addExpToBoxer,
  addProgressToBoxer,
  calculateCombatStats,
  calculateComboAdjustedDamage,
  calculateGoldReward,
  expToNext,
  purchaseUpgrade,
} from "../game/formulas";
import { dailyResetRemainingMs } from "../game/progress";
import { getNextStagePosition } from "../data/stages";
import { clearGame, loadGame, saveGame, type LoadGameResult, type SaveSnapshot } from "../game/save";
import type {
  AutoMode,
  Boxer,
  BoxerType,
  ComboId,
  CombatRuntime,
  GameState,
  Gender,
  MonsterAttackResult,
  SpeedMultiplier,
  UpgradeKey,
} from "../game/types";

type GameActions = {
  createBoxer: (name: string, boxerType?: BoxerType, gender?: Gender) => void;
  upgrade: (key: UpgradeKey) => void;
  retryBoss: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  // TASK-015: 전투 컨트롤. AUTO 토글·배속·수동 탭·수동 스킬(피니시).
  toggleAuto: () => void;
  setSpeedMultiplier: (multiplier: SpeedMultiplier) => void;
  manualAttack: () => void;
  triggerSkill: () => void;
  // TASK-017: 단일 캐릭터 타입/성별 런타임 전환(강화·골드 유지, typeMultiplier 재적용).
  switchType: (boxerType: BoxerType, gender: Gender) => void;
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
  // TASK-015: 전투 컨트롤 기본값(휘발 UI 상태). AUTO·x1.
  autoMode: DEFAULT_AUTO_MODE,
  speedMultiplier: DEFAULT_SPEED_MULTIPLIER,
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
    // TASK-019(P3): 신규 재화·플레이어 진행 초기값.
    diamond: INITIAL_DIAMOND,
    playerLevel: INITIAL_PLAYER_LEVEL,
    playerExp: INITIAL_PLAYER_EXP,
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
  // TASK-017: 마지막 타입 전환 게임시각(휘발 클로저 변수, 저장 안 함). 쿨다운 악용 방지 판정에만 쓴다.
  let lastTypeSwitchAt: number | null = null;

  // TASK-015: "게임 시간" 시계. combat의 모든 *At 필드는 게임 시간 기준이다.
  //  - 실시간(dependencies.now): 저장·throttle·pause/오프라인 정산용.
  //  - 게임 시간(gameNow): 전투 진행·보스 타임아웃용. 배속 시 실시간 경과 × speedMultiplier로 누적.
  // 초기에는 gameNow == 실시간이라 init에서 만든 combat 필드와 정렬된다.
  let lastRealNow = initialNow;
  let gameNow = initialNow;

  return create<GameStore>((set, get) => {
    // 마지막 동기화 이후 흐른 실시간을 현재 배속으로 환산해 게임 시간을 전진시킨다.
    const syncGameNow = (): number => {
      const realNow = dependencies.now();
      const deltaReal = Math.max(0, realNow - lastRealNow);
      const multiplier = get().speedMultiplier;
      gameNow += deltaReal * multiplier;
      lastRealNow = realNow;
      return gameNow;
    };

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
          const stageBossDefeated = attackedStageWasBoss && step.attack.killed;
          bossDefeated ||= stageBossDefeated;
          // TASK-019(P3): 처치 시 플레이어 경험치 가산(보스 클리어는 보스 보상, 일반 처치는 킬 보상).
          //   레벨업 정산·다이아 보상은 addExpToBoxer 내부에서 순수 처리된다(가정값 — constants.ts).
          if (step.attack.killed) {
            boxer = addExpToBoxer(boxer, stageBossDefeated ? EXP_PER_BOSS_CLEAR : EXP_PER_KILL);
          }
          // v1.3b: 발동한 콤비네이션이 있으면 직전 발동 콤보로 갱신(연출용). null이면 직전 값 유지.
          if (step.attack.combo) lastCombo = step.attack.combo;
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
        bossRemainingMs: getBossRemainingMs(combat, now),
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
      // TASK-015: AUTO OFF(MANUAL)면 자동 타이머를 예약하지 않는다(유일 타이머 구조 유지).
      //   강화·재도전·재개 등 다른 진입점이 scheduleNext를 호출해도 MANUAL이면 진행이 멈춘다.
      if (!state.isRunning || state.autoMode !== "AUTO" || !state.boxer || !state.combat) return;
      // 게임 시간을 현 시점까지 정산한 뒤(배속 누적), 다음 게임 이벤트까지의 실시간 지연을 역환산한다.
      const now = syncGameNow();
      const timeoutAt = state.combat.bossDeadlineAt === null
        ? Number.POSITIVE_INFINITY
        : state.combat.bossDeadlineAt + 1;
      const dueGameAt = Math.min(
        state.combat.nextAttackAt,
        state.combat.nextMonsterAttackAt,
        timeoutAt,
      );
      // 실시간 지연 = 남은 게임 시간 / 배속. 배속 x2면 같은 게임 시간을 절반 실시간에 도달한다.
      const multiplier = state.speedMultiplier;
      const delayRealMs = Math.max(0, (dueGameAt - now) / multiplier);
      timerHandle = dependencies.schedule(() => {
        timerHandle = null;
        const result = advanceCombat(syncGameNow());
        if (result.bossTimedOut || result.bossDefeated || result.knockedDown) persist(true);
        else if (result.killed) persist(false);
        scheduleNext();
      }, delayRealMs);
    };

    return {
      ...initial.state,

      createBoxer: (name, boxerType = DEFAULT_BOXER_TYPE, gender = DEFAULT_GENDER) => {
        clearTimer();
        const now = syncGameNow();
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
        const now = syncGameNow();
        const stats = calculateCombatStats(result.boxer.upgradeLevels, result.boxer.boxerType);
        // 가정: 체력 강화 시 최대 HP가 늘어난 만큼 현재 HP도 가산(풀충전 아님). 현재 HP는 새 최대치 클램프.
        const hpDelta = Math.max(0, stats.maxHp - state.combat.boxerMaxHp);
        const boxerHp = Math.min(stats.maxHp, state.combat.boxerHp + hpDelta);
        // 변경된 공격 속도를 반영해 4종 공격 쿨타임을 now 기준으로 재설정한다(가정: 콤보 진행 초기화).
        const rescheduled = rescheduleAttacks(state.combat, stats.attackSpeed, now);
        set({
          boxer: result.boxer,
          combat: {
            ...rescheduled,
            boxerHp,
            boxerMaxHp: stats.maxHp,
          },
          message: `강화 완료! ${result.cost.toLocaleString()} 골드를 사용했습니다.`,
        });
        persist(true);
        scheduleNext();
      },

      retryBoss: () => {
        const state = get();
        if (!state.boxer || !state.combat || !state.combat.isFarming) return;
        const now = syncGameNow();
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
        // 게임 시간으로 진행을 정산하고, 일시정지 시각은 실시간 기준으로 기록한다(오프라인 정산용).
        const gameTime = syncGameNow();
        advanceCombat(gameTime);
        clearTimer();
        pausedAt = dependencies.now();
        set({ isRunning: false, bossRemainingMs: getBossRemainingMs(get().combat, gameTime) });
        persist(true);
      },

      resume: () => {
        const state = get();
        if (!state.boxer || !state.combat) return;
        if (state.isRunning) {
          scheduleNext();
          return;
        }

        const realNow = dependencies.now();
        // 정지 동안 흐른 실시간은 배속으로 게임 시간에 누적하지 않는다(오프라인 정산이 별도로 처리).
        //   lastRealNow를 현재 실시간으로 맞춰 정지 구간을 게임 시간에서 제외한 뒤 gameNow를 읽는다.
        lastRealNow = realNow;
        const gameTime = gameNow;
        let boxer = state.boxer;
        let combat = state.combat;
        let offlineSummary = state.offlineSummary;
        if (pausedAt !== null) {
          // 오프라인(정지) 진행은 실시간 기준(배속 미적용). 게임 시간 가속은 포그라운드 자동 전투에만 적용.
          const progress = calculateOfflineProgress(boxer, combat.position, Math.max(0, realNow - pausedAt));
          const wasBoss = getStageDefinition(combat.position).isBoss;
          boxer = progress.boxer;
          combat = createCombatRuntime(
            boxer,
            progress.position,
            gameTime,
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
          bossRemainingMs: getBossRemainingMs(combat, gameTime),
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

      // TASK-015: AUTO ↔ MANUAL 토글.
      //  - AUTO→MANUAL: 진행을 게임 시간으로 정산하고 타이머를 멈춘다(이후 입력 액션으로만 진행).
      //  - MANUAL→AUTO: 게임 시간 기준으로 재예약해 자동 전투를 재개한다.
      toggleAuto: () => {
        const state = get();
        const nextMode: AutoMode = state.autoMode === "AUTO" ? "MANUAL" : "AUTO";
        if (nextMode === "MANUAL") {
          const gameTime = syncGameNow();
          if (state.boxer && state.combat) advanceCombat(gameTime);
          clearTimer();
          set({ autoMode: "MANUAL", message: "수동 모드: 화면을 탭해 공격하세요." });
          return;
        }
        // MANUAL→AUTO. 먼저 게임 시간을 정산해 lastRealNow를 현재로 맞춘 뒤 자동 예약한다.
        syncGameNow();
        set({ autoMode: "AUTO", message: "자동 전투를 재개합니다." });
        scheduleNext();
      },

      // TASK-015: 배속 설정. 전환 시점까지 게임 시간을 정산(누적)한 뒤 배율을 바꾸고 재예약한다.
      //   게임 시간으로 정산 후 배율을 바꾸므로 이미 진행한 양은 보존되고, 이후 실시간만 배율로 단축된다.
      setSpeedMultiplier: (multiplier) => {
        const state = get();
        if (state.speedMultiplier === multiplier) return;
        // 현 배율로 여기까지의 게임 시간을 정산한 뒤 배율을 교체한다(전환 직전/직후 게임 시간 연속).
        syncGameNow();
        set({ speedMultiplier: multiplier });
        scheduleNext();
      },

      // TASK-015: 수동 탭 공격(AUTO OFF 전용). 입력 1회 = 다음 복서 공격 시각까지 게임 시간을 전진시켜
      //   stepCombat 1회(그 사이 due한 몬스터 공격·보스 타임아웃도 함께 처리). 자동 타이머는 예약하지 않는다.
      manualAttack: () => {
        const state = get();
        if (state.autoMode !== "MANUAL" || !state.boxer || !state.combat) return;
        const settled = syncGameNow();
        // 다음 복서 공격 시각으로 게임 시간을 전진(현재 이후라면). 이미 지난 경우 현재 게임 시간 사용.
        const target = Math.max(settled, state.combat.nextAttackAt);
        gameNow = target;
        const result = advanceCombat(target);
        if (result.bossTimedOut || result.bossDefeated || result.knockedDown) persist(true);
        else if (result.killed) persist(false);
      },

      // TASK-015: 수동 스킬(피니시) — AUTO OFF 전용·콤보 게이지 가득일 때만.
      //   가정/TODO: 스킬 슬롯 시스템(TASK-010)이 아직 없어, equip.md의 Slot1>2>3 우선순위를 구현할 대상이 없다.
      //   임시로 '콤보 게이지를 소비하는 강타(어퍼 ×FINISHER_DAMAGE_MULT) 1종'으로 한정한다.
      //   TASK-010 도입 시 슬롯 기반 스킬로 교체한다.
      triggerSkill: () => {
        const state = get();
        const { boxer, combat } = state;
        if (state.autoMode !== "MANUAL" || !boxer || !combat) return;
        if (combat.comboGauge < COMBO_GAUGE_MAX) return; // 게이지 부족 시 무동작.
        const now = syncGameNow();
        // 보스 타임아웃이 먼저면 스킬 대신 타임아웃을 정산한다(밸런스 게임 시간 기준 유지).
        if (combat.bossDeadlineAt !== null && now > combat.bossDeadlineAt) {
          advanceCombat(now);
          persist(true);
          return;
        }
        const stage = getStageDefinition(combat.position);
        const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
        const base = calculateComboAdjustedDamage(stats, "UPPER", null, dependencies.random());
        // 피니시 배수는 클램프 밖에서 곱하므로 안전 정수 상한으로 다시 클램프한다
        // (attackPower 상한이 무제한이라 base.damage가 상한 근처면 ×3이 넘칠 수 있음).
        const damage = Math.min(MAX_SAFE_GAME_INTEGER, Math.floor(base.damage * FINISHER_DAMAGE_MULT));
        const killed = damage >= combat.monsterHp;
        const goldReward = killed ? calculateGoldReward(stage.goldReward, stats.goldBonus) : 0;
        const bossDefeated = killed && stage.isBoss;
        // TASK-019(P3): 수동 피니시 처치도 경험치 가산(보스 클리어는 보스 보상, 일반은 킬 보상).
        const nextBoxer = killed
          ? addExpToBoxer(
              addProgressToBoxer(boxer, 1, goldReward),
              bossDefeated ? EXP_PER_BOSS_CLEAR : EXP_PER_KILL,
            )
          : boxer;

        let nextCombat: CombatRuntime;
        if (!killed) {
          // 피니시 발동만으로 게이지를 소비한다(처치 못 해도 소비). 진행은 동일 스테이지 유지.
          nextCombat = { ...combat, monsterHp: Math.max(0, combat.monsterHp - damage), comboGauge: 0 };
        } else if (combat.isFarming) {
          nextCombat = createCombatRuntime(nextBoxer, combat.position, now, true);
        } else {
          // 일반/보스 처치 모두 다음 스테이지로 전이(보스 처치 시 다음 챕터 1스테이지).
          nextCombat = createCombatRuntime(nextBoxer, getNextStagePosition(combat.position), now);
        }

        set({
          boxer: nextBoxer,
          combat: nextCombat,
          lastAttack: {
            stageId: stage.id,
            damage,
            isCritical: base.isCritical,
            killed,
            goldReward,
            attackType: "UPPER",
            hand: "RIGHT",
            combo: null,
          },
          comboGauge: nextCombat.comboGauge,
          comboStep: nextCombat.comboStep,
          message: bossDefeated
            ? "보스를 쓰러뜨렸습니다! 다음 챕터로 이동합니다."
            : "피니시!",
          bossRemainingMs: getBossRemainingMs(nextCombat, now),
        });
        persist(killed);
      },

      // TASK-017: 단일 캐릭터의 타입/성별을 런타임 전환한다. 강화 레벨·골드·진행·콤보/쿨타임·보스 데드라인은
      //   유지하고, combat.ts의 switchFighterType로 새 boxer/combat을 만든다(typeMultiplier 재적용 + HP 클램프).
      //   가정/TODO: 전환 비용(TYPE_SWITCH_COST)은 P3 재화 도입(TASK-019) 전까지 무료 — 차감 미연결.
      //   가정: 잦은 전환 악용 방지 쿨다운(TYPE_SWITCH_COOLDOWN_MS, 휘발). 0이면 무제한.
      switchType: (boxerType, gender) => {
        const state = get();
        const { boxer, combat } = state;
        if (!boxer || !combat) return;
        // 같은 타입·성별이면 무동작(불필요한 persist/재예약 방지).
        if (boxer.boxerType === boxerType && boxer.gender === gender) return;
        const now = syncGameNow();
        // 쿨다운 내 재전환은 무동작 + 안내 메시지(가정: TYPE_SWITCH_COOLDOWN_MS=0이면 항상 통과).
        if (
          TYPE_SWITCH_COOLDOWN_MS > 0 &&
          lastTypeSwitchAt !== null &&
          now < lastTypeSwitchAt + TYPE_SWITCH_COOLDOWN_MS
        ) {
          set({ message: "아직 타입을 바꿀 수 없습니다. 잠시 후 다시 시도하세요." });
          return;
        }
        // TODO: TYPE_SWITCH_COST 다이아 차감(sink) — boxer.diamond는 TASK-019에서 도입됐으나
        //   현재 TYPE_SWITCH_COST=0(무료)이라 차감 미연결. 상점/타입전환 비용 확정 시 addDiamondToBoxer 역연산으로 연결한다.
        const switched = switchFighterType(boxer, combat, boxerType, gender, now);
        lastTypeSwitchAt = now;
        set({
          boxer: switched.boxer,
          combat: switched.combat,
          comboGauge: switched.combat.comboGauge,
          comboStep: switched.combat.comboStep,
          bossRemainingMs: getBossRemainingMs(switched.combat, now),
          message: "파이터 타입을 전환했습니다.",
        });
        // boxer.type/gender는 저장 항목이라 강제 저장한다(throttle 무시).
        persist(true);
        scheduleNext();
      },
    };
  });
}

export const useGameStore = createGameStore();

// TASK-019(P3): 헤더(TASK-020) 토대용 순수 셀렉터. GameState에 파생 필드를 노출하지 않고(이번 범위는 저장 토대),
//   화면이 boxer + 주입 now로부터 직접 파생하도록 작은 셀렉터만 export한다.
//   - selectExpToNext: 현재 플레이어 레벨의 다음 레벨까지 필요한 경험치(저장 안 함, 순수 파생).
//   - selectExpProgress: 경험치 진행률(0~1). 경험치 바 표시용.
//   - selectDailyResetRemainingMs: 다음 일일 리셋까지 남은 ms(주입 now 기준 순수). ⏱ 타이머용.
export function selectExpToNext(boxer: Boxer | null): number {
  return boxer ? expToNext(boxer.playerLevel) : 0;
}

export function selectExpProgress(boxer: Boxer | null): number {
  if (!boxer) return 0;
  const threshold = expToNext(boxer.playerLevel);
  if (threshold <= 0) return 0;
  return Math.min(1, Math.max(0, boxer.playerExp / threshold));
}

export function selectDailyResetRemainingMs(now: number): number {
  return dailyResetRemainingMs(now);
}
