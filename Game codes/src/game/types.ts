export interface PlayerPosition {
  x: number;
  y: number;
}

export interface Star {
  x: number;
  y: number;
  turnsAlive: number;
}

export interface PlayerLock {
  isLocked: boolean;
  turnsRemaining: number;
}

export interface RoundScore {
  team1: number;
  team2: number;
}

export interface GameAction {
  playerId: string;
  action: "move" | "harvest" | "lock" | "unlock" | "locked" | "timeout";
  fromX: number;
  fromY: number;
  toX?: number;
  toY?: number;
  direction?: Direction;
  targetPlayer?: number;
  result?: "harvested" | "unlocked" | "locked" | "missed" | "harvested_overtime_win";
  round: number;
  turn: number;
  timestamp: number;
}

export type Direction = "up" | "down" | "left" | "right";

export type GameStatus = "tutorial" | "active" | "resting" | "overtime" | "game_finished" | "thank_you";

export interface GameState {
  status: GameStatus;
  currentRound: number;
  currentTurn: number;
  currentPlayer: number; // 0-3 player index
  turnsRemaining: number;
  team1: string[]; // ["human", "bot1"]
  team2: string[]; // ["bot2", "bot3"]
  team1Score: number;
  team2Score: number;
  roundScores: RoundScore[];
  grid: string[][]; // "empty" | "star"
  playerPositions: PlayerPosition[];
  playerLocks: PlayerLock[];
  stars: Star[];
  turnsSinceLastStar: number;
  turnStartTime: number | null;
  gameActions: GameAction[];
  // Resting state
  restingPhaseEndTime?: number;
  // Countdown
  countdownStartTime?: number;
  countdownDuration?: number;
}

export const TOTAL_TURNS_PER_ROUND = 30;
export const TOTAL_ROUNDS = 3;
export const TURN_ORDER = [0, 2, 1, 3]; // human, bot2, bot1, bot3
export const RESTING_TIME_SECONDS = 10;
export const TURN_TIMEOUT_SECONDS = 10;

export const PLAYER_IDS = ["human", "bot1", "bot2", "bot3"];
