# TASK-014 전투 헤더·적 카드·스테이지 진행바 (P2)

## 목표

메인 전투 화면 상단에 **전투 헤더**(월드맵 표기 · 스테이지 진행바 · 복서/몬스터 대결 카드)를 추가한다. 모든 데이터는 **기존 코드에서 파생**하며 신규 게임 로직·저장 필드는 만들지 않는다(표시 전용).

## 참고 문서

- `docs/ui/02-파이터-메인화면.md` §1, §3-1
- `docs/기획/presentation/ui.md`(현 상/중/하 구조), `docs/기획/systems/stage-and-offline.md`
- `src/data/stages.ts`, `src/game/formulas.ts`, `src/game/combat.ts`

## 작업 범위

1. **스테이지 진행바(5칸)**: 일반 4점(stage 1~4) + 보스 1점(stage 5). `StagePosition.stage`와 `getStageDefinition().isBoss`로 현재 위치 점을 채운다. `STAGES_PER_CHAPTER=5`, `BOSS_STAGE_NUMBER=5` 사용. `STAGE 12-3` 식 라벨(챕터-스테이지).
2. **몬스터 대결 카드**(우): 이름·현재HP/최대HP·공격력(🔥). 데이터 소스:
   - 이름 → `getStageDefinition().monsterName`
   - HP → `CombatRuntime.monsterHp`(현재) / `getStageDefinition().maxHp`(최대)
   - 공격력 → `calculateMonsterAttackPower(position)`
3. **복서 대결 카드**(좌): 기존 `BoxerStatus` 셀렉터(이름·타입·HP·공격력) 재사용.
4. **월드맵 버튼**(좌상단): 이번 태스크는 **헤더 표기만**. 동작은 "현재 진행 지점 + 도달한 챕터/스테이지 내 재방문" 정의를 따르되, 별도 선택 화면 신설은 범위 밖(미도달 구간 점프 금지). 클릭 시 동작은 `TODO`로 비활성/안내 처리.
5. CSS Modules로 360px 한 열에 헤더가 깨지지 않게 배치(가로 스크롤 없음, safe-area 대응).
6. E2E: `e2e/*.spec.ts`·`docs/browser-smoke-checklist.md`에 진행바·적 카드 표시 항목 추가.

## 구현 원칙

- 프레젠테이셔널: 스토어 셀렉터로만 구동, 신규 전투 로직·저장 필드 없음.
- 모든 수치는 `stages.ts`/`formulas.ts`/`combat.ts`에서 파생 — 카드에 하드코딩 금지.

## 하지 않을 것

- 월드맵 선택/점프 화면 신설(미도달 구간 점프 불가).
- AUTO/배속/수동 스킬(TASK-015), 타입 전환(TASK-017).
- 밸런스·저장 변경(`BALANCE_VERSION`/`SCHEMA_VERSION` 불변).

## 완료 기준

- 진행바가 현재 stage(1~5, 보스 강조)를 정확히 표시한다.
- 적 카드가 `monsterName`·현재/최대 HP·`calculateMonsterAttackPower` 값을 실시간 반영한다.
- 360px·데스크톱 한 열에서 헤더가 깨지지 않고 가로 스크롤이 없다.
- `node tools/check.mjs fast "<바뀐 파일>"` + `npm run e2e` 통과.

## 체크리스트

- [ ] 5칸 진행바: stage 1~4 일반 + stage 5 보스, 현재 위치/`isBoss` 강조, `STAGE C-S` 라벨
- [ ] 몬스터 카드: `monsterName`·현재HP/`maxHp`·`calculateMonsterAttackPower` 표시
- [ ] 복서 카드: 기존 `BoxerStatus` 셀렉터 재사용(이름·타입·HP·공격력)
- [ ] 월드맵 버튼: 헤더 표기만(동작 `TODO` 비활성/안내)
- [ ] CSS Modules 360px 한 열, 가로 스크롤 없음, safe-area
- [ ] E2E·스모크 체크리스트에 진행바·적 카드 항목 추가
- [ ] `check.mjs fast` + `npm run e2e` 통과

## 결과 보고 형식

수정/신규 컴포넌트 / 데이터 소스 매핑 / 360px 점검 / E2E·스모크 갱신 / 남은 TODO(월드맵 동작) / 다음 태스크.
