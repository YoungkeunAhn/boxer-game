import type {
  AttackBeat,
  AttackType,
  BoxerType,
  CombatStats,
  ComboId,
  EquippedSkills,
  Gender,
  Hand,
  SkillId,
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

export const BOSS_TIME_LIMIT_MS = 30_000;
export const OFFLINE_MAX_DURATION_MS = 8 * 60 * 60 * 1_000;
// v4(TASK-005): HP·방어 강화 추가 → SCHEMA 3→4, 몬스터 공격·HP/방어 곡선·타입 maxHp/defense 계수 → BALANCE 2→3.
// v5(TASK-006): 회피·카운터 강화 추가 → SCHEMA 4→5, 회피·가드·카운터 수식·타입 evasion/counter/damageReduction 계수 → BALANCE 3→4.
// v1.3a(TASK-007): 기본 공격 4종·손·쿨타임 도입. 저장 형태(Boxer/SaveData) 불변 → SCHEMA 유지(5),
//   공격별 데미지 계수·쿨타임·평균 DPS 환산 수식 → BALANCE 4→5.
// v1.3b(TASK-008): 콤비네이션 보너스·콤보 게이지 도입. 콤보 상태는 CombatRuntime 런타임 전용 필드라
//   저장 형태(Boxer/SaveData) 불변 → SCHEMA 유지(5). 콤비네이션 보너스(데미지 배수·치명타 가산)라는
//   새 밸런스 수식 도입 → BALANCE 5→6.
// v1.3c(TASK-009): 보스 그로기 게이지·상태 도입. 그로기(groggyGauge/groggyMax/groggyUntil)는
//   boxerHp/comboGauge처럼 CombatRuntime 비저장 런타임 값이라 저장 형태(Boxer/SaveData) 불변
//   → SCHEMA 유지(5). 그로기 누적·해제·추가 피해 배수·FULL_COMBO_GROGGY_BONUS(0→20) 등
//   새 밸런스 수식 도입 → BALANCE 6→7.
// v1.3d(TASK-010): 전용 스킬 슬롯(액티브3·패시브1) 도입. Boxer에 equippedSkills(장착 정보)를 저장 형태에 추가
//   → 저장 스키마 변경 → SCHEMA 5→6, 저장 키 boxer-game.save.v5→v6, 기존 v5는 legacy로 안내(삭제 금지).
//   스킬 데미지/쿨타임/회피·카운터 버프/그로기·내상 DoT/피해감소 등 새 밸런스 수식·수치 도입 → BALANCE 7→8.
//   skillCooldowns/activeBuffs/internalDoT는 비저장 런타임 값이라 SCHEMA에 영향 없음(상향 사유는 equippedSkills).
// TASK-013(수정내용2 마감): SCHEMA 6·BALANCE 8을 수정내용2 최종 확정 버전으로 동결한다(재번호 없음).
//   단계별 누적 bump가 이미 저장키(boxer-game.save.v6)·legacy 목록(v1~v5)·isSaveData 동등검증·
//   constants.test 단언·e2e/fixtures에 삼중으로 결합돼 전부 녹색이므로, 위 '가정:' 임시값은 수치를 바꾸지 않고
//   '확정값'으로 표기만 정리한다. 이후 플레이테스트로 어떤 수치를 실제로 조정하면 그때 BALANCE_VERSION만
//   9로 올리고(저장 형태 불변이라 SCHEMA 유지) 문서·테스트·STAGES_BALANCE_VERSION·e2e/fixtures를 동반 갱신한다.
// v1.3d 후속(버그 수정): 나비스텝 cooldownSpeedup 버프가 실제로 기본 공격 쿨타임을 단축하도록 연결(이전엔
//   합산만 되고 미적용 = 문서 명시 효과 무동작)하고, 전투 중 스킬 장착/해제가 combat.skillCooldowns를
//   재정합하도록 수정(이전엔 새 액티브 스킬이 다음 처치 전까지 미발동). 전자가 전투 cadence를 바꾸는
//   밸런스 변경이라 BALANCE 8→9(저장 형태 불변 → SCHEMA 6 유지).
export const SCHEMA_VERSION = 6;
export const BALANCE_VERSION = 9;
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
