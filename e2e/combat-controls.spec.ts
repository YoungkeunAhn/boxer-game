import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  speedToggle,
  type SeedOptions,
} from "./fixtures";

// docs/browser-smoke-checklist.md - 전투 컨트롤
// 자동 전투가 기본이라 사용자 컨트롤은 배속 하나뿐(AUTO 토글·수동 탭·수동 스킬 UI 제거).
// 배속의 게임 시간 누적(밸런스 불변)은 store 단위 테스트가 검증하고, E2E는 배속 토글의 표시·순환만 확인한다.

async function seedAndGo(page: import("@playwright/test").Page, options: SeedOptions) {
  await seedSave(page, options);
  await gotoFrozen(page);
}

test.describe("전투 컨트롤", () => {
  test("배속 토글이 x1 ↔ x2 라벨·aria로 순환한다", async ({ page }) => {
    await seedAndGo(page, { chapter: 1, stage: 1 });

    const speed = speedToggle(page);
    await expect(speed).toHaveText(/x1/);
    await expect(speed).toHaveAttribute("aria-label", /배속 x1/);

    await speed.click();
    await expect(speed).toHaveText(/x2/);
    await expect(speed).toHaveAttribute("aria-label", /배속 x2/);

    await speed.click();
    await expect(speed).toHaveText(/x1/);
  });
});
