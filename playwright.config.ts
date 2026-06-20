import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// 브라우저 스모크 체크리스트(docs/browser-smoke-checklist.md)를 자동 회귀 검증한다.
// 고정 프로덕션 프리뷰(build:web -> preview:verify, 0.0.0.0:4173 strictPort)를 그대로 사용한다.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // dist/를 서빙하므로 반드시 빌드 후 프리뷰를 띄운다. strictPort라 포트 충돌 시 우회 없이 실패한다.
  webServer: {
    command: "npm.cmd run build:web && npm.cmd run preview:verify",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile-360",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
      testIgnore: /desktop-longrun\.spec\.ts/,
    },
  ],
});
