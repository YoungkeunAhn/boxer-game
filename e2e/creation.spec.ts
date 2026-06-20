import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  createBoxer,
  hpNow,
  hpMax,
  statValue,
  SAVE_KEY,
} from "./fixtures";

// docs/browser-smoke-checklist.md - 생성과 자동 전투
// 주의: 치명타는 Math.random 기반(클럭 비제어)이라 처치 시점이 가변적이다.
// runFor 창은 "정확히 1처치"가 보장되도록 잡거나, 한 방 처치/고HP 시드로 결정성을 확보한다.
test.describe("생성과 자동 전투", () => {
  test("이름을 입력해 복서를 생성하면 1-1 숲 입구가 열린다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);
    await expect(page.getByText("CHAPTER 1 · STAGE 1")).toBeVisible();
    await expect(page.locator("#combat-title")).toHaveText("앤트");
    await expect(
      page.locator('section[aria-labelledby="combat-title"]').getByText("숲 입구"),
    ).toBeVisible();
  });

  test("타입·성별을 선택해 생성하면 상태창에 라벨이 표시되고 저장에 복원된다", async ({ page }) => {
    await gotoFrozen(page);
    await page.getByTestId("type-OUT_BOXER").click();
    await page.getByTestId("gender-FEMALE").click();
    await createBoxer(page, "카운터");

    await expect(page.getByTestId("boxer-identity")).toHaveText("아웃복서 · 여자");

    const saved = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved as string);
    expect(parsed.schemaVersion).toBe(5);
    expect(parsed.boxer.boxerType).toBe("OUT_BOXER");
    expect(parsed.boxer.gender).toBe("FEMALE");
  });

  test("기본 선택은 인파이터·남자다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);
    await expect(page.getByTestId("boxer-identity")).toHaveText("인파이터 · 남자");
  });

  test("초기값이 공격력 10, 1회/초, 치명타율 5%, 치명타 피해 2배, 골드 보너스 0%다", async ({
    page,
  }) => {
    await gotoFrozen(page);
    await createBoxer(page);
    await expect(statValue(page, "attackPower")).toHaveText("10");
    await expect(statValue(page, "attackSpeed")).toHaveText("1.0회/초");
    await expect(statValue(page, "critRate")).toHaveText("5%");
    await expect(statValue(page, "critDamage")).toHaveText("2.0배");
    await expect(statValue(page, "goldBonus")).toHaveText("+0%");
  });

  test("생성 즉시 공격하지 않고 약 1초 뒤 첫 공격이 발생한다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);
    const max = await hpMax(page);

    expect(await hpNow(page)).toBe(max); // 생성 직후 풀피
    await page.clock.runFor(900);
    expect(await hpNow(page)).toBe(max); // 1초 미만, 아직 공격 없음
    await page.clock.runFor(200);
    expect(await hpNow(page)).toBeLessThan(max); // 1초 경과 후 첫 공격
  });

  test("공격 버튼을 누르지 않아도 공격 주기마다 몬스터 HP가 감소한다", async ({ page }) => {
    // 1-3(68HP)은 잽(1초 쿨타임, 계수 0.3 → 3피해)만으로 두 번 쳐도 죽지 않아 연속 감소를 관찰할 수 있다.
    await seedSave(page, { chapter: 1, stage: 3 });
    await gotoFrozen(page);
    const max = await hpMax(page);

    await page.clock.runFor(1_000);
    const afterFirst = await hpNow(page);
    expect(afterFirst).toBeLessThan(max);

    await page.clock.runFor(1_000);
    expect(await hpNow(page)).toBeLessThan(afterFirst);
  });

  test("최근 피해/치명타 표시에 undefined·NaN·Infinity가 없다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);
    await page.clock.runFor(3_000);
    const meta = await page
      .locator('section[aria-labelledby="combat-title"]')
      .innerText();
    expect(meta).not.toMatch(/undefined|NaN|Infinity/);
    expect(meta).toMatch(/타격|치명타/);
  });

  test("몬스터 처치 시 골드와 총 처치 수가 늘고 다음 스테이지로 이동한다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);
    // 4종 쿨타임상 1-1(30HP)은 t=5000(잽 5타 15 + 스트레이트 15)에 처치되고, 1-2(45HP)는
    // t=7000까지 잽만으로는 죽지 않는다 → 창을 7초로 잡아 정확히 1처치를 보장한다.
    await page.clock.runFor(7_000);

    await expect(page.getByText("CHAPTER 1 · STAGE 2")).toBeVisible();
    await expect(statValue(page, "totalKills")).toHaveText("1마리");
    await expect(
      page.locator('section[aria-labelledby="boxer-status-title"]').getByText(/\d+ G/),
    ).not.toHaveText("0 G");
  });

  test("초과 피해가 다음 몬스터 HP를 미리 줄이지 않는다", async ({ page }) => {
    // 공격력을 높여 1-1을 한 방에 처치 → 다음 공격(+1000ms) 전에 멈춰 1-2 첫 상태 확인.
    await seedSave(page, { upgradeLevels: { attackPower: 30 } });
    await gotoFrozen(page);

    await page.clock.runFor(1_000);
    await expect(page.getByText("CHAPTER 1 · STAGE 2")).toBeVisible();
    expect(await hpNow(page)).toBe(await hpMax(page)); // 새 몬스터는 풀피(이월 없음)
  });
});
