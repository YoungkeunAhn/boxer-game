export const meta = {
  name: 'dev',
  description: '복서게임 단일 태스크(TASK-NNN)를 계획→구현→검증→리뷰 사이클로 처리',
  whenToUse: 'tasks/의 TASK 하나, 또는 임의 구현 스펙 하나를 반복 개발 사이클로 끝까지 돌릴 때',
  phases: [
    { title: 'Plan', detail: '태스크 문서 + 참고 기획 문서를 읽고 구현 계획 수립' },
    { title: 'Implement', detail: '작업 브랜치 생성/전환 후 계획대로 구현하고 check.mjs fast로 자체 검증(green까지)' },
    { title: 'Verify', detail: 'check.mjs를 독립 에이전트로 재실행해 통과 확인' },
    { title: 'Review', detail: 'code-reviewer로 diff 리뷰 후 각 지적을 적대 검증' },
  ],
}

// args 사용법:
//   "TASK-004"                                  → 해당 태스크를 fast 게이트로
//   { task: "TASK-004", full: true, e2e: true } → full 게이트 + e2e
//   { spec: "임의 구현 지시문" }                 → 태스크 문서 대신 자유 스펙으로 재사용
const taskId = typeof args === 'string' ? args : (args && args.task)
const freeSpec = args && typeof args === 'object' ? args.spec : null
const wantFull = !!(args && typeof args === 'object' && args.full)
const wantE2e = !!(args && typeof args === 'object' && args.e2e)

if (!taskId && !freeSpec) {
  throw new Error('args에 처리할 태스크 ID나 spec을 넘겨주세요. 예: "TASK-004" 또는 { spec: "..." }')
}

const SPEC_REF = taskId
  ? `tasks/${taskId}-*.md (이 태스크 문서와 그 안의 "참고 문서"로 명시된 docs/기획/** 파일들을 모두 읽어라)`
  : `아래 자유 스펙:\n${freeSpec}`

const RULES = `프로젝트 규칙(CLAUDE.md / tasks/README.md 공통 규칙) 엄수:
- 전투·피해·보상·전이·강화·정산 로직은 src/game/의 순수 함수로. React/DOM/Date.now/Math.random/타이머는 스토어에서 주입.
- 저장 형태(Boxer/SaveData)가 바뀌면 SCHEMA_VERSION을 올리고 저장 키 접미사(boxer-game.save.vN)를 맞춘다. 수식·밸런스가 바뀌면 BALANCE_VERSION을 올린다. 옛 저장은 삭제하지 말고 legacy/invalid로 안내.
- 미확정 수치는 constants.ts에 "가정:" 주석 + 임시값으로 넣고 같은 값을 테스트/기획 문서와 함께 갱신. 추측으로 단정하지 말 것.
- 신규 순수 함수는 colocated *.test.ts, 스토어 변경은 createGameStore + 가짜 now/random/schedule로 테스트.
- 파일 내용 읽기가 깨지면 python tools/read-md.py "<path>" 사용. MVP 경계(PVP·길드·랭킹·결제·광고·장비·서버동기화) 밖은 손대지 말 것.`

const BRANCH_RULE = `브랜치 규칙(코드를 만지기 전에 반드시 1회 수행):
1. 'git branch --show-current'로 현재 브랜치를 확인한다.
2. main(또는 master)이면 작업용 새 브랜치를 만들고 전환한다: 'git switch -c <브랜치명>'.
   - 이미 main이 아닌 작업 브랜치 위에 있으면 새로 만들지 말고 그대로 사용한다.
   - 같은 이름의 브랜치가 이미 있으면 'git switch <브랜치명>'으로 전환만 한다.
3. 브랜치명 규칙: 전부 소문자 케밥, 'feat/' 접두사.
   - 태스크면: feat/task-<번호>-<태스크 문서 파일명에서 딴 슬러그>
     예) TASK-004 → feat/task-004-boxer-type-gender  (tasks/TASK-004-boxer-type-gender.md 파일명에서 'TASK-' 제거·소문자화)
   - 자유 스펙이면: feat/<스펙을 한 줄로 요약한 짧은 영문 케밥 슬러그>
4. 커밋·푸시는 하지 않는다(브랜치 생성/전환까지만). 스테이징·커밋·푸시는 사람이 deploy로 처리한다.`

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'files', 'versionBumps', 'tests', 'risks'],
  properties: {
    summary: { type: 'string', description: '이 태스크가 무엇을 바꾸는지 2~3문장' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'change'],
        properties: {
          path: { type: 'string' },
          change: { type: 'string', description: '이 파일에서 할 변경 요약' },
        },
      },
    },
    versionBumps: {
      type: 'object',
      additionalProperties: false,
      required: ['schema', 'balance', 'reason'],
      properties: {
        schema: { type: 'boolean', description: 'SCHEMA_VERSION을 올려야 하는가' },
        balance: { type: 'boolean', description: 'BALANCE_VERSION을 올려야 하는가' },
        reason: { type: 'string' },
      },
    },
    tests: { type: 'array', items: { type: 'string' }, description: '추가/수정할 테스트 케이스' },
    risks: { type: 'array', items: { type: 'string' }, description: '주의점·미확정(가정) 항목' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['passed', 'command', 'failureTail'],
  properties: {
    passed: { type: 'boolean' },
    command: { type: 'string', description: '실제로 실행한 명령' },
    failureTail: { type: 'string', description: '실패 시 출력 끝부분, 통과면 빈 문자열' },
  },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'file', 'severity', 'detail'],
        properties: {
          title: { type: 'string' },
          file: { type: 'string', description: 'path:line 형식' },
          severity: { type: 'string', enum: ['blocker', 'warning', 'nit'] },
          detail: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isReal', 'reason'],
  properties: {
    isReal: { type: 'boolean', description: '실제로 고쳐야 하는 정당한 지적인가' },
    reason: { type: 'string' },
  },
}

// ── 1. 계획 ─────────────────────────────────────────────
phase('Plan')
const plan = await agent(
  `복서게임(복서 아이들 오토배틀러)의 다음 작업을 구현하기 위한 계획을 세워라.

작업 스펙: ${SPEC_REF}

먼저 CLAUDE.md, tasks/README.md, 그리고 스펙이 가리키는 문서들을 모두 읽어 현재 코드(src/game/types.ts, constants.ts, save.ts 등)와 대조하라.
${RULES}

계획만 세우고 코드는 수정하지 마라. 어떤 파일을 어떻게 바꿀지, 스키마/밸런스 버전을 올려야 하는지, 어떤 테스트를 추가할지, 가정/리스크가 무엇인지 구조화해서 반환하라.`,
  { schema: PLAN_SCHEMA, label: `plan:${taskId || 'spec'}`, phase: 'Plan' },
)

// ── 2. 구현 ─────────────────────────────────────────────
phase('Implement')
const impl = await agent(
  `복서게임의 다음 계획을 실제로 구현하라. 작업 디렉터리에 직접 파일을 수정한다.

작업 스펙: ${SPEC_REF}

승인된 구현 계획:
${JSON.stringify(plan, null, 2)}

${RULES}

${BRANCH_RULE}

구현 절차:
1. 위 브랜치 규칙대로 작업 브랜치를 만들거나 전환한다(코드 수정 전에).
2. 계획대로 src/ 파일을 수정하고 colocated 테스트를 추가/갱신한다.
3. 변경한 모든 파일을 인자로 'node tools/check.mjs fast "<바뀐 파일1>" "<바뀐 파일2>" ...' 를 실행한다.
4. 실패하면 원인을 고치고 green이 될 때까지 반복한다.
커밋은 하지 마라(스테이징/커밋은 사람이 한다). 마지막에: 작업한 브랜치 이름, 수정한 파일 목록, 올린 버전(schema/balance), check.mjs 최종 결과, 남은 TODO/가정, 다음 태스크 제안을 요약해 반환하라.`,
  { label: `impl:${taskId || 'spec'}`, phase: 'Implement' },
)

// ── 3. 독립 검증 ────────────────────────────────────────
phase('Verify')
const verifyCmd = wantFull
  ? 'node tools/check.mjs full'
  : 'node tools/check.mjs full' // fast는 바뀐 파일 인자가 필요하므로 독립 재검증은 full로 통일
const verify = await agent(
  `복서게임 작업 트리의 현재 변경을 독립적으로 검증하라. 다음을 그대로 실행하라:
  ${verifyCmd}${wantE2e ? '\n  npm run e2e' : ''}
출력을 보고 통과/실패와 실패 시 출력 끝부분을 정확히 보고하라. 코드는 수정하지 마라(검증만).`,
  { schema: VERIFY_SCHEMA, label: 'verify', phase: 'Verify' },
)

// ── 4. 리뷰 + 지적 적대 검증 ────────────────────────────
phase('Review')
const review = await agent(
  `'git --no-pager diff HEAD' 로 현재 작업 트리의 변경(diff)을 확인하고 리뷰하라.
정확성 버그·보안·프로젝트 규칙(버전 관리/순수 함수/MVP 경계) 위반을 우선으로, 신뢰도 높은 지적만 내라. 코드는 수정하지 마라.`,
  { agentType: 'code-reviewer', schema: FINDINGS_SCHEMA, label: 'review', phase: 'Review' },
)

const findings = (review && review.findings) || []
const verified = await parallel(
  findings.map((f) => () =>
    agent(
      `복서게임 코드 리뷰에서 나온 다음 지적이 실제로 고쳐야 하는 정당한 것인지 적대적으로 검증하라.
해당 파일을 직접 읽고 확인하라. 확신이 없으면 isReal=false로 기울여라(거짓 양성 제거가 목적).

지적: ${f.title}
위치: ${f.file}
심각도: ${f.severity}
내용: ${f.detail}`,
      { schema: VERDICT_SCHEMA, label: `verify:${f.file}`, phase: 'Review' },
    ).then((v) => ({ ...f, verdict: v })),
  ),
)
const confirmed = verified
  .filter(Boolean)
  .filter((f) => f.verdict && f.verdict.isReal)

return {
  task: taskId || '(free spec)',
  plan,
  implementation: impl,
  verification: verify,
  confirmedFindings: confirmed,
  droppedFindings: findings.length - confirmed.length,
}
