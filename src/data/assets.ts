import type { StageDefinition, UpgradeKey } from "../game/types";

// 스테이지 테마 → 아트 에셋 경로 매핑(표시 전용). 에셋은 public/ 아래 폴더로 정리되어 있다:
//   public/rings/ring_{themeId}.png            — 챕터 테마별 링 배경(없으면 default)
//   public/monsters/monster_{themeId}_{variant} — 일반/보스 몬스터 픽셀 아트
//   public/fx/fx_*.png                          — 타격/카운터/그로기 이펙트
// themeId는 getStageDefinition()이 STAGE_THEMES에서 파생한다(forest_entrance / wolf_forest / rock_canyon).

// 전용 아트가 존재하는 테마. 그 외(미래 신규 테마)는 안전한 폴백을 쓴다.
const THEMES_WITH_ART = new Set(["forest_entrance", "wolf_forest", "rock_canyon"]);

// 폴백 기본값: 링은 중립 링, 몬스터는 늑대 세트(가장 범용적인 휴머노이드 실루엣).
const FALLBACK_MONSTER_THEME = "wolf_forest";

export function ringImageForStage(stage: StageDefinition): string {
  return THEMES_WITH_ART.has(stage.themeId)
    ? `/rings/ring_${stage.themeId}.png`
    : "/rings/ring_default.png";
}

export function monsterImageForStage(stage: StageDefinition): string {
  const variant = stage.isBoss ? "boss" : "normal";
  const theme = THEMES_WITH_ART.has(stage.themeId)
    ? stage.themeId
    : FALLBACK_MONSTER_THEME;
  return `/monsters/monster_${theme}_${variant}.png`;
}

export const FX_HIT = "/fx/fx_hit.png";
export const FX_COUNTER = "/fx/fx_counter.png";
export const FX_GROGGY = "/fx/fx_groggy.png";

// 강화 카드 아트(표시 전용). public/upgrades/ 아래로 정리되어 있다:
//   upgrade_{upgradeKey}.png — 강화 항목 아이콘(9종 전부 존재, 없으면 이모지 폴백)
//   upgrade_card_bg.png      — 카드 프레임 배경(CSS에서 직접 참조)
//   upgrade_coin.png         — 골드 비용 코인
const UPGRADE_KEYS_WITH_ICON = new Set<UpgradeKey>([
  "attackPower",
  "attackSpeed",
  "critRate",
  "critDamage",
  "goldBonus",
  "maxHp",
  "defense",
  "dodge",
  "counter",
]);

export function upgradeIconForKey(key: UpgradeKey): string | null {
  return UPGRADE_KEYS_WITH_ICON.has(key) ? `/upgrades/upgrade_${key}.png` : null;
}

export const UPGRADE_COIN = "/upgrades/upgrade_coin.png";

// 상단바 재화 아이콘(표시 전용). public/currency/ 아래로 정리:
//   currency_gold.png — 골드(upgrade_coin과 동일 코인 아트)
export const CURRENCY_GOLD = "/currency/currency_gold.png";
