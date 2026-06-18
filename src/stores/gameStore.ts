import { create } from "zustand";
import { findOpponent } from "../data/opponents";
import { findTraining } from "../data/trainings";
import { fight } from "../game/battle";
import { INITIAL_STATS } from "../game/formulas";
import { clearGame, loadGame, saveGame } from "../game/save";
import { applyTraining } from "../game/training";
import type { Boxer, GameState } from "../game/types";

type GameActions = {
  createBoxer: (name: string) => void;
  train: (trainingId: string) => void;
  battle: (opponentId: string) => void;
  reset: () => void;
};

export type GameStore = GameState & GameActions;

const EMPTY_STATE: GameState = {
  boxer: null,
  lastBattleResult: null,
  message: null,
};

const initialState = loadGame() ?? EMPTY_STATE;

function createDefaultBoxer(name: string): Boxer {
  return {
    id: "player_boxer",
    name: name.trim() || "무명 복서",
    level: 1,
    stats: { ...INITIAL_STATS },
    money: 0,
    fame: 0,
    defeatedOpponentIds: [],
  };
}

function persist(state: GameState): void {
  saveGame(state);
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  createBoxer: (name) => {
    const nextState: GameState = {
      boxer: createDefaultBoxer(name),
      lastBattleResult: null,
      message: "링에 오를 준비가 끝났습니다.",
    };
    persist(nextState);
    set(nextState);
  },

  train: (trainingId) =>
    set((state) => {
      const training = findTraining(trainingId);
      if (!state.boxer || !training) return state;
      const boxer = applyTraining(state.boxer, training);
      const nextState: GameState = {
        boxer,
        lastBattleResult: state.lastBattleResult,
        message: `${training.name} 완료! 공격력이 올랐습니다.`,
      };
      persist(nextState);
      return nextState;
    }),

  battle: (opponentId) =>
    set((state) => {
      const opponent = findOpponent(opponentId);
      if (!state.boxer || !opponent) return state;
      const outcome = fight(state.boxer, opponent, Math.random());
      const nextState: GameState = {
        boxer: outcome.boxer,
        lastBattleResult: outcome.result,
        message: outcome.result.won
          ? `${opponent.name}에게 승리했습니다!`
          : `${opponent.name}에게 패배했습니다. 훈련 후 다시 도전하세요.`,
      };
      persist(nextState);
      return nextState;
    }),

  reset: () => {
    clearGame();
    set(EMPTY_STATE);
  },
}));

