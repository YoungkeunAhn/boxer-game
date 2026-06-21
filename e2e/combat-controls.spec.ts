import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  autoToggle,
  speedToggle,
  manualAttackButton,
  skillButton,
  type SeedOptions,
} from "./fixtures";

// docs/browser-smoke-checklist.md - 전투 컨트롤(TASK-015)
// clock/RNG는 fixtures의 freezeClock + 결정적 진행으로 안정화한다. 배속의 게임 시간 누적은
// store 단위 테스트가 1차 검증(밸런스 불변), E2E는 컨트롤 동작·표시만 결정적으로 확인한다.

// 몬스터 카드 HP 텍스트("❤ 1,234 / 5,678")에서 현재 HP만 숫자로 뽑는다.
async function monsterHp(page: import("@playwright/test").Page): Promise<number> {
  const text = await page.getByTestId("monster-card-hp").innerText();
  const current = text.replace("❤", "").split("/")[0].trim().replace(/,/g, "");
  return Number(current);
}

async function seedAndGo(page: import("@playwright/test").Page, options: SeedOptions) {
  await seedSave(page, options);
  await gotoFrozen(page);
}

test.describe("전투 컨트롤", () => {
  test("AUTO 토글이 ON/OFF로 전환되고 aria-pressed가 반영된다", async ({ page }) => {
    await seedAndGo(page, { chapter: 1, stage: 1, gold: 0 });

    const toggle = autoToggle(page);
    await expect(toggle).toHaveText(/AUTO ON/);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await toggle.click();
    await expect(toggle).toHaveText(/AUTO OFF/);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

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

  test("AUTO ON에서는 수동 공격 버튼이 비활성이다", async ({ page }) => {
    await seedAndGo(page, { chapter: 1, stage: 1 });
    await expect(manualAttackButton(page)).toBeDisabled();
    await expect(skillButton(page)).toBeDisabled();
  });

  test("AUTO OFF에서 수동 공격 버튼을 누르면 몬스터 HP가 감소한다(결정적)", async ({ page }) => {
    // 기본 강화(공격력 레벨 0)로 시작해 한 번 탭(첫 잽 3피해)으로는 처치되지 않게 한다(stage 1-1, HP 30).
    // 클럭은 동결돼 자동 진행이 없으므로 변화는 오직 수동 탭으로만 발생한다.
    await seedAndGo(page, { chapter: 1, stage: 1 });

    await autoToggle(page).click(); // MANUAL
    await expect(manualAttackButton(page)).toBeEnabled();

    const before = await monsterHp(page);
    await manualAttackButton(page).click();
    // 첫 잽 = floor(10×0.3)=3 → 30 → 27. 같은 스테이지에서 HP만 감소(전이 없음).
    await expect.poll(() => monsterHp(page)).toBe(before - 3);
  });

  test("AUTO OFF로 전환하면 자동 전투가 멈춰 몬스터 HP가 동결된다", async ({ page }) => {
    await seedAndGo(page, { chapter: 1, stage: 1 });
    await autoToggle(page).click(); // MANUAL

    const hp = await monsterHp(page);
    // 입력 없이 시간을 진행시켜도(동결 클럭 + MANUAL) HP가 변하지 않는다.
    await page.clock.runFor(5_000);
    expect(await monsterHp(page)).toBe(hp);
  });
});
