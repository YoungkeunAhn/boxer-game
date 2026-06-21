import {
  test,
  expect,
  gotoFrozen,
  seedSave,
  enterBoss,
  type SeedOptions,
} from "./fixtures";

// 기대값은 게임 코드(stages.ts / formulas.ts / constants.ts)의 수식을 그대로 재현해 계산한다.
// 하드코딩이 아니라 동일 수식 파생이므로 밸런스 상수가 바뀌면 이 테스트도 함께 깨져 회귀를 잡는다.
const BASE_HP = [30, 45, 68, 105, 330] as const;
const MONSTER_BASE_ATTACK_POWER = 8;
const MONSTER_ATTACK_CHAPTER_MULTIPLIER = 1.5;
const MONSTER_ATTACK_STAGE_MULTIPLIERS = [1.0, 1.05, 1.1, 1.2, 1.6] as const;

function maxHp(chapter: number, stage: number): string {
  return Math.floor(BASE_HP[stage - 1] * 1.8 ** (chapter - 1)).toLocaleString();
}

function monsterAttack(chapter: number, stage: number): string {
  const raw =
    MONSTER_BASE_ATTACK_POWER *
    MONSTER_ATTACK_CHAPTER_MULTIPLIER ** (chapter - 1) *
    MONSTER_ATTACK_STAGE_MULTIPLIERS[stage - 1];
  return Math.max(1, Math.floor(raw)).toLocaleString();
}

async function seedAndGo(page: import("@playwright/test").Page, options: SeedOptions) {
  await seedSave(page, options);
  await gotoFrozen(page);
}

async function hasHorizontalScroll(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
}

// docs/browser-smoke-checklist.md - 전투 헤더(TASK-014)
test.describe("전투 헤더", () => {
  test("일반 스테이지(12-3)에서 STAGE 라벨·5칸 진행바·현재 칸 강조를 표시한다", async ({
    page,
  }) => {
    await seedAndGo(page, { chapter: 12, stage: 3 });

    await expect(page.getByTestId("combat-header")).toBeVisible();
    await expect(page.getByTestId("stage-label")).toHaveText("STAGE 12-3");

    const dots = page.getByTestId("stage-dot");
    await expect(dots).toHaveCount(5);

    // 현재 칸은 stage 3(인덱스 2)만 강조, 보스 칸은 5번째만.
    await expect(dots.nth(2)).toHaveAttribute("data-current", "true");
    await expect(dots.nth(0)).toHaveAttribute("data-current", "false");
    await expect(dots.nth(4)).toHaveAttribute("data-boss", "true");
    await expect(dots.nth(4)).toHaveAttribute("data-current", "false");
  });

  test("보스 스테이지 진입 시 5번째 칸이 보스·현재로 강조된다", async ({ page }) => {
    await enterBoss(page);

    const dots = page.getByTestId("stage-dot");
    await expect(dots).toHaveCount(5);
    await expect(dots.nth(4)).toHaveAttribute("data-boss", "true");
    await expect(dots.nth(4)).toHaveAttribute("data-current", "true");
    // 일반 칸은 현재가 아니다.
    await expect(dots.nth(3)).toHaveAttribute("data-current", "false");
    await expect(page.getByTestId("stage-label")).toHaveText("STAGE 1-5");
  });

  test("몬스터 카드가 이름·현재/최대 HP·공격력을 기대값대로 표시한다", async ({ page }) => {
    await seedAndGo(page, { chapter: 2, stage: 3 });

    // chapter 2 = 늑대 숲 테마, stage 3 = "울프 전사".
    await expect(page.getByTestId("monster-card-name")).toHaveText("울프 전사");
    await expect(page.getByTestId("monster-card-hp")).toContainText(`/ ${maxHp(2, 3)}`);
    await expect(page.getByTestId("monster-card-attack")).toHaveText(
      `🔥 ${monsterAttack(2, 3)}`,
    );
  });

  test("복서 카드가 이름·타입(라벨)·HP·공격력을 표시한다", async ({ page }) => {
    await seedAndGo(page, {
      name: "헤더복서",
      boxerType: "OUT_BOXER",
      gender: "FEMALE",
      chapter: 1,
      stage: 1,
    });

    await expect(page.getByTestId("boxer-card-name")).toHaveText("헤더복서");
    await expect(page.getByTestId("boxer-card-type")).toHaveText("아웃복서 · 여자");
    // HP는 런타임 boxerHp/boxerMaxHp에서 파생(현재/최대).
    await expect(page.getByTestId("boxer-card-hp")).toContainText("/");
    await expect(page.getByTestId("boxer-card-attack")).toContainText("🔥");
  });

  test("월드맵 버튼은 비활성이며 클릭해도 화면 전환이 일어나지 않는다", async ({ page }) => {
    await seedAndGo(page, { chapter: 1, stage: 2 });

    const worldMap = page.getByTestId("world-map-button");
    await expect(worldMap).toBeDisabled();
    await expect(worldMap).toHaveAttribute("aria-disabled", "true");

    // disabled 버튼은 force 클릭해도 무동작이어야 한다(헤더·전투 화면 유지).
    await worldMap.click({ force: true });
    await expect(page.getByTestId("combat-header")).toBeVisible();
    await expect(page.getByTestId("stage-label")).toHaveText("STAGE 1-2");
  });

  test("헤더가 가로 스크롤 없이 렌더된다(긴 챕터·큰 수치 포함)", async ({ page }) => {
    await seedAndGo(page, {
      name: "가나다라마바사아자차카타파하",
      chapter: 30,
      stage: 4,
      upgradeLevels: { attackPower: 200, maxHp: 200 },
    });

    await expect(page.getByTestId("combat-header")).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
