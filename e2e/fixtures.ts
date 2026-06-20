import { test as base, expect, type Page } from "@playwright/test";

// 스토어는 모듈 평가 시점에 Date.now/localStorage를 읽으므로(gameStore.ts: useGameStore = createGameStore()),
// 클럭과 저장 시드는 반드시 page.goto 이전에 init script로 주입한다.

export const CLOCK_TIME_ISO = "2026-01-01T00:00:00.000Z";
export const CLOCK_TIME_MS = Date.parse(CLOCK_TIME_ISO);
export const SAVE_KEY = "boxer-game.save.v3";
export const LEGACY_SAVE_KEY = "boxer-game.save.v1";

export const SCHEMA_VERSION = 3;
export const BALANCE_VERSION = 2;

export type BoxerType = "INFIGHTER" | "OUT_BOXER";
export type Gender = "MALE" | "FEMALE";

export type UpgradeKey =
  | "attackPower"
  | "attackSpeed"
  | "critRate"
  | "critDamage"
  | "goldBonus";

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
};

const ZERO_LEVELS: Record<UpgradeKey, number> = {
  attackPower: 0,
  attackSpeed: 0,
  critRate: 0,
  critDamage: 0,
  goldBonus: 0,
};

// save.ts의 isSaveData를 통과하는 v3 저장 JSON을 만든다.
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
    },
    position: { chapter, stage },
    isFarming,
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

export function hpBar(page: Page) {
  return page.getByRole("progressbar");
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

// pagehide -> pause(), visibilitychange(visible) -> resume() 를 직접 발생시킨다.
export async function sendToBackground(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
}

export async function returnToForeground(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

export const test = base;
export { expect };
