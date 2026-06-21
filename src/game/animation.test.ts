import { describe, expect, it } from "vitest";
import { ANIMATION_HOLD_MS } from "./constants";
import {
  attackAnimationKey,
  BOXER_POSES,
  NEW_ANIMATION_KEYS,
  POSE_MAP,
  poseForKey,
  resolveAnimationKey,
  type AnimationKey,
} from "./animation";
import type { AttackType, Hand } from "./types";

describe("resolveAnimationKey 우선순위", () => {
  const attack = { attackType: "JAB" as AttackType, hand: "LEFT" as Hand };

  it("recentDefense.outcome='COUNTER'면 boxer_counter (최우선)", () => {
    expect(
      resolveAnimationKey({ lastAttack: attack, recentDefense: { outcome: "COUNTER" } }),
    ).toBe("boxer_counter");
  });

  it("recentDefense.outcome='MISS'면 boxer_dodge", () => {
    expect(
      resolveAnimationKey({ lastAttack: attack, recentDefense: { outcome: "MISS" } }),
    ).toBe("boxer_dodge");
  });

  it("recentDefense.outcome='GUARD'면 boxer_guard", () => {
    expect(
      resolveAnimationKey({ lastAttack: attack, recentDefense: { outcome: "GUARD" } }),
    ).toBe("boxer_guard");
  });

  it("recentDefense.outcome='HIT'면 방어 키를 쓰지 않고 직전 공격으로 폴백", () => {
    expect(
      resolveAnimationKey({ lastAttack: attack, recentDefense: { outcome: "HIT" } }),
    ).toBe("boxer_left_jab");
  });

  it("방어 없고 lastAttack 있으면 공격 키", () => {
    expect(resolveAnimationKey({ lastAttack: attack, recentDefense: null })).toBe(
      "boxer_left_jab",
    );
  });

  it("아무것도 없으면 boxer_idle", () => {
    expect(resolveAnimationKey({ lastAttack: null, recentDefense: null })).toBe("boxer_idle");
  });
});

describe("attackAnimationKey: AttackType × Hand → 기존 키", () => {
  const cases: Array<[AttackType, Hand, AnimationKey]> = [
    ["JAB", "LEFT", "boxer_left_jab"],
    ["JAB", "RIGHT", "boxer_left_jab"], // 잽은 손 고정.
    ["STRAIGHT", "RIGHT", "boxer_right_straight"],
    ["STRAIGHT", "LEFT", "boxer_right_straight"], // 스트레이트는 손 고정.
    ["HOOK", "LEFT", "boxer_left_hook"],
    ["HOOK", "RIGHT", "boxer_right_hook"],
    ["UPPER", "LEFT", "boxer_left_upper"],
    ["UPPER", "RIGHT", "boxer_right_upper"],
  ];

  it.each(cases)("%s/%s → %s", (attackType, hand, expected) => {
    expect(attackAnimationKey(attackType, hand)).toBe(expected);
  });

  it("resolveAnimationKey도 동일 매핑을 사용한다", () => {
    expect(
      resolveAnimationKey({
        lastAttack: { attackType: "UPPER", hand: "RIGHT" },
        recentDefense: null,
      }),
    ).toBe("boxer_right_upper");
  });
});

describe("POSE_MAP: 07 문서 §3-4 표와 일치", () => {
  it("인파이터 6포즈(키·리치 SHORT·라벨)", () => {
    expect(POSE_MAP.INFIGHTER).toEqual({
      POSE_1: { key: "boxer_idle", reach: "SHORT", labelKo: "기본 가드" },
      POSE_2: { key: "boxer_guard", reach: "SHORT", labelKo: "타이트 가드" },
      POSE_3: { key: "boxer_left_jab", reach: "SHORT", labelKo: "숏 잽" },
      POSE_4: { key: "boxer_left_hook", reach: "SHORT", labelKo: "바디 훅" },
      POSE_5: { key: "boxer_left_upper", reach: "SHORT", labelKo: "어퍼컷" },
      POSE_6: { key: "boxer_counter", reach: "SHORT", labelKo: "카운터 훅" },
    });
  });

  it("아웃파이터 6포즈(키·리치 LONG·라벨), 스텝백은 기존 boxer_dodge 재사용", () => {
    expect(POSE_MAP.OUT_BOXER).toEqual({
      POSE_1: { key: "boxer_idle", reach: "LONG", labelKo: "롱 가드" },
      POSE_2: { key: "boxer_guard", reach: "LONG", labelKo: "라이트 풋워크" },
      POSE_3: { key: "boxer_dodge", reach: "LONG", labelKo: "스텝 백" },
      POSE_4: { key: "boxer_left_jab", reach: "LONG", labelKo: "롱 잽" },
      POSE_5: { key: "boxer_right_straight", reach: "LONG", labelKo: "스트레이트 크로스" },
      POSE_6: { key: "boxer_counter", reach: "LONG", labelKo: "카운터 펀치" },
    });
  });

  it("신규 애니 키는 boxer_counter 하나뿐(POSE_6에서만 등장)", () => {
    expect(NEW_ANIMATION_KEYS).toEqual(["boxer_counter"]);
    const allKeys = [...BOXER_POSES].flatMap((pose) => [
      POSE_MAP.INFIGHTER[pose].key,
      POSE_MAP.OUT_BOXER[pose].key,
    ]);
    const newKeyOccurrences = allKeys.filter((k) => k === "boxer_counter");
    // 카운터는 타입당 POSE_6 한 번씩, 총 2번만 등장한다(다른 신규 키는 없음).
    expect(newKeyOccurrences).toHaveLength(2);
    // 회피(boxer_dodge)는 아웃파이터에만 한 번 — 신규 키를 만들지 않고 기존 키 재사용.
    expect(allKeys.filter((k) => k === "boxer_dodge")).toHaveLength(1);
  });

  it("인파이터는 SHORT, 아웃파이터는 LONG 리치로 타입 정체성을 구분한다", () => {
    for (const pose of BOXER_POSES) {
      expect(POSE_MAP.INFIGHTER[pose].reach).toBe("SHORT");
      expect(POSE_MAP.OUT_BOXER[pose].reach).toBe("LONG");
    }
  });
});

describe("poseForKey: 키 → 6포즈 역매핑", () => {
  it("idle 키는 항상 POSE_1", () => {
    expect(poseForKey("INFIGHTER", "boxer_idle")).toBe("POSE_1");
    expect(poseForKey("OUT_BOXER", "boxer_idle")).toBe("POSE_1");
  });

  it("카운터 키는 POSE_6", () => {
    expect(poseForKey("INFIGHTER", "boxer_counter")).toBe("POSE_6");
    expect(poseForKey("OUT_BOXER", "boxer_counter")).toBe("POSE_6");
  });

  it("아웃파이터 boxer_left_jab은 롱 잽(POSE_4), 인파이터는 숏 잽(POSE_3)", () => {
    expect(poseForKey("INFIGHTER", "boxer_left_jab")).toBe("POSE_3");
    expect(poseForKey("OUT_BOXER", "boxer_left_jab")).toBe("POSE_4");
  });

  it("아웃파이터 boxer_dodge는 스텝백(POSE_3)", () => {
    expect(poseForKey("OUT_BOXER", "boxer_dodge")).toBe("POSE_3");
  });

  // 회귀(리뷰 지적): 전투 엔진은 타입과 무관하게 모든 공격(우훅/우어퍼/스트레이트 등)을 내므로
  //   POSE_MAP에 정규 키로 없는 변형도 resolveAnimationKey가 반환한다. 이때 idle(POSE_1)로
  //   폴백하면 라벨이 '기본 가드'로 어긋난다 → 모든 키가 실제 공격/방어 포즈로 매핑돼야 한다.
  it("POSE_MAP에 정규 키로 없는 변형도 idle로 폴백하지 않는다", () => {
    // 인파이터: 우훅/우어퍼/스트레이트 포즈가 POSE_MAP엔 없지만 엔진은 낸다.
    expect(poseForKey("INFIGHTER", "boxer_right_hook")).toBe("POSE_4");
    expect(poseForKey("INFIGHTER", "boxer_right_upper")).toBe("POSE_5");
    expect(poseForKey("INFIGHTER", "boxer_right_straight")).toBe("POSE_3");
    // 아웃파이터: 훅·어퍼 포즈가 아예 없지만 엔진은 낸다 → 스트레이트 크로스(POSE_5) 계열로.
    expect(poseForKey("OUT_BOXER", "boxer_left_hook")).toBe("POSE_5");
    expect(poseForKey("OUT_BOXER", "boxer_right_hook")).toBe("POSE_5");
    expect(poseForKey("OUT_BOXER", "boxer_left_upper")).toBe("POSE_5");
    expect(poseForKey("OUT_BOXER", "boxer_right_upper")).toBe("POSE_5");
  });

  it("attackAnimationKey가 낼 수 있는 모든 공격 키는 idle(POSE_1)이 아니다", () => {
    const attackKeys: AnimationKey[] = [
      "boxer_left_jab",
      "boxer_right_straight",
      "boxer_left_hook",
      "boxer_right_hook",
      "boxer_left_upper",
      "boxer_right_upper",
    ];
    for (const key of attackKeys) {
      expect(poseForKey("INFIGHTER", key)).not.toBe("POSE_1");
      expect(poseForKey("OUT_BOXER", key)).not.toBe("POSE_1");
    }
  });

  it("POSE_MAP 정규 키는 같은 포즈로 왕복(round-trip)한다", () => {
    for (const type of ["INFIGHTER", "OUT_BOXER"] as const) {
      for (const pose of BOXER_POSES) {
        expect(poseForKey(type, POSE_MAP[type][pose].key)).toBe(pose);
      }
    }
  });
});

describe("모션 홀드 윈도우(시각 기반 도출 채택 시)", () => {
  it("lastAttackAt + ANIMATION_HOLD_MS 경과 후 now면 idle로 복귀", () => {
    const lastAttackAt = 1_000;
    expect(
      resolveAnimationKey({
        lastAttack: { attackType: "JAB", hand: "LEFT" },
        recentDefense: null,
        lastAttackAt,
        now: lastAttackAt + ANIMATION_HOLD_MS, // 윈도우 끝(미만이어야 유효).
      }),
    ).toBe("boxer_idle");
  });

  it("윈도우 안이면 공격 키 유지", () => {
    const lastAttackAt = 1_000;
    expect(
      resolveAnimationKey({
        lastAttack: { attackType: "JAB", hand: "LEFT" },
        recentDefense: null,
        lastAttackAt,
        now: lastAttackAt + ANIMATION_HOLD_MS - 1,
      }),
    ).toBe("boxer_left_jab");
  });

  it("방어 윈도우 경과 후 직전 공격으로 폴백", () => {
    const lastDefenseAt = 1_000;
    expect(
      resolveAnimationKey({
        lastAttack: { attackType: "STRAIGHT", hand: "RIGHT" },
        recentDefense: { outcome: "COUNTER" },
        lastDefenseAt,
        now: lastDefenseAt + ANIMATION_HOLD_MS,
      }),
    ).toBe("boxer_right_straight");
  });
});
