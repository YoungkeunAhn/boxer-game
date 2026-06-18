export type Stats = {
  health: number;
  attack: number;
  defense: number;
  speed: number;
};

export type StatKey = keyof Stats;

export type Reward = {
  money: number;
  fame: number;
};

export type Boxer = {
  id: string;
  name: string;
  level: number;
  stats: Stats;
  money: number;
  fame: number;
  defeatedOpponentIds: string[];
};

export type Training = {
  id: string;
  name: string;
  description: string;
  statGains: Partial<Stats>;
};

export type Opponent = {
  id: string;
  name: string;
  description: string;
  stats: Stats;
  reward: Reward;
};

export type BattleResult = {
  opponentId: string;
  opponentName: string;
  won: boolean;
  winChance: number;
  reward: Reward;
  isFirstWin: boolean;
};

export type GameState = {
  boxer: Boxer | null;
  lastBattleResult: BattleResult | null;
  message: string | null;
};

export type SaveData = {
  schemaVersion: number;
  balanceVersion: number;
  savedAt: string;
  boxer: Boxer;
};

