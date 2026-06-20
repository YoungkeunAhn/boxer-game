#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModulesDir = path.join(rootDir, "node_modules");

const executables = {
  tsc: path.join(nodeModulesDir, "typescript", "bin", "tsc"),
  vite: path.join(nodeModulesDir, "vite", "bin", "vite.js"),
  vitest: path.join(nodeModulesDir, "vitest", "vitest.mjs"),
};

const requestedMode = process.argv[2] ?? "fast";
const cliPaths = process.argv.slice(3).filter((value) => value !== "--");
const validModes = new Set(["fast", "full", "plan"]);

if (["--help", "-h", "help"].includes(requestedMode)) {
  printHelp();
  process.exit(0);
}

if (!validModes.has(requestedMode)) {
  console.error(`[check] 알 수 없는 모드: ${requestedMode}`);
  printHelp();
  process.exit(2);
}

const changedPaths = normalizePaths(cliPaths.length > 0 ? cliPaths : detectChangedPaths());
const plan = createPlan(requestedMode, changedPaths);

printPlan(plan, cliPaths.length > 0);

if (requestedMode === "plan") {
  process.exit(0);
}

const startedAt = Date.now();
const firstResults = await Promise.all(plan.first.map(runTask));
const firstFailed = firstResults.some((code) => code !== 0);

if (firstFailed) {
  console.error(`[check] 실패 (${formatDuration(Date.now() - startedAt)})`);
  process.exit(1);
}

for (const task of plan.then) {
  const code = await runTask(task);
  if (code !== 0) {
    console.error(`[check] 실패 (${formatDuration(Date.now() - startedAt)})`);
    process.exit(1);
  }
}

console.log(`[check] 통과 (${formatDuration(Date.now() - startedAt)})`);

function createPlan(mode, paths) {
  if (mode === "full") {
    return fullPlan(paths, "full 모드");
  }

  if (paths.length === 0) {
    return {
      mode: "fast",
      reason: "변경 경로를 찾지 못해 전체 단위 테스트와 타입 검사를 실행",
      paths,
      first: [typecheckTask(), allTestsTask()],
      then: [],
    };
  }

  if (paths.some(requiresFullCheck)) {
    return fullPlan(paths, "빌드/테스트 설정 변경을 감지해 full로 승격");
  }

  const sourcePaths = paths.filter((filePath) => /\.(ts|tsx)$/.test(filePath));
  const bundlePaths = paths.filter((filePath) =>
    filePath === "index.html" || /\.(css|scss|sass|less)$/.test(filePath),
  );
  const hasUnknownCodePath = paths.some(
    (filePath) =>
      !isDocumentationPath(filePath) &&
      !sourcePaths.includes(filePath) &&
      !bundlePaths.includes(filePath),
  );

  const first = [];
  if (sourcePaths.length > 0 || hasUnknownCodePath) {
    first.push(typecheckTask());
  }
  if (sourcePaths.length > 0) {
    first.push(relatedTestsTask(sourcePaths));
  } else if (hasUnknownCodePath) {
    first.push(allTestsTask());
  }
  if (bundlePaths.length > 0) {
    first.push(buildTask());
  }

  return {
    mode: "fast",
    reason:
      first.length === 0
        ? "문서/에이전트 지침만 변경되어 프로젝트 검사를 생략"
        : "변경 종류에 맞는 최소 검사를 선택",
    paths,
    first,
    then: [],
  };
}

function fullPlan(paths, reason) {
  return {
    mode: "full",
    reason,
    paths,
    first: [typecheckTask(), allTestsTask()],
    then: [buildTask()],
  };
}

function typecheckTask() {
  return {
    label: "TypeScript",
    script: executables.tsc,
    args: ["-b", "--pretty", "false"],
  };
}

function allTestsTask() {
  return {
    label: "Vitest 전체",
    script: executables.vitest,
    args: ["run", "--configLoader", "runner"],
  };
}

function relatedTestsTask(paths) {
  return {
    label: "Vitest 관련",
    script: executables.vitest,
    args: [
      "related",
      ...paths,
      "--run",
      "--passWithNoTests",
      "--configLoader",
      "runner",
    ],
  };
}

function buildTask() {
  return {
    label: "Vite 빌드",
    script: executables.vite,
    args: ["build", "--configLoader", "runner"],
  };
}

function runTask(task) {
  const startedAt = Date.now();
  console.log(`[check] 시작: ${task.label}`);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [task.script, ...task.args], {
      cwd: rootDir,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", (error) => {
      console.error(`[check] ${task.label} 실행 오류: ${error.message}`);
      resolve(1);
    });
    child.on("close", (code) => {
      const exitCode = code ?? 1;
      const result = exitCode === 0 ? "통과" : `실패(${exitCode})`;
      console.log(`[check] ${result}: ${task.label} (${formatDuration(Date.now() - startedAt)})`);
      resolve(exitCode);
    });
  });
}

function detectChangedPaths() {
  const commands = [
    ["-c", "core.quotepath=false", "diff", "--name-only", "--diff-filter=ACMR"],
    ["-c", "core.quotepath=false", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    ["-c", "core.quotepath=false", "ls-files", "--others", "--exclude-standard"],
  ];
  const detected = [];

  for (const args of commands) {
    try {
      const output = execFileSync("git", args, {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      detected.push(...output.split(/\r?\n/));
    } catch {
      // Git 저장소가 아니거나 Git을 사용할 수 없으면 안전한 기본 검사로 폴백한다.
    }
  }

  return detected;
}

function normalizePaths(paths) {
  return [
    ...new Set(
      paths
        .map((filePath) => filePath.trim())
        .filter(Boolean)
        .map((filePath) => {
          const absolutePath = path.isAbsolute(filePath)
            ? path.normalize(filePath)
            : path.resolve(rootDir, filePath);
          return path.relative(rootDir, absolutePath).split(path.sep).join("/");
        })
        .filter((filePath) => filePath !== "" && !filePath.startsWith("../")),
    ),
  ];
}

function requiresFullCheck(filePath) {
  return (
    filePath === "package.json" ||
    filePath === "package-lock.json" ||
    filePath === "vite.config.ts" ||
    filePath === "vitest.config.ts" ||
    filePath.startsWith("tsconfig") ||
    filePath === "tools/check.mjs"
  );
}

function isDocumentationPath(filePath) {
  return (
    filePath.endsWith(".md") ||
    filePath.startsWith("docs/") ||
    filePath.startsWith(".codex/agents/")
  );
}

function printPlan(plan, pathsWereProvided) {
  const source = pathsWereProvided ? "입력 경로" : "Git 변경 경로";
  console.log(`[check] 계획: ${plan.mode} — ${plan.reason}`);
  if (plan.paths.length > 0) {
    console.log(`[check] ${source}: ${plan.paths.join(", ")}`);
  }
  const labels = [...plan.first, ...plan.then].map((task) => task.label);
  console.log(`[check] 검사: ${labels.length > 0 ? labels.join(" → ") : "없음"}`);
}

function printHelp() {
  console.log(`사용법:
  node tools/check.mjs fast [변경 경로 ...]
  node tools/check.mjs full
  node tools/check.mjs plan [변경 경로 ...]

fast는 Git 변경 파일 또는 전달한 경로에 맞춰 최소 검사를 선택합니다.
full은 전체 테스트, 타입 검사, 프로덕션 빌드를 실행합니다.`);
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}초`;
}
