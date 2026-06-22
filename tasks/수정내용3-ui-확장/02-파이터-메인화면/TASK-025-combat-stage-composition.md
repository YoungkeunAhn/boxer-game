# TASK-025 전투 화면 합성(단일 무대로 통합) (P2 후속)

## 배경 — "왜 아직 컴포넌트 나열처럼 보이나"

TASK-014~018(P2)은 메인 전투 화면의 각 기능을 **독립 프레젠테이셔널 컴포넌트**로 추가하는 것까지가 목표였고 그건 끝났다. 그러나 그 컴포넌트들을 목업(`docs/ui/예시이미지/메인ui1.png`)의 **단일 게임 화면으로 합성·재배치하는 작업**과 **이모지 → 픽셀 아트 교체**는 어느 태스크에도 없었다. 결과적으로 `HomePage` 파이터 탭은 9개 컴포넌트를 `.grid`(2열 단순 나열)로 쌓기만 해서 "기능 박스들의 나열"로 보인다.

이 태스크는 **(a) 합성·레이아웃만** 다룬다. 실제 스프라이트 아트 교체(이모지 제거)는 **범위 밖**(별도 태스크, 아트 에셋 확정 후).

### 중복 진단 (전투 정보가 6개 컴포넌트에 분산)

| 목업 구역 | 현재 그리는 컴포넌트 | 문제 |
| --- | --- | --- |
| 상단바(프로필·재화·타이머) | `TopBar` | 거의 맞음(유지) |
| 월드맵 바 (월드맵 \| STAGE C-S \| 타이머) | `CombatHeader` topRow | 단독 박스로 분리됨 |
| 적/내 카드 + VS (이름·HP·공격력) | `CombatHeader` cards **+** `BoxerStatus` **+** `CombatPanel` 헤딩 | **3중 중복** |
| 링 무대 (배경+두 파이터+데미지 숫자) | `CombatPanel` arena **+** `BoxerFigure` | 같은 전투를 2박스로 |
| AUTO/배속/스킬쿨 (무대 위 오버레이) | `CombatControls` **+** `SkillCooldownBar` | 별도 박스로 분리됨 |
| 타입 선택 4종 | `TypeSwitchPanel` | 위치만 재배치 |
| 강화 6종 그리드 | `UpgradePanel` | 위치만 재배치 |
| 하단 5탭 | `TabBar` | 맞음(유지) |

→ **`BoxerStatus`는 통째로 잉여**다. 정체성(이름·타입)은 `CombatHeader`/`TopBar`와, 능력치는 `UpgradePanel`과 겹치며 목업엔 해당 카드가 없다.

## 목표

전투 영역의 4~6개 박스를 **단일 `<CombatStage>` 컨테이너 1개**로 합성하고, `HomePage` 파이터 탭을 목업 수직 순서로 재조립한다. 표시 전용 — 순수 로직·저장·밸런스 무변경.

## 참고 문서

- `docs/ui/02-파이터-메인화면.md` §1(목업 요소), §5(합성 갭 — 본 태스크)
- 목업: `docs/ui/예시이미지/메인ui1.png`
- 기존 컴포넌트: `src/components/{CombatHeader,CombatPanel,BoxerFigure,CombatControls,SkillCooldownBar,BoxerStatus,TypeSwitchPanel,UpgradePanel,TopBar,TabBar}.tsx`
- `src/pages/HomePage.tsx`, `src/pages/HomePage.module.css`

## 목표 구조

```text
<TopBar/>                       ← 그대로
┌─ <CombatStage/> (신규 합성 컨테이너, 테두리 1개) ───────────┐
│  A. 월드맵 바   : CombatHeader.topRow + 보스타이머           │
│  B. 파이터 카드 : CombatHeader.cards (좌 내복서 / 우 적, HP·공격력) │
│  C. 링 무대(position:relative, 배경 1장) ──                  │
│       · 좌 BoxerFigure 스프라이트                            │
│       · 우 CombatPanel 몬스터 아바타                         │
│       · 오버레이: 데미지 숫자(feed) · 그로기 바              │
│       · 우상단 오버레이: CombatControls(AUTO/배속)          │
│       · 우하단 오버레이: SkillCooldownBar(원형 쿨)          │
└─────────────────────────────────────────────────────────────┘
<TypeSwitchPanel/>              ← "현재 파이터 타입"으로 재배치
<UpgradePanel/>                 ← 강화 그리드
<TabBar/>                       ← 그대로
```

## 작업 범위

1. **`CombatStage.tsx`/`CombatStage.module.css`(신규)**: A(월드맵 바)·B(파이터 카드)·C(링 무대)를 한 컨테이너로 합성. 링은 `position:relative`, 내부에 기존 `BoxerFigure`/`CombatControls`/`SkillCooldownBar`를 **오버레이 슬롯**으로 배치. 단일 배경 면(`background`/CSS) 위에 좌·우 파이터를 올린다.
2. **`CombatHeader` 흡수**: topRow(월드맵 바)·cards(파이터 카드)를 `CombatStage`로 이전. 단독 섹션 렌더 제거(컴포넌트는 보존하되 `HomePage`에서 직접 호출하지 않음, 또는 내부를 `CombatStage`가 import).
3. **`CombatPanel` 해체**: arena/HP/feed/그로기/보스타이머를 `CombatStage` 링으로 이전. 별도 박스 제거.
4. **`CombatControls`/`SkillCooldownBar`**: 무대 위 오버레이로 **스타일만** 변경(로직·액션 동일).
5. **`BoxerStatus` 드롭**: 파이터 탭에서 제거(잉여). 파일은 보존(미사용 — 추후 상세 능력치 시트에서 재활용 가능).
6. **`HomePage.tsx`/`HomePage.module.css` 재조립**: `.grid` 제거 → `<CombatStage/>` + `<TypeSwitchPanel/>` + `<UpgradePanel/>` 수직 배치. hero(타이틀·'처음부터')는 접거나 상단 메뉴로 이동(표현만, `reset` 로직 보존).
7. **반응형**: 360px·데스크톱에서 무대·오버레이·카드가 깨지지 않게 점검(가로 스크롤 없음, safe-area).

## 구현 원칙

- **표시 전용 합성**: `src/game/`·`formulas`·`constants`·스토어 액션 무변경. `BALANCE_VERSION`/`SCHEMA_VERSION` 불변(저장 키 `boxer-game.save.v6` 유지).
- **순수 함수·주입 원칙 그대로**: 컴포넌트는 스토어 셀렉터/액션만 사용. `Date.now`/`Math.random`/타이머 직접 사용 금지.
- **아트는 플레이스홀더 유지**: `BoxerFigure`(🧍/👊)·`CombatPanel`(🥊/👾) 이모지 그대로. 단, 링 슬롯을 `data-animation-key`/`data-pose` 구조로 만들어 **스프라이트 시트만 끼우면 되게** 자리만 확보.

## 🔴 최대 리스크 — E2E `data-testid` 보존

컴포넌트를 합치면서 아래 testid를 **같은 의미의 노드에 그대로 유지**해야 `e2e/*.spec.ts`가 깨지지 않는다(이동은 OK, 소실 금지).

```text
combat-header, stage-label, stage-progress, stage-dot(×5),
world-map-button, boxer-card(-name/-type/-hp/-attack),
monster-card(-name/-hp/-attack), combat-badge,
arena-boxer, arena-monster, boxer-hp, monster-hp, groggy / groggy-bar,
boss-timer, boss-warning, combat-feed, feed-damage/-combo/-skill/-defense,
auto-toggle, speed-toggle, manual-attack, skill-button,
boxer-figure(-sprite/-pose-label/-counter)
```

## 하지 않을 것

- 실제 픽셀 스프라이트/링 배경 아트 교체(별도 태스크, 에셋 확정 후).
- 전투 로직·밸런스·저장 스키마 변경(`BALANCE_VERSION`/`SCHEMA_VERSION` 불변).
- 새 게임 기능/강화 축/탭 추가. MVP 경계(PVP·길드·결제·장비·서버) 밖 손대지 않음.
- 월드맵 동작 구현(여전히 `TODO` 비활성 표기).

## 완료 기준

- 파이터 탭이 목업 수직 순서(상단바 → 단일 전투무대 → 타입선택 → 강화 → 하단탭)로 보인다.
- 전투 정보가 **단일 `CombatStage`** 안에 모이고, `BoxerStatus`·중복 헤딩·중복 HP 표기가 사라진다.
- AUTO/배속/스킬쿨이 링 무대 **위 오버레이**로 배치된다(별도 박스 아님).
- 위 `data-testid`가 전부 보존되어 `npm run e2e`가 통과한다.
- 360px·데스크톱에서 무대가 깨지지 않고 가로 스크롤이 없다.
- `node tools/check.mjs fast "<바뀐 파일>"` + `npm run e2e` 통과.

## 권장 단계 (각 단계 독립 커밋)

1. **CombatStage 골격**: CombatHeader(바+카드) + CombatPanel(링)을 흡수해 세로 1박스화, testid 보존.
2. **오버레이 배치**: CombatControls·SkillCooldownBar를 링 위로, BoxerFigure를 링 좌측 슬롯으로.
3. **HomePage 재조립**: `.grid` 제거, `BoxerStatus` 드롭, 타입/강화/탭 수직 배치.
4. **반응형·E2E**: 모바일 360 폭 점검 + `npm run e2e` 통과.

## 체크리스트

- [ ] `CombatStage.tsx`/`.module.css` 신규 — A(월드맵 바)·B(카드)·C(링) 합성, 단일 테두리
- [ ] `CombatHeader` topRow·cards 흡수, 단독 섹션 제거
- [ ] `CombatPanel` arena/HP/feed/그로기/보스타이머 링으로 이전, 별도 박스 제거
- [ ] `CombatControls`·`SkillCooldownBar` 무대 위 오버레이로(로직 불변)
- [ ] `BoxerFigure` 링 좌측 슬롯 배치(`data-animation-key`/`data-pose` 유지)
- [ ] `BoxerStatus` 파이터 탭에서 제거(파일 보존)
- [ ] `HomePage` `.grid` 제거 → 수직 섹션 재조립, hero 정리(`reset` 로직 보존)
- [ ] 위 `data-testid` 전수 보존
- [ ] 360px·데스크톱 깨짐 없음, 가로 스크롤 없음, safe-area
- [ ] `check.mjs fast` + `npm run e2e` 통과

## 결과 보고 형식

수정/신규 컴포넌트 / 합성 전후 박스 수 / 보존한 testid 목록 / 360px 점검 / E2E 결과 / 남은 TODO(아트 교체·월드맵 동작) / 다음 태스크.
