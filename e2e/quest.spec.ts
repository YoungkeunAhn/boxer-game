import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  tab,
  tabBadge,
  currencyGold,
  currencyDiamond,
} from "./fixtures";

// docs/ui/05-퀘스트.md — 퀘스트 4탭·리스트·버튼 3상태·마일스톤 바·뱃지(TASK-021).
test.describe("퀘스트 시스템", () => {
  test("퀘스트 탭이 4개 카테고리 탭과 일일 마일스톤 바를 보인다", async ({ page }) => {
    await seedSave(page);
    await gotoFrozen(page);
    await tab(page, "quest").click();

    for (const id of ["daily", "weekly", "challenge", "achievement"]) {
      await expect(page.getByTestId(`quest-tab-${id}`)).toBeVisible();
    }
    // 일일 탭 기본 선택 → 마일스톤 바 노출.
    await expect(page.getByTestId("quest-milestone")).toBeVisible();
    await expect(page.getByTestId("quest-milestone-points")).toContainText("/ 100");
  });

  test("미완료 퀘스트는 [이동] 버튼이고 누르면 파이터 탭으로 이동한다", async ({ page }) => {
    await seedSave(page);
    await gotoFrozen(page);
    await tab(page, "quest").click();

    const moveButton = page.getByTestId("quest-button-daily_stage_3");
    await expect(moveButton).toHaveText("이동");
    await moveButton.click();
    await expect(tab(page, "fighter")).toHaveAttribute("data-active", "true");
    await expect(page.locator("#combat-title")).toBeVisible();
  });

  test("완료된 퀘스트를 수령하면 보상이 재화에 가산되고 ✓로 바뀐다", async ({ page }) => {
    // daily_upgrade_5: 강화 5회 목표·보상 🪙7,000. progress를 5로 시드해 완료 상태로 만든다.
    await seedSave(page, {
      gold: 1_000,
      questState: { progress: { daily_upgrade_5: 5 } },
    });
    await gotoFrozen(page);
    await tab(page, "quest").click();

    const claimButton = page.getByTestId("quest-button-daily_upgrade_5");
    await expect(claimButton).toHaveText("수령");
    await claimButton.click();

    // 보상(7,000골드)이 상단 바 골드에 가산된다(1,000 → 8,000 → 축약 8.0K).
    await expect(currencyGold(page)).toContainText("8.0K");
    // 수령 후 버튼은 ✓(비활성)로 바뀌고 재수령 불가.
    await expect(claimButton).toHaveText("✓");
    await expect(claimButton).toBeDisabled();
  });

  test("누적 점수 도달 시 마일스톤 상자를 수령하면 다이아가 가산된다", async ({ page }) => {
    // dailyPoints 20 → 20구간 수령 가능(보상 💎10).
    await seedSave(page, {
      diamond: 100,
      questState: { dailyPoints: 20 },
    });
    await gotoFrozen(page);
    await tab(page, "quest").click();

    const box = page.getByTestId("quest-milestone-20");
    await expect(box).toHaveAttribute("data-state", "ready");
    await box.click();
    await expect(currencyDiamond(page)).toContainText("110");
    await expect(box).toHaveAttribute("data-state", "claimed");
  });

  test("완료·미수령 퀘스트가 있으면 하단 퀘스트 탭에 알림 뱃지가 보인다", async ({ page }) => {
    await seedSave(page, { questState: { progress: { daily_stage_3: 3 } } });
    await gotoFrozen(page);
    await expect(tabBadge(page, "quest")).toBeVisible();
  });
});
