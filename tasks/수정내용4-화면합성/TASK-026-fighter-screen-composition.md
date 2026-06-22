# TASK-026 파이터 메인화면 최종 합성 (수정내용4)

> 수정내용3 `02-파이터-메인화면/TASK-025`(합성 스펙)를 **구현 단위로 구체화한 묶음**이다. 기획 근거·중복 진단·목표 구조는 `docs/ui/02-파이터-메인화면.md` §5 / TASK-025를 따른다. 본 문서는 "무엇을, 어느 파일에서, 어떤 순서로, 무엇을 보존하며" 고치는지를 담는다.

## 한 줄 목표

파이터 탭의 흩어진 6개 전투 박스를 **단일 `<CombatStage>` 한 박스**로 합성하고, 잉여 컴포넌트(`BoxerStatus`)를 드롭한 뒤, 파이터 탭을 목업 수직 순서(상단바 → 전투무대 → 타입선택 → 강화 → 하단탭)로 재조립한다. **표시 전용 — 로직·저장·밸런스 무변경.**

## 현재 상태 (착수 기준선)

`src/pages/HomePage.tsx`의 파이터 탭은 `.grid`(2열)에 아래 9개를 단순 나열한다.

```text
.grid
  ├─ BoxerStatus        ← 정체성·능력치 (잉여: TopBar/CombatHeader/UpgradePanel과 중복)
  ├─ CombatHeader       ← 월드맵 바 + 파이터 카드(이름·HP·공격력)
  ├─ BoxerFigure        ← 내 복서 포즈 스프라이트(이모지)
  ├─ CombatPanel        ← 링 arena + HP 바 + 그로기 + 보스타이머 + 전투 피드
  ├─ CombatControls     ← AUTO/배속/수동공격/수동스킬
  ├─ SkillCooldownBar   ← 기본 공격 4종 쿨타임 바
  ├─ SkillPanel         ← 전용 스킬 슬롯 장착/해제
  ├─ TypeSwitchPanel    ← 타입×성별 4카드
  └─ UpgradePanel       ← 강화 9종(공격/방어 그룹 탭)
```

→ 같은 전투 정보(정체성·HP)가 `BoxerStatus`/`CombatHeader`/`CombatPanel` **3중 중복**, 링이 `CombatPanel`+`BoxerFigure` 2박스로 쪼개져 "기능 박스 나열"로 보인다.

## 목표 구조 (합성 후)

```text
<TopBar/>                              ← 그대로 (유지)
┌─ <CombatStage/> (신규, 테두리 1개) ─────────────────────────┐
│  A. 월드맵 바  : [🗺월드맵] STAGE 12-3 ●─●─◆─◇─👹 (+보스타이머)│
│  B. 파이터 카드: [내 복서 이름·HP·🔥] VS [몬스터 이름·HP·🔥]   │
│  C. 링 무대 (position:relative, 배경 1면)                     │
│       · 좌: BoxerFigure 스프라이트(이모지 슬롯)               │
│       · 우: CombatPanel 몬스터 아바타(이모지 슬롯)            │
│       · 좌/우 하단 오버레이: boxer-hp / monster-hp 바, 그로기 │
│       · 중앙 오버레이: 데미지 숫자(combat-feed)               │
│       · 우상단 오버레이: CombatControls(AUTO/배속)            │
│       · 우하단 오버레이: SkillCooldownBar(원형 쿨)            │
│       · 하단 상태줄: combat-badge(자동 전투 중) + boss-timer  │
└──────────────────────────────────────────────────────────────┘
<TypeSwitchPanel/>                     ← "현재 파이터 타입"으로 재배치
<UpgradePanel/>                        ← 강화 그리드(공격/방어 탭)
<TabBar/>                              ← 그대로 (유지)
```

화면 예시(이모지 플레이스홀더 상태)는 `docs/ui/02-파이터-메인화면.md` §5 / 합성 후 목업 참고.

## 파일별 변경 계획

### 신규

| 파일 | 역할 |
| --- | --- |
| `src/components/CombatStage.tsx` | A(월드맵 바)·B(파이터 카드)·C(링 무대)를 한 컨테이너로 합성. 내부에서 `BoxerFigure`/`CombatControls`/`SkillCooldownBar`를 **오버레이 슬롯**으로 import·배치 |
| `src/components/CombatStage.module.css` | 단일 테두리 무대, 링 `position:relative` + 오버레이 절대 배치, 360px/데스크톱 반응형 |

### 수정

| 파일 | 변경 |
| --- | --- |
| `src/pages/HomePage.tsx` | `.grid` 제거 → `<CombatStage/>` + `<TypeSwitchPanel/>` + `<UpgradePanel/>` 수직 배치. `BoxerStatus`·`SkillPanel` 파이터 탭 호출 제거. hero(타이틀·'처음부터')는 접기/상단 메뉴로 이동(표현만, `reset` 로직 보존) |
| `src/pages/HomePage.module.css` | `.grid`/`.status` 등 미사용 규칙 정리, 수직 섹션 간격 |
| `src/components/CombatHeader.tsx` | topRow(월드맵 바)·cards를 `CombatStage`가 사용하도록 분리/노출. 단독 섹션으로는 더 이상 렌더하지 않음(컴포넌트·testid는 보존) |
| `src/components/CombatPanel.tsx` | arena/HP/feed/그로기/보스타이머를 `CombatStage` 링으로 이전. 별도 박스 래퍼 제거 |
| `src/components/CombatControls.tsx` / `CombatControls.module.css` | 무대 위 오버레이로 **스타일만** 변경(액션·상태 동일) |
| `src/components/SkillCooldownBar.tsx` | 무대 우하단 원형 오버레이 배치(표시 로직 동일, `now`는 계속 주입 `getNow()`) |

### 보존(파일 유지·파이터 탭에서 미호출)

- `src/components/BoxerStatus.tsx` — **드롭**(파일 삭제 금지, 추후 상세 능력치 시트에서 재활용).
- `src/components/SkillPanel.tsx` — 가정/TODO: 목업의 파이터 무대에는 슬롯 장착 UI가 없다. 파이터 탭에서 제거하고 파일 보존(스킬 슬롯 시스템 TASK-010 정식화 시 별도 위치로 재배치). **결정 필요 항목**(아래 `가정:` 참조).

> `가정:` `SkillPanel` 처리는 TASK-025 스펙에 명시가 없다. 목업 일치를 우선해 파이터 무대에서는 내리되 파일은 보존한다. 만약 슬롯 장착 UI를 화면에 유지해야 한다면 `CombatStage` 아래 별도 섹션으로 두는 대안을 남긴다(범위 확장 시 재논의).

## 🔴 최대 리스크 — E2E `data-testid` 전수 보존

컴포넌트를 합치면서 아래 testid를 **같은 의미의 노드에 그대로 유지**(이동 OK, 소실 금지)해야 `e2e/*.spec.ts`가 깨지지 않는다.

```text
combat-header, stage-label, stage-progress, stage-dot(×5),
world-map-button, boxer-card(-name/-type/-hp/-attack),
monster-card(-name/-hp/-attack), combat-badge,
arena-boxer, arena-monster, boxer-hp, monster-hp, groggy / groggy-bar,
boss-timer, boss-warning, combat-feed, feed-damage/-combo/-skill/-defense,
auto-toggle, speed-toggle, manual-attack, skill-button,
boxer-figure(-sprite/-pose-label/-counter)
```

> 합성 전에 `rg -n "data-testid" src/components/{CombatHeader,CombatPanel,BoxerFigure,CombatControls,SkillCooldownBar}.tsx`로 현재 testid 위치를 스냅샷해 두고, 합성 후 같은 목록이 DOM에 남았는지 대조한다.

## 구현 단계 (각 단계 독립 커밋)

1. **CombatStage 골격** — `CombatStage.tsx`/`.module.css` 신규. `CombatHeader`의 topRow+cards와 `CombatPanel`의 링/HP/feed를 흡수해 세로 1박스화. 이 단계에서 testid는 전부 그대로 옮겨 붙이는 것이 목표(시각만 변함).
2. **오버레이 배치** — `CombatControls`·`SkillCooldownBar`를 링 위 절대배치 오버레이로, `BoxerFigure`를 링 좌측 슬롯으로. `data-animation-key`/`data-pose` 구조 유지(아트 끼울 자리 확보).
3. **HomePage 재조립** — `.grid` 제거, `BoxerStatus`·`SkillPanel` 파이터 탭 호출 제거, `<CombatStage/>`+`<TypeSwitchPanel/>`+`<UpgradePanel/>` 수직 배치. hero 정리(`reset` 로직 보존).
4. **반응형·E2E** — 360px·데스크톱 깨짐/가로 스크롤/safe-area 점검 후 `npm run e2e` 통과까지.

## 구현 원칙

- **표시 전용**: `src/game/`·`formulas`·`constants`·스토어 액션 무변경. `BALANCE_VERSION`/`SCHEMA_VERSION` 불변(저장 키 `boxer-game.save.v8` 유지).
- **셀렉터/액션만 사용**: 데이터는 기존 셀렉터(`calculateCombatStats`·`getStageDefinition`·`calculateMonsterAttackPower`·`combat.*Hp`)에서 그대로 파생. 합성 과정에서 새 계산 로직을 만들지 않는다.
- **아트 플레이스홀더 유지**: 이모지 그대로. 링 슬롯을 `data-animation-key`/`data-pose` 구조로 만들어 **스프라이트 시트만 끼우면 되게** 자리만 확보.
- **유일 타이머 구조 유지**: 합성은 JSX/CSS 재배치일 뿐 타이머·스케줄에 손대지 않는다.

## 하지 않을 것

- 실제 픽셀 스프라이트/링 배경 아트 교체(별도 태스크, 에셋 확정 후).
- 전투 로직·밸런스·저장 스키마 변경(`BALANCE_VERSION`/`SCHEMA_VERSION` 불변).
- 새 게임 기능/강화 축/탭 추가. 월드맵 동작 구현(여전히 `TODO` 비활성 표기).
- `BoxerStatus`/`SkillPanel` **파일 삭제**(드롭=미호출, 보존).

## 완료 기준

- [ ] 파이터 탭이 목업 수직 순서(상단바 → 단일 전투무대 → 타입선택 → 강화 → 하단탭)로 보인다.
- [ ] 전투 정보가 **단일 `CombatStage`** 안에 모이고, `BoxerStatus`·중복 헤딩·중복 HP 표기가 사라진다.
- [ ] AUTO/배속/스킬쿨이 링 무대 **위 오버레이**로 배치된다(별도 박스 아님).
- [ ] 위 `data-testid`가 전부 보존되어 `npm run e2e`가 통과한다.
- [ ] 360px·데스크톱에서 무대가 깨지지 않고 가로 스크롤이 없다.
- [ ] `BALANCE_VERSION`/`SCHEMA_VERSION` 불변(저장 키 `boxer-game.save.v8`).
- [ ] `node tools/check.mjs fast "<바뀐 파일>"` + `npm run e2e` 통과.

## 체크리스트

- [ ] `CombatStage.tsx`/`.module.css` 신규 — A(월드맵 바)·B(카드)·C(링) 합성, 단일 테두리
- [ ] `CombatHeader` topRow·cards 흡수, 단독 섹션 제거(컴포넌트·testid 보존)
- [ ] `CombatPanel` arena/HP/feed/그로기/보스타이머 링으로 이전, 별도 박스 제거
- [ ] `CombatControls`·`SkillCooldownBar` 무대 위 오버레이로(로직 불변)
- [ ] `BoxerFigure` 링 좌측 슬롯 배치(`data-animation-key`/`data-pose` 유지)
- [ ] `BoxerStatus` 파이터 탭에서 제거(파일 보존)
- [ ] `SkillPanel` 파이터 탭에서 제거(파일 보존, `가정:` 재논의 여지)
- [ ] `HomePage` `.grid` 제거 → 수직 섹션 재조립, hero 정리(`reset` 로직 보존)
- [ ] 위 `data-testid` 전수 보존(합성 전후 스냅샷 대조)
- [ ] 360px·데스크톱 깨짐 없음, 가로 스크롤 없음, safe-area
- [ ] `check.mjs fast` + `npm run e2e` 통과

## 결과 보고 형식

수정/신규 컴포넌트 / 합성 전후 박스 수 / 보존한 testid 목록 / `SkillPanel` 처리 결정 / 360px 점검 / E2E 결과 / 남은 TODO(아트 교체·월드맵 동작) / 다음 태스크.
</content>
