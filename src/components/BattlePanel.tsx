import { OPPONENTS } from "../data/opponents";
import { calculateCombatPower, calculateWinChance } from "../game/formulas";
import type { BattleResult, Boxer } from "../game/types";
import { useGameStore } from "../stores/gameStore";
import styles from "./GamePanel.module.css";

type BattlePanelProps = {
  boxer: Boxer;
  result: BattleResult | null;
};

export function BattlePanel({ boxer, result }: BattlePanelProps) {
  const battle = useGameStore((state) => state.battle);
  const opponent = OPPONENTS[0];

  if (!opponent) return null;

  const opponentPower = calculateCombatPower(opponent.stats);
  const winChance = calculateWinChance(boxer.stats, opponent.stats);
  const winChancePercent = Math.round(winChance * 100);

  return (
    <section className={styles.panel} aria-labelledby="battle-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Next match</p>
          <h2 className={styles.title} id="battle-title">
            VS {opponent.name}
          </h2>
          <p className={styles.description}>{opponent.description}</p>
        </div>
        <span className={styles.badge}>전투력 {opponentPower.toFixed(1)}</span>
      </div>

      <div className={styles.chance}>
        <div className={styles.chanceLabel}>
          <span>예상 승률</span>
          <strong>{winChancePercent}%</strong>
        </div>
        <div className={styles.chanceTrack}>
          <div
            className={styles.chanceFill}
            style={{ width: `${winChancePercent}%` }}
          />
        </div>
      </div>

      <div className={styles.reward}>
        <span>승리 보상</span>
        <span>💰 {opponent.reward.money}원</span>
        <span>★ {opponent.reward.fame}</span>
      </div>

      <button
        className={styles.button}
        type="button"
        onClick={() => battle(opponent.id)}
      >
        경기 시작
      </button>

      {result?.opponentId === opponent.id && (
        <p className={styles.result} role="status">
          <strong>{result.won ? "승리!" : "패배"}</strong>{" "}
          {result.won
            ? `돈 ${result.reward.money}원과 명성 ${result.reward.fame}을 획득했습니다.`
            : "보상은 없지만, 공격력을 더 키우면 승률이 올라갑니다."}
        </p>
      )}
    </section>
  );
}

