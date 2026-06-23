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
  ACTIVE_SKILL_SLOT_MAX,
  DEFAULT_AUTO_MODE,
  DEFAULT_BOXER_TYPE,
  DEFAULT_EQUIPPED_SKILLS,
  DEFAULT_GENDER,
  DEFAULT_SPEED_MULTIPLIER,
  EXP_PER_BOSS_CLEAR,
  EXP_PER_KILL,
  GROGGY_DURATION_MS,
  INITIAL_DIAMOND,
  INITIAL_PLAYER_EXP,
  INITIAL_PLAYER_LEVEL,
  INITIAL_UPGRADE_LEVELS,
  MAX_SAFE_GAME_INTEGER,
  QUEST_AUTO_BATTLE_MS_PER_MINUTE,
  TYPE_SWITCH_COOLDOWN_MS,
} from "../game/constants";
import {
  addDiamondToBoxer,
  addExpToBoxer,
  addProgressToBoxer,
  calculateCombatStats,
  calculateGoldReward,
  expToNext,
  purchaseUpgrade,
} from "../game/formulas";
import { dailyResetRemainingMs } from "../game/progress";
import { getNextStagePosition } from "../data/stages";
import {
  addQuestProgress,
  applyQuestResets,
  claimMilestone as claimMilestonePure,
  claimQuest as claimQuestPure,
  createInitialQuestState,
  hasClaimableQuest,
  type QuestCumulativeSource,
} from "../game/quests";
import { isPassiveSkill, isSkillEquippableFor } from "../data/skills";
import {
  applyActiveSkill,
  mergeSkillCooldowns,
  selectReadySkill,
} from "../game/skills";
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
  QuestReward,
  QuestState,
  SkillId,
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
  // TASK-015: 전투 컨트롤. AUTO 토글·배속·수동 탭·수동 스킬.
  toggleAuto: () => void;
  setSpeedMultiplier: (multiplier: SpeedMultiplier) => void;
  manualAttack: () => void;
  // 수동 스킬: MANUAL 모드에서 준비된 장착 액티브 스킬 1개를 슬롯 우선순위로 발동한다(v1.3d 슬롯 기반).
  triggerSkill: () => void;
  // TASK-017: 단일 캐릭터 타입/성별 런타임 전환(강화·골드 유지, typeMultiplier 재적용).
  switchType: (boxerType: BoxerType, gender: Gender) => void;
  // TASK-020(P3): 주입 now(실시간 epoch ms) 읽기. 상단 바의 일일 리셋 타이머 표시 파생 전용 —
  //   UI가 Date.now를 직접 호출하지 않고 주입된 시계에서 읽도록 한다(프로젝트 규칙·E2E 가짜 클럭 정합).
  getNow: () => number;
  // TASK-021(P3): 퀘스트 수령·마일스톤 수령·무료 상자(상점 골격) 이벤트.
  claimQuest: (questId: string) => void;
  claimMilestone: (threshold: number) => void;
  claimFreeChest: () => void;
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

// TASK-021(P3): boxer 누적값(현재는 처치 수)에서 퀘스트 누적 소스를 만든다.
function questSourceFromBoxer(boxer: Boxer | null): QuestCumulativeSource {
  return { killMonster: boxer ? boxer.totalKills : 0 };
}

// TASK-021(P3): now=0 기준 placeholder 퀘스트 상태(boxer 없을 때/리셋용). 실제 now는 init/createBoxer에서 주입.
const EMPTY_QUEST_STATE: QuestState = createInitialQuestState(0, { killMonster: 0 });

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
  // TASK-021(P3): 퀘스트 초기 상태(placeholder). 실제 리셋 시각은 init/createBoxer에서 now로 갱신.
  questState: EMPTY_QUEST_STATE,
  // v1.3c/v1.3d: 보스 그로기·스킬 UI 파생값(비저장).
  groggyGauge: 0,
  groggyMax: 0,
  isGroggy: false,
  lastSkill: null,
  lastKillReward: null,
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
    // TASK-021(P3): 저장된 퀘스트 상태에 지난(오프라인 포함) 일일/주간 리셋을 주입 now로 정산한다.
    //   가정: 오프라인 처치(offline.boxer.totalKills 증가)는 일일 killMonster 증분에 반영되지 않게,
    //   리셋이 일어났다면 스냅샷이 현재 누적값으로 재설정된다(방치 자동 달성 방지 — 가정).
    const questState = applyQuestResets(
      result.data.questState,
      now,
      questSourceFromBoxer(offline.boxer),
    );
    return {
      savedAt,
      shouldPersistOffline: savedAt !== now,
      state: {
        ...EMPTY_STATE,
        boxer: offline.boxer,
        combat,
        questState,
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
    // TASK-019(P3): 신규 재화·플레이어 진행 초기값.
    diamond: INITIAL_DIAMOND,
    playerLevel: INITIAL_PLAYER_LEVEL,
    playerExp: INITIAL_PLAYER_EXP,
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
  // TASK-017: 마지막 타입 전환 게임시각(휘발 클로저 변수, 저장 안 함). 쿨다운 악용 방지 판정에만 쓴다.
  let lastTypeSwitchAt: number | null = null;
  // TASK-021(P3): 자동 전투 누적 게임시간(ms) 중 아직 분으로 환산해 퀘스트에 반영하지 않은 잔여분.
  //   온라인 진행만 집계한다(오프라인 정산은 별도 — 가정: 방치 자동 달성 방지). 휘발 클로저(분 단위로만 progress에 반영).
  let autoBattleRemainderMs = 0;
  // advanceCombat 직전 게임시각(자동 전투 경과 측정 기준). 진행 호출 사이의 게임시간 델타를 분으로 환산한다.
  let lastAdvanceGameAt = initialNow;
  // UI 연출용: 처치 보상 시퀀스(동일 금액 연속 처치도 애니 재시동하도록 증가시키는 카운터).
  let killSeq = 0;

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
          // TASK-021(P3): 퀘스트 진행 상태도 함께 저장한다(v7 top-level 필드).
          questState: state.questState,
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
      let lastKillReward = get().lastKillReward;
      let killed = false;
      let bossTimedOut = false;
      let bossDefeated = false;
      let knockedDown = false;
      // TASK-021(P3): 이번 진행에서 발생한 퀘스트 이벤트 카운트.
      let stageClears = 0;
      let bossClears = 0;
      const startPlayerLevel = boxer.playerLevel;
      const startTotalKills = boxer.totalKills;
      // 자동 전투 누적 분: 이번 호출까지 흐른 게임시간 델타를 잔여 ms에 더해 분으로 환산한다(온라인 한정 — 가정).
      const advanceDeltaMs = Math.max(0, now - lastAdvanceGameAt);
      lastAdvanceGameAt = now;

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
        const wasFarming = combat.isFarming;
        const step = stepCombat(boxer, combat, dependencies.random(), now);
        boxer = step.boxer;
        combat = step.combat;
        if (step.attack) {
          lastAttack = step.attack;
          killed ||= step.attack.killed;
          const stageBossDefeated = attackedStageWasBoss && step.attack.killed;
          bossDefeated ||= stageBossDefeated;
          // TASK-021(P3): 퀘스트 카운트. 보스 처치=bossClear, 일반 스테이지 전진(파밍 아님)=stageClear.
          if (stageBossDefeated) bossClears += 1;
          else if (step.attack.killed && !attackedStageWasBoss && !wasFarming) stageClears += 1;
          // TASK-019(P3): 처치 시 플레이어 경험치 가산(보스 클리어는 보스 보상, 일반 처치는 킬 보상).
          //   레벨업 정산·다이아 보상은 addExpToBoxer 내부에서 순수 처리된다(가정값 — constants.ts).
          if (step.attack.killed) {
            boxer = addExpToBoxer(boxer, stageBossDefeated ? EXP_PER_BOSS_CLEAR : EXP_PER_KILL);
            // UI 연출용(비저장): 몬스터 위로 떠오르는 획득 골드. seq로 매 처치마다 애니 재시동.
            killSeq += 1;
            lastKillReward = { gold: step.attack.goldReward, seq: killSeq };
          }
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

      // TASK-021(P3): 퀘스트 진행 정산(리셋 → 이벤트 진행 누적). 보상 가산은 수령(claim) 시점에 한다.
      //   - 일일/주간 리셋을 주입 now로 정산(killMonster는 totalKills 스냅샷 증분으로 자동 반영).
      //   - 스테이지/보스/레벨업: 이번 진행에서 발생한 카운트만큼 progress 증가.
      //   - 자동 전투 분: 게임시간 델타를 분으로 환산해 누적(온라인 한정 — 가정).
      let questState = applyQuestResets(get().questState, now, questSourceFromBoxer(boxer));
      if (stageClears > 0) questState = addQuestProgress(questState, "stageClear", stageClears);
      if (bossClears > 0) questState = addQuestProgress(questState, "bossClear", bossClears);
      const levelGains = Math.max(0, boxer.playerLevel - startPlayerLevel);
      if (levelGains > 0) questState = addQuestProgress(questState, "playerLevelUp", levelGains);
      // 비일일 killMonster(주간/도전/업적)는 progress 누적형이므로 이번 처치 수만큼 직접 증가시킨다.
      //   일일 killMonster는 스냅샷 증분이라 addQuestProgress가 isCumulativeGoal로 건너뛴다.
      const killsThisTick = Math.max(0, boxer.totalKills - startTotalKills);
      if (killsThisTick > 0) questState = addQuestProgress(questState, "killMonster", killsThisTick);
      autoBattleRemainderMs += advanceDeltaMs;
      const minutes = Math.floor(autoBattleRemainderMs / QUEST_AUTO_BATTLE_MS_PER_MINUTE);
      if (minutes > 0) {
        autoBattleRemainderMs -= minutes * QUEST_AUTO_BATTLE_MS_PER_MINUTE;
        questState = addQuestProgress(questState, "autoBattleMinutes", minutes);
      }

      set({
        boxer,
        combat,
        questState,
        lastAttack,
        recentDefense,
        // v1.3b: 콤보 연출 상태를 노출(combat 런타임 필드에서 파생). 로직 추가 없이 표시용.
        comboGauge: combat.comboGauge,
        comboStep: combat.comboStep,
        lastCombo,
        lastSkill,
        lastKillReward,
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
        // TASK-021(P3): 새 복서의 퀘스트 상태를 now 기준으로 초기화하고 자동 전투 측정 기준을 맞춘다.
        autoBattleRemainderMs = 0;
        lastAdvanceGameAt = now;
        set({
          ...EMPTY_STATE,
          boxer,
          combat,
          questState: createInitialQuestState(now, questSourceFromBoxer(boxer)),
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
        const now = syncGameNow();
        // 강화 전/후 공격 속도를 둘 다 구한다(진척 보존 재스케줄에 필요).
        const prevStats = calculateCombatStats(state.boxer.upgradeLevels, state.boxer.boxerType);
        const stats = calculateCombatStats(result.boxer.upgradeLevels, result.boxer.boxerType);
        // 가정: 체력 강화 시 최대 HP가 늘어난 만큼 현재 HP도 가산(풀충전 아님). 현재 HP는 새 최대치 클램프.
        const hpDelta = Math.max(0, stats.maxHp - state.combat.boxerMaxHp);
        const boxerHp = Math.min(stats.maxHp, state.combat.boxerHp + hpDelta);
        // 변경된 공격 속도를 반영하되 진행 중인 공격 쿨타임 진척을 보존해 재스케줄한다(연타 강화로도 공격이 끊기지 않음).
        const rescheduled = rescheduleAttacks(state.combat, prevStats.attackSpeed, stats.attackSpeed, now);
        const upgradedCombat = {
          ...rescheduled,
          boxerHp,
          boxerMaxHp: stats.maxHp,
        };
        // TASK-021(P3): 강화 성공 1회 = upgradeStat 퀘스트 +1(리셋 정산 후 진행).
        let questState = applyQuestResets(state.questState, now, questSourceFromBoxer(result.boxer));
        questState = addQuestProgress(questState, "upgradeStat", 1);
        set({
          boxer: result.boxer,
          combat: upgradedCombat,
          questState,
          message: `강화 완료! ${result.cost.toLocaleString()} 골드를 사용했습니다.`,
          ...getGroggyView(upgradedCombat, now),
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
          ...getGroggyView(combat, now),
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
        set({
          isRunning: false,
          bossRemainingMs: getBossRemainingMs(get().combat, gameTime),
          ...getGroggyView(get().combat, gameTime),
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
          ...getGroggyView(combat, gameTime),
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
        // 쿨타임은 게임 시간 기준(combat 클럭)으로 재정합한다.
        const now = syncGameNow();
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
        const now = syncGameNow();
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
        // TASK-021(P3): 자동 전투 측정 클로저도 초기화(다음 새 복서 생성 시 createBoxer에서 now 기준 재설정).
        autoBattleRemainderMs = 0;
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

      // 수동 스킬(MANUAL 전용) — v1.3d 슬롯 기반.
      //   장착 액티브 슬롯에서 쿨타임이 끝난 스킬 1개를 슬롯 우선순위(Slot1>2>3)로 골라 즉시 발동한다.
      //   준비된 스킬이 없으면 무동작(no-op). AUTO 모드에서는 resolveAttack 내부에서 자동 발동되므로 이 버튼은 MANUAL 전용.
      //   발동 효과(monsterDamage/groggyGain/buff/internalDoT)와 쿨타임 소비는 applyActiveSkill 결과를 그대로 반영한다.
      triggerSkill: () => {
        const state = get();
        const { boxer, combat } = state;
        if (state.autoMode !== "MANUAL" || !boxer || !combat) return;
        const now = syncGameNow();
        // 보스 타임아웃이 먼저면 스킬 대신 타임아웃을 정산한다(밸런스 게임 시간 기준 유지).
        if (combat.bossDeadlineAt !== null && now > combat.bossDeadlineAt) {
          advanceCombat(now);
          persist(true);
          return;
        }
        // 슬롯 우선순위로 준비된 액티브 스킬을 고른다. 없으면 무동작.
        const readySkill = selectReadySkill(boxer.equippedSkills.active, combat.skillCooldowns, now);
        if (!readySkill) {
          set({ message: "사용할 수 있는 스킬이 없습니다." });
          return;
        }
        const stage = getStageDefinition(combat.position);
        const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
        const effect = applyActiveSkill(readySkill, stats, now);
        const damage = effect.monsterDamage;
        const killed = damage >= combat.monsterHp;
        const goldReward = killed ? calculateGoldReward(stage.goldReward, stats.goldBonus) : 0;
        const bossDefeated = killed && stage.isBoss;
        // 처치 시 경험치 가산(보스 클리어는 보스 보상, 일반은 킬 보상).
        const nextBoxer = killed
          ? addExpToBoxer(
              addProgressToBoxer(boxer, 1, goldReward),
              bossDefeated ? EXP_PER_BOSS_CLEAR : EXP_PER_KILL,
            )
          : boxer;

        // 발동 스킬에 따른 런타임 갱신값(쿨타임·버프·내상·그로기). createCombatRuntime로 전이되는 경우엔 초기화되므로 미적용.
        const nextSkillCooldowns =
          effect.cooldownMs !== null
            ? { ...combat.skillCooldowns, [readySkill]: now + effect.cooldownMs }
            : combat.skillCooldowns;
        const nextBuffs = effect.buff ? [...combat.activeBuffs, effect.buff] : combat.activeBuffs;
        const nextInternalDoT = effect.internalDoT ?? combat.internalDoT;
        // 그로기 누적(보스·비그로기 상태에서만). 상한 도달 시 그로기 진입.
        const isGroggyNow = combat.groggyUntil !== null && now < combat.groggyUntil;
        let groggyGauge = combat.groggyGauge;
        let groggyUntil = combat.groggyUntil;
        let groggyTriggered = false;
        if (combat.groggyMax > 0 && effect.groggyGain > 0 && !isGroggyNow) {
          const withSkill = groggyGauge + effect.groggyGain;
          if (withSkill >= combat.groggyMax) {
            groggyGauge = 0;
            groggyUntil = now + GROGGY_DURATION_MS;
            groggyTriggered = true;
          } else {
            groggyGauge = Math.min(combat.groggyMax, withSkill);
          }
        }

        let nextCombat: CombatRuntime;
        if (!killed) {
          // 스킬 발동만으로 쿨타임·버프·내상·그로기를 갱신한다(처치 못 해도 소비). 진행은 동일 스테이지 유지.
          nextCombat = {
            ...combat,
            monsterHp: Math.max(0, combat.monsterHp - damage),
            skillCooldowns: nextSkillCooldowns,
            activeBuffs: nextBuffs,
            internalDoT: nextInternalDoT,
            groggyGauge,
            groggyUntil,
          };
        } else if (combat.isFarming) {
          nextCombat = createCombatRuntime(nextBoxer, combat.position, now, true);
        } else {
          // 일반/보스 처치 모두 다음 스테이지로 전이(보스 처치 시 다음 챕터 1스테이지).
          nextCombat = createCombatRuntime(nextBoxer, getNextStagePosition(combat.position), now);
        }

        // TASK-021(P3): 수동 스킬 처치도 퀘스트 진행에 반영(advanceCombat을 거치지 않는 경로).
        let questState = applyQuestResets(state.questState, now, questSourceFromBoxer(nextBoxer));
        if (killed) {
          if (bossDefeated) questState = addQuestProgress(questState, "bossClear", 1);
          else if (!combat.isFarming) questState = addQuestProgress(questState, "stageClear", 1);
          const killsDelta = Math.max(0, nextBoxer.totalKills - boxer.totalKills);
          if (killsDelta > 0) questState = addQuestProgress(questState, "killMonster", killsDelta);
          const levelGains = Math.max(0, nextBoxer.playerLevel - boxer.playerLevel);
          if (levelGains > 0) questState = addQuestProgress(questState, "playerLevelUp", levelGains);
        }

        set({
          boxer: nextBoxer,
          combat: nextCombat,
          questState,
          lastAttack: {
            stageId: stage.id,
            damage,
            isCritical: false,
            killed,
            goldReward,
            // 스킬 연출은 attackType/hand를 어퍼/오른손 기본값으로 표기(연출 톤 유지). 콤보는 없음.
            attackType: "UPPER",
            hand: "RIGHT",
            combo: null,
            groggyGain: effect.groggyGain,
            groggyTriggered,
            groggyBonusApplied: false,
            skillTriggered: readySkill,
            hits: effect.hits,
            skillDamage: damage,
            internalDamage: 0,
          },
          lastSkill: readySkill,
          comboGauge: nextCombat.comboGauge,
          comboStep: nextCombat.comboStep,
          message: bossDefeated
            ? "보스를 쓰러뜨렸습니다! 다음 챕터로 이동합니다."
            : "스킬 발동!",
          bossRemainingMs: getBossRemainingMs(nextCombat, now),
          ...getGroggyView(nextCombat, now),
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
      // TASK-020(P3): 주입 now 노출(표시 전용). 게임 상태 변경 없음 — 상단 바 일일 타이머 1초 갱신용.
      getNow: () => dependencies.now(),

      // TASK-021(P3): 퀘스트 보상 수령. 완료·미수령일 때만 보상(골드·다이아)을 boxer에 가산하고 강제 저장.
      claimQuest: (questId) => {
        const state = get();
        if (!state.boxer || !state.combat) return;
        const now = syncGameNow();
        const reset = applyQuestResets(state.questState, now, questSourceFromBoxer(state.boxer));
        const result = claimQuestPure(reset, questId, questSourceFromBoxer(state.boxer));
        if (!result.claimed) {
          if (reset !== state.questState) set({ questState: reset });
          return;
        }
        const boxer = applyRewardToBoxer(state.boxer, result.reward);
        set({ boxer, questState: result.state, message: "퀘스트 보상을 받았습니다." });
        persist(true);
      },

      // TASK-021(P3): 마일스톤 상자 수령(구간별 별도). 점수 도달·미수령일 때만 보상 가산 + 강제 저장.
      claimMilestone: (threshold) => {
        const state = get();
        if (!state.boxer || !state.combat) return;
        const now = syncGameNow();
        const reset = applyQuestResets(state.questState, now, questSourceFromBoxer(state.boxer));
        const result = claimMilestonePure(reset, threshold);
        if (!result.claimed) {
          if (reset !== state.questState) set({ questState: reset });
          return;
        }
        const boxer = applyRewardToBoxer(state.boxer, result.reward);
        set({ boxer, questState: result.state, message: "마일스톤 상자를 받았습니다." });
        persist(true);
      },

      // TASK-021(P3): 무료 상자 수령(상점 골격). 상점(TASK-023) 도입 전까지 퀘스트 진행만 +1(claimFreeChest).
      //   TODO(TASK-023): 무료 상자 실제 보상·일일 1회 제한을 상점 상태와 연결한다.
      claimFreeChest: () => {
        const state = get();
        if (!state.boxer || !state.combat) return;
        const now = syncGameNow();
        let questState = applyQuestResets(state.questState, now, questSourceFromBoxer(state.boxer));
        questState = addQuestProgress(questState, "claimFreeChest", 1);
        set({ questState, message: "무료 상자를 받았습니다." });
        persist(true);
      },
    };
  });
}

// TASK-021(P3): 퀘스트/마일스톤 보상(골드·다이아만)을 boxer에 가산한다(순수 — 새 Boxer 반환).
function applyRewardToBoxer(boxer: Boxer, reward: QuestReward): Boxer {
  let next = boxer;
  if (reward.gold && reward.gold > 0) {
    next = { ...next, gold: Math.min(MAX_SAFE_GAME_INTEGER, next.gold + Math.floor(reward.gold)) };
  }
  if (reward.diamond && reward.diamond > 0) {
    next = addDiamondToBoxer(next, reward.diamond);
  }
  return next;
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

// TASK-020(P3): 하단 탭 알림 뱃지(빨강 점) 셀렉터. 수령 가능한 보상/신규가 있을 때만 true.
//   현재는 backing state가 없어 항상 false를 반환한다(자리/메커니즘만 구현, 추측 단정 금지).
//   - selectShopBadge: 무료 상자 수령 가능 시 true — 상점(TASK-023)에서 backing state 연결 예정. TODO.
//   - selectQuestBadge: 완료·미수령 퀘스트 또는 마일스톤 상자 수령 가능 시 true — 퀘스트(TASK-021)에서 연결 예정. TODO.
//   가방·경기장은 보류 탭이라 뱃지 없음(셀렉터 불필요).
export function selectShopBadge(_state: GameState): boolean {
  // TODO(TASK-023): 무료 상자 수령 가능 여부 backing state 연결.
  return false;
}

export function selectQuestBadge(state: GameState): boolean {
  // TASK-021(P3): 완료·미수령 퀘스트 또는 수령 가능한 마일스톤이 하나라도 있으면 뱃지 표시.
  if (!state.boxer) return false;
  return hasClaimableQuest(state.questState, { killMonster: state.boxer.totalKills });
}
