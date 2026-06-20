import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// 단위 테스트는 src 아래 *.test.ts(x)로만 한정한다.
// e2e/*.spec.ts는 Playwright가 실행하므로 Vitest 수집에서 제외한다.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts?(x)"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
