import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  createBoxer,
  statValue,
  upgradeButton,
  hpBar,
} from "./fixtures";

// docs/browser-smoke-checklist.md - 강화
test.describe("강화", () => {
  test("공격 탭의 다섯 강화에 현재 값·레벨·다음 값·비용이 표시된다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);

    // 기본 활성 그룹은 공격 계열.
    await expect(page.getByTestId("upgrade-tab-attack")).toHaveAttribute("aria-selected", "true");

    for (const key of [
      "attackPower",
      "attackSpeed",
      "critRate",
      "critDamage",
      "goldBonus",
    ] as const) {
      const row = page.getByTestId(`upgrade-row-${key}`);
      await expect(row).toBeVisible();
      await expect(row.getByText("Lv.")).toBeVisible();
      await expect(upgradeButton(page, key)).toBeVisible();
    }
  });

  test("방어 탭을 누르면 방어 4종이 노출되고 골드 충분 시 레벨이 1 오른다", async ({ page }) => {
    await seedSave(page, { gold: 100000 });
    await gotoFrozen(page);

    const defenseKeys = ["maxHp", "defense", "dodge", "counter"] as const;

    // 기본(공격 탭)에서는 방어 행이 숨겨져 있다.
    for (const key of defenseKeys) {
      await expect(page.getByTestId(`upgrade-row-${key}`)).toBeHidden();
    }

    await page.getByTestId("upgrade-tab-defense").click();
    await expect(page.getByTestId("upgrade-tab-defense")).toHaveAttribute("aria-selected", "true");

    for (const key of defenseKeys) {
      const row = page.getByTestId(`upgrade-row-${key}`);
      await expect(row).toBeVisible();
      await expect(row.getByText("Lv. 0")).toBeVisible();
      const button = upgradeButton(page, key);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      await button.click();
      await expect(row.getByText("Lv. 1")).toBeVisible();
    }
  });

  test("각 칸에 다음 레벨 증가량(+표시)이 보이고 MAX에서는 증가량이 사라진다", async ({ page }) => {
    await seedSave(page, {
      gold: 1000,
      upgradeLevels: { attackSpeed: 40 }, // 상한(5.0회/초) 도달
    });
    await gotoFrozen(page);

    // 공격력은 상한이 없어 다음 레벨 증가량이 +표시로 보인다.
    await expect(page.getByTestId("upgrade-delta-attackPower")).toContainText("+");

    // 상한(MAX)인 공격속도는 증가량 표기가 없고 버튼이 MAX다.
    await expect(page.getByTestId("upgrade-delta-attackSpeed")).toHaveCount(0);
    await expect(upgradeButton(page, "attackSpeed")).toHaveText("MAX");
  });

  test("공격력 0레벨 비용은 10골드, 강화 후 피해가 floor(10×1.2)=12로 오른다", async ({
    page,
  }) => {
    await seedSave(page, { gold: 1000 });
    await gotoFrozen(page);

    await expect(upgradeButton(page, "attackPower")).toHaveText("10 G");
    await expect(statValue(page, "attackPower")).toHaveText("10");

    await upgradeButton(page, "attackPower").click();

    await expect(statValue(page, "attackPower")).toHaveText("12");
    await expect(
      page.locator('section[aria-labelledby="boxer-status-title"]').getByText(/\d+ G/),
    ).toHaveText("990 G");
  });

  test("골드가 부족하면 버튼이 비활성화되고 잔액이 음수가 되지 않는다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page); // 초기 골드 0

    await expect(upgradeButton(page, "attackPower")).toBeDisabled();
    await expect(
      page.locator('section[aria-labelledby="boxer-status-title"]').getByText(/\d+ G/),
    ).toHaveText("0 G");
  });

  test("공격속도를 강화하면 표시 속도가 빨라지고 자동 공격이 단일 스트림으로 진행된다", async ({
    page,
  }) => {
    await seedSave(page, { gold: 1000 });
    await gotoFrozen(page);

    await expect(statValue(page, "attackSpeed")).toHaveText("1.0회/초");
    await upgradeButton(page, "attackSpeed").click();
    await expect(statValue(page, "attackSpeed")).toHaveText("1.1회/초");

    // 강화 후에도 공격이 정상 진행되고(타이머 중복 없이) HP가 줄어든다.
    const max = Number(await hpBar(page).getAttribute("aria-valuemax"));
    await page.clock.runFor(1000);
    const after = Number(await hpBar(page).getAttribute("aria-valuenow"));
    expect(after).toBeLessThan(max);
    // 1주기 동안 한 번의 공격만 반영(중복 타이머면 2회 이상 감소). 1.1회/초 → 1타 데미지 10~20.
    expect(max - after).toBeLessThanOrEqual(20);
  });

  test("상한(5.0회/초, 50%, 5.0배, +500%)에서 MAX 상태가 표시된다", async ({ page }) => {
    await seedSave(page, {
      gold: 1000,
      upgradeLevels: { attackSpeed: 40, critRate: 45, critDamage: 30, goldBonus: 100 },
    });
    await gotoFrozen(page);

    await expect(statValue(page, "attackSpeed")).toHaveText("5.0회/초");
    await expect(statValue(page, "critRate")).toHaveText("50%");
    await expect(statValue(page, "critDamage")).toHaveText("5.0배");
    await expect(statValue(page, "goldBonus")).toHaveText("+500%");

    for (const key of ["attackSpeed", "critRate", "critDamage", "goldBonus"] as const) {
      await expect(upgradeButton(page, key)).toHaveText("MAX");
      await expect(upgradeButton(page, key)).toBeDisabled();
    }
  });

  test("빠른 연속 탭으로 비용·레벨이 중복 반영되지 않는다", async ({ page }) => {
    await seedSave(page, { gold: 10 }); // 공격력 1회 강화 비용만 보유
    await gotoFrozen(page);

    const button = upgradeButton(page, "attackPower");
    await button.click();
    await button.click({ force: true }).catch(() => {});

    // 레벨은 한 번만 올라야 한다(12, 14 아님).
    await expect(statValue(page, "attackPower")).toHaveText("12");
    await expect(button).toBeDisabled(); // 잔액 0, 다음 비용 13G
  });
});
