import {
  FARMING_STAGE_NUMBER,
  getNextStagePosition,
  getPreviousNormalStagePosition,
  getStageDefinition,
} from "../data/stages";
import {
  ATTACK_COOLDOWN_MS,
  ATTACK_FIXED_HAND,
  ATTACK_HISTORY_LIMIT,
  ATTACK_PRIORITY,
  ATTACK_TYPES,
  BOSS_TIME_LIMIT_MS,
  COMBINATIONS,
  BOXER_TYPE_MODIFIERS,
  COMBO_GAUGE_MAX,
  COMBO_GAUGE_PER_JAB,
  COUNTER_BASE_DAMAGE_RATE,
  DEFAULT_EQUIPPED_SKILLS,
  EXP_PER_KILL,
  FULL_COMBO_GROGGY_BONUS,
  GROGGY_DAMAGE_MULT,
  GROGGY_DURATION_MS,
  GROGGY_GAIN_BY_ATTACK,
  GROGGY_MAX_BASE,
  INFIGHTER_GUARD_COUNTER_RATE,
  KNOCKDOWN_PARTIAL_GOLD_RATE,
  MAX_SAFE_GAME_INTEGER,
  MONSTER_ATTACK_INTERVAL_MS,
  OFFLINE_MAX_DURATION_MS,
} from "./constants";
import {
  addExpToBoxer,
  addProgressToBoxer,
  calculateCombatStats,
  calculateComboAdjustedDamage,
  calculateCounterDamage,
  calculateExpectedHitDamage,
  calculateGoldReward,
  calculateGuardedDamage,
  calculateMonsterAttackPower,
} from "./formulas";
import {
  applyActiveSkill,
  applyInternalDamage,
  collectPassiveModifiers,
  getActiveBuffModifiers,
  initSkillCooldowns,
  selectReadySkill,
  tickBuffs,
} from "./skills";
import type {
  AttackBeat,
  AttackType,
  Boxer,
  BoxerType,
  CombatRuntime,
  CombatStepResult,
  ComboId,
  EquippedSkills,
  Gender,
  Hand,
  MonsterAttackResult,
  OfflineProgress,
  SkillBuff,
  SkillId,
  StagePosition,
} from "./types";

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name}은 0 이상의 유한한 수여야 합니다.`);
  }
}

// 실효 쿨타임 = 문서 쿨타임 / (attackSpeed × (1 + cooldownSpeedup)). attackSpeed가 오를수록,
//   그리고 cooldownSpeedup 버프(나비스텝 '쿨타임 회복 +20%')가 클수록 모든 공격이 더 자주 나간다.
function effectiveCooldownMs(
  attackType: AttackType,
  attackSpeed: number,
  cooldownSpeedup = 0,
): number {
  return ATTACK_COOLDOWN_MS[attackType] / (attackSpeed * (1 + cooldownSpeedup));
}

function minReadyAt(nextReadyAt: Record<AttackType, number>): number {
  let min = Number.POSITIVE_INFINITY;
  for (const type of ATTACK_TYPES) {
    if (nextReadyAt[type] < min) min = nextReadyAt[type];
  }
  return min;
}

// 전투 시작·스테이지 전이 시 4종 공격 쿨타임을 now 기준으로 전체 재설정한다(createCombatRuntime 전용).
// 가정: 새 전투/전이 시 콤보 진행(직전 손)을 초기화한다(lastHand는 호출부가 정함).
//   강화로 공격 속도가 바뀔 때는 이 함수가 아니라 rescheduleAttacks(진척 보존)를 쓴다.
function createAttackSchedule(
  attackSpeed: number,
  now: number,
): { nextReadyAt: Record<AttackType, number>; nextAttackAt: number } {
  const nextReadyAt = {
    JAB: now + effectiveCooldownMs("JAB", attackSpeed),
    STRAIGHT: now + effectiveCooldownMs("STRAIGHT", attackSpeed),
    HOOK: now + effectiveCooldownMs("HOOK", attackSpeed),
    UPPER: now + effectiveCooldownMs("UPPER", attackSpeed),
  };
  return { nextReadyAt, nextAttackAt: minReadyAt(nextReadyAt) };
}

// 두 타격이 (공격 종류·손)까지 같은지.
function beatsEqual(a: AttackBeat, b: AttackBeat): boolean {
  return a.attackType === b.attackType && a.hand === b.hand;
}

// v1.3b: attackHistory가 어떤 콤보의 "진행 중 prefix"라면, 그 콤보의 다음 단계 타격(공격 종류·손)을 돌려준다.
//   더 긴 콤보를 우선(FULL_COMBO > ONE_TWO_HOOK > ONE_TWO; COMBINATIONS 정렬 순)해 풀콤보 진행을 끝까지 노린다.
//   진행 prefix = history의 끝부분이 콤보 시퀀스의 앞 k(1≤k<len)개와 정확히 일치.
//   진행 중 콤보가 없으면(빈 history 포함) null. 콤보 시작(잽)은 호출부의 우선순위 폴백에 맡긴다.
export function nextComboBeat(history: readonly AttackBeat[]): AttackBeat | null {
  for (const combo of COMBINATIONS) {
    const seq = combo.sequence;
    for (let k = seq.length - 1; k >= 1; k -= 1) {
      if (history.length < k) continue;
      const tail = history.slice(history.length - k);
      let matches = true;
      for (let i = 0; i < k; i += 1) {
        if (!beatsEqual(tail[i], seq[i])) {
          matches = false;
          break;
        }
      }
      if (matches) return seq[k];
    }
  }
  return null;
}

// v1.3b: 콤보 진행을 우선하는 공격 선택 정책(정책을 한 곳에 모음).
//   ① 진행 중 콤보의 다음 단계 공격이 ready면 그 공격을 친다(콤보 이어가기).
//   ② 아니면 기존 우선순위(어퍼>훅>스트레이트>잽) 폴백.
//   콤보 시작(잽)은 별도로 강제하지 않는다. 잽은 우선순위 최하위라 다른 ready 공격이 있으면 그쪽이 먼저 나가고,
//   콤보는 자연스레 잽만 ready인 순간에 열린다(문서 발동 정책과 일치).
export function selectAttackType(
  nextReadyAt: Record<AttackType, number>,
  now: number,
  history: readonly AttackBeat[] = [],
): AttackType {
  // nextComboBeat는 진행 중 콤보가 있을 때만 다음 단계를 돌려준다(없으면 null → 폴백).
  const next = nextComboBeat(history);
  if (next && nextReadyAt[next.attackType] <= now) {
    return next.attackType;
  }
  for (const type of ATTACK_PRIORITY) {
    if (nextReadyAt[type] <= now) return type;
  }
  // 방어적 처리: ready가 없으면 가장 빨리 준비되는 공격을 고른다(정상 호출에선 도달하지 않음).
  return ATTACK_TYPES.reduce((soonest, type) =>
    nextReadyAt[type] < nextReadyAt[soonest] ? type : soonest,
  );
}

// v1.3b: 이번 타격을 history에 더한 뒤 끝부분(suffix)이 어떤 콤비네이션 시퀀스와 정확히 일치하면 그 식별자를 돌려준다.
//   더 긴 콤보 우선(COMBINATIONS 정렬). 순서+손이 모두 일치해야 발동한다.
export function matchCombination(history: readonly AttackBeat[]): ComboId | null {
  for (const combo of COMBINATIONS) {
    const seq = combo.sequence;
    if (history.length < seq.length) continue;
    const tail = history.slice(history.length - seq.length);
    let matches = true;
    for (let i = 0; i < seq.length; i += 1) {
      if (!beatsEqual(tail[i], seq[i])) {
        matches = false;
        break;
      }
    }
    if (matches) return combo.id;
  }
  return null;
}

// v1.3b: attackHistory에 한 타격을 더하고 길이 상한을 적용한다(불변).
function pushHistory(history: readonly AttackBeat[], beat: AttackBeat): AttackBeat[] {
  const next = [...history, beat];
  return next.length > ATTACK_HISTORY_LIMIT
    ? next.slice(next.length - ATTACK_HISTORY_LIMIT)
    : next;
}

// 손 선택 규칙(문서): 잽=왼손/스트레이트=오른손 고정. 훅·어퍼는 직전 손과 반대 손 우선(없으면 왼손).
export function selectHand(attackType: AttackType, lastHand: Hand | null): Hand {
  const fixed = ATTACK_FIXED_HAND[attackType];
  if (fixed) return fixed;
  if (lastHand === "LEFT") return "RIGHT";
  if (lastHand === "RIGHT") return "LEFT";
  return "LEFT";
}

export function createCombatRuntime(
  boxer: Boxer,
  position: StagePosition = { chapter: 1, stage: 1 },
  now = 0,
  isFarming = false,
): CombatRuntime {
  assertTimestamp(now, "now");
  const stage = getStageDefinition(position);
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  const schedule = createAttackSchedule(stats.attackSpeed, now);
  // 전투 시작·스테이지 전이 시 복서 HP를 최대치로 충전한다.
  return {
    position: { ...position },
    monsterHp: stage.maxHp,
    bossDeadlineAt: stage.isBoss ? now + BOSS_TIME_LIMIT_MS : null,
    nextAttackAt: schedule.nextAttackAt,
    isFarming: isFarming && !stage.isBoss,
    nextReadyAt: schedule.nextReadyAt,
    lastHand: null,
    // v1.3b: 콤보 진행 상태를 초기화한다(킬·스테이지 전이·넉다운·보스 타임아웃 시 이 함수로 리셋).
    attackHistory: [],
    comboGauge: 0,
    comboStep: 0,
    // v1.3c: 보스 스테이지에서만 그로기를 활성화한다(비보스면 groggyMax=0 → 누적·발동 불가).
    //   킬·전이·넉다운·보스 타임아웃 시 이 함수로 재생성되며 그로기도 자동 초기화된다.
    groggyGauge: 0,
    groggyMax: stage.isBoss ? GROGGY_MAX_BASE : 0,
    groggyUntil: null,
    // v1.3d: 스킬 런타임. 액티브 쿨타임을 정책(AFTER_COOLDOWN)대로 now 기준 초기화하고, 버프·내상은 비운다.
    //   킬·전이·넉다운·보스 타임아웃 시 이 함수로 재생성되며 스킬 상태도 자동 초기화된다.
    skillCooldowns: initSkillCooldowns(boxer.equippedSkills?.active ?? [], now),
    activeBuffs: [],
    internalDoT: null,
    boxerHp: stats.maxHp,
    boxerMaxHp: stats.maxHp,
    nextMonsterAttackAt: now + MONSTER_ATTACK_INTERVAL_MS,
    monsterAttackPrep: null,
  };
}

// TASK-017: 단일 캐릭터의 타입/성별을 런타임 전환한다(4캐릭터 보유 아님).
//   강화 레벨·골드·진행 위치·monsterHp·콤보/쿨타임 진행·보스 데드라인은 모두 유지하고,
//   boxer를 새 type/gender로 교체한 뒤 calculateCombatStats의 typeMultiplier로 새 maxHp를 재계산한다.
// 가정(HP 처리): 풀충전이 아니라 강화(upgrade)와 동일 규칙 — boxerMaxHp를 새 타입 최대치로 갱신하고
//   현재 boxerHp를 새 최대치로 클램프한다(인파이터→아웃복서로 maxHp가 줄면 현재 HP도 줄 수 있음).
//   maxHp가 늘어도 부족분을 자동 보충하지 않는다(가정 — 기획이 '풀충전'을 원하면 변경).
// 가정: attackSpeed는 타입 무관이라 공격 쿨타임은 그대로 둔다(콤보 진행도 보존). 변이 금지·새 객체 반환.
export function switchFighterType(
  boxer: Boxer,
  combat: CombatRuntime,
  boxerType: BoxerType,
  gender: Gender,
  now: number,
): { boxer: Boxer; combat: CombatRuntime } {
  assertTimestamp(now, "now");
  // 통합(v1.3d): 전용 스킬은 타입 전용이므로(교차 타입은 save.isEquippedSkills에서 invalid), 타입을 바꾸면
  //   장착 스킬을 새 타입의 기본 세트로 재설정한다. 그렇지 않으면 직렬화 시 isBoxer가 실패해 저장이 거부된다.
  const equippedSkills: EquippedSkills = {
    active: [...DEFAULT_EQUIPPED_SKILLS[boxerType].active],
    passive: DEFAULT_EQUIPPED_SKILLS[boxerType].passive,
  };
  const nextBoxer: Boxer = { ...boxer, boxerType, gender, equippedSkills };
  const stats = calculateCombatStats(nextBoxer.upgradeLevels, boxerType);
  const boxerMaxHp = stats.maxHp;
  const boxerHp = Math.min(boxerMaxHp, combat.boxerHp);
  return {
    boxer: nextBoxer,
    // 새 타입 액티브 슬롯에 맞춰 스킬 쿨타임을 now 기준으로 재초기화한다(이전 타입 스킬 키는 버린다).
    combat: { ...combat, boxerHp, boxerMaxHp, skillCooldowns: initSkillCooldowns(equippedSkills.active, now) },
  };
}

// 강화로 공격 속도가 바뀌었을 때 공격 쿨타임 "진척(progress)"을 보존해 재스케줄한 새 런타임을 만든다(HP·진행 유지).
// 가정: 전체 리셋(now+쿨타임)이 아니라, 타입별로 이미 지난 진척 비율을 새 쿨타임에 비례 적용한다.
//   타입별 remaining = max(0, nextReadyAt[type] - now), fraction = oldCd>0 ? min(1, remaining/oldCd) : 0,
//   새 nextReadyAt[type] = now + fraction × newCd. 따라서 ① 같은 속도(oldCd==newCd)면 nextAttackAt이 사실상 불변이고,
//   ② 속도가 오르면(newCd<oldCd) 다음 공격이 당겨지거나 같으며 절대 멀어지지 않는다 → 연타 강화로 공격이 끊기지 않는다.
// 가정: oldAttackSpeed/newAttackSpeed는 양수(>0)이며 effectiveCooldownMs는 항상 유한·양수. 시간값이라 정수 클램프 불필요.
//   강화는 버프를 바꾸지 않으므로 cooldownSpeedup은 old/new가 같다 → 진척 비율 계산에서 상쇄되어 기본 쿨타임으로 충분.
export function rescheduleAttacks(
  combat: CombatRuntime,
  oldAttackSpeed: number,
  newAttackSpeed: number,
  now: number,
): CombatRuntime {
  assertTimestamp(now, "now");
  const nextReadyAt = { ...combat.nextReadyAt };
  for (const type of ATTACK_TYPES) {
    const oldCd = effectiveCooldownMs(type, oldAttackSpeed);
    const newCd = effectiveCooldownMs(type, newAttackSpeed);
    const remaining = Math.max(0, combat.nextReadyAt[type] - now);
    const fraction = oldCd > 0 ? Math.min(1, remaining / oldCd) : 0;
    nextReadyAt[type] = now + fraction * newCd;
  }
  return { ...combat, nextReadyAt, nextAttackAt: minReadyAt(nextReadyAt) };
}

// v1.2a/v1.2b: 몬스터 공격 한 번. 회피 → 가드 → 피격 순으로 판정한다.
// 가정(한 공격에 배타적): ① 회피 롤 random < dodgeRate → MISS. 아웃복서면 COUNTER(monsterHp만 깎음).
//   ② 회피 실패 → 가드 적용 피해로 boxerHp 감소. 가드 감소가 있으면 GUARD, 없으면 HIT.
//      인파이터는 가드 성공 시 약한 근접 반격(counterDamage > 0, monsterHp만 깎음).
// 가정: 카운터/가드 반격은 몬스터를 처치하지 않는다(monsterHp만 0 이상으로 감소, 보상·전이 경로 미사용).
//   보스 그로기 누적은 TASK-009. knockedDown은 피격 분기에서만 발생한다. 모든 분기는 주입된 random으로 결정적.
export function resolveMonsterAttack(
  boxer: Boxer,
  combat: CombatRuntime,
  randomValue: number,
  now: number,
): { combat: CombatRuntime; result: MonsterAttackResult; knockedDown: boolean } {
  assertTimestamp(now, "now");
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("randomValue는 0 이상 1 미만이어야 합니다.");
  }
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  // v1.3d: 활성 버프·패시브를 도출한다(만료 버프는 getActiveBuffModifiers가 now로 거른다).
  const buffMods = getActiveBuffModifiers(combat.activeBuffs, now);
  const passive = collectPassiveModifiers(boxer);
  // 거리조절 버프는 몬스터 공격 쿨타임을 늘린다(다음 공격 시각을 더 멀리 잡는다).
  const monsterInterval = MONSTER_ATTACK_INTERVAL_MS * (1 + buffMods.monsterCooldownDelay);
  // 압박 버프는 몬스터 공격력을 약화한다.
  const attackPower = Math.max(
    1,
    Math.floor(calculateMonsterAttackPower(combat.position) * (1 - buffMods.monsterAttackWeaken)),
  );
  const baseCombat = {
    ...combat,
    activeBuffs: tickBuffs(combat.activeBuffs, now),
    nextMonsterAttackAt: now + monsterInterval,
  };

  // ① 회피 판정. 나비스텝·거리조절·고스트스텝·팬텀잽 버프가 회피율을 가산한다(CAP 클램프).
  const effectiveDodge = Math.min(1, Math.max(0, stats.dodge + buffMods.dodgeBonus));
  const dodged = randomValue < effectiveDodge;
  if (dodged) {
    const isOutBoxer = boxer.boxerType === "OUT_BOXER";
    // 회피 카운터 계수: 아웃복서 기본 카운터 + 나비스텝/고스트스텝 카운터 가산을 stats.counter에 더한다.
    const buffedStats = { ...stats, counter: stats.counter + buffMods.counterBonus };
    let counterDamage = isOutBoxer
      ? calculateCounterDamage(buffedStats, COUNTER_BASE_DAMAGE_RATE)
      : 0;
    let skillTriggered: SkillId | null = null;
    // 스텝백카운터(패시브): 회피 성공 시 자동 강한 반격(타입 무관 장착 가능 시). 더 강한 쪽을 쓴다.
    if (passive.stepBackCounterRate > 0) {
      const stepBack = calculateCounterDamage(buffedStats, passive.stepBackCounterRate);
      if (stepBack > counterDamage) {
        counterDamage = stepBack;
        skillTriggered = "step_back_counter";
      }
    }
    const monsterHp =
      counterDamage > 0 ? Math.max(0, combat.monsterHp - counterDamage) : combat.monsterHp;
    return {
      combat: { ...baseCombat, monsterHp },
      result: {
        outcome: isOutBoxer || counterDamage > 0 ? "COUNTER" : "MISS",
        damage: 0,
        counterDamage,
        skillTriggered,
      },
      knockedDown: false,
    };
  }

  // ② 가드 적용 피격. 철벽가드(패시브) 피해감소를 합산 인자로 넘긴다.
  const { damage, guarded } = calculateGuardedDamage(
    attackPower,
    stats.defense,
    boxer.boxerType,
    passive.guardDamageReduction,
  );
  const boxerHp = Math.max(0, combat.boxerHp - damage);
  const knockedDown = boxerHp <= 0;
  // 인파이터는 가드 성공(피해 감소 발생) 시 약한 근접 반격. 넉다운하면 반격은 의미 없으므로 0.
  const guardCounter =
    !knockedDown && guarded && boxer.boxerType === "INFIGHTER"
      ? calculateCounterDamage(stats, INFIGHTER_GUARD_COUNTER_RATE)
      : 0;
  const monsterHp =
    guardCounter > 0 ? Math.max(0, combat.monsterHp - guardCounter) : combat.monsterHp;
  return {
    combat: { ...baseCombat, boxerHp, monsterHp },
    result: {
      outcome: guarded ? "GUARD" : "HIT",
      damage,
      counterDamage: guardCounter,
      skillTriggered: passive.guardDamageReduction > 0 ? "iron_guard" : null,
    },
    knockedDown,
  };
}

// v1.2a: 넉다운(복서 HP 0) 처리. 진행 위치는 잃지 않는다.
// 가정: 현재 스테이지 유지(보스는 직전 일반 스테이지 파밍으로 전환)하고, 현재 스테이지 골드 ×
//   KNOCKDOWN_PARTIAL_GOLD_RATE를 1회 부분 지급한 뒤 HP를 채워 자동 재시작한다.
export function resolveKnockdown(
  boxer: Boxer,
  combat: CombatRuntime,
  now: number,
): { boxer: Boxer; combat: CombatRuntime; partialGold: number } {
  assertTimestamp(now, "now");
  const stage = getStageDefinition(combat.position);
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  const partialGold = Math.min(
    MAX_SAFE_GAME_INTEGER,
    Math.floor(
      calculateGoldReward(stage.goldReward, stats.goldBonus) *
        KNOCKDOWN_PARTIAL_GOLD_RATE,
    ),
  );
  const nextBoxer = addProgressToBoxer(boxer, 0, partialGold);
  const nextPosition = stage.isBoss
    ? getPreviousNormalStagePosition(combat.position.chapter)
    : combat.position;
  const nextCombat = createCombatRuntime(
    nextBoxer,
    nextPosition,
    now,
    stage.isBoss ? true : combat.isFarming,
  );
  return { boxer: nextBoxer, combat: nextCombat, partialGold };
}

export function resolveBossTimeout(
  boxer: Boxer,
  combat: CombatRuntime,
  now: number,
): CombatRuntime {
  assertTimestamp(now, "now");
  const stage = getStageDefinition(combat.position);
  if (
    !stage.isBoss ||
    combat.bossDeadlineAt === null ||
    now <= combat.bossDeadlineAt
  ) {
    return combat;
  }

  return createCombatRuntime(
    boxer,
    getPreviousNormalStagePosition(combat.position.chapter),
    now,
    true,
  );
}

export function retryBoss(
  boxer: Boxer,
  combat: CombatRuntime,
  now: number,
): CombatRuntime {
  assertTimestamp(now, "now");
  return createCombatRuntime(
    boxer,
    { chapter: combat.position.chapter, stage: FARMING_STAGE_NUMBER + 1 },
    now,
  );
}

// v1.3c: 보스 그로기 한 타격 처리(순수). 그로기는 보스 스테이지(groggyMax>0)에서만 의미를 가진다.
//   ① now>=groggyUntil이면 그로기 해제(groggyUntil=null).
//   ② 그로기 상태(groggyUntil!==null && now<groggyUntil)면 이 타격은 추가 피해를 받고(applyBonus=true) 누적은 하지 않는다.
//   ③ 비그로기면 이번 공격의 그로기 누적량 = (공격별 기본 + 풀콤보 보너스) × 타입 배율을 게이지에 더한다(정수 내림).
//      게이지가 groggyMax에 도달하면 그로기 진입(groggyUntil=now+GROGGY_DURATION_MS, 게이지 0 리셋, triggered=true).
// 반환: 갱신된 그로기 필드와 연출용 플래그. 비보스(groggyMax<=0)면 누적 0·배수 미적용으로 즉시 반환.
export function resolveGroggy(
  combat: CombatRuntime,
  attackType: AttackType,
  combo: ComboId | null,
  boxerType: BoxerType,
  now: number,
): {
  groggyGauge: number;
  groggyUntil: number | null;
  gain: number;
  triggered: boolean;
  bonusApplied: boolean;
} {
  // 비보스 스테이지: 그로기 비활성. 누적·배수·발동 모두 없음.
  if (combat.groggyMax <= 0) {
    return {
      groggyGauge: combat.groggyGauge,
      groggyUntil: null,
      gain: 0,
      triggered: false,
      bonusApplied: false,
    };
  }

  // ① 만료 판정. active=false면(미진입이거나 now가 종료 시각 이상) 아래에서 누적을 재개하고 groggyUntil=null로 푼다.
  const active = combat.groggyUntil !== null && now < combat.groggyUntil;

  // ② 그로기 상태: 이 타격은 추가 피해만 받고 누적하지 않는다.
  if (active) {
    return {
      groggyGauge: combat.groggyGauge,
      groggyUntil: combat.groggyUntil,
      gain: 0,
      triggered: false,
      bonusApplied: true,
    };
  }

  // ③ 비그로기: 누적 후 상한 도달 시 그로기 진입.
  const base =
    GROGGY_GAIN_BY_ATTACK[attackType] +
    (combo === "FULL_COMBO" ? FULL_COMBO_GROGGY_BONUS : 0);
  const gain = Math.floor(base * BOXER_TYPE_MODIFIERS[boxerType].groggyGainMultiplier);
  const nextGauge = combat.groggyGauge + gain;
  if (gain > 0 && nextGauge >= combat.groggyMax) {
    return {
      groggyGauge: 0,
      groggyUntil: now + GROGGY_DURATION_MS,
      gain,
      triggered: true,
      bonusApplied: false,
    };
  }
  return {
    groggyGauge: Math.min(combat.groggyMax, nextGauge),
    groggyUntil: null,
    gain,
    triggered: false,
    bonusApplied: false,
  };
}

export function resolveAttack(
  boxer: Boxer,
  combat: CombatRuntime,
  randomValue: number,
  now: number,
): CombatStepResult {
  assertTimestamp(now, "now");
  const timedOutCombat = resolveBossTimeout(boxer, combat, now);
  if (timedOutCombat !== combat) {
    return {
      boxer,
      combat: timedOutCombat,
      attack: null,
      bossTimedOut: true,
      monsterAttack: null,
      knockedDown: false,
    };
  }

  const stage = getStageDefinition(combat.position);
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  // v1.3d: 진입부에서 버프 만료를 정리하고 활성 버프 계수를 읽는다(압박 훅/어퍼 증댐 등 기본 타격에 반영).
  const buffMods = getActiveBuffModifiers(combat.activeBuffs, now);
  const liveBuffs = tickBuffs(combat.activeBuffs, now);
  // v1.3d: 내상(리버샷 DoT)을 복서 공격 틱 시점에 정산한다(가정: 정밀 시간 틱은 TODO). monsterHp에 먼저 적용한다.
  const dotResult = applyInternalDamage(combat.internalDoT, now);
  const monsterHpAfterDot = Math.max(0, combat.monsterHp - dotResult.damage);

  // 이번 틱에 칠 공격(콤보 진행 우선 정책)과 손을 고른다.
  const attackType = selectAttackType(combat.nextReadyAt, now, combat.attackHistory);
  const hand = selectHand(attackType, combat.lastHand);
  // 이번 타격을 history에 더한 뒤 콤비네이션(순서+손) 매칭 → 발동 시 보너스를 데미지/치명타에 반영한다.
  const nextHistory = pushHistory(combat.attackHistory, { attackType, hand });
  const combo = matchCombination(nextHistory);
  const { damage: rawBaseDamage, isCritical } = calculateComboAdjustedDamage(stats, attackType, combo, randomValue);
  // v1.3d: 압박 버프는 훅/어퍼 기본 타격에 데미지 증가를 더한다(다른 공격엔 영향 없음).
  const hookUpperBoosted =
    (attackType === "HOOK" || attackType === "UPPER") && buffMods.hookUpperDamageBonus > 0
      ? Math.min(
          MAX_SAFE_GAME_INTEGER,
          Math.floor(rawBaseDamage * (1 + buffMods.hookUpperDamageBonus)),
        )
      : rawBaseDamage;
  // v1.3c: 그로기 상태/누적을 먼저 판정한다(보스만 유효). 그로기 상태면 이 타격에 추가 피해 배수를 적용하고,
  //   비그로기면 이번 공격의 그로기 누적량을 더한다(상한 도달 시 그로기 진입). 비보스면 모두 무효.
  const groggy = resolveGroggy(combat, attackType, combo, boxer.boxerType, now);
  // 추가 피해는 그로기 상태에서 친 공격에만 적용한다(정수 클램프). monsterHp 차감·killed 재판정은 이 값으로 한다.
  const damage = groggy.bonusApplied
    ? Math.min(MAX_SAFE_GAME_INTEGER, Math.floor(hookUpperBoosted * GROGGY_DAMAGE_MULT))
    : hookUpperBoosted;

  // v1.3d: 기본 타격 후 액티브 스킬 자동 발동 판정(쿨 종료·슬롯 우선). 발동 시 효과를 모은다.
  const readySkill = selectReadySkill(
    boxer.equippedSkills?.active ?? [],
    combat.skillCooldowns,
    now,
  );
  const skillEffect = readySkill ? applyActiveSkill(readySkill, stats, now) : null;
  const skillDamage = skillEffect?.monsterDamage ?? 0;
  // 스킬 그로기 누적을 같은 게이지에 합산한다(보스 한정·비그로기 상태에서만). resolveGroggy가 이미 상태/만료를 판정했다.
  const skillGroggyGain = skillEffect?.groggyGain ?? 0;

  // 이번 틱 몬스터 총 피해 = 내상 + 기본 타격 + 스킬. killed는 총 피해로 재판정한다.
  const totalMonsterDamage = Math.min(
    MAX_SAFE_GAME_INTEGER,
    dotResult.damage + damage + skillDamage,
  );
  const killed = totalMonsterDamage >= combat.monsterHp;
  // 잽은 콤보 게이지를 누적한다(상한 클램프). 잽 외 공격은 게이지를 올리지 않는다.
  const comboGauge =
    attackType === "JAB"
      ? Math.min(COMBO_GAUGE_MAX, combat.comboGauge + COMBO_GAUGE_PER_JAB)
      : combat.comboGauge;
  // comboStep: 발동한 콤보의 시퀀스 길이(없으면 0). 연출용.
  const comboStep = combo
    ? (COMBINATIONS.find((c) => c.id === combo)?.sequence.length ?? 0)
    : 0;
  const goldReward = killed
    ? calculateGoldReward(stage.goldReward, stats.goldBonus)
    : 0;
  const nextBoxer = killed
    ? addProgressToBoxer(boxer, 1, goldReward)
    : boxer;

  // v1.3d: 스킬 그로기 누적을 base 그로기 결과에 합산한다(보스·비그로기·게이지 누적 중일 때만).
  //   그로기 상태(bonusApplied)나 진입 직후(triggered)면 스킬 그로기는 합산하지 않는다(상태 일관성).
  let mergedGroggyGauge = groggy.groggyGauge;
  let mergedGroggyUntil = groggy.groggyUntil;
  let mergedGroggyGain = groggy.gain;
  let mergedGroggyTriggered = groggy.triggered;
  if (
    combat.groggyMax > 0 &&
    skillGroggyGain > 0 &&
    !groggy.bonusApplied &&
    !groggy.triggered
  ) {
    const withSkill = groggy.groggyGauge + skillGroggyGain;
    mergedGroggyGain = groggy.gain + skillGroggyGain;
    if (withSkill >= combat.groggyMax) {
      mergedGroggyGauge = 0;
      mergedGroggyUntil = now + GROGGY_DURATION_MS;
      mergedGroggyTriggered = true;
    } else {
      mergedGroggyGauge = Math.min(combat.groggyMax, withSkill);
    }
  }

  // v1.3d: 발동 스킬에 따른 런타임 갱신값(쿨타임·버프·내상). 내상은 새로 부여한 DoT가 있으면 그것을, 없으면 정산 후 잔여 DoT.
  const nextSkillCooldowns =
    skillEffect && readySkill && skillEffect.cooldownMs !== null
      ? { ...combat.skillCooldowns, [readySkill]: now + skillEffect.cooldownMs }
      : combat.skillCooldowns;
  const nextBuffs: SkillBuff[] = skillEffect?.buff
    ? [...liveBuffs, skillEffect.buff]
    : liveBuffs;
  const nextInternalDoT = skillEffect?.internalDoT ?? dotResult.internalDoT;

  let nextCombat: CombatRuntime;
  const timedOutAfterAttack =
    !killed &&
    stage.isBoss &&
    combat.bossDeadlineAt !== null &&
    now >= combat.bossDeadlineAt;

  if (timedOutAfterAttack) {
    nextCombat = createCombatRuntime(
      nextBoxer,
      getPreviousNormalStagePosition(combat.position.chapter),
      now,
      true,
    );
  } else if (!killed) {
    // 친 공격만 쿨타임을 갱신하고 직전 손을 기록한다. 다른 공격의 준비 시각은 그대로 둔다.
    const nextReadyAt = {
      ...combat.nextReadyAt,
      // v1.3d: 친 공격의 다음 준비 시각에 cooldownSpeedup 버프(나비스텝)를 반영해 쿨타임을 단축한다.
      [attackType]: now + effectiveCooldownMs(attackType, stats.attackSpeed, buffMods.cooldownSpeedup),
    };
    nextCombat = {
      ...combat,
      // 내상 + 기본 타격 + 스킬 피해를 합산해 차감한다.
      monsterHp: Math.max(0, combat.monsterHp - totalMonsterDamage),
      nextReadyAt,
      nextAttackAt: minReadyAt(nextReadyAt),
      lastHand: hand,
      // v1.3b: 콤보 진행 상태를 갱신한다. 콤보 끊김(시퀀스 이탈)은 nextComboBeat/matchCombination이
      //   suffix 일치로만 발동하므로 별도 리셋 없이 자연스레 처리된다(이탈한 타격은 새 history 끝에 남아 prefix 불일치).
      attackHistory: nextHistory,
      comboGauge,
      comboStep,
      // v1.3c+v1.3d: 그로기 게이지·상태를 갱신한다(base 타격 + 스킬 그로기 합산; 비보스면 0/null 유지).
      groggyGauge: mergedGroggyGauge,
      groggyUntil: mergedGroggyUntil,
      // v1.3d: 스킬 런타임(쿨타임·버프·내상)을 갱신한다.
      skillCooldowns: nextSkillCooldowns,
      activeBuffs: nextBuffs,
      internalDoT: nextInternalDoT,
    };
  } else if (combat.isFarming) {
    nextCombat = createCombatRuntime(nextBoxer, combat.position, now, true);
  } else {
    nextCombat = createCombatRuntime(
      nextBoxer,
      getNextStagePosition(combat.position),
      now,
    );
  }

  return {
    boxer: nextBoxer,
    combat: nextCombat,
    attack: {
      stageId: stage.id,
      damage,
      isCritical,
      killed,
      goldReward,
      attackType,
      hand,
      combo,
      groggyGain: mergedGroggyGain,
      groggyTriggered: mergedGroggyTriggered,
      groggyBonusApplied: groggy.bonusApplied,
      // v1.3d 연출용: 이번 틱에 발동한 액티브 스킬·다단 타수·스킬 피해·내상 정산 피해.
      skillTriggered: readySkill,
      hits: skillEffect?.hits ?? null,
      skillDamage,
      internalDamage: dotResult.damage,
    },
    bossTimedOut: timedOutAfterAttack,
    monsterAttack: null,
    knockedDown: false,
  };
}

// v1.2a: 복서 공격(nextAttackAt)과 몬스터 공격(nextMonsterAttackAt)을 now 기준 시간순으로 한 스텝씩
// 인터리브한다. 더 이른 이벤트를 처리한다. random은 복서 치명타 또는 몬스터 회피/가드/카운터 판정에 쓰인다.
// 넉다운 발생 시 resolveKnockdown까지 적용해 돌려준다.
export function stepCombat(
  boxer: Boxer,
  combat: CombatRuntime,
  randomValue: number,
  now: number,
): CombatStepResult {
  assertTimestamp(now, "now");

  const boxerDue = combat.nextAttackAt <= now;
  const monsterDue = combat.nextMonsterAttackAt <= now;

  // 몬스터 공격이 복서 공격보다 (엄격히) 이르면 몬스터 공격을 먼저 처리한다. 같은 시각이면 복서 우선.
  const monsterFirst =
    monsterDue && (!boxerDue || combat.nextMonsterAttackAt < combat.nextAttackAt);

  if (monsterFirst) {
    const monster = resolveMonsterAttack(
      boxer,
      combat,
      randomValue,
      combat.nextMonsterAttackAt,
    );
    if (monster.knockedDown) {
      const knockdown = resolveKnockdown(boxer, monster.combat, combat.nextMonsterAttackAt);
      return {
        boxer: knockdown.boxer,
        combat: knockdown.combat,
        attack: null,
        bossTimedOut: false,
        monsterAttack: monster.result,
        knockedDown: true,
      };
    }
    return {
      boxer,
      combat: monster.combat,
      attack: null,
      bossTimedOut: false,
      monsterAttack: monster.result,
      knockedDown: false,
    };
  }

  return resolveAttack(boxer, combat, randomValue, combat.nextAttackAt);
}

export function calculateOfflineProgress(
  boxer: Boxer,
  position: StagePosition,
  elapsedMs: number,
): OfflineProgress {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError("elapsedMs는 0 이상의 유한한 수여야 합니다.");
  }

  const clampedElapsedMs = Math.min(elapsedMs, OFFLINE_MAX_DURATION_MS);
  const offlinePosition = getStageDefinition(position).isBoss
    ? getPreviousNormalStagePosition(position.chapter)
    : { ...position };
  const stage = getStageDefinition(offlinePosition);
  // 가정: 오프라인 정산은 피격(회피/가드/카운터 포함)을 모델링하지 않고 기존 파밍 정산을 그대로 유지한다.
  // v1.3a: 4종 공격을 평균 효율로 일반화한다. 계수 가중합 Σ(계수/쿨타임초)=1.0 이라
  //   base-rate(attackSpeed) 한 틱당 평균 피해 = 기대 타격 피해이므로(= calculateAttackDps),
  //   기존 정산식을 그대로 쓴다. 공격 횟수를 먼저 내림해 1초 미만 이탈은 0처치로 둔다.
  // 복귀 시 createCombatRuntime이 boxerHp를 최대치로 채운다(TASK-013에서 재검토).
  const stats = calculateCombatStats(boxer.upgradeLevels, boxer.boxerType);
  const elapsedSeconds = clampedElapsedMs / 1_000;
  const attacks = Math.floor(elapsedSeconds * stats.attackSpeed);
  const kills = Math.min(
    MAX_SAFE_GAME_INTEGER,
    Math.floor((attacks * calculateExpectedHitDamage(stats)) / stage.maxHp),
  );
  const rewardPerKill = calculateGoldReward(stage.goldReward, stats.goldBonus);
  const gold = Math.min(MAX_SAFE_GAME_INTEGER, kills * rewardPerKill);

  // 오프라인 정산도 온라인 처치와 동일하게 경험치를 부여한다(동작 일관성).
  //   오프라인 위치는 항상 일반 스테이지로 강제되므로 보스 클리어 보너스는 없고 EXP_PER_KILL만 적용.
  const exp = Math.min(MAX_SAFE_GAME_INTEGER, kills * EXP_PER_KILL);
  const progressed = addExpToBoxer(addProgressToBoxer(boxer, kills, gold), exp);

  return {
    boxer: progressed,
    position: offlinePosition,
    elapsedMs: clampedElapsedMs,
    kills,
    gold,
  };
}
