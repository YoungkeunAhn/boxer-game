# TASK-019 다이아·플레이어 레벨·저장 스키마 (P3 토대)

## 목표

P3의 토대인 **재화·진행 모델**을 도입한다: **다이아(💎, 무과금 획득)** + **플레이어 레벨/경험치(Lv + 경험치 바)**. 에너지(⚡)는 **미채택**. 이 태스크가 P3 저장 스키마(`v6→v7`) 범프를 담당하며, TASK-020(5탭 헤더)·TASK-021(퀘스트 보상)이 여기에 의존한다.

## 참고 문서

- `docs/ui/01-공통-레이아웃.md` §3-1, §3-3, §3-5
- `docs/기획/systems/stage-and-offline.md`(오프라인 처치수 파생), `docs/기획/overview/mvp-scope.md`(제외 항목 해제)
- `src/game/types.ts`(`SaveData`), `src/game/save.ts`(타입가드), `src/stores/gameStore.ts`, `src/game/constants.ts`

## 작업 범위

1. **저장 필드 추가**(에너지 제외): `diamond: number`, `playerLevel: number`, `playerExp: number`. `expToNext`는 저장하지 않고 순수 함수 파생(강화 레벨과 동일 패턴).
2. **타입가드**: `diamond`/`playerLevel`/`playerExp` 유한·음수불가·세이프정수 범위 검증(`save.ts` 패턴). `MAX_SAFE_GAME_INTEGER` 클램프.
3. **`SCHEMA_VERSION` v6→v7 범프 + 저장 키 접미사(`boxer-game.save.v7`) 일치**. 옛 저장은 삭제하지 말고 `legacy`/`invalid` 안내. **P3 재화·레벨·퀘스트(TASK-021)는 이 한 번의 v7 범프로 합친다** — 퀘스트 상태 필드까지 포함해 한 번에 올릴지 순서 조정.
4. **다이아 획득/사용 경로**:
   - 획득: 퀘스트·업적·무료 상자(TASK-021/상점 골격). 결제 획득은 보류.
   - 사용: 무과금 상점(보류) — 현재는 타입 전환 비용(TASK-017) 등 sink 연결은 `TODO`.
   - 단위: 정수, 클램프.
5. **플레이어 경험치 곡선**(`가정:`): `expToNext(level) = floor(BASE_EXP * GROWTH^level)`(기존 1.25^ 톤 맞춤). 획득원: 몬스터 처치·보스 클리어·퀘스트 완료(수치 `TODO`). 레벨업 보상 `TODO`(다이아 소량 등 — 밸런스 확정 전 미정). 임시값은 `constants.ts`에 `가정:` 주석.
6. **순수 파생 시간 로직**(에너지 없음): 일일 리셋 타이머 `dailyResetAt = 다음 로컬 00:00`, 표시 = `dailyResetAt - now`. 주입 `now` 기준 순수 함수(`Date.now` 금지). 오프라인 에너지 회복 로직 **불필요**.
7. **mvp-scope 갱신**: `docs/기획/overview/mvp-scope.md` "제외"에서 다이아·플레이어 레벨 해제(에너지·결제·경기장은 그대로 제외/보류).
8. 테스트: 신규 필드 타입가드(유효/무효/범위초과), v6 저장 로드 시 `legacy`/`invalid` 처리, 경험치 곡선·레벨업 파생, 일일 리셋 타이머 순수성(주입 now).

## 구현 원칙

- 시간·경험치·리셋은 전부 `src/game/`의 순수 함수 + 주입 `now`. `Date.now` 직접 사용 금지.
- 새 객체 반환(변이 금지), `MAX_SAFE_GAME_INTEGER` 클램프.
- 스키마는 **한 번만** 흔든다 — 퀘스트(TASK-021)와 범프 합류 여부를 먼저 결정.

## 하지 않을 것

- 에너지(⚡) 도입(미채택).
- 실결제(IAP)·상점 구매 로직(상점 보류 — TASK-023 골격).
- 다중 화면 라우팅/탭 UI(TASK-020).

## 완료 기준

- `diamond`/`playerLevel`/`playerExp`가 저장·로드·타입가드된다.
- v6 저장이 안전하게 `legacy`/`invalid` 처리되고 v7 키로 저장된다.
- 경험치 곡선·레벨업·일일 리셋 타이머가 주입 `now` 기준 순수 함수로 동작한다.
- `mvp-scope.md`에서 해당 항목이 해제된다.
- `node tools/check.mjs full` 통과(스키마/버전 변경 → full).

## 체크리스트

- [ ] `SaveData` 필드 추가: `diamond`/`playerLevel`/`playerExp`(`expToNext`는 파생)
- [ ] 타입가드(유한·음수불가·세이프정수) + `MAX_SAFE_GAME_INTEGER` 클램프
- [ ] `SCHEMA_VERSION` v6→v7 + 저장 키 `boxer-game.save.v7`, 옛 저장 `legacy`/`invalid`
- [ ] 다이아 획득/사용 경로 정의(사용 sink는 `TODO`)
- [ ] 경험치 곡선·획득원·레벨업 보상 `가정:`/`TODO`(임시값 `constants.ts`)
- [ ] 일일 리셋 타이머 순수 파생(주입 now, `Date.now` 금지), 에너지 회복 로직 없음
- [ ] `mvp-scope.md` 제외 목록에서 다이아·플레이어 레벨 해제
- [ ] 테스트: 타입가드·v6 로드 처리·경험치/레벨 파생·리셋 타이머 순수성
- [ ] `node tools/check.mjs full` 통과

## 결과 보고 형식

추가 필드·타입가드 / 버전 범프(v6→v7)·키 / 경험치·리셋 순수 로직 / mvp-scope 갱신 / 다이아 sink TODO / TASK-020·021 합류 메모 / 테스트 결과.
