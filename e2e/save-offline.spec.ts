import {
  test,
  expect,
  gotoFrozen,
  reloadFrozen,
  installClock,
  freezeClock,
  seedSaveV2,
  seedLegacyV1,
  seedCorruptV2,
  createBoxer,
  enterBoss,
  hpNow,
  hpMax,
  statValue,
  sendToBackground,
  returnToForeground,
  LEGACY_SAVE_KEY,
} from "./fixtures";

const statusSection = (p: import("@playwright/test").Page) =>
  p.locator('section[aria-labelledby="boxer-status-title"]');

// docs/browser-smoke-checklist.md - 저장, 백그라운드와 오프라인 보상
test.describe("저장·백그라운드·오프라인", () => {
  test("새로고침 후 이름·골드·총 처치 수·위치가 복원된다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page, "챔피언");

    // 1-1, 1-2 처치 후 1-3 진행 중까지 진행한다.
    await page.clock.runFor(11_000);
    await expect(page.getByText("CHAPTER 1 · STAGE 3")).toBeVisible();
    const goldBefore = await statusSection(page).getByText(/\d+ G/).innerText();
    const killsBefore = await statValue(page, "totalKills").innerText();

    await reloadFrozen(page);

    await expect(statusSection(page).locator("#boxer-status-title")).toHaveText("챔피언");
    await expect(page.getByText("CHAPTER 1 · STAGE 3")).toBeVisible();
    await expect(statusSection(page).getByText(/\d+ G/)).toHaveText(goldBefore);
    await expect(statValue(page, "totalKills")).toHaveText(killsBefore);
  });

  test("저장을 불러오면 몬스터는 최대 HP에서 새로 시작한다", async ({ page }) => {
    await seedSaveV2(page, { chapter: 1, stage: 2, gold: 100 });
    await gotoFrozen(page);
    expect(await hpNow(page)).toBe(await hpMax(page));
  });

  test("백그라운드로 보내면 온라인 공격이 멈춘다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);
    const max = await hpMax(page);

    await sendToBackground(page);
    await page.clock.runFor(5_000);

    expect(await hpNow(page)).toBe(max); // 일시정지 중 공격 없음
  });

  test("복귀 시 반복 파밍 보상 요약이 한 번만 표시된다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);

    await sendToBackground(page);
    await page.clock.fastForward(60_000); // 60초 자리 비움
    await returnToForeground(page);

    const summary = page.getByText(/자리를 비운 동안 몬스터/);
    await expect(summary).toHaveCount(1);
    await expect(summary).toBeVisible();
  });

  test("보스 중 백그라운드 진입 후 복귀하면 같은 장 4스테이지로 돌아간다", async ({ page }) => {
    await enterBoss(page);

    await sendToBackground(page);
    await returnToForeground(page);

    await expect(page.getByText("CHAPTER 1 · STAGE 4")).toBeVisible();
    await expect(page.getByTestId("combat-badge")).toHaveText("파밍 중");
  });

  test("8시간을 넘는 이탈도 최대 8시간까지만 인정된다", async ({ page }) => {
    const nineHoursMs = 9 * 60 * 60 * 1_000;
    await seedSaveV2(page, { chapter: 1, stage: 1, savedAtMs: Date.parse("2026-01-01T00:00:00.000Z") - nineHoursMs });
    await gotoFrozen(page);

    // 8시간 상한: 처치 10,080 / 골드 50,400 (9시간이면 더 큼).
    await expect(page.getByText(/자리를 비운 동안 몬스터 10,080마리/)).toBeVisible();
    await expect(page.getByText(/50,400 골드/)).toBeVisible();
  });

  test("v1 저장이 있으면 삭제하지 않고 호환 불가·새 게임 안내가 표시된다", async ({ page }) => {
    await seedLegacyV1(page);
    await gotoFrozen(page);

    await expect(page.getByRole("alert")).toContainText("이전 버전 저장 데이터");
    await expect(page.locator("#boxer-name")).toBeVisible();

    const legacy = await page.evaluate((key) => window.localStorage.getItem(key), LEGACY_SAVE_KEY);
    expect(legacy).not.toBeNull(); // v1 저장은 보존돼야 한다
  });

  test("손상되거나 지원하지 않는 v2 저장은 오류 없이 새 게임 화면을 표시한다", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await seedCorruptV2(page, "{이건 JSON 아님");
    await gotoFrozen(page);

    await expect(page.locator("#boxer-name")).toBeVisible();
    await expect(page.getByRole("button", { name: "커리어 시작하기" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("저장소 쓰기 실패 시 현재 세션은 유지되고 유실 가능성이 안내된다", async ({ page }) => {
    // localStorage.setItem이 항상 던지도록 만들어 저장 실패를 강제한다.
    await installClock(page);
    await page.addInitScript(() => {
      const proto = Object.getPrototypeOf(window.localStorage);
      proto.setItem = () => {
        throw new Error("QuotaExceeded(test)");
      };
    });
    await page.goto("/");
    await freezeClock(page);

    await createBoxer(page);

    await expect(page.getByRole("alert")).toContainText("저장에 실패");
    await expect(page.locator("#combat-title")).toBeVisible(); // 세션은 계속 유지
  });
});
