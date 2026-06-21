import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  createBoxer,
  enterBoss,
  hpNow,
  hpMax,
  groggyBar,
  statValue,
  type SeedOptions,
} from "./fixtures";

const badge = (p: import("@playwright/test").Page) => p.getByTestId("combat-badge");
const bossTimer = (p: import("@playwright/test").Page) => p.getByTestId("boss-timer");

async function bossSeconds(page: import("@playwright/test").Page): Promise<number> {
  return parseFloat((await bossTimer(page).innerText()).replace("초", ""));
}

async function seedAndGo(page: import("@playwright/test").Page, options: SeedOptions) {
  await seedSave(page, options);
  await gotoFrozen(page);
}

// docs/browser-smoke-checklist.md - 스테이지와 보스
test.describe("스테이지와 보스", () => {
  test("일반 스테이지는 자동 전투, 5스테이지는 BOSS·30초로 표시된다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page); // 1-1
    await expect(badge(page)).toHaveText("자동 전투");
    await expect(bossTimer(page)).toHaveCount(0);
    // 일반 스테이지에서는 그로기 바가 표시되지 않는다.
    await expect(groggyBar(page)).toHaveCount(0);
  });

  test("보스 스테이지는 BOSS 배지·30.0초 제한 시간·그로기 바를 보여준다", async ({ page }) => {
    await enterBoss(page);
    await expect(badge(page)).toHaveText("BOSS");
    await expect(bossTimer(page)).toHaveText("30.0초");
    await expect(groggyBar(page)).toBeVisible();
  });

  test("보스 남은 시간이 감소하고 0 아래로 내려가지 않는다", async ({ page }) => {
    await enterBoss(page);
    await expect(bossTimer(page)).toHaveText("30.0초");

    await page.clock.runFor(10_000);
    const remaining = await bossSeconds(page);
    expect(remaining).toBeLessThan(30);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });

  test("보스 처치 시 다음 장 1스테이지로 이동하고 보상을 한 번만 받는다", async ({ page }) => {
    // 공격력을 충분히 높여 첫 타에 보스를 처치한다.
    await enterBoss(page, { upgradeLevels: { attackPower: 30 } });

    await page.clock.runFor(1_000);

    await expect(page.getByText("CHAPTER 2 · STAGE 1")).toBeVisible();
    await expect(statValue(page, "totalKills")).toHaveText("1마리");
    await expect(
      page.locator('section[aria-labelledby="boxer-status-title"]').getByText(/\d+ G/),
    ).toHaveText("50 G");
  });

  test("보스 시간초과 시 같은 장 4스테이지 반복 파밍으로 돌아간다", async ({ page }) => {
    // 치명타 RNG로도 30타 안에 처치 불가하도록 HP가 큰 3장 보스를 쓴다(최대 전피해 600 < 보스 HP).
    await enterBoss(page, { chapter: 3 });

    await page.clock.runFor(30_001);

    await expect(page.getByText("CHAPTER 3 · STAGE 4")).toBeVisible();
    await expect(badge(page)).toHaveText("파밍 중");
    await expect(page.getByRole("button", { name: /보스 다시 도전하기/ })).toBeVisible();
  });

  test("반복 파밍에서 일반 몬스터를 처치해도 같은 장 4에 새 몬스터가 등장한다", async ({
    page,
  }) => {
    await seedAndGo(page, {
      chapter: 1,
      stage: 4,
      isFarming: true,
      upgradeLevels: { attackPower: 30 },
    });
    await expect(badge(page)).toHaveText("파밍 중");
    const max = await hpMax(page);

    await page.clock.runFor(1_000); // 첫 타에 처치 → 같은 4스테이지 새 몬스터

    await expect(page.getByText("CHAPTER 1 · STAGE 4")).toBeVisible();
    await expect(badge(page)).toHaveText("파밍 중");
    await expect(statValue(page, "totalKills")).toHaveText("1마리");
    expect(await hpNow(page)).toBe(max); // 새 몬스터는 풀피
  });

  test("보스 재도전 시 현재 HP를 버리고 최대 HP·30초 보스를 새로 시작한다", async ({ page }) => {
    await seedAndGo(page, { chapter: 1, stage: 4, isFarming: true });
    await page.clock.runFor(3_000); // 파밍 몬스터 HP 일부 소모

    await page.getByRole("button", { name: /보스 다시 도전하기/ }).click();

    await expect(badge(page)).toHaveText("BOSS");
    await expect(bossTimer(page)).toHaveText("30.0초");
    expect(await hpNow(page)).toBe(await hpMax(page)); // 보스 풀피로 새로 시작
  });

  // 4장 숲 입구, 5장 늑대 숲, 6장 바위 협곡 테마를 재사용한다.
  for (const { chapter, theme } of [
    { chapter: 4, theme: "숲 입구" },
    { chapter: 5, theme: "늑대 숲" },
    { chapter: 6, theme: "바위 협곡" },
  ]) {
    test(`${chapter}장은 ${theme} 테마를 재사용한다`, async ({ page }) => {
      await seedAndGo(page, { chapter, stage: 1, upgradeLevels: { attackPower: 30 } });
      await expect(
        page.locator('section[aria-labelledby="combat-title"]').getByText(theme),
      ).toBeVisible();
    });
  }
});
