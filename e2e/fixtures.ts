import { test as base, expect, type Page } from "@playwright/test";

// 스토어는 모듈 평가 시점에 Date.now/localStorage를 읽으므로(gameStore.ts: useGameStore = createGameStore()),
// 클럭과 저장 시드는 반드시 page.goto 이전에 init script로 주입한다.

export const CLOCK_TIME_ISO = "2026-01-01T00:00:00.000Z";
export const CLOCK_TIME_MS = Date.parse(CLOCK_TIME_ISO);
export const SAVE_KEY = "boxer-game.save.v7";
export const LEGACY_SAVE_KEY = "boxer-game.save.v1";

// TASK-021(P3): 퀘스트 시스템 도입 → SCHEMA 6→7, BALANCE 7→8.
export const SCHEMA_VERSION = 7;
export const BALANCE_VERSION = 8;

export type BoxerType = "INFIGHTER" | "OUT_BOXER";
export type Gender = "MALE" | "FEMALE";

export type UpgradeKey =
  | "attackPower"
  | "attackSpeed"
  | "critRate"
  | "critDamage"
  | "goldBonus"
  // v4(TASK-005): 체력·방어, v5(TASK-006): 회피·카운터 강화.
  | "maxHp"
  | "defense"
  | "dodge"
  | "counter";

export type SeedOptions = {
  name?: string;
  boxerType?: BoxerType;
  gender?: Gender;
  gold?: number;
  totalKills?: number;
  chapter?: number;
  stage?: number;
  isFarming?: boolean;
  savedAtMs?: number;
  upgradeLevels?: Partial<Record<UpgradeKey, number>>;
  // TASK-019(P3): 재화·플레이어 진행 시드(기본값: diamond 0·playerLevel 1·playerExp 0).
  diamond?: number;
  playerLevel?: number;
  playerExp?: number;
  // TASK-021(P3): 퀘스트 상태 시드(기본: 빈 진행, 리셋 시각은 CLOCK_TIME_MS 이후 먼 미래로 둬 로드 시 리셋이 일어나지 않게 한다).
  questState?: QuestStateSeed;
};

// 저장 v7의 questState 형태(save.ts isQuestState를 통과해야 한다).
export type QuestStateSeed = {
  progress?: Record<string, number>;
  claimed?: Record<string, boolean>;
  dailyPoints?: number;
  milestonesClaimed?: number[];
  dailySnapshot?: { killMonster: number; autoBattleMinutes: number };
  resetAt?: { daily: number; weekly: number };
};

// 기본 리셋 시각: CLOCK_TIME_MS(2026-01-01) 기준 충분히 먼 미래(로드 시 리셋 트리거 방지).
const FAR_FUTURE_DAILY = CLOCK_TIME_MS + 24 * 60 * 60 * 1_000;
const FAR_FUTURE_WEEKLY = CLOCK_TIME_MS + 7 * 24 * 60 * 60 * 1_000;

function buildQuestState(seed: QuestStateSeed = {}) {
  return {
    progress: seed.progress ?? {},
    claimed: seed.claimed ?? {},
    dailyPoints: seed.dailyPoints ?? 0,
    milestonesClaimed: seed.milestonesClaimed ?? [],
    dailySnapshot: seed.dailySnapshot ?? { killMonster: 0, autoBattleMinutes: 0 },
    resetAt: seed.resetAt ?? { daily: FAR_FUTURE_DAILY, weekly: FAR_FUTURE_WEEKLY },
  };
}

const ZERO_LEVELS: Record<UpgradeKey, number> = {
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

// save.ts의 isSaveData를 통과하는 v6 저장 JSON을 만든다.
export function buildSaveJson(options: SeedOptions = {}): string {
  const {
    name = "테스트복서",
    boxerType = "INFIGHTER",
    gender = "MALE",
    gold = 0,
    totalKills = 0,
    chapter = 1,
    stage = 1,
    isFarming = false,
    savedAtMs = CLOCK_TIME_MS,
    upgradeLevels = {},
    diamond = 0,
    playerLevel = 1,
    playerExp = 0,
    questState = {},
  } = options;

  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    balanceVersion: BALANCE_VERSION,
    savedAt: new Date(savedAtMs).toISOString(),
    boxer: {
      id: "player_boxer",
      name,
      boxerType,
      gender,
      gold,
      totalKills,
      upgradeLevels: { ...ZERO_LEVELS, ...upgradeLevels },
      // TASK-019(P3): 신규 저장 필드(없으면 isBoxer 타입가드 실패 → 로드 시 invalid).
      diamond,
      playerLevel,
      playerExp,
    },
    position: { chapter, stage },
    isFarming,
    // TASK-021(P3): 퀘스트 상태(없으면 isQuestState 실패 → 로드 시 invalid).
    questState: buildQuestState(questState),
  });
}

// 가짜 클럭 설치. install만으로는 실시간으로 흐르므로, goto 이후 freezeClock으로 동결한다.
export async function installClock(page: Page, timeMs = CLOCK_TIME_MS): Promise<void> {
  await page.clock.install({ time: new Date(timeMs) });
}

// install 직후의 클럭은 실시간으로 흐른다. 현재 fake now를 읽어 그 약간 뒤에서 동결한다.
// 버퍼(300ms)는 (a) evaluate→pauseAt 왕복 드리프트보다 크고 (b) 기본 공격 간격 1000ms보다
// 작아, 동결용 점프가 예약된 공격 타이머를 미리 발사하지 않도록 한다.
const FREEZE_BUFFER_MS = 300;

export async function freezeClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + FREEZE_BUFFER_MS));
}

// 클럭 설치 + 이동 + 동결을 한 번에 처리한다(시드는 goto 전에 주입돼야 하므로 호출 측에서 먼저 seed).
export async function gotoFrozen(page: Page, timeMs = CLOCK_TIME_MS): Promise<void> {
  await installClock(page, timeMs);
  await page.goto("/");
  await freezeClock(page);
}

// 새로고침은 init script(클럭 설치 포함)를 재실행하므로 클럭이 CLOCK_TIME_MS로 리셋된다. 다시 동결한다.
export async function reloadFrozen(page: Page): Promise<void> {
  await page.reload();
  await freezeClock(page);
}

export async function seedSave(page: Page, options: SeedOptions = {}): Promise<void> {
  const json = buildSaveJson(options);
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* 무시 */
      }
    },
    [SAVE_KEY, json] as const,
  );
}

export async function seedLegacyV1(page: Page): Promise<void> {
  await page.addInitScript(
    (key) => {
      try {
        window.localStorage.setItem(key, "legacy-v1-blob");
      } catch {
        /* 무시 */
      }
    },
    LEGACY_SAVE_KEY,
  );
}

export async function seedCorruptSave(page: Page, raw = "{not-json"): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* 무시 */
      }
    },
    [SAVE_KEY, raw] as const,
  );
}

export async function createBoxer(page: Page, name = "테스트복서"): Promise<void> {
  await page.locator("#boxer-name").fill(name);
  await page.getByRole("button", { name: "커리어 시작하기" }).click();
  await expect(page.locator("#combat-title")).toBeVisible();
}

// 보스 진입: 보스 위치 저장을 불러오면 게임이 4스테이지 파밍으로 강등하므로,
// 4스테이지 파밍 상태에서 "보스 다시 도전하기"로 실제 보스에 진입한다.
export async function enterBoss(page: Page, options: SeedOptions = {}): Promise<void> {
  await seedSave(page, { chapter: 1, stage: 4, isFarming: true, ...options });
  await gotoFrozen(page);
  await page.getByRole("button", { name: /보스 다시 도전하기/ }).click();
  await expect(page.getByTestId("combat-badge")).toHaveText("BOSS");
}

// TASK-015: 전투 컨트롤 testid 헬퍼. SAVE_KEY/SCHEMA_VERSION/BALANCE_VERSION은 불변(컨트롤은 휘발 UI 상태).
export function autoToggle(page: Page) {
  return page.getByTestId("auto-toggle");
}

export function speedToggle(page: Page) {
  return page.getByTestId("speed-toggle");
}

export function manualAttackButton(page: Page) {
  return page.getByTestId("manual-attack");
}

export function skillButton(page: Page) {
  return page.getByTestId("skill-button");
}

export function hpBar(page: Page) {
  // TASK-020(P3): 상단 바 경험치 바도 progressbar라 이름(…체력)으로 몬스터 HP 바를 한정한다.
  return page.getByRole("progressbar", { name: /체력$/ });
}

export async function hpNow(page: Page): Promise<number> {
  return Number(await hpBar(page).getAttribute("aria-valuenow"));
}

export async function hpMax(page: Page): Promise<number> {
  return Number(await hpBar(page).getAttribute("aria-valuemax"));
}

export function statValue(page: Page, key: UpgradeKey | "totalKills") {
  return page.getByTestId(`stat-${key}`);
}

export function upgradeButton(page: Page, key: UpgradeKey) {
  return page.getByTestId(`upgrade-button-${key}`);
}

// TASK-020(P3): 상단 바·하단 5탭 testid 헬퍼. 탭은 휘발 UI 상태라 SAVE_KEY/SCHEMA/BALANCE 불변(v6/6/7).
export type TabId = "shop" | "bag" | "fighter" | "quest" | "arena";

export function topBar(page: Page) {
  return page.getByTestId("top-bar");
}

export function playerLevel(page: Page) {
  return page.getByTestId("player-level");
}

export function playerExpBar(page: Page) {
  return page.getByTestId("player-exp-bar");
}

export function currencyGold(page: Page) {
  return page.getByTestId("currency-gold");
}

export function currencyDiamond(page: Page) {
  return page.getByTestId("currency-diamond");
}

export function dailyResetTimer(page: Page) {
  return page.getByTestId("daily-reset-timer");
}

export function tabBar(page: Page) {
  return page.getByTestId("tab-bar");
}

export function tab(page: Page, id: TabId) {
  return page.getByTestId(`tab-${id}`);
}

export function tabBadge(page: Page, id: TabId) {
  return page.getByTestId(`tab-badge-${id}`);
}

// pagehide -> pause(), visibilitychange(visible) -> resume() 를 직접 발생시킨다.
export async function sendToBackground(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
}

export async function returnToForeground(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

export const test = base;
export { expect };
