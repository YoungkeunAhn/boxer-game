import { test, expect, gotoFrozen, seedSave, SAVE_KEY, SCHEMA_VERSION } from "./fixtures";

// docs/browser-smoke-checklist.md - 파이터 타입 전환(TASK-017)
// 상태 전환(라벨·전용 스킬 표시·선택 카드 data-current)까지만 검증한다.
// 외형 스프라이트(6포즈) 교체는 TASK-018 소관이라 픽셀은 검증하지 않는다.
test.describe("파이터 타입 전환", () => {
  test("인파이터 남 → 아웃복서 여 전환 시 라벨·전용 스킬·선택 카드가 갱신된다", async ({ page }) => {
    // 인파이터 남자로 시작.
    await seedSave(page, { boxerType: "INFIGHTER", gender: "MALE" });
    await gotoFrozen(page);

    const panel = page.getByTestId("type-switch-panel");
    await expect(panel).toBeVisible();

    // 초기 선택 카드: 인파이터 남자, data-current=true.
    const infMale = page.getByTestId("type-switch-card-INFIGHTER-MALE");
    const outFemale = page.getByTestId("type-switch-card-OUT_BOXER-FEMALE");
    await expect(infMale).toHaveAttribute("data-current", "true");
    await expect(outFemale).toHaveAttribute("data-current", "false");

    // 식별 라벨도 인파이터 · 남자.
    await expect(page.getByTestId("boxer-identity")).toHaveText("인파이터 · 남자");
    await expect(page.getByTestId("boxer-card-type")).toHaveText("인파이터 · 남자");
    // 현재 카드의 전용 스킬은 인파이터 세트(예: 뎀프시롤).
    await expect(page.getByTestId("type-switch-skills-INFIGHTER-MALE")).toContainText("뎀프시롤");

    // 아웃복서 여자 카드 클릭 → 전환.
    await outFemale.click();

    // 선택 카드 data-current가 옮겨간다.
    await expect(outFemale).toHaveAttribute("data-current", "true");
    await expect(infMale).toHaveAttribute("data-current", "false");

    // 식별 라벨·복서 카드 타입이 아웃복서 · 여자로 갱신.
    await expect(page.getByTestId("boxer-identity")).toHaveText("아웃복서 · 여자");
    await expect(page.getByTestId("boxer-card-type")).toHaveText("아웃복서 · 여자");
    await expect(page.getByTestId("type-switch-current")).toContainText("아웃복서 · 여자");
    // 선택된 아웃복서 카드의 전용 스킬은 아웃복서 세트(예: 고스트스텝).
    await expect(page.getByTestId("type-switch-skills-OUT_BOXER-FEMALE")).toContainText("고스트스텝");

    // 저장 스냅샷에도 새 타입/성별이 반영된다(현행 SCHEMA 기준).
    const saved = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
    const parsed = JSON.parse(saved as string);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.boxer.boxerType).toBe("OUT_BOXER");
    expect(parsed.boxer.gender).toBe("FEMALE");
  });
});
