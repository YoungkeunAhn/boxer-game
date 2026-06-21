import { ANIMATION_HOLD_MS } from "./constants";
import type {
  AttackType,
  BoxerType,
  DefenseOutcome,
  Hand,
} from "./types";

// TASK-018: 타입별 6포즈 애니메이션 — 순수 표현 계층.
//   게임 상태(idle/가드/공격/회피/카운터)를 애니메이션 키로 매핑한다. 전투 판정·저장·밸런스 불변.
//   신규 키는 `boxer_counter` 하나뿐이며, 나머지 5포즈는 기존 키를 재사용한다(docs/ui/07 §3-4).

// === 애니메이션 키 ===
// 기존 키(docs/기획/presentation/animation.md): 공격 4종(좌/우)·idle·가드·회피(스텝백 재사용).
//   신규: boxer_counter(카운터 발동 전용 — 메커니즘만 있고 명명 애니가 없어 본 태스크에서 추가).
export type AnimationKey =
  | "boxer_idle"
  | "boxer_guard"
  | "boxer_dodge"
  | "boxer_left_jab"
  | "boxer_right_straight"
  | "boxer_left_hook"
  | "boxer_right_hook"
  | "boxer_left_upper"
  | "boxer_right_upper"
  | "boxer_counter";

// 신규 애니 키는 카운터 하나로 제한한다(TASK-018 구현 원칙). 나머지는 모두 기존 키 재사용.
export const NEW_ANIMATION_KEYS = ["boxer_counter"] as const satisfies readonly AnimationKey[];

// === 6포즈 식별자 ===
export type BoxerPose = "POSE_1" | "POSE_2" | "POSE_3" | "POSE_4" | "POSE_5" | "POSE_6";

export const BOXER_POSES = ["POSE_1", "POSE_2", "POSE_3", "POSE_4", "POSE_5", "POSE_6"] as const satisfies readonly BoxerPose[];

// 리치(타입 정체성): 같은 "잽"도 인파이터=숏(근접·짧은 리치) / 아웃파이터=롱(거리·긴 리치).
//   동일 키를 외형/이동 거리로만 차별화하므로 신규 키를 만들지 않는다.
export type PoseReach = "SHORT" | "LONG";

export type PoseDescriptor = {
  key: AnimationKey;
  reach: PoseReach;
  labelKo: string;
};

// 타입별 6포즈 → (애니 키·리치·라벨) 매핑. docs/ui/07-캐릭터-애니메이션.md §3-4 표 그대로.
//   인파이터: 기본가드/타이트가드/숏잽/바디훅/어퍼/카운터훅 — 모두 SHORT(근접 압박형).
//   아웃파이터: 롱가드/라이트풋워크/스텝백(회피)/롱잽/스트레이트크로스/카운터펀치 — 모두 LONG(거리 조절형).
//   POSE_6만 신규 키 boxer_counter. POSE_3 아웃파이터는 회피라 기존 boxer_dodge 재사용(중복 키 미생성).
export const POSE_MAP: Readonly<Record<BoxerType, Record<BoxerPose, PoseDescriptor>>> = {
  INFIGHTER: {
    POSE_1: { key: "boxer_idle", reach: "SHORT", labelKo: "기본 가드" },
    POSE_2: { key: "boxer_guard", reach: "SHORT", labelKo: "타이트 가드" },
    POSE_3: { key: "boxer_left_jab", reach: "SHORT", labelKo: "숏 잽" },
    POSE_4: { key: "boxer_left_hook", reach: "SHORT", labelKo: "바디 훅" },
    POSE_5: { key: "boxer_left_upper", reach: "SHORT", labelKo: "어퍼컷" },
    POSE_6: { key: "boxer_counter", reach: "SHORT", labelKo: "카운터 훅" },
  },
  OUT_BOXER: {
    POSE_1: { key: "boxer_idle", reach: "LONG", labelKo: "롱 가드" },
    POSE_2: { key: "boxer_guard", reach: "LONG", labelKo: "라이트 풋워크" },
    POSE_3: { key: "boxer_dodge", reach: "LONG", labelKo: "스텝 백" },
    POSE_4: { key: "boxer_left_jab", reach: "LONG", labelKo: "롱 잽" },
    POSE_5: { key: "boxer_right_straight", reach: "LONG", labelKo: "스트레이트 크로스" },
    POSE_6: { key: "boxer_counter", reach: "LONG", labelKo: "카운터 펀치" },
  },
};

// 공격 종류·손 → 기존 공격 애니 키(animation.md 손 규칙):
//   잽=왼손, 스트레이트=오른손, 훅/어퍼는 hand에 따라 좌/우.
//   잽·스트레이트는 손이 고정이라 hand가 어긋나도 정의된 키를 돌려준다(방어적).
export function attackAnimationKey(attackType: AttackType, hand: Hand): AnimationKey {
  switch (attackType) {
    case "JAB":
      return "boxer_left_jab";
    case "STRAIGHT":
      return "boxer_right_straight";
    case "HOOK":
      return hand === "RIGHT" ? "boxer_right_hook" : "boxer_left_hook";
    case "UPPER":
      return hand === "RIGHT" ? "boxer_right_upper" : "boxer_left_upper";
  }
}

// resolveAnimationKey 입력(전부 스토어가 이미 보유한 상태에서 파생). 시각 인자는 선택(모션 홀드 윈도우용).
export type AnimationInput = {
  // 직전 복서 공격(없으면 null). attackType·hand만 사용.
  lastAttack: { attackType: AttackType; hand: Hand } | null;
  // 직전 몬스터 공격 방어 결과(없으면 null). outcome만 사용.
  recentDefense: { outcome: DefenseOutcome } | null;
  // 모션 홀드 윈도우 계산용(선택). 셋 다 주면 now가 이벤트+ANIMATION_HOLD_MS를 지난 경우 idle로 복귀.
  now?: number;
  lastAttackAt?: number | null;
  lastDefenseAt?: number | null;
};

// 한 시각 이벤트가 모션 홀드 윈도우 안(아직 보여줄 시점)인지. 시각 정보가 없으면 항상 "유효"로 간주한다
//   (시각 기반 도출을 채택하지 않은 경우 — 직전 이벤트 객체 변경만으로 표시).
function withinHold(eventAt: number | null | undefined, now: number | undefined): boolean {
  if (now === undefined || eventAt === undefined || eventAt === null) return true;
  return now < eventAt + ANIMATION_HOLD_MS;
}

// 현재 애니메이션 키를 도출하는 순수 함수.
//   우선순위: 카운터(COUNTER) > 회피(MISS) > 가드(GUARD) > 직전 공격(attackType+hand) > idle.
//   - 카운터: outcome==='COUNTER'(아웃복서 회피 부수효과)만 boxer_counter로 본다(인파이터 가드 반격은 GUARD로 분류).
//   - 방어 결과 HIT은 별도 피격 모션 키가 없어 직전 공격/ idle로 흘려보낸다(공통 피격 모션은 TODO).
//   - 모션 홀드: 시각 인자(now/lastAttackAt/lastDefenseAt)가 주어지면 윈도우 경과 후 해당 이벤트를
//     무시한다. 주의: 현재 유일 호출부(BoxerFigure)는 시각 인자를 주지 않으므로 홀드가 비활성이고,
//     방어 이벤트가 한 번 발생하면 다음 방어 이벤트 전까지 우선순위상 '직전 공격' 분기가 가려진다.
//     이는 플레이스홀더 단계의 알려진 한계이며, 시각 인자를 주입하면 함수는 의도대로 동작한다(BoxerFigure TODO 참조).
export function resolveAnimationKey(input: AnimationInput): AnimationKey {
  const { lastAttack, recentDefense, now, lastAttackAt, lastDefenseAt } = input;

  const defenseActive = recentDefense !== null && withinHold(lastDefenseAt, now);
  if (defenseActive) {
    if (recentDefense.outcome === "COUNTER") return "boxer_counter";
    if (recentDefense.outcome === "MISS") return "boxer_dodge";
    if (recentDefense.outcome === "GUARD") return "boxer_guard";
    // HIT: 전용 피격 키 없음 → 아래 공격/ idle 폴백.
  }

  if (lastAttack !== null && withinHold(lastAttackAt, now)) {
    return attackAnimationKey(lastAttack.attackType, lastAttack.hand);
  }

  return "boxer_idle";
}

// 도출된 애니 키 → 6포즈 역매핑(타입별 완전표).
//   전투 엔진은 타입과 무관하게 모든 공격(JAB/STRAIGHT/HOOK/UPPER×좌우)을 낼 수 있으나,
//   각 타입의 6포즈는 그 타입의 대표 동작만 정의한다(POSE_MAP). 그래서 POSE_MAP에 없는 키
//   (예: 인파이터의 boxer_right_straight, 아웃파이터의 훅·어퍼)는 같은 계열의 대표 포즈로
//   정규화한다 — 모든 AnimationKey를 빠짐없이 명시해 idle로 잘못 폴백하지 않게 한다.
//   POSE_MAP의 정규 키는 같은 포즈로 왕복(round-trip)하도록 맞춘다(animation.test.ts가 검증).
export const KEY_TO_POSE: Readonly<Record<BoxerType, Record<AnimationKey, BoxerPose>>> = {
  INFIGHTER: {
    boxer_idle: "POSE_1",
    boxer_guard: "POSE_2",
    boxer_dodge: "POSE_2", // 인파이터엔 회피 포즈가 없어 가드(POSE_2)로 흡수.
    boxer_left_jab: "POSE_3",
    boxer_right_straight: "POSE_3", // 스트레이트 포즈 없음 → 숏 잽(POSE_3) 계열.
    boxer_left_hook: "POSE_4",
    boxer_right_hook: "POSE_4",
    boxer_left_upper: "POSE_5",
    boxer_right_upper: "POSE_5",
    boxer_counter: "POSE_6",
  },
  OUT_BOXER: {
    boxer_idle: "POSE_1",
    boxer_guard: "POSE_2",
    boxer_dodge: "POSE_3",
    boxer_left_jab: "POSE_4",
    boxer_right_straight: "POSE_5",
    boxer_left_hook: "POSE_5", // 훅/어퍼 포즈 없음 → 스트레이트 크로스(POSE_5) 계열.
    boxer_right_hook: "POSE_5",
    boxer_left_upper: "POSE_5",
    boxer_right_upper: "POSE_5",
    boxer_counter: "POSE_6",
  },
};

// 도출된 키 + 타입에서 현재 6포즈 식별자를 역매핑한다(표시용; BoxerFigure data-pose).
//   KEY_TO_POSE가 모든 키를 커버하므로 항상 정확한 포즈를 돌려준다(idle 오폴백 없음).
export function poseForKey(boxerType: BoxerType, key: AnimationKey): BoxerPose {
  return KEY_TO_POSE[boxerType][key];
}
