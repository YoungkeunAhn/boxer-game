import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  createBoxer,
  enterBoss,
  hpNow,
  hpMax,
  freezeRandom,
} from "./fixtures";

// docs/browser-smoke-checklist.md - 데스크톱과 장시간 실행 (chromium-desktop 프로젝트)
test.describe("데스크톱·장시간 실행", () => {
  test("데스크톱 너비에서 세 카드가 모두 보이고 가로 스크롤이 없다", async ({ page }) => {
    await gotoFrozen(page);
    await createBoxer(page);

    await expect(page.locator("#boxer-status-title")).toBeVisible();
    await expect(page.locator("#combat-title")).toBeVisible();
    await expect(page.locator("#upgrade-title")).toBeVisible();
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return el.scrollWidth > el.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });

  test("공격 한 번당 HP가 한 번만 감소한다(타이머 중복 없음)", async ({ page }) => {
    // 105HP(1-4) 몬스터에 기본 공격력(10)으로 공격한다. 첫 4초는 잽(1초 쿨타임)만 ready이므로
    // 매 초 잽 한 번씩만 닿아야 한다(스트레이트는 5초). 몬스터 HP에 닿는 변수를 모두 제거한다:
    //   - RNG 동결(회피·치명타 실패) → 아웃복서 카운터(회피 성공 시 발동)·치명타 없음
    //   - 스킬 비움 → 액티브 스킬 피해 없음
    //   - 아웃복서 선택 → 인파이터 가드 카운터(몬스터 반격)가 끼지 않음
    // 그러면 잽 데미지는 결정적이다: 0.3 × 공격력 20(아웃복서 글래스캐논 ×2.0 보정) = 6.
    //   중복 타이머라면 한 주기에 2번 닿아 12가 된다.
    await freezeRandom(page);
    await seedSave(page, {
      chapter: 1,
      stage: 4,
      boxerType: "OUT_BOXER",
      equippedSkills: { active: [], passive: null },
    });
    await gotoFrozen(page);

    const max = await hpMax(page);
    let prev = await hpNow(page);
    expect(prev).toBe(max);

    for (let i = 0; i < 4; i += 1) {
      await page.clock.runFor(1_000);
      const current = await hpNow(page);
      const delta = prev - current;
      expect(delta).toBe(6);
      prev = current;
    }
  });

  test("장시간 방치 후 보스 실패·파밍 전이가 한 번만 발생한다", async ({ page }) => {
    // 치명타 RNG로도 처치되지 않도록 HP가 큰 3장 보스를 쓴다(시간초과를 결정적으로 보장).
    await enterBoss(page, { chapter: 3 });

    await page.clock.runFor(60_000); // 보스 제한 30초를 크게 초과

    // 단 한 번 파밍으로 전이해 같은 장 4스테이지에서 안정적으로 머문다.
    await expect(page.getByText("CHAPTER 3 · STAGE 4")).toBeVisible();
    await expect(page.getByTestId("combat-badge")).toHaveText("파밍 중");
  });

  test("핵심 플레이 동안 콘솔·페이지 오류가 없다", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });

    await gotoFrozen(page);
    await createBoxer(page);
    await page.clock.runFor(12_000); // 여러 스테이지 진행
    // 강화 한 번(골드 확보 후)
    await page.clock.runFor(8_000);

    expect(errors).toEqual([]);
  });
});
