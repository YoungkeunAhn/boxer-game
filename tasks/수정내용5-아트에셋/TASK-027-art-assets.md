# TASK-027 아트 에셋 교체 (수정내용5)

> TASK-026(파이터 메인화면 합성)이 플레이스홀더(이모지)로 남긴 자리를 **실제 이미지 에셋으로 교체**한다. 합성이 보존한 `data-animation-key`/`data-pose`/`data-boxer-type`/`data-gender` 슬롯에 끼우는 작업이다. **표시 전용 — 로직·저장·밸런스 무변경.**

## 한 줄 목표

전투 화면의 이모지/텍스트 플레이스홀더(🧍/👊/🥊/👾/👹)를 **실제 이미지**로 교체한다. 파이터 정지 이미지는 연결 완료 상태이며, 본 태스크는 **포즈 시트·몬스터·링 배경·이펙트**의 에셋 명세를 확정하고 에셋 도착분부터 순차 연결한다.

## 현재 상태 (착수 기준선)

- ✅ **파이터 정지 idle 이미지(타입×성별 4종)** — `public/sprites/boxer_{type}_{gender}.png`, `BoxerFigure`가 이모지 대신 렌더(에셋 누락 시에만 이모지 폴백). idle 1컷이라 포즈와 무관하게 같은 캐릭터를 보여주고, 동작감은 기존 포즈 트랜스폼(`.sprite`)·포즈 라벨·카운터 버스트로 표현.
- ⬜ **포즈별 스프라이트 시트** — 공격/가드/회피/카운터는 여전히 idle 정지 이미지(또는 이모지 폴백).
- ⬜ **몬스터** — `👾`(일반)/`👹`(보스) 이모지.
- ⬜ **링 배경** — 없음(CSS 톤 그라데이션만).
- ⬜ **타격 이펙트** — 텍스트("COUNTER!")·숫자.

## 에셋 명세 (아티스트 전달용)

> 공통 권장: 투명 배경 PNG(또는 스프라이트 시트 1장 + JSON 좌표), 정사각, 1배수 256×256(레티나 대비 512 권장). 파일명은 아래 네이밍을 그대로 따르면 코드가 슬롯에서 자동으로 읽는다.

### A. 내 복서 — `BoxerFigure` (포즈 시트)

타입 2종(`INFIGHTER`·`OUT_BOXER`) × 성별 2종(`MALE`·`FEMALE`) = **캐릭터 4명**. 각 캐릭터의 애니메이션 키:

| animation key | 의미 | 현재 이모지 | 인파이터 사용 | 아웃복서 사용 |
| --- | --- | --- | :-: | :-: |
| `boxer_idle` | 기본 자세 | 🧍 | ✅ | ✅ |
| `boxer_guard` | 가드 | 🛡️ | ✅ | ✅ |
| `boxer_dodge` | 회피/스텝백 | 💨 | | ✅ |
| `boxer_left_jab` | 왼손 잽 | 👊 | ✅ | ✅ |
| `boxer_right_straight` | 오른손 스트레이트 | 🥊 | | ✅ |
| `boxer_left_hook` | 왼 훅 | 🤜 | ✅ | |
| `boxer_right_hook` | 오른 훅 | 🤛 | (전투 발생) | (전투 발생) |
| `boxer_left_upper` | 왼 어퍼 | ⬆️ | ✅ | |
| `boxer_right_upper` | 오른 어퍼 | ⤴️ | (전투 발생) | (전투 발생) |
| `boxer_counter` | 카운터 | 💥 | ✅ | ✅ |

- **최소(MVP)**: 타입별 실사용 6포즈 → 4명 × 6 = **24장**
  - 인파이터 6: `idle`·`guard`·`left_jab`·`left_hook`·`left_upper`·`counter`
  - 아웃복서 6: `idle`·`guard`·`dodge`·`left_jab`·`right_straight`·`counter`
- **완전판**: 4명 × 10키 = **40장**(좌/우 훅·어퍼 모두 전투 중 발생 가능)
- **네이밍**: `boxer_{type}_{gender}_{key}.png` 예) `boxer_infighter_male_boxer_idle.png`
  - type: `infighter` | `outboxer`, gender: `male` | `female`
  - 또는 캐릭터당 시트 1장 + 프레임 좌표 JSON(`boxer_{type}_{gender}_sheet.png`)

### B. 몬스터 — `CombatStage` 아레나/카드 (👾/👹 대체)

코드는 현재 **일반/보스 2가지**만 구분하지만 테마(챕터)별 이름이 있다.

| themeId | 챕터명 | 일반 | 보스 |
| --- | --- | --- | --- |
| `forest_entrance` | 숲 입구 | 앤트 계열 | 앤트 보스 |
| `wolf_forest` | 늑대 숲 | 울프 계열 | 울프 보스 |
| `rock_canyon` | 바위 협곡 | 골렘 계열 | 거대 골렘 |

- **최소**: 일반 1 + 보스 1 = **2장**
- **테마별(권장)**: 3테마 × (일반 1 + 보스 1) = **6장**
- **네이밍**: `monster_{themeId}_{normal|boss}.png`

### C. 링 배경 — `CombatStage` 무대

- **최소**: 링 배경 1장(가로형, 무대 1면)
- **테마별(권장)**: 3장 `ring_{themeId}.png`
- **규격**: 360px~데스크톱 반응형 → 가로형 1080×720 권장, 좌우 잘림 대비 안전영역 여유.

### D. (선택) 타격 이펙트

- `fx_hit.png`·`fx_counter.png`·`fx_groggy.png`(각 1장, 투명 PNG). 필수 아님.

### 요약 (권장 세트)

| 구분 | 최소 | 권장 |
| --- | --- | --- |
| 복서 포즈 | 24 | 40 |
| 몬스터 | 2 | 6 |
| 링 배경 | 0(CSS) | 3 |
| 이펙트 | 0 | 3 |

## 파일별 변경 계획 (에셋 도착 후)

| 파일 | 변경 |
| --- | --- |
| `public/sprites/` | 에셋 추가(위 네이밍). 파이터 idle 4종은 이미 존재. |
| `src/components/BoxerFigure.tsx` | `BOXER_IMAGE` 맵을 포즈 시트 기준으로 확장 — `animationKey`별 프레임 선택. 정지 idle만 있을 땐 현 동작 유지(폴백 체계 보존). data-속성·testid 불변. |
| `src/components/BoxerFigure.module.css` | 스프라이트 시트면 `background-position` 프레임 전환, 단일 PNG면 `.spriteImg` 교체. 포즈 트랜스폼 규칙 유지. |
| `src/components/CombatStage.tsx` | 몬스터 아바타(👾/👹)와 진행바 보스 점(👹)을 `monster_{themeId}_{...}.png`로 교체. `arena-monster`·`monster-card`·`stage-dot` testid·구조 보존. 링 컨테이너에 배경 이미지 적용(또는 CSS). |
| `src/components/CombatStage.module.css` | 링 배경 이미지(`ring_{themeId}.png`) 또는 CSS 그라디언트, 360px 깨짐 없이. |

## 🔴 리스크 — testid/data-속성 보존

에셋 교체는 노드 **내용**만 바꾸고, TASK-026이 보존한 앵커는 그대로 둬야 e2e가 깨지지 않는다. 특히:

```text
boxer-figure(-sprite/-pose-label/-counter), data-boxer-type/-gender/-animation-key/-pose/-reach/-effect/-counter,
arena-boxer/-monster, monster-card(-name/-hp/-attack), stage-dot(×5), combat-feed
```

- `animation.spec.ts`는 `boxer-figure`의 **data-속성**만 검증(이모지/이미지 픽셀은 안 봄) → 이미지로 바꿔도 통과해야 한다.
- 360px/데스크톱 in-viewport·가로 스크롤·44px 터치 영역(presentation·mobile spec) 유지.

## 구현 단계 (에셋 도착분부터 독립 커밋)

1. **파이터 포즈 시트** — 4명 6~10포즈 연결(idle 외 포즈). `BOXER_IMAGE` 확장 + CSS 프레임 전환.
2. **몬스터** — 테마별 일반/보스 이미지 연결(👾/👹 대체).
3. **링 배경** — `ring_{themeId}` 또는 CSS 무대 배경.
4. **(선택) 이펙트** — 타격/카운터/그로기 fx.
5. 각 단계 후 `npm run e2e` 통과.

## 하지 않을 것

- 전투 로직·밸런스·저장 스키마 변경(`BALANCE_VERSION`/`SCHEMA_VERSION` 불변).
- 새 애니메이션 키·게임 상태 추가(슬롯 구조 재사용만).
- 월드맵 동작 구현(여전히 `TODO` 비활성).

## 완료 기준

- [ ] 전투 화면의 복서·몬스터가 이모지가 아닌 **이미지**로 보인다(보유 에셋 범위 내).
- [ ] 에셋 누락 키는 이모지/idle로 안전하게 폴백한다(깨진 이미지 없음).
- [ ] `data-testid`·`data-*` 속성 전수 보존 → `npm run e2e` 통과.
- [ ] 360px·데스크톱 깨짐·가로 스크롤 없음.
- [ ] `BALANCE_VERSION`/`SCHEMA_VERSION` 불변(저장 키 `boxer-game.save.v8`).
- [ ] `node tools/check.mjs fast "<바뀐 파일>"` + `npm run e2e` 통과.

## 결과 보고 형식

연결한 에셋 종류·수 / 폴백 동작 확인 / 보존한 testid·data-속성 / 360px 점검 / E2E 결과 / 남은 미보유 에셋 / 다음 단계.
