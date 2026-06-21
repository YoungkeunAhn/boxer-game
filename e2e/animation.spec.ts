import { test, expect, gotoFrozen, seedSave, autoToggle, manualAttackButton } from "./fixtures";
import type { Page } from "@playwright/test";

// docs/browser-smoke-checklist.md - 타입별 6포즈 애니메이션(TASK-018)
// 순수 표현 계층이라 픽셀 대신 BoxerFigure의 data-속성을 검증한다.
//   (1) 타입별 포즈 세트 렌더, (2) 타입 전환 시 data-boxer-type/포즈 매핑 교체,
//   (3) 카운터 유발(아웃복서 회피→COUNTER) 시 data-animation-key='boxer_counter'/data-counter='true'.

const figure = (page: Page) => page.getByTestId("boxer-figure");

// 회피 판정(random < dodge)을 결정적으로 만들기 위해 Math.random을 낮은 값으로 고정한다.
//   스토어 기본 의존성은 Math.random을 그대로 쓰므로(gameStore DEFAULT_DEPENDENCIES) goto 전에 덮어쓴다.
//   0.001 < dodge(아웃복서 캡 0.6)라 몬스터 공격마다 회피→COUNTER가 보장된다.
async function pinLowRandom(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Math.random = () => 0.001;
  });
}

test.describe("타입별 6포즈 애니메이션", () => {
  test("인파이터로 시작하면 인파이터 타입·idle 포즈(POSE_1)로 렌더된다", async ({ page }) => {
    await seedSave(page, { boxerType: "INFIGHTER", gender: "MALE" });
    await gotoFrozen(page);

    const fig = figure(page);
    await expect(fig).toBeVisible();
    await expect(fig).toHaveAttribute("data-boxer-type", "INFIGHTER");
    await expect(fig).toHaveAttribute("data-effect", "shake");
    // 동결 클럭이라 첫 공격 전에는 idle(POSE_1).
    await expect(fig).toHaveAttribute("data-pose", "POSE_1");
    await expect(fig).toHaveAttribute("data-animation-key", "boxer_idle");
    await expect(fig).toHaveAttribute("data-reach", "SHORT");
  });

  test("수동 공격 1회 후 인파이터 숏 잽(boxer_left_jab/POSE_3/SHORT)이 표시된다", async ({ page }) => {
    await seedSave(page, { boxerType: "INFIGHTER", gender: "MALE", chapter: 1, stage: 1 });
    await gotoFrozen(page);

    await autoToggle(page).click(); // MANUAL — 입력으로만 진행.
    await manualAttackButton(page).click();

    const fig = figure(page);
    // 첫 복서 공격은 잽(우선순위상 1초 쿨다운이 가장 먼저 ready).
    await expect(fig).toHaveAttribute("data-animation-key", "boxer_left_jab");
    await expect(fig).toHaveAttribute("data-pose", "POSE_3");
    await expect(fig).toHaveAttribute("data-reach", "SHORT");
  });

  test("타입 전환(인파→아웃) 시 data-boxer-type와 6포즈 리치(SHORT→LONG)가 함께 교체된다", async ({ page }) => {
    await seedSave(page, { boxerType: "INFIGHTER", gender: "MALE" });
    await gotoFrozen(page);

    const fig = figure(page);
    await expect(fig).toHaveAttribute("data-boxer-type", "INFIGHTER");
    await expect(fig).toHaveAttribute("data-reach", "SHORT");
    await expect(fig).toHaveAttribute("data-effect", "shake");

    // 아웃복서 여자 카드로 전환(TASK-017 연동).
    await page.getByTestId("type-switch-card-OUT_BOXER-FEMALE").click();

    await expect(fig).toHaveAttribute("data-boxer-type", "OUT_BOXER");
    await expect(fig).toHaveAttribute("data-gender", "FEMALE");
    // 아웃파이터는 롱 리치·청 잔상 톤으로 6포즈 세트가 교체된다.
    await expect(fig).toHaveAttribute("data-reach", "LONG");
    await expect(fig).toHaveAttribute("data-effect", "afterimage");
  });

  test("아웃복서 회피 성공 시 카운터 연출(boxer_counter/data-counter=true)이 표시된다", async ({ page }) => {
    await pinLowRandom(page);
    // 아웃복서 + 회피 강화로 회피율을 높인다(random=0.001이라 캡 회피율로도 항상 성공).
    await seedSave(page, {
      boxerType: "OUT_BOXER",
      gender: "FEMALE",
      chapter: 1,
      stage: 1,
      upgradeLevels: { dodge: 55, counter: 50 },
    });
    await gotoFrozen(page);

    const fig = figure(page);
    await expect(fig).toHaveAttribute("data-boxer-type", "OUT_BOXER");

    // 몬스터 공격(2000ms 간격)이 발생하도록 자동 전투 시간을 진행한다.
    //   첫 몬스터 공격에서 회피(MISS) → 아웃복서라 COUNTER → recentDefense.outcome='COUNTER'.
    await page.clock.runFor(2_200);

    await expect(fig).toHaveAttribute("data-animation-key", "boxer_counter");
    await expect(fig).toHaveAttribute("data-counter", "true");
    await expect(page.getByTestId("boxer-figure-counter")).toBeVisible();
  });
});
