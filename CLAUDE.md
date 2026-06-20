# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`복서키우기` (Boxer Idle) — an idle auto-battler. A boxer auto-attacks monsters, earns gold on kill, gold buys stat upgrades, upgrades break through bosses, clearing a boss advances to the next chapter. Target platform is an **Apps-in-Toss (앱인토스) WebView mini-app** built with React 19 + Vite + TypeScript. Most docs and in-code messages are in Korean; keep that convention.

## Commands

- `npm run dev` — Granite dev server (Apps-in-Toss). `npm run dev:web` runs plain Vite.
- `npm run build` — Apps-in-Toss build (`ait build`). `npm run build:web` runs `tsc -b && vite build`.
- `npm test` — Vitest once. `npm run test:watch` for watch mode.
- Run a single test file: `npx vitest run src/game/combat.test.ts`. Filter by name: `npx vitest run -t "보스 타임아웃"`.
- **Verification gate (use this instead of running tsc/vitest directly):**
  - `node tools/check.mjs fast "<changed file>" ["<file2>" ...]` — selects the minimal checks for the changed files (typecheck + related tests, build only when bundle inputs like CSS/`index.html` change). Pass every file you changed.
  - `node tools/check.mjs full` — full typecheck + all tests + production build. Use for config/dependency/bundle changes and final release verification.
  - `node tools/check.mjs plan "<file>"` — print which checks would run without executing them.
  - `check.mjs` auto-promotes to `full` when `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*`, `vitest.config.ts`, or `tools/check.mjs` change. Doc-only changes (`.md`, `docs/`) run nothing.
- **Browser E2E (Playwright, opt-in — NOT part of `check.mjs`):** automates `docs/process/browser-smoke-checklist.md`. The fast/full gate above covers pure logic; run E2E **in addition** when you change UI components, CSS, the store, or anything affecting on-screen game behavior, and as the final pre-release check (it replaces the manual click-through).
  - `npm run e2e` — run the suite (chromium-desktop + mobile-360). `webServer` auto-runs `build:web → preview:verify` on `127.0.0.1:4173`.
  - `npm run e2e:install` — first-time only, downloads Chromium. `npm run e2e:report` / `npm run e2e:ui` — inspect failures / debug interactively.
  - `npm run check:e2e` — `check.mjs full` + E2E together (release gate).
  - Specs live in `e2e/*.spec.ts` (units are `src/**/*.test.ts`; `vitest.config.ts` keeps the two from cross-collecting). See `docs/process/browser-smoke-checklist.md` "자동화 현황" for which items stay manual.
- **`dev` workflow (multi-agent dev cycle):** `/dev TASK-004` runs one task through plan → implement (on a new `feat/...` branch) → verify → review. User-triggered only; see `docs/process/dev-workflow.md` for args, branch naming, and the operating model.
- **명령·스킬 한눈에:** 어떤 명령/스킬/게이트를 언제 쓰는지 모르겠으면 `docs/process/workflow-index.md`(워크플로우 인덱스)를 먼저 본다.

## Reading files (project rule from AGENTS.md)

Source files may have mixed/non-UTF-8 encodings and Korean paths. To read file *contents* in the shell, use `python tools/read-md.py "<path>"` (multiple paths allowed; `--show-encoding` to inspect). Use `rg --files` only to locate paths. The Read tool handles encoding fine for normal work — this rule matters mainly for shell-based reads.

## Architecture

Strict separation between pure game logic, the store, and UI. Logic never touches React, the DOM, `Date.now`, `Math.random`, or timers directly — those are **injected**.

- **`src/game/` — pure logic (the heart of the codebase).** All stat/damage/reward/cost/stage-transition/offline math is pure functions taking explicit `now`/`randomValue` args.
  - `formulas.ts` — stat curves, damage, crit, gold, upgrade cost (`1.25^level`), purchase logic. All numbers clamped via `MAX_SAFE_GAME_INTEGER` to avoid overflow.
  - `combat.ts` — one attack step (`resolveAttack`), boss timeout (`resolveBossTimeout`), boss retry, and offline progress (`calculateOfflineProgress`). Functions return new immutable `CombatRuntime`/`Boxer` objects.
  - `constants.ts` — balance numbers, `SCHEMA_VERSION`, `BALANCE_VERSION`, boss time limit, offline cap (8h).
  - `types.ts` — all shared types, including `SaveDataV2`/`SaveData`.
- **`src/data/stages.ts` — content + stage math.** Stages are procedurally derived, not hardcoded per stage: 5 stages/chapter (stage 5 = boss, stage 4 = the "farming" fallback), HP/gold scale by chapter (`1.8^`, `1.6^`), themes cycle via `STAGE_THEMES`. Always go through `getStageDefinition` / `getNextStagePosition` / `getPreviousNormalStagePosition`.
- **`src/stores/gameStore.ts` — Zustand store, the only stateful orchestrator.** `createGameStore(dependencyOverrides)` injects `now`/`random`/`schedule`/`cancelSchedule`/`load`/`save`/`clear` (defaults wire to `Date.now`, `Math.random`, `setTimeout`, real save module). `useGameStore` is the default-wired singleton; tests build isolated stores with fake deps. **Exactly one auto-battle timer** (`scheduleNext`/`clearTimer`); each tick calls `advanceCombat` which loops `resolveAttack` over elapsed time so it stays correct after lag or backgrounding. Saves are throttled (`SAVE_THROTTLE_MS`) except forced saves on kill-boss/timeout/lifecycle events.
- **`src/game/save.ts` — persistence, isolated and versioned.** localStorage with temp-key write-then-commit to avoid corruption. `loadGame` returns a discriminated `LoadGameResult` (`loaded`/`empty`/`legacy`/`invalid`/`unavailable`); every field is validated by type guards on load. Save key is versioned (`boxer-game.save.v2`); v1 is detected as `legacy`.
- **UI: `src/pages/HomePage.tsx`, `src/components/`.** Presentational, driven entirely by the store. CSS Modules (`*.module.css`) + `src/styles/global.css`.

### When changing game rules or balance

Logic, balance, and save format are coupled by version numbers. If you change formulas, stage data, or the save shape, bump `BALANCE_VERSION` / `SCHEMA_VERSION` in `constants.ts` as appropriate (a mismatched save is rejected as `invalid` on load), update the colocated `*.test.ts`, and update the relevant docs under `docs/`. Per AGENTS.md: keep MVP scope (no PVP, guild, season pass, payments, ads); mark unconfirmed items `TODO` and pre-verification design calls `가정:`.

### 변경 전 영향도 (coupling) — 손대기 전에 1회

이 레포는 버전으로 묶인 강한 커플링이 있다. `formulas.ts` / `stages.ts` / `types.ts`(`SaveData`) / `constants.ts` 중 하나를 바꾸면 보통 아래로 파급된다. **밸런스·스키마를 손대기 전에** 역의존성을 한 번 훑고 위험도(🔴 결제성/세이브 호환성 직결 · 🟡 표시·진행 영향 · 🟢 국소)를 매긴다.

- `formulas.ts` / `constants.ts`(밸런스) → `combat.ts` 사용처 → 콜로케이트 `*.test.ts` → `BALANCE_VERSION` → `docs/`
- `types.ts`(`SaveData`/`Boxer` shape) / `save.ts` → `gameStore.ts` 직렬화·역직렬화 → 타입가드 → `SCHEMA_VERSION` + 저장 키 접미사(`boxer-game.save.vN`) → `combat.test.ts`/스토어 테스트
- `stages.ts` → `getStageDefinition`/`getNextStagePosition` 호출처 → 스토어 전이 로직 → 스테이지 테스트

### 변경 후 체크리스트 (every change)

커밋(또는 `/dev` 리뷰) 전에 대조한다. 어기면 곧 버그다.

- [ ] 순수 로직(`src/game/`)에 React/DOM/`Date.now`/`Math.random`/타이머를 직접 넣지 않았다(전부 주입).
- [ ] 능력치·피해·보상·비용·전이·정산은 **새 객체를 반환하는 순수 함수**다(기존 객체 변이 금지).
- [ ] 수치 계산은 `MAX_SAFE_GAME_INTEGER`로 클램프된다.
- [ ] 스테이지는 하드코딩이 아니라 `getStageDefinition`/`getNextStagePosition`/`getPreviousNormalStagePosition`를 거친다.
- [ ] 수식·밸런스 변경 → `BALANCE_VERSION` 범프. 저장 shape 변경 → `SCHEMA_VERSION` 범프 + 저장 키 접미사 일치(옛 저장은 삭제 말고 `legacy`/`invalid` 안내).
- [ ] 콜로케이트 `*.test.ts` 갱신. 미확정 수치는 `가정:` 주석으로 두고 테스트/기획 문서와 같은 값으로 동기화.
- [ ] `node tools/check.mjs fast "<바뀐 파일들>"` green. UI·CSS·스토어를 건드렸으면 `npm run e2e`도 통과.
- [ ] MVP 경계(PVP·길드·랭킹·결제·광고·장비·서버동기화) 밖을 손대지 않았다.

### 개발 원칙 (Karpathy / surgical)

요구된 것만, 최소 변경으로. 불필요한 추상화·미리 만드는 일반화·요청되지 않은 기능 추가를 피한다. 모든 변경에는 검증 가능한 성공 기준(테스트·게이트·수동 확인 절차)을 둔다.

## Tests

Vitest, colocated as `*.test.ts` next to the unit. Pure-logic modules are tested directly; the store is tested by constructing `createGameStore` with deterministic fake `now`/`random`/`schedule`. There is no DOM/component test setup — keep new logic in pure functions so it's testable without React.

## Config notes

- `granite.config.ts` is the Apps-in-Toss app config (appName `boxer-idle`, displayName `복서키우기`). Web build command there mirrors `build:web`.
- Two TS projects: `tsconfig.app.json` (src, strict, no-emit) and `tsconfig.node.json` (tooling), composed by `tsconfig.json`.
- `boxer-idle.ait` and `.granite/` are build artifacts (gitignored).
