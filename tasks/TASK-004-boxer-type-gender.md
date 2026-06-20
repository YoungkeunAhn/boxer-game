# TASK-004 복서 타입·성별 도입 (v1.1)

## 목표

복서 생성 시 **타입(인파이터/아웃복서)**과 **성별(남/여)**을 선택하고, 저장·복원·표시되게 한다.
이 태스크는 식별·외형·저장 골격을 먼저 세우는 단계다. 타입별 전투 보정의 실제 효과는 후속 태스크(HP/회피/스킬)에서 연결하되, **타입 보정 테이블의 골격**은 여기서 정의한다.

## 참고 문서

- `docs/기획/boxer/types.md`, `docs/기획/boxer/infighter.md`, `docs/기획/boxer/out-boxer.md`, `docs/기획/boxer/gender.md`
- `docs/기획/systems/data-model.md`, `docs/기획/systems/save-model.md`
- `docs/기획/presentation/ui.md`

## 작업 범위

1. `src/game/types.ts`
   - `export type BoxerType = 'INFIGHTER' | 'OUT_BOXER';`
   - `export type Gender = 'MALE' | 'FEMALE';`
   - `Boxer`에 `boxerType: BoxerType`, `gender: Gender` 추가.
   - `SaveDataV2` → `SaveDataV3`로 확장(`schemaVersion: 3`). `SaveData = SaveDataV3`.
2. `src/game/constants.ts`
   - 타입 enum 상수와 **타입별 보정 테이블 골격**을 추가한다. 가정: 인파이터 = 체력·방어·피해감소 높음 / 회피·카운터 낮음, 아웃복서 = 회피·카운터 높음 / 체력·방어 낮음. 실제 계수는 후속 태스크에서 사용하므로 우선 `1.0` 같은 중립 기준 + `가정:` 주석으로 자리만 잡는다.
   - `SCHEMA_VERSION`을 3으로 올린다. (성별은 외형 전용이므로 `BALANCE_VERSION`은 전투 보정을 실제로 적용하는 태스크에서 올린다.)
3. `src/game/save.ts`
   - 저장 키를 `boxer-game.save.v3`로 올린다. 로드 시 타입 가드로 `boxerType`/`gender` 검증.
   - 가정: 기존 `boxer-game.save.v2` 키는 삭제하지 않고 `legacy`로 안내(타입·성별 정보가 없어 자동 마이그레이션 불가). 마이그레이션을 택할 경우 기본값(`INFIGHTER`/`MALE`)을 부여하는 방안을 `가정:`으로 문서화하고 테스트한다.
4. 복서 생성 플로우(생성 컴포넌트 / `HomePage` / `gameStore`의 `createBoxer`)
   - 이름 입력 + 타입 2지선다 + 성별 2지선다를 한 화면에서 받는다.
   - 타입/성별별 한 줄 설명(인파이터=압박·탱커, 아웃복서=회피·카운터)을 표시한다.
5. `src/components/BoxerStatus.tsx`에 타입·성별 라벨 표시.
6. 테스트: `types`/`save`/`gameStore`의 생성·저장·복원 케이스, v2 legacy 처리.

## 구현 원칙

- 성별은 전투 성능에 영향 없음(외형·모션 식별자 전용). 전투는 타입이 100% 결정한다.
- 타입 보정의 실제 수치는 미확정이므로 `가정:`으로 표시하고, HP/회피/카운터를 도입하는 태스크에서 일관되게 연결한다.

## 하지 않을 것

- 복서 HP·몬스터 공격·스킬·신규 강화(후속 태스크).
- 외형 스프라이트/애니메이션 리소스 제작(TASK-012에서 키 설계).

## 완료 기준

- 새 게임에서 이름·타입·성별을 선택하면 그 값으로 복서가 생성된다.
- 저장 후 재접속하면 타입·성별이 복원되고 상태창에 표시된다.
- v2 저장은 삭제되지 않고 안내(legacy)되며 새 게임으로 진입할 수 있다.
- `node tools/check.mjs fast` 통과. UI를 건드렸다면 `npm run e2e`도 통과.

## 결과 보고 형식

수정 파일 / 추가 타입·상수 / 스키마 버전 변경 / 생성 플로우 동작 / 남은 TODO / 다음 태스크.
