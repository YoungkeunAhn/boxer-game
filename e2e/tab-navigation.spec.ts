import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  topBar,
  playerLevel,
  playerExpBar,
  currencyGold,
  currencyDiamond,
  tabBar,
  tab,
  tabBadge,
  type TabId,
} from "./fixtures";

async function hasHorizontalScroll(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
}

const LOCKED_TABS: TabId[] = ["shop", "bag", "arena"];

// docs/ui/01-공통-레이아웃.md §3-2 — 상단 바 + 하단 5탭 공통 프레임.
test.describe("탭 네비게이션·상단 바", () => {
  test("상단 바가 레벨·경험치 바·골드·다이아를 시드값대로 표시한다", async ({ page }) => {
    await seedSave(page, {
      gold: 128_400,
      diamond: 2_350,
      playerLevel: 45,
      playerExp: 30,
    });
    await gotoFrozen(page);

    await expect(topBar(page)).toBeVisible();
    await expect(playerLevel(page)).toHaveText("Lv.45");
    // 재화 수치는 1,000 이상이면 약어 표기(128,400 → 128.4K, 2,350 → 2.3K).
    await expect(currencyGold(page)).toContainText("128.4K");
    await expect(currencyDiamond(page)).toContainText("2.3K");

    // 경험치 바는 progressbar 시맨틱(valuemin/max/now)을 노출한다.
    const expBar = playerExpBar(page);
    await expect(expBar).toHaveAttribute("aria-valuemin", "0");
    expect(Number(await expBar.getAttribute("aria-valuenow"))).toBe(30);
    expect(Number(await expBar.getAttribute("aria-valuemax"))).toBeGreaterThan(0);
  });

  test("파이터가 기본 탭이고 전투 화면이 보인다", async ({ page }) => {
    await seedSave(page);
    await gotoFrozen(page);

    await expect(tabBar(page)).toBeVisible();
    await expect(tab(page, "fighter")).toHaveAttribute("data-active", "true");
    await expect(page.locator("#combat-title")).toBeVisible();
  });

  test("퀘스트 탭으로 전환하면 퀘스트 패널이 보이고 파이터로 복귀한다", async ({ page }) => {
    await seedSave(page);
    await gotoFrozen(page);

    await tab(page, "quest").click();
    await expect(tab(page, "quest")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("quest-panel")).toBeVisible();
    await expect(page.locator("#combat-title")).toBeHidden();

    await tab(page, "fighter").click();
    await expect(tab(page, "fighter")).toHaveAttribute("data-active", "true");
    await expect(page.locator("#combat-title")).toBeVisible();
    await expect(page.getByTestId("quest-panel")).toBeHidden();
  });

  test("보류 탭(상점·가방·경기장)은 잠금·비활성이고 강제 클릭해도 파이터 화면을 유지한다", async ({
    page,
  }) => {
    await seedSave(page);
    await gotoFrozen(page);

    for (const id of LOCKED_TABS) {
      const locked = tab(page, id);
      await expect(locked).toBeDisabled();
      await expect(locked).toHaveAttribute("data-locked", "true");
      await expect(locked).toHaveAttribute("aria-disabled", "true");

      // disabled를 우회한 강제 클릭에도 진입이 차단되고 파이터가 활성으로 유지된다.
      await locked.dispatchEvent("click");
      await expect(tab(page, "fighter")).toHaveAttribute("data-active", "true");
      await expect(page.locator("#combat-title")).toBeVisible();
    }
  });

  test("알림 뱃지는 현재 조건(false)에서 노출되지 않는다", async ({ page }) => {
    await seedSave(page);
    await gotoFrozen(page);

    await expect(tabBadge(page, "shop")).toHaveCount(0);
    await expect(tabBadge(page, "quest")).toHaveCount(0);
  });

  test("상단 바·하단 탭이 가로 스크롤을 만들지 않는다", async ({ page }) => {
    await seedSave(page, {
      name: "가나다라마바사아자차카타파하",
      gold: 999_999_999,
      diamond: 999_999_999,
      playerLevel: 999,
      playerExp: 12_345,
    });
    await gotoFrozen(page);

    await expect(topBar(page)).toBeVisible();
    await expect(tabBar(page)).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
