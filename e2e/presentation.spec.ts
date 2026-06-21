import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  createBoxer,
  boxerHpBar,
  hpBar,
  type SeedOptions,
} from "./fixtures";
import type { Page } from "@playwright/test";

// TASK-012 타입별 톤·애니메이션(표시 계층 전용) 회귀 검증.
//  - 연출 추가 후에도 핵심 정보(HP·feed·타이머)가 360px에서 가려지지 않고 가로 스크롤이 없는지
//  - 인파이터/아웃복서가 시각적으로 구분되는지(data-boxer-type / 톤 클래스)
//  - 공격 모션 키(data-attack-key)가 lastAttack 결과와 일치하는지

const combatSection = (p: Page) => p.locator(`section[aria-labelledby="combat-title"]`);
const boxerAvatar = (p: Page) => p.locator(`[data-testid="arena-boxer"] [data-attack-key]`);

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
}

async function seedAndStart(page: Page, options: SeedOptions = {}) {
  await seedSave(page, options);
  await gotoFrozen(page);
}

test.describe("타입별 톤·애니메이션", () => {
  test("연출 적용 후에도 핵심 정보가 화면 안에 보이고 가로 스크롤이 없다", async ({ page }) => {
    await seedAndStart(page, { boxerType: "INFIGHTER" });
    // 전투를 진행시켜 공격·피드 연출을 발생시킨다.
    await page.clock.runFor(4_000);

    expect(await hasHorizontalScroll(page)).toBe(false);

    const viewport = page.viewportSize()!;
    for (const box of [
      await boxerHpBar(page).boundingBox(),
      await hpBar(page).boundingBox(),
      await page.getByTestId("feed-damage").boundingBox(),
    ]) {
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    // feed 데미지 텍스트가 실제로 보인다(연출이 가리지 않음).
    await expect(page.getByTestId("feed-damage")).toBeVisible();
  });

  test("인파이터와 아웃복서의 톤 표식(data-boxer-type)이 다르다", async ({ page }) => {
    await seedAndStart(page, { boxerType: "INFIGHTER" });
    await expect(combatSection(page)).toHaveAttribute("data-boxer-type", "INFIGHTER");

    await seedSave(page, { boxerType: "OUT_BOXER" });
    await gotoFrozen(page);
    await expect(combatSection(page)).toHaveAttribute("data-boxer-type", "OUT_BOXER");
  });

  test("공격 모션 키(data-attack-key)가 발생한 공격에 맞춰 갱신된다", async ({ page }) => {
    await seedAndStart(page, { boxerType: "INFIGHTER" });
    await page.clock.runFor(4_000);

    const key = await boxerAvatar(page).getAttribute("data-attack-key");
    expect(key).toBeTruthy();
    // 공격/회피/사망 키 중 하나여야 한다(대기 상태가 아님 = 전투가 일어남).
    expect(key).toMatch(/^boxer_(left|right)_(jab|straight|hook|upper)$|^boxer_(miss|guard|counter|down)$/);
  });

  test("prefers-reduced-motion에서도 핵심 정보가 그대로 보인다", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoFrozen(page);
    await createBoxer(page);
    await page.clock.runFor(3_000);

    expect(await hasHorizontalScroll(page)).toBe(false);
    await expect(boxerHpBar(page)).toBeVisible();
    await expect(hpBar(page)).toBeVisible();
  });
});
