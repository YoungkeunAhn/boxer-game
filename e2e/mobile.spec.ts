import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  createBoxer,
  enterBoss,
  hpBar,
  boxerHpBar,
  groggyBar,
} from "./fixtures";

const section = (p: import("@playwright/test").Page, id: string) =>
  p.locator(`section[aria-labelledby="${id}"]`);

async function hasHorizontalScroll(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
}

// docs/browser-smoke-checklist.md - 360px 모바일 화면 (mobile-360 프로젝트)
test.describe("360px 모바일", () => {
  test("viewport 360px에서 가로 스크롤이 생기지 않는다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("전투·강화 영역이 한 열로 배치된다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);

    const combat = await section(page, "combat-title").boundingBox();
    const upgrade = await section(page, "upgrade-title").boundingBox();
    expect(combat && upgrade).toBeTruthy();
    // 세로로 쌓인다(y 증가) + 같은 x에서 시작(한 열).
    expect(upgrade!.y).toBeGreaterThan(combat!.y);
    expect(Math.abs(upgrade!.x - combat!.x)).toBeLessThanOrEqual(2);
  });

  test("버튼·입력 필드가 너무 작지 않다(최소 탭 영역)", async ({ page }) => {
    await gotoFrozen(page);
    // 입력 필드는 타이핑 편의를 위해 넉넉히 유지.
    const input = await page.locator("#boxer-name").boundingBox();
    expect(input!.height).toBeGreaterThanOrEqual(44);

    await createBoxer(page);
    // UI 우선: 버튼 높이를 44px로 강제하지 않는다(컴팩트 게임 UI 허용). 다만 너무 작아 누르기 어려운 버튼만 막는다.
    const MIN_BUTTON_TAP = 28;
    for (const button of await page.getByRole("button").all()) {
      if (!(await button.isVisible())) continue;
      // 상단 바 재화 칩(골드/다이아 '+')은 컴팩트한 정보 칩이라 제외한다.
      const inTopBar = await button.evaluate(
        (el) => !!el.closest('[data-testid="top-bar"]'),
      );
      if (inTopBar) continue;
      const box = await button.boundingBox();
      expect(box!.height, await button.innerText()).toBeGreaterThanOrEqual(MIN_BUTTON_TAP);
    }
  });

  test("긴 이름·큰 골드·처치 수가 가로 스크롤을 만들지 않는다", async ({ page }) => {
    await seedSave(page, {
      name: "가나다라마바사아자차카타파하",
      gold: 999_999_999,
      totalKills: 123_456_789,
    });
    await gotoFrozen(page);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("복서 HP·몬스터 HP·그로기 바와 보스 시간이 화면 안에 들어온다", async ({ page }) => {
    await enterBoss(page);

    const viewport = page.viewportSize()!;
    // 보스 진입 시 그로기 바가 나타난다(비보스에서는 표시되지 않음 → stages-boss.spec에서 검증).
    await expect(groggyBar(page)).toBeVisible();
    const boxerHp = await boxerHpBar(page).boundingBox();
    const monsterHp = await hpBar(page).boundingBox();
    const groggy = await groggyBar(page).boundingBox();
    const timer = await page.getByTestId("boss-timer").boundingBox();
    for (const box of [boxerHp, monsterHp, groggy, timer]) {
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });

});
