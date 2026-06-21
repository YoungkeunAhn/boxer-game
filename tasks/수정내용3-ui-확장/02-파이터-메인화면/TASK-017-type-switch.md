# TASK-017 파이터 타입 외형 전환 (P2)

## 목표

**단일 캐릭터**가 4종(타입×성별)의 외형·모션·타입 전용 스킬을 **런타임 전환**하는 기능을 추가한다(4캐릭터 동시 보유 아님). 강화 레벨·골드는 유지하고, 타입 고유 보정만 재적용한다. 신규 저장 필드는 없고 `boxer.type`/`boxer.gender`의 **변경 경로만** 추가된다.

## 참고 문서

- `docs/ui/02-파이터-메인화면.md` §3-4
- `docs/ui/07-캐릭터-애니메이션.md`(전환 시 6포즈 세트 교체 — TASK-018과 연동)
- `docs/기획/skills/infighter-skills.md`, `docs/기획/skills/out-boxer-skills.md`
- `src/game/formulas.ts`(`calculateCombatStats`의 `typeMultiplier`), `src/game/types.ts`(`boxer.type`/`gender`)

## 작업 범위

1. 타입 전환 패널: 4종(인파이터 남/여, 아웃파이터 남/여) 카드, 현재 선택 강조, 가로 스크롤.
2. 전환 액션(스토어):
   - 강화 레벨(`UpgradeLevels`)·골드 **유지**.
   - `boxer.type`/`boxer.gender` 갱신 → `calculateCombatStats`의 `typeMultiplier`(maxHp/defense/dodge/counter) 재계산.
   - 스킬 슬롯을 타입 전용 스킬로 교체(`infighter-skills`/`out-boxer-skills`).
3. 전환 비용·악용 방지(`가정:`/`TODO`): 무료 vs 다이아(P3 재화 도입 전이면 무료로 두고 비용은 TODO), 잦은 전환 방지(쿨다운/비용) 검토. 임시값은 `constants.ts`에 `가정:` 주석.
4. 테스트: 전환 후 강화 레벨·골드 보존, `typeMultiplier` 재적용, 스킬 슬롯 교체, 진행 중 전투 상태(HP) 처리 회귀.
5. E2E: 타입 전환 → 외형/스킬 변경 표시 갱신(외형은 TASK-018과 연동, 본 태스크는 상태 전환까지).

## 구현 원칙

- 순수 함수로 새 `Boxer` 반환(변이 금지). 전환은 스토어 액션으로 주입 의존성 사용.
- `boxer.type`/`gender`는 이미 저장 항목 — 신규 필드 없이 변경 경로만 추가(`SCHEMA_VERSION` 불변).
- 전환 비용에 다이아를 쓰는 결정은 P3(TASK-019) 재화 도입 이후에만 연결.

## 하지 않을 것

- 4캐릭터 동시 보유/개별 성장(단일 캐릭터 외형 전환만).
- 신규 저장 필드 추가, `SCHEMA_VERSION` 범프.
- 6포즈 스프라이트 제작(TASK-018).

## 완료 기준

- 타입 전환 시 강화 레벨·골드 보존, `typeMultiplier`·스킬 슬롯이 정확히 재적용된다.
- 진행 중 전투 상태가 깨지지 않는다(HP 처리 명세대로).
- `node tools/check.mjs fast "<바뀐 파일>"` + `npm run e2e` 통과.

## 체크리스트

- [ ] 타입 전환 패널(4종 카드, 현재 선택 강조)
- [ ] 전환 액션: 강화 레벨·골드 유지, `boxer.type`/`gender` 갱신, `typeMultiplier` 재계산
- [ ] 스킬 슬롯 타입 전용 교체(infighter/out-boxer)
- [ ] 전환 비용·악용 방지 `가정:`/`TODO`(임시값 `constants.ts` 주석, P3 재화 연결은 TASK-019 이후)
- [ ] 테스트: 레벨·골드 보존 / `typeMultiplier` 재적용 / 스킬 교체 / 전투 상태 처리
- [ ] E2E: 타입 전환 상태 갱신
- [ ] `check.mjs fast` + `npm run e2e` 통과

## 결과 보고 형식

전환 액션 설계 / 능력치·스킬 재적용 정합 / 비용 정책(가정/TODO) / 저장 불변 확인 / 테스트·E2E 결과 / TASK-018 연동 메모 / 다음 태스크.
