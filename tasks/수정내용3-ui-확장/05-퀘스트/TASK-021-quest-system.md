# TASK-021 퀘스트 시스템 (P3)

## 목표

일일/주간/도전/업적 **퀘스트 시스템**을 도입한다. 다이아·경험치의 주요 획득원이다. **추적 가능한 목표만** 채택하고(보류 시스템 의존 목표 제외), 보상은 **골드·다이아만**(아이템·에너지 제외). 저장 상태는 **TASK-019의 v7 범프에 합류**한다.

## 참고 문서

- `docs/ui/05-퀘스트.md` §3-1~§3-5
- `docs/ui/01-공통-레이아웃.md`(일일 리셋 타이머·재화), `docs/ui/03-상점.md`(무료 상자)
- `src/game/combat.ts`(처치/전진 이벤트), `src/stores/gameStore.ts`(`purchaseUpgrade`/`advanceCombat`)

## 작업 범위

1. **데이터 모델**:
   - `QuestDef`: id, category(daily/weekly/challenge/achievement), goalType, target, reward(gold·diamond), points(마일스톤 기여).
   - `QuestState`(저장): `progress`(questId→current), `claimed`, `dailyPoints`, `milestonesClaimed[]`, `dailySnapshot`(일일 시작 누적값), `resetAt{daily,weekly}`.
2. **진행 추적(이벤트 훅) — 추적 가능한 목표만**:
   - `killMonster` ← `resolveAttack` 처치(`boxer.kills`).
   - `stageClear`/`bossClear` ← 스테이지 전진·보스 클리어.
   - `upgradeStat` ← `purchaseUpgrade` 성공(9종).
   - `autoBattleMinutes` ← `advanceCombat` 누적 경과(주입 now). 오프라인 포함 `TODO`(`가정:` 온라인만 집계 — 방치 자동 달성 방지).
   - `claimFreeChest` ← 무료 상자 수령(상점 골격).
   - `playerLevelUp` ← 플레이어 레벨업(TASK-019).
   - **제외 목표**: `enhanceEquip`·`enhanceTraining`(장비·훈련 보류).
3. **누적값 스냅샷**: `boxer.kills` 등 비리셋 누적값은 **일일 시작 스냅샷** 기준 증분으로 계산(저장).
4. **보상/수령**: 골드·다이아만. 중복 수령 방지(`claimed`) + 마일스톤 상자 별도 수령(`milestonesClaimed`). 다이아 보상은 TASK-019 다이아에 가산.
5. **리셋**: 일일 00:00(TASK-019 일일 리셋 기준 동일), 주간 월요일 00:00(`가정:`), 도전/업적 영구. 주입 now 기준 순수 함수(`Date.now` 금지).
6. **마일스톤 진행 바**: 일일 누적 점수(예 45/100)→구간(20/40/60/80/100) 상자 수령.
7. **UI**: 탭(일일/주간/도전/업적), 퀘스트 리스트(아이콘·제목·진행바 N/M·보상·버튼 3상태: 이동/수령/✓), 마일스톤 바. [이동] 라우팅: 스테이지/처치→파이터, 강화→파이터(강화 패널), 무료상자→상점. (장비→가방 라우팅은 보류로 미사용)
8. **알림 뱃지**: 완료·미수령 또는 마일스톤 수령 가능 시 하단 네비 뱃지(TASK-020 연동).
9. 테스트: 진행 증분(스냅샷 기준)·중복 수령 방지·마일스톤 수령·일일/주간 리셋 순수성(주입 now)·보상 가산.

## 구현 원칙

- 진행 추적·리셋·증분은 `src/game/`의 순수 함수 + 주입 now. 이벤트 훅은 스토어에서 순수 함수 호출.
- 보류 시스템(장비·훈련·에너지) 의존 목표/보상은 채택하지 않는다.
- 저장 스키마는 TASK-019의 v7 범프에 합류(별도 범프 금지).

## 하지 않을 것

- 장비/훈련 강화 목표(`enhanceEquip`/`enhanceTraining`), 아이템·에너지 보상.
- 독립 `SCHEMA_VERSION` 범프(TASK-019와 합류).
- 주간/시즌 랭킹·경기장 연계(보류).

## 완료 기준

- 추적 가능한 목표가 정확히 증분·완료·수령되고 중복 수령이 막힌다.
- 일일/주간 리셋이 주입 now 기준으로 정확히 동작한다.
- 마일스톤 상자가 누적 점수 구간에서 수령된다.
- 보상이 골드·다이아로만 지급된다.
- `node tools/check.mjs full` 통과(저장 스키마 합류 → full) + `npm run e2e`.

## 체크리스트

- [ ] `QuestDef`/`QuestState` 모델(정의·상태 분리), v7 저장 합류
- [ ] 이벤트 훅: kill/stage/boss/upgrade/autoBattleMinutes/claimFreeChest/playerLevelUp
- [ ] 제외 목표(enhanceEquip/enhanceTraining) 미채택 확인
- [ ] 일일 시작 스냅샷 기준 증분 계산
- [ ] 보상 골드·다이아만, 중복 수령 방지 + 마일스톤 별도 수령
- [ ] 일일/주간 리셋 순수 파생(주입 now, `Date.now` 금지)
- [ ] 마일스톤 진행 바(20/40/60/80/100)
- [ ] UI: 4탭·리스트·버튼 3상태·[이동] 라우팅·마일스톤 바
- [ ] 알림 뱃지(TASK-020 연동)
- [ ] 테스트: 증분/중복방지/마일스톤/리셋/보상 가산
- [ ] `node tools/check.mjs full` + `npm run e2e` 통과

## 결과 보고 형식

퀘스트 모델·상태 / 채택·제외 목표 / 스냅샷 증분 방식 / 리셋 순수 로직 / 보상·마일스톤 / UI·뱃지 / v7 합류 확인 / 테스트·E2E 결과.
