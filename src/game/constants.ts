import type {
  AttackBeat,
  AttackType,
  AutoMode,
  BoxerType,
  CombatStats,
  ComboId,
  EquippedSkills,
  Gender,
  Hand,
  QuestDef,
  QuestReward,
  SpeedMultiplier,
  UpgradeKey,
  UpgradeLevels,
} from "./types";

export const INITIAL_UPGRADE_LEVELS: Readonly<UpgradeLevels> = {
  attackPower: 0,
  attackSpeed: 0,
  critRate: 0,
  critDamage: 0,
  goldBonus: 0,
  maxHp: 0,
  defense: 0,
  dodge: 0,
  counter: 0,
};

export const INITIAL_COMBAT_STATS: Readonly<CombatStats> = {
  attackPower: 10,
  attackSpeed: 1,
  critRate: 0.05,
  critDamage: 2,
  goldBonus: 0,
  // 확정값(BALANCE 8, TASK-013): 기본 체력 100·방어 0.
  maxHp: 100,
  defense: 0,
  // 확정값(BALANCE 8, TASK-013): 기본 회피율 0.05·카운터 계수 1.0.
  dodge: 0.05,
  counter: 1.0,
};

export const UPGRADE_BASE_COSTS: Readonly<Record<UpgradeKey, number>> = {
  attackPower: 10,
  attackSpeed: 25,
  critRate: 40,
  critDamage: 50,
  goldBonus: 30,
  // 확정값(BALANCE 8, TASK-013): 체력 20·방어 35.
  maxHp: 20,
  defense: 35,
  // 확정값(BALANCE 8, TASK-013): 회피 45·카운터 55.
  dodge: 45,
  counter: 55,
};

export const UPGRADE_MAX_LEVELS: Readonly<Record<UpgradeKey, number | null>> = {
  attackPower: null,
  attackSpeed: 40,
  critRate: 45,
  critDamage: 30,
  goldBonus: 100,
  // 확정값(BALANCE 8, TASK-013): 체력 무제한·방어 60레벨 상한.
  maxHp: null,
  defense: 60,
  // 확정값(BALANCE 8, TASK-013): 회피 55레벨 상한(기본 0.05 + 0.01×55 = 0.6 = CAP), 카운터 50레벨 상한.
  dodge: 55,
  counter: 50,
};

// 확정값(BALANCE 8, TASK-013): 체력 강화 1레벨당 +25 HP(선형).
export const MAX_HP_PER_LEVEL = 25;
// 확정값(BALANCE 8, TASK-013): 방어 강화 1레벨당 방어 +4.
export const DEFENSE_PER_LEVEL = 4;
// 확정값(BALANCE 8, TASK-013): 피해감소율 상한 80%.
export const DEFENSE_DAMAGE_REDUCTION_CAP = 0.8;
// 확정값(BALANCE 8, TASK-013): 피해감소율 = defense / (defense + K), K=100.
export const DEFENSE_REDUCTION_K = 100;

// === v1.2b 회피·가드·카운터 (확정값, BALANCE 8) ===
// 확정(TASK-013): 판정 순서 회피 → 가드 → 피격. 카운터는 회피(아웃복서)·가드(인파이터) 성공의 부수효과.
export const DODGE_PER_LEVEL = 0.01;
export const DODGE_RATE_CAP = 0.6;
export const COUNTER_PER_LEVEL = 0.04;
export const COUNTER_RATE_CAP = 5.0;
export const COUNTER_BASE_DAMAGE_RATE = 0.8;
export const GUARD_DAMAGE_REDUCTION = 0.25;
export const GUARD_DAMAGE_REDUCTION_TOTAL_CAP = 0.9;
export const INFIGHTER_GUARD_COUNTER_RATE = 0.3;

// 확정값(BALANCE 8, TASK-013): 1장 1스테이지 몬스터 기본 공격력 8.
export const MONSTER_BASE_ATTACK_POWER = 8;
// 확정값(BALANCE 8, TASK-013): 몬스터 공격 쿨타임 2000ms.
export const MONSTER_ATTACK_INTERVAL_MS = 2_000;
// 확정값(BALANCE 8, TASK-013): 몬스터 공격력 장 배율 1.5^(chapter-1).
export const MONSTER_ATTACK_CHAPTER_MULTIPLIER = 1.5;
// 확정값(BALANCE 8, TASK-013): 스테이지 내 공격력 배율.
export const MONSTER_ATTACK_STAGE_MULTIPLIERS = [1.0, 1.05, 1.1, 1.2, 1.6] as const;
// 확정값(BALANCE 8, TASK-013): 넉다운 시 현재 스테이지 골드의 20% 부분 지급.
export const KNOCKDOWN_PARTIAL_GOLD_RATE = 0.2;
// TODO(연출 미적용): 몬스터 공격 예고 600ms. 예고 연출 상수만 두고 전투 판정에는 미사용(잔여 TODO).
export const MONSTER_ATTACK_PREP_MS = 600;

// === v1.3a 기본 공격 4종 (확정값, BALANCE 8) ===
export const ATTACK_TYPES = ["JAB", "STRAIGHT", "HOOK", "UPPER"] as const satisfies readonly AttackType[];

// 문서 명시 쿨타임(공격 속도 1.0 기준). 실효 쿨타임 = 이 값 / attackSpeed.
export const ATTACK_COOLDOWN_MS: Readonly<Record<AttackType, number>> = {
  JAB: 1_000,
  STRAIGHT: 5_000,
  HOOK: 10_000,
  UPPER: 15_000,
};

// 확정값(BALANCE 8): 공격별 데미지 계수(attackPower 배수). 잽 낮음~어퍼 매우 높음.
// 초당 가중합 Σ(계수 / 쿨타임초) = 0.3 + 1.5/5 + 2.0/10 + 3.0/15 = 1.0 으로 맞춰
// 평균 DPS를 기존 단일 공격(공격력×attackSpeed/초)과 동일하게 유지한다(처치·골드·보스 진행 동일).
export const ATTACK_DAMAGE_COEFFICIENTS: Readonly<Record<AttackType, number>> = {
  JAB: 0.3,
  STRAIGHT: 1.5,
  HOOK: 2.0,
  UPPER: 3.0,
};

// 손 고정 규칙: 잽=왼손, 스트레이트=오른손, 훅·어퍼=선택(null → 좌우 교대).
export const ATTACK_FIXED_HAND: Readonly<Record<AttackType, Hand | null>> = {
  JAB: "LEFT",
  STRAIGHT: "RIGHT",
  HOOK: null,
  UPPER: null,
};

// ready 공격이 여러 개일 때의 선택 우선순위(강한 공격 우선). 잽이 가장 자주, 어퍼가 가장 드물게 발동한다.
export const ATTACK_PRIORITY = ["UPPER", "HOOK", "STRAIGHT", "JAB"] as const satisfies readonly AttackType[];

// === v1.3b 콤비네이션·콤보 게이지 (확정값, BALANCE 8) ===
// 콤비네이션 정의(문서 docs/기획/combat/combinations.md). 순서+손이 모두 일치해야 발동한다.
//   원투:       left_jab → right_straight                                  → 스트레이트 데미지 증가
//   원투 훅:    left_jab → right_straight → left_hook                      → 훅 치명타 확률 증가
//   풀 콤비네이션: left_jab → right_straight → left_hook → right_upper      → 어퍼 데미지 증가(+그로기: TASK-009)
// 각 정의는 attackHistory 끝부분과 정확히 일치(suffix match)할 때 발동한다.
export type Combination = {
  id: ComboId;
  sequence: readonly AttackBeat[];
};

export const COMBINATIONS: readonly Combination[] = [
  {
    id: "FULL_COMBO",
    sequence: [
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
      { attackType: "HOOK", hand: "LEFT" },
      { attackType: "UPPER", hand: "RIGHT" },
    ],
  },
  {
    id: "ONE_TWO_HOOK",
    sequence: [
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
      { attackType: "HOOK", hand: "LEFT" },
    ],
  },
  {
    id: "ONE_TWO",
    sequence: [
      { attackType: "JAB", hand: "LEFT" },
      { attackType: "STRAIGHT", hand: "RIGHT" },
    ],
  },
] as const;

// attackHistory 길이 상한. 가장 긴 콤보(풀 콤비네이션 4타)를 담을 수 있어야 한다.
export const ATTACK_HISTORY_LIMIT = 4;

// 확정값(BALANCE 8, TASK-013): 콤비네이션 보너스.
// 원투: 마무리 스트레이트 데미지 ×1.3.
export const ONE_TWO_STRAIGHT_DAMAGE_MULT = 1.3;
// 원투 훅: 마무리 훅의 치명타 확률 +0.2(가산, 최종 확률은 1.0 클램프).
export const ONE_TWO_HOOK_CRIT_BONUS = 0.2;
// 풀 콤비네이션: 마무리 어퍼 데미지 ×1.5.
export const FULL_COMBO_UPPER_DAMAGE_MULT = 1.5;
// 풀 콤비네이션 마무리 어퍼가 기본 어퍼 그로기 누적에 더하는 보너스(확정 +20).
export const FULL_COMBO_GROGGY_BONUS = 20;

// 확정값(BALANCE 8, TASK-013): 콤보 게이지. 잽 1회당 +10, 상한 100. 게이지 소비/효과는 MVP 밖(미도입).
export const COMBO_GAUGE_PER_JAB = 10;
export const COMBO_GAUGE_MAX = 100;

// TODO(잔여): 콤보 끊김 조건은 '시퀀스 이탈/킬·전이·넉다운·보스 타임아웃 리셋'만 적용한다.
//   시간 초과 끊김(COMBO_WINDOW_MS)은 attackHistory에 타임스탬프가 필요해 복잡도가 높으므로 의도적으로 미구현 TODO로 남긴다.

// === v1.3c 보스 그로기 (확정값, BALANCE 8) ===
// 보스 그로기 게이지 상한. 누적이 이 값에 도달하면 보스가 그로기 상태로 진입한다.
export const GROGGY_MAX_BASE = 100;
// 공격별 기본 그로기 누적량. 잽·스트레이트는 0, 훅·어퍼만 누적(타입 배율은 별도 곱).
export const GROGGY_GAIN_BY_ATTACK: Readonly<Record<AttackType, number>> = {
  JAB: 0,
  STRAIGHT: 0,
  HOOK: 15,
  UPPER: 25,
};
// 그로기 상태 지속 시간(ms). 진입 시각 + 이 값까지 보스가 그로기 상태로 유지된다.
export const GROGGY_DURATION_MS = 4_000;
// 그로기 상태의 보스가 받는 피해 배수(>1). 그로기 중 친 공격에만 적용한다.
export const GROGGY_DAMAGE_MULT = 1.5;
// TODO(연출 미적용): 보스 강공격 예고 판정 시점(ms). 시점 상수만 두고 전투 판정에는 미사용(잔여 TODO).
export const BOSS_WARNING_LEAD_MS = 800;

// === v1.3d 전용 스킬 슬롯·수치 (확정값, BALANCE 8) ===
// 슬롯 구조: 기본 4종(고정) + 액티브 최대 3 + 패시브 1.
export const ACTIVE_SKILL_SLOT_MAX = 3;
export const PASSIVE_SKILL_SLOT_MAX = 1;

// 액티브 스킬 자동 발동 정책(한 곳에서 관리, skills.ts가 참조):
//   확정(TASK-013): 쿨타임이 끝난 액티브 스킬을 슬롯 순서(Slot1>Slot2>Slot3)로 한 틱당 1개 자동 발동한다.
//   확정: 기본 타격은 그대로 나가고 스킬은 그 위에 별도 이벤트로 더해진다(같은 틱 동시 발동 허용).
//   확정: 전투 시작 시 모든 액티브 스킬은 cooldownMs 후 첫 발동(시작 즉시 발동 아님)으로 동결한다.
export const SKILL_FIRST_READY_DELAY = "AFTER_COOLDOWN" as const;

// 확정값(BALANCE 8, TASK-013): 스킬별 수치. 데이터 모듈(skills.ts)은 식별·메타·쿨타임을 담고, 수치는 여기에 모은다.
// 문서 명시값(지속 5초/6초, +15%/+20%/+10%, Groggy+20/+15)과 데미지 계수·쿨타임·다단 타수·
// 내상 초당 피해·철벽가드 감소율·스텝백카운터 계수를 BALANCE 8 확정값으로 동결한다.
export const SKILL_NUMBERS = {
  // --- 인파이터 ---
  // 리버샷: 강한 단일 + 내상(5초 DoT) + 보스 Groggy +20.
  liver_shot: {
    cooldownMs: 8_000,
    damageCoefficient: 2.5, // attackPower 배수(확정)
    groggyGain: 20, // 문서 명시
    internalDurationMs: 5_000, // 문서 명시(내상 5초)
    internalTickMs: 1_000, // 확정: 1초마다 1틱
    internalDamageCoefficient: 0.4, // 확정: 틱당 attackPower 배수
  },
  // 철벽가드(패시브): 받는 피해 -60%(문서 명시).
  iron_guard: {
    damageReduction: 0.6, // 문서 명시
  },
  // 압박: 6초간 훅/어퍼 +20%, 몬스터 공격력 -10%(문서 명시).
  pressure: {
    cooldownMs: 12_000,
    durationMs: 6_000, // 문서 명시
    hookUpperDamageBonus: 0.2, // 문서 명시
    monsterAttackWeaken: 0.1, // 문서 명시
  },
  // 가젤펀치: 강한 단일 강타 + Groggy +15(문서 명시).
  gazelle_punch: {
    cooldownMs: 10_000,
    damageCoefficient: 3.5, // 확정
    groggyGain: 15, // 문서 명시
  },
  // 뎀프시롤: 다단 훅 + 대량 그로기(문서 예시 4타). 각 타격 계수와 그로기 총량 확정.
  dempsey_roll: {
    cooldownMs: 18_000,
    hits: 4, // 문서 예시 4타
    hitCoefficient: 1.0, // 확정: 타당 attackPower 배수
    groggyGain: 40, // 확정: 대량 그로기
  },
  // --- 아웃복서 ---
  // 고스트스텝: 완전 회피(다음 몬스터 공격 무효) + 카운터 강화 + 스트레이트 쿨 초기화(확정: 회피 버프로 모델링).
  ghost_step: {
    cooldownMs: 12_000,
    durationMs: 2_000, // 확정: 다음 공격 무효 창
    dodgeBonus: 1.0, // 확정: 완전 회피(소비처에서 1.0 클램프)
    counterBonus: 1.0, // 확정: 카운터 계수 +1.0
  },
  // 나비스텝: 5초간 회피율 +15%, 쿨타임 회복 +20%, 카운터 확률 +10%(문서 명시).
  navi_step: {
    cooldownMs: 14_000,
    durationMs: 5_000, // 문서 명시
    dodgeBonus: 0.15, // 문서 명시
    cooldownSpeedup: 0.2, // 문서 명시
    counterBonus: 0.1, // 문서 명시(카운터 확률 → 카운터 계수 가산으로 모델링, 확정)
  },
  // 스텝백카운터(패시브): 회피 성공 시 자동 강한 반격. 반격 계수 확정.
  step_back_counter: {
    counterRate: 1.2, // 확정: calculateCounterDamage rate(기본 회피 카운터 0.8보다 강함)
  },
  // 팬텀잽: 다단 잽(문서 예시 3타) + 짧은 회피 버프. 계수·지속 확정.
  phantom_jab: {
    cooldownMs: 9_000,
    hits: 3, // 문서 예시 3타
    hitCoefficient: 0.3, // 확정: 잽 계수와 동일
    durationMs: 2_000, // 확정: 짧은 회피 버프
    dodgeBonus: 0.1, // 확정
  },
  // 거리조절: 6초간 몬스터 공격 쿨타임 +20%, 복서 회피율 +10%(문서 명시).
  distance_control: {
    cooldownMs: 13_000,
    durationMs: 6_000, // 문서 명시
    monsterCooldownDelay: 0.2, // 문서 명시
    dodgeBonus: 0.1, // 문서 명시
  },
} as const;

// 확정값(BALANCE 8, TASK-013): 타입별 기본 장착 스킬(문서 equip.md 장착 예시 기준). 액티브 3 + 패시브 1.
export const DEFAULT_EQUIPPED_SKILLS: Readonly<Record<BoxerType, EquippedSkills>> = {
  INFIGHTER: {
    active: ["liver_shot", "pressure", "dempsey_roll"],
    passive: "iron_guard",
  },
  OUT_BOXER: {
    active: ["phantom_jab", "ghost_step", "navi_step"],
    passive: "step_back_counter",
  },
};

// === TASK-015 전투 컨트롤(AUTO·배속·수동) — 휘발 UI 상태(저장 안 함) ===
// 가정: 배속 단계는 x1/x2만(확장은 추후, x4 이상은 이번 범위 밖). 임시값.
export const SPEED_MULTIPLIERS = [1, 2] as const satisfies readonly SpeedMultiplier[];
// 가정: 기본 배속 x1, 기본 모드 AUTO(현행 자동 전투 유지). 임시값.
export const DEFAULT_SPEED_MULTIPLIER: SpeedMultiplier = 1;
export const DEFAULT_AUTO_MODE: AutoMode = "AUTO";
// 수동 스킬: MANUAL 모드에서 장착 액티브 슬롯의 준비된 스킬 1개(Slot1>2>3 우선순위)를 발동한다(통합 이후 슬롯 기반).
//   (이전 임시 구현이던 콤보 게이지 소비형 피니시 'FINISHER_DAMAGE_MULT'는 TASK-010 전용 스킬 슬롯 도입으로 제거.)

export const BOSS_TIME_LIMIT_MS = 30_000;
export const OFFLINE_MAX_DURATION_MS = 8 * 60 * 60 * 1_000;
// v4(TASK-005): HP·방어 강화 추가 → SCHEMA 3→4, 몬스터 공격·HP/방어 곡선·타입 maxHp/defense 계수 → BALANCE 2→3.
// v5(TASK-006): 회피·카운터 강화 추가 → SCHEMA 4→5, 회피·가드·카운터 수식·타입 evasion/counter/damageReduction 계수 → BALANCE 3→4.
// v1.3a(TASK-007): 기본 공격 4종·손·쿨타임 도입. 저장 형태(Boxer/SaveData) 불변 → SCHEMA 유지(5),
//   공격별 데미지 계수·쿨타임·평균 DPS 환산 수식 → BALANCE 4→5.
// v1.3b(TASK-008): 콤비네이션 보너스·콤보 게이지 도입. 콤보 상태는 CombatRuntime 런타임 전용 필드라
//   저장 형태(Boxer/SaveData) 불변 → SCHEMA 유지(5). 콤비네이션 보너스(데미지 배수·치명타 가산)라는
//   새 밸런스 수식 도입 → BALANCE 5→6.
// === 014~021 라인(메인): 전투 컨트롤·타입 전환·애니메이션·재화/레벨·퀘스트 ===
// TASK-015: 전투 컨트롤(AUTO/배속/수동) 도입 — 컨트롤은 휘발 UI 상태(저장 안 함), 보스 타임아웃은
//   게임 시간 기준이라 배속이 진행/처치/골드/타임아웃 결과를 바꾸지 않음 → SCHEMA/BALANCE 불변.
// TASK-017: boxer.type/gender 변경 경로(런타임 타입 전환)만 추가 — 신규 저장 필드·새 밸런스 수식 없음.
//   기존 calculateCombatStats의 typeMultiplier(BOXER_TYPE_MODIFIERS)를 재적용할 뿐 → SCHEMA/BALANCE 불변.
// TASK-018: 타입별 6포즈 애니메이션 — 순수 표현 계층(애니 키 도출·포즈 매핑·타입 톤·CSS). 신규 키는
//   boxer_counter 1개뿐이고 전투 판정·저장 형태·밸런스 수식은 전혀 바뀌지 않음 → SCHEMA/BALANCE 불변.
//   ANIMATION_HOLD_MS/TYPE_TONE은 표현용 가정값이라 전투 계산에 들어가지 않음(BALANCE 대상 아님).
// TASK-019(P3 재화·플레이어 레벨): Boxer에 diamond/playerLevel/playerExp 저장 필드 추가 → 저장 형태 변경.
//   BALANCE: 경험치 곡선 expToNext(BASE×GROWTH^level)·획득원·레벨업 보상이라는 신규 밸런스 수식 도입.
// TASK-021(P3 퀘스트): questState가 SaveData의 새 top-level 필드로 추가돼 저장 형태가 바뀐다.
//   BALANCE: 퀘스트 보상(골드·다이아)·마일스톤 보상·일일/주간 리셋이라는 신규 진행 밸런스 수식 도입.
//
// === 009~013 라인(브랜치): 보스 그로기·전용 스킬 슬롯 ===
// v1.3c(TASK-009): 보스 그로기 게이지·상태 도입. 그로기(groggyGauge/groggyMax/groggyUntil)는
//   boxerHp/comboGauge처럼 CombatRuntime 비저장 런타임 값이라 저장 형태(Boxer/SaveData) 불변.
//   그로기 누적·해제·추가 피해 배수·FULL_COMBO_GROGGY_BONUS(0→20) 등 새 밸런스 수식 도입.
// v1.3d(TASK-010): 전용 스킬 슬롯(액티브3·패시브1) 도입. Boxer에 equippedSkills(장착 정보)를 저장 형태에 추가
//   → 저장 스키마 변경. 스킬 데미지/쿨타임/회피·카운터 버프/그로기·내상 DoT/피해감소 등 새 수식 도입.
//   skillCooldowns/activeBuffs/internalDoT는 비저장 런타임 값이라 SCHEMA에 영향 없음(상향 사유는 equippedSkills).
// v1.3d 후속(버그 수정): 나비스텝 cooldownSpeedup 버프가 실제로 기본 공격 쿨타임을 단축하도록 연결,
//   전투 중 스킬 장착/해제가 combat.skillCooldowns를 재정합하도록 수정. 전투 cadence를 바꾸는 밸런스 변경.
// v1.3d 후속(버그 수정): 강화 시 rescheduleAttacks가 공격 쿨타임 진척(progress)을 보존하도록 변경(이전엔
//   전체 리셋 → 강화를 연타하면 nextAttackAt이 계속 밀려 공격이 멈춤). 전투 cadence를 바꾸는 변경.
//
// 통합(009~013 ↔ 014~021): equippedSkills + questState + 재화/레벨 단일 v8, BALANCE 11.
//   두 직교 시스템(보스 그로기·전용 스킬 슬롯 ↔ 전투 컨트롤·재화/레벨·퀘스트)을 한 저장 형태로 합치면서
//   SCHEMA를 두 라인의 최대(v6, v7)보다 한 단계 위인 v8로, BALANCE를 두 라인 누적(10, 8)을 합친 최종 11로 동결한다.
//   저장 키 boxer-game.save.v8, 옛 v1~v7은 LEGACY_SAVE_KEYS로 안내(삭제 금지).
export const SCHEMA_VERSION = 8;
export const BALANCE_VERSION = 11;
export const MAX_SAFE_GAME_INTEGER = Number.MAX_SAFE_INTEGER;

export const BOXER_TYPES = ["INFIGHTER", "OUT_BOXER"] as const satisfies readonly BoxerType[];
export const GENDERS = ["MALE", "FEMALE"] as const satisfies readonly Gender[];

export const DEFAULT_BOXER_TYPE: BoxerType = "INFIGHTER";
export const DEFAULT_GENDER: Gender = "MALE";

export const BOXER_TYPE_META: Readonly<
  Record<BoxerType, { label: string; tagline: string }>
> = {
  INFIGHTER: { label: "인파이터", tagline: "압박·탱커 — 맞으며 버티고 몰아붙인다" },
  OUT_BOXER: { label: "아웃복서", tagline: "회피·카운터 — 거리를 두고 받아친다" },
};

export const GENDER_META: Readonly<Record<Gender, { label: string }>> = {
  MALE: { label: "남자" },
  FEMALE: { label: "여자" },
};

// 확정값(BALANCE 8, TASK-013): 타입별 전투 보정. 인파이터=체력·방어·가드 높음/회피·카운터 낮음, 아웃복서=회피·카운터 높음/체력·방어 낮음.
export type BoxerTypeModifiers = {
  maxHpMultiplier: number;
  defenseMultiplier: number;
  damageReductionMultiplier: number;
  evasionMultiplier: number;
  counterMultiplier: number;
  // v1.3c: 보스 그로기 누적 배율. 인파이터>1(그로기 빠름), 아웃복서<1(그로기 느림).
  groggyGainMultiplier: number;
};

// === TASK-017 파이터 타입 외형 전환 ===
// 가정/TODO: 전환 비용·악용 방지(쿨다운). P3(TASK-019) 다이아 재화 도입 전이라 전환은 무료(0).
//   비용 차감 로직은 자리만 두고 재화 연결은 TASK-019 이후로 미룬다(추측 가격 단정 금지).
export const TYPE_SWITCH_COST = 0;
// 가정: 잦은 전환 악용 방지 쿨다운(ms). 미확정 임시값 — 0(무제한)으로 두고 회귀 안전을 우선한다.
//   쿨다운은 휘발 클로저 변수(lastTypeSwitchAt)로만 관리해 저장에 영향이 없다(SCHEMA 불변).
export const TYPE_SWITCH_COOLDOWN_MS = 0;

// 타입 전용 스킬 표시 메타데이터(infighter-skills.md/out-boxer-skills.md의 라벨).
// 가정: 스킬 슬롯 시스템(TASK-010)이 아직 코드에 없어 실제 슬롯 교체가 아니라 표시용 세트로만 노출한다.
//   TASK-010 도입 시 슬롯 기반 교체로 연결한다(TODO). 효과·수치는 미확정(가정, equip.md 참조).
export type TypeSkillSet = {
  active: readonly string[];
  passive: string;
};

export const TYPE_SKILLS: Readonly<Record<BoxerType, TypeSkillSet>> = {
  INFIGHTER: {
    // 인파이터 전용(docs/기획/skills/infighter-skills.md).
    active: ["리버샷", "압박", "가젤펀치", "뎀프시롤"],
    passive: "철벽가드",
  },
  OUT_BOXER: {
    // 아웃복서 전용(docs/기획/skills/out-boxer-skills.md).
    active: ["고스트스텝", "나비 스텝", "팬텀 잽", "거리 조절"],
    passive: "스텝백 카운터",
  },
};

// === TASK-018 타입별 6포즈 애니메이션(순수 표현 — SCHEMA/BALANCE 무관) ===
// 가정: 공격·방어 모션을 화면에 보여줄 지속 시간(ms). 시각 기반 모션 홀드 윈도우를 채택할 때만 쓰이며,
//   전투 계산에는 전혀 들어가지 않으므로 BALANCE_VERSION 대상이 아니다(임시값 — 아트/연출 확정 후 조정).
//   현재 BoxerFigure는 lastAttack/recentDefense 객체 변경만으로 표시하므로 이 값에 의존하지 않는다(TODO: 시각 홀드 채택 시 사용).
export const ANIMATION_HOLD_MS = 400;

// 가정: 타입 톤 메타(docs/기획/presentation/ui-tone.md). 인파이터=붉은/묵직·화면흔들림, 아웃복서=청/잔상.
//   순수 표현용 색·이펙트 식별자라 전투/저장에 영향 없음. accentColor는 CSS 강조색, effect는 연출 분기 키.
export type TypeTone = {
  accentColor: string;
  effect: "shake" | "afterimage";
};

export const TYPE_TONE: Readonly<Record<BoxerType, TypeTone>> = {
  // 인파이터: 붉은 압박감·무거운 화면 흔들림(강한 타격/가드 강조).
  INFIGHTER: { accentColor: "#d73c36", effect: "shake" },
  // 아웃복서: 푸른 잔상·빠른 스텝(MISS·COUNTER 강조).
  OUT_BOXER: { accentColor: "#3c7cd7", effect: "afterimage" },
};

// === TASK-019 P3 재화·플레이어 레벨/경험치 (BALANCE 6→7) ===
// 신규 boxer 초기값. 새 게임·복서 생성 시 적용한다.
export const INITIAL_DIAMOND = 0;
// 가정: 플레이어 레벨은 1부터 시작(전투 강화 레벨과 별개). 경험치는 0에서 누적.
export const INITIAL_PLAYER_LEVEL = 1;
export const INITIAL_PLAYER_EXP = 0;

// 플레이어 경험치 곡선(가정값 — TASK-013/TASK-021 밸런스 확정 시 갱신).
//   expToNext(level) = floor(PLAYER_EXP_BASE × PLAYER_EXP_GROWTH^level).
//   기존 강화 비용 곡선(1.25^level)과 톤을 맞춘다(formulas.ts: calculateUpgradeCost 참고).
export const PLAYER_EXP_BASE = 50; // 가정: Lv1→2에 필요한 기준 경험치.
export const PLAYER_EXP_GROWTH = 1.25; // 가정: 기존 강화 비용 곡선과 동일 성장률.

// 경험치 획득원(가정/TODO — 실제 수치는 밸런스 확정 전 임시값).
export const EXP_PER_KILL = 1; // 가정: 일반 몬스터 처치 1회당 경험치.
export const EXP_PER_BOSS_CLEAR = 20; // 가정: 보스 클리어 1회당 경험치.
// TODO(TASK-021): 퀘스트 완료 보상 경험치. 퀘스트 시스템 도입 시 연결.
export const EXP_PER_QUEST = 0;

// 레벨업 보상(가정/TODO — 밸런스 확정 전 미정). 레벨 1회 상승당 지급 다이아.
//   가정: 진행 동기 부여용 소량(임시 2). 미확정이면 0으로 둬도 무방하나, 다이아 sink가 아직 없어
//   값을 0이 아닌 임시값으로 둬 경험치→레벨업→다이아 파생 경로를 테스트로 검증할 수 있게 한다.
export const LEVEL_UP_DIAMOND_REWARD = 2;

// 일일 콘텐츠 리셋 기준 시각(로컬 시간 0시 = 자정). 다음 로컬 00:00까지 남은 시간을 표시 타이머로 쓴다.
//   가정: WebView(앱인토스) 실행 환경의 로컬 타임존 기준. UTC 고정 여부는 TASK-021 일일 리셋과 동일 기준으로 맞춘다.
//   순수 함수(progress.ts: nextDailyResetAt)가 주입 now로부터 Date를 만들어 계산하며 Date.now는 직접 호출하지 않는다.
export const DAILY_RESET_HOUR = 0;

// === TASK-021 P3 퀘스트 시스템 (BALANCE 7→8, 가정값 — TASK-013 밸런스 확정 시 갱신) ===
// 마일스톤 누적 점수 구간(일일 진행도 바). 누적 점수가 구간 값 이상이면 해당 상자를 수령할 수 있다.
//   가정: 5구간 20/40/60/80/100(docs/ui/05-퀘스트.md §1 이미지). 합계 100 = 일일 만점.
export const QUEST_MILESTONE_THRESHOLDS = [20, 40, 60, 80, 100] as const;
// 가정: 마일스톤 구간별 보상(다이아). 진행할수록 보상 증가. 임시값(밸런스 확정 시 갱신).
export const QUEST_MILESTONE_REWARDS: Readonly<Record<number, QuestReward>> = {
  20: { diamond: 10 },
  40: { diamond: 15 },
  60: { diamond: 20 },
  80: { diamond: 25 },
  100: { diamond: 30 },
};

// 주간 리셋 기준 요일(0=일요일 … 1=월요일). 가정: 월요일 00:00(docs/ui/05-퀘스트.md §3-1).
export const WEEKLY_RESET_DAY = 1;

// 자동 전투 분 환산 기준(autoBattleMinutes 목표용). 1분 = 60_000ms.
export const QUEST_AUTO_BATTLE_MS_PER_MINUTE = 60_000;

// 퀘스트 정적 카탈로그(가정값 — 목표·보상·점수 모두 임시값, TASK-013 확정 시 갱신).
//   추적 가능한 목표만 채택(stageClear/bossClear/killMonster/upgradeStat/autoBattleMinutes/claimFreeChest/playerLevelUp).
//   제외(보류): enhanceEquip·enhanceTraining. 보상은 골드·다이아만(아이템·에너지 제외).
//   일일 퀘스트 points 합계는 100(마일스톤 만점)에 맞춘다.
export const QUEST_CATALOG: readonly QuestDef[] = [
  // 일일(daily) — points 합계 100.
  {
    id: "daily_kill_30",
    category: "daily",
    goalType: "killMonster",
    target: 30,
    reward: { gold: 6_000 },
    points: 20,
    title: "몬스터 30마리 처치",
    description: "자동 전투로 몬스터를 처치하세요.",
  },
  {
    id: "daily_stage_3",
    category: "daily",
    goalType: "stageClear",
    target: 3,
    reward: { gold: 5_000 },
    points: 20,
    title: "스테이지 3회 클리어",
    description: "스테이지를 전진하세요.",
  },
  {
    id: "daily_upgrade_5",
    category: "daily",
    goalType: "upgradeStat",
    target: 5,
    reward: { gold: 7_000 },
    points: 20,
    title: "강화 5회",
    description: "골드로 능력치를 강화하세요.",
  },
  {
    id: "daily_auto_20",
    category: "daily",
    goalType: "autoBattleMinutes",
    target: 20,
    reward: { diamond: 10 },
    points: 20,
    title: "자동 전투 20분 진행",
    description: "자동 전투를 진행하세요.",
  },
  {
    id: "daily_free_chest",
    category: "daily",
    goalType: "claimFreeChest",
    target: 1,
    reward: { diamond: 20 },
    points: 20,
    title: "일일 무료 상자 받기",
    description: "상점에서 무료 상자를 받으세요.",
  },
  // 주간(weekly).
  {
    id: "weekly_boss_5",
    category: "weekly",
    goalType: "bossClear",
    target: 5,
    reward: { diamond: 50 },
    points: 0,
    title: "보스 5회 클리어",
    description: "이번 주 보스를 5회 격파하세요.",
  },
  {
    id: "weekly_kill_500",
    category: "weekly",
    goalType: "killMonster",
    target: 500,
    reward: { gold: 50_000 },
    points: 0,
    title: "몬스터 500마리 처치",
    description: "이번 주 누적 처치를 달성하세요.",
  },
  // 도전(challenge) — 영구(비리셋).
  {
    id: "challenge_levelup_10",
    category: "challenge",
    goalType: "playerLevelUp",
    target: 10,
    reward: { diamond: 30 },
    points: 0,
    title: "플레이어 레벨 10 달성",
    description: "플레이어 레벨을 올리세요.",
  },
  {
    id: "challenge_upgrade_50",
    category: "challenge",
    goalType: "upgradeStat",
    target: 50,
    reward: { gold: 30_000 },
    points: 0,
    title: "강화 50회",
    description: "강화를 누적하세요.",
  },
  // 업적(achievement) — 영구(비리셋).
  {
    id: "achievement_kill_1000",
    category: "achievement",
    goalType: "killMonster",
    target: 1_000,
    reward: { diamond: 100 },
    points: 0,
    title: "몬스터 1,000마리 처치",
    description: "누적 처치 기록을 세우세요.",
  },
  {
    id: "achievement_boss_20",
    category: "achievement",
    goalType: "bossClear",
    target: 20,
    reward: { diamond: 150 },
    points: 0,
    title: "보스 20회 격파",
    description: "보스를 누적 격파하세요.",
  },
] as const;

export const BOXER_TYPE_MODIFIERS: Readonly<Record<BoxerType, BoxerTypeModifiers>> = {
  INFIGHTER: {
    // 확정(BALANCE 8): 체력·방어 +30%, 가드 피해감소 +20%, 회피 -40%, 카운터 -50%.
    maxHpMultiplier: 1.3,
    defenseMultiplier: 1.3,
    damageReductionMultiplier: 1.2,
    evasionMultiplier: 0.6,
    counterMultiplier: 0.5,
    // 확정(BALANCE 8): 그로기 누적 +40%(인파이터가 그로기로 공략).
    groggyGainMultiplier: 1.4,
  },
  OUT_BOXER: {
    // 확정(BALANCE 8): 체력·방어 -20%, 가드 피해감소 -10%, 회피 +60%, 카운터 +60%.
    maxHpMultiplier: 0.8,
    defenseMultiplier: 0.8,
    damageReductionMultiplier: 0.9,
    evasionMultiplier: 1.6,
    counterMultiplier: 1.6,
    // 확정(BALANCE 8): 그로기 누적 -30%(아웃복서는 회피·카운터로 공략).
    groggyGainMultiplier: 0.7,
  },
};
