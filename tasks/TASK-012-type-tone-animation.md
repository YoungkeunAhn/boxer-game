# TASK-012 타입별 톤·애니메이션 (v1.4b)

## 목표

타입별 연출 톤과 공격·회피 애니메이션, 전투 텍스트 연출(MISS/GUARD/COUNTER/콤보/스킬명)을 입힌다. 등급분류를 고려해 **과격하지 않은 표현**(피·잔혹 연출 제외)을 유지한다.

## 참고 문서

- `docs/기획/presentation/ui-tone.md`, `docs/기획/presentation/animation.md`
- `docs/game-rating.md`

## 작업 범위

1. 애니메이션 키 매핑: `boxer_left_jab`, `boxer_right_straight`, `boxer_left_hook`, `boxer_right_hook`, `boxer_left_upper`, `boxer_right_upper` 등. 손 선택 규칙(좌우 교대, TASK-007)을 그대로 따른다.
2. 모션 상태: 대기/공격/피격/회피/사망/스킬. 회피 모션(더킹·위빙·스웨이·스텝백·고스트스텝·나비스텝)을 몬스터 공격·회피 결과와 연동.
3. 타입별 톤:
   - 인파이터: 묵직한 타격·무거운 화면 흔들림·붉은 압박감, GUARD/훅·어퍼/피해 감소 강조(예: `IRON GUARD! 피해 -60%`, `LIVER SHOT!`, `DEMPSEY ROLL!`).
   - 아웃복서: 잔상·빠른 스텝·가벼운 이동감, MISS/COUNTER/스트레이트 궤적 강조(예: `GHOST STEP! MISS!`, `COUNTER STRAIGHT! CRIT -210`).
4. 전투 텍스트 연출: 데미지 숫자, 콤비네이션(ONE-TWO/ONE-TWO HOOK/FULL COMBO), 스킬명, MISS/GUARD/COUNTER, 보스 강공격 WARNING.
5. 성능: WebView 60fps 목표, 가벼운 CSS/transform 기반 연출 우선. 과한 리소스 지양.
6. E2E/스모크: 연출이 핵심 정보 표시를 가리지 않는지, 360px에서 깨지지 않는지 확인 항목 추가.

## 구현 원칙

- 연출은 표시 계층에만 둔다. 전투 로직/난수/타이밍을 바꾸지 않는다(애니메이션은 상태 변화의 결과를 따라간다).
- 등급분류 고려: 타격 표현을 과격하게 만들지 않고 출혈·부상·잔혹 연출은 넣지 않는다.

## 하지 않을 것

- 사운드(가정: 별도 태스크/TODO. 넣는다면 On/Off 처리 필요 — 출시 체크리스트 참고).
- 전투 수치·규칙 변경.

## 완료 기준

- 4종 공격·회피·스킬 모션과 타입별 톤이 적용되고, 전투 텍스트 연출이 결과와 일치한다.
- 인파이터/아웃복서가 시각적으로 구분된다.
- 연출이 60fps 목표에서 끊기지 않고 360px에서 정보 가독성을 해치지 않는다.
- `node tools/check.mjs full` + `npm run e2e` 통과.

## 결과 보고 형식

수정/신규 파일 / 애니메이션 키·모션 매핑 / 타입 톤 차이 / 텍스트 연출 / 성능·등급분류 점검 / 남은 TODO / 다음 태스크.
