# 기술 스택

## 문서 목적

복서키우기 v0.1의 구현 기술과 코드 분리 원칙을 정의해 개발 시작점과 확장 경계를 명확히 한다.

## 기술 스택 요약

| 영역 | 선택 | 용도 |
| --- | --- | --- |
| 빌드 | Vite | 빠른 개발 서버와 정적 프로덕션 빌드 |
| UI | React + TypeScript | 화면 구성과 정적 타입 검증 |
| 상태 | Zustand | 게임 상태와 UI 액션 관리 |
| 스타일 | CSS Modules 또는 Tailwind CSS (`TODO`) | 컴포넌트 스타일 관리 |
| 저장 | localStorage | v0.1 진행도와 설정 저장 |
| 플랫폼 | 앱인토스 WebView SDK | 앱 생명주기와 플랫폼 기능 연동 |

## WebView 웹앱으로 시작하는 이유

- v0.1은 2D 화면과 수치 중심의 방치형 게임이라 브라우저 기술로 핵심 루프를 빠르게 검증할 수 있다.
- Unity나 Godot 도입에 따른 빌드 체계와 런타임 복잡도를 초기 범위에서 피한다.
- 앱인토스 WebView 제약과 SDK 호환성은 개발 착수 전에 `공식 문서 확인 필요`.

## 프론트엔드 구성

- React 컴포넌트는 표시와 사용자 입력 연결만 담당한다.
- TypeScript `strict` 모드를 사용하고 게임 데이터 타입을 명시한다.
- 라우팅은 실제 화면 수가 확정된 뒤 결정한다. (`TODO`)
- SSR에 의존하지 않으며 정적 빌드 결과가 WebView에서 실행되도록 한다.
- 앱인토스 SDK 호출은 플랫폼 어댑터에 모아 브라우저 단독 실행도 가능하게 한다.

## 상태 관리

- Zustand 스토어에는 현재 복서, 재화, 진행도, 설정과 이를 변경하는 액션을 둔다.
- 계산 가능한 값은 중복 저장하지 않고 선택자 또는 순수 함수로 계산한다.
- 저장 데이터와 일시적인 UI 상태를 구분한다.

## 저장 방식

- v0.1은 localStorage로 빠르게 검증한다.
- 저장 데이터에 `schemaVersion`, 마지막 저장 시각, 복서 상태를 포함한다.
- 저장 전 직렬화하고 불러올 때 타입, 범위, 필수 필드를 검증한다.
- 손상되거나 지원하지 않는 버전은 백업 후 초기화하는 정책을 마련한다. (`TODO`)
- 앱인토스 사용자 식별자 기반 서버 저장과 기기 간 동기화는 추후 검토한다. (`TODO`)

## 게임 로직 분리 원칙

- 게임 로직은 UI와 분리한다.
- 전투력 계산, 훈련 처리, 경기 결과 계산은 입력과 출력이 명확한 순수 함수로 작성한다.
- 시간, 난수, 저장소 같은 외부 의존성은 함수 인자나 어댑터로 주입한다.
- 저장/불러오기는 별도 모듈로 분리하고 스토어가 localStorage를 직접 호출하지 않게 한다.
- 핵심 수식과 저장 마이그레이션에는 단위 테스트를 작성한다.

## 추천 폴더 구조

```txt
src/
  game/
    types.ts
    constants.ts
    formulas.ts
    training.ts
    battle.ts
    save.ts
  data/
    trainings.ts
    opponents.ts
    equipments.ts
  stores/
    gameStore.ts
  components/
    BoxerStatus.tsx
    TrainingPanel.tsx
    BattlePanel.tsx
  pages/
    HomePage.tsx
```

`platform/`에는 앱인토스 SDK 어댑터를, `game/*.test.ts`에는 핵심 규칙 테스트를 추가한다.

## v0.1에서 사용하지 않을 기술

- Unity, Godot 등 별도 게임 엔진
- SSR 프레임워크와 서버 렌더링
- 서버 데이터베이스, 계정 동기화, 실시간 통신
- 결제, 광고, 리더보드, PVP용 SDK

## 추후 확장

- 서버 저장 도입 시 저장소 인터페이스의 localStorage 구현을 API 구현으로 교체한다.
- 콘텐츠 데이터는 코드에서 JSON 또는 관리 도구로 옮길 수 있게 ID 기반으로 참조한다.
- 분석, 원격 설정, 계정 연동은 사용자 동의와 앱인토스 정책을 확인한 뒤 추가한다. (`공식 문서 확인 필요`)

## 관련 문서

- [앱인토스 출시 전략](./platform-apps-in-toss.md)
- [데이터 모델](./기획/docs/data-model.md)
- [핵심 루프](./기획/docs/core-loop.md)
- [MVP 범위](./기획/docs/mvp-scope.md)
