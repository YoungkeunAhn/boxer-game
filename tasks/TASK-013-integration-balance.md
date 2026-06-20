# TASK-013 통합 검증·밸런스 확정 (수정내용2 마감)

## 목표

`수정내용2`(TASK-004~012)로 흩어진 `가정:`/`TODO` 수치를 플레이테스트로 확정하고, 버전·문서·테스트·저장 스키마를 정합화한 뒤 앱인토스 출시 회귀까지 점검한다.

## 참고 문서

- `docs/기획/systems/stats-and-formulas.md`, `docs/기획/systems/save-model.md`, `docs/기획/README.md`(현재 구현 기준선 표)
- `docs/release-checklist.md`, `docs/browser-smoke-checklist.md`, `docs/game-rating.md`

## 작업 범위

1. 밸런스 확정: 전투 1세션을 플레이테스트(또는 시뮬레이션)해 타입별 보스 도달 시간·강화 효율·스킬 기여를 측정하고, `가정:` 임시값을 확정값으로 교체한다. `BALANCE_VERSION`을 확정 버전으로 한 번 더 정리한다.
2. 저장 스키마 마감: 개발 중 단계별로 올린 `SCHEMA_VERSION`을 `수정내용2` 최종 스키마로 정리(가정: 단일 최종 버전으로 합치고 저장 키 접미사 확정). 로드 시 옛 스키마는 `legacy`/`invalid` 안내, v1 키 비삭제 규칙 유지.
3. 문서 정합: `docs/기획/README.md`의 "현재 구현 기준선" 표, `stats-and-formulas.md`, `data-model.md`, `save-model.md`, `content-data.md`를 확정값·신규 필드로 갱신. `가정:` 잔여 항목을 정리하거나 명시적으로 남긴다.
4. 테스트 정합: 모든 colocated `*.test.ts`를 확정값으로 갱신. 큰 수 안전성(무한 장), 오프라인 중복 없음, 넉다운·재도전, 타입 보정, 콤보·그로기·스킬 회귀를 포함.
5. 브라우저/E2E 회귀: `npm run e2e`(데스크톱·모바일 360) 전체 통과, `docs/browser-smoke-checklist.md` 수동 잔여 항목 점검.
6. 출시 회귀: `node tools/check.mjs full` 통과 후 `ait build`(`npm run build`)로 앱인토스 번들 생성 확인, 샌드박스/실기기 점검 준비. 등급분류 관점(과격 표현 없음, 확률형 유료/광고 없음) 재확인.

## 구현 원칙

- 이 태스크는 신규 시스템을 추가하지 않는다. 확정·정리·회귀가 목적이다.
- 수치를 바꾸면 항상 문서·테스트·버전을 함께 갱신한다(코드만 바꾸지 않는다).

## 하지 않을 것

- 장비·프레스티지·PVP·랭킹 등 `수정내용2` 밖 시스템.
- 실제 출시 제출(별도 출시 태스크).

## 완료 기준

- `가정:` 임시값이 확정값으로 교체되고 `BALANCE_VERSION`/`SCHEMA_VERSION`이 최종 정리된다.
- 기획 README 기준선 표와 코드/테스트가 일치한다.
- `node tools/check.mjs full` + `npm run e2e` 전체 통과, 앱인토스 번들이 생성된다.
- 남은 `TODO`(사운드·스킬 해금 경제 등)가 명시적으로 문서화된다.

## 체크리스트

- [ ] 밸런스 확정: 플레이테스트/시뮬레이션으로 타입별 보스 도달 시간·강화 효율·스킬 기여 측정, `가정:` 임시값을 확정값으로 교체
- [ ] `BALANCE_VERSION`을 확정 버전으로 정리
- [ ] 저장 스키마 마감: 단계별 `SCHEMA_VERSION`을 최종 스키마로 정리, 저장 키 접미사 확정
- [ ] 로드 시 옛 스키마 `legacy`/`invalid` 안내, v1 키 비삭제 규칙 유지
- [ ] 문서 정합: 기획 README 기준선 표·`stats-and-formulas.md`·`data-model.md`·`save-model.md`·`content-data.md` 확정값/신규 필드 갱신, `가정:` 잔여 정리
- [ ] 테스트 정합: 큰 수 안전성·오프라인 중복 없음·넉다운/재도전·타입 보정·콤보/그로기/스킬 회귀 갱신
- [ ] 브라우저/E2E 회귀: `npm run e2e`(데스크톱·모바일 360) 전체 통과, 스모크 수동 잔여 점검
- [ ] 출시 회귀: `node tools/check.mjs full` 통과 후 `ait build`(`npm run build`) 번들 생성 확인
- [ ] 등급분류 재확인(과격 표현 없음, 확률형 유료/광고 없음), 남은 `TODO` 문서화

## 결과 보고 형식

확정한 밸런스값 / 최종 버전(스키마·밸런스) / 갱신 문서·테스트 / E2E·번들 결과 / 출시 회귀 점검 / 남은 TODO.
