import type {
  GameState,
  Direction,
  Star,
  PlayerPosition,
  PlayerLock,
  GameAction,
} from "./types";
import {
  TOTAL_TURNS_PER_ROUND,
  TOTAL_ROUNDS,
  TURN_ORDER,
  PLAYER_IDS,
} from "./types";
import { getIngroupBotMove, type BotGameState } from "./BotMove";

// Generate empty 10x10 grid
function generateGrid(): string[][] {
  return Array(10)
    .fill(null)
    .map(() => Array(10).fill("empty"));
}

// Get random non-overlapping positions for 4 players
function getInitialPositions(): PlayerPosition[] {
  const positions: PlayerPosition[] = [];
  const used = new Set<string>();

  while (positions.length < 4) {
    const x = Math.floor(Math.random() * 10);
    const y = Math.floor(Math.random() * 10);
    const key = `${x},${y}`;
    if (!used.has(key)) {
      positions.push({ x, y });
      used.add(key);
    }
  }
  return positions;
}

function getInitialLocks(): PlayerLock[] {
  return [
    { isLocked: false, turnsRemaining: 0 },
    { isLocked: false, turnsRemaining: 0 },
    { isLocked: false, turnsRemaining: 0 },
    { isLocked: false, turnsRemaining: 0 },
  ];
}

function placeInitialStar(playerPositions: PlayerPosition[]): Star[] {
  let x = Math.floor(Math.random() * 10);
  let y = Math.floor(Math.random() * 10);
  while (playerPositions.some((pos) => pos.x === x && pos.y === y)) {
    x = Math.floor(Math.random() * 10);
    y = Math.floor(Math.random() * 10);
  }
  return [{ x, y, turnsAlive: 0 }];
}

export function createInitialGameState(): GameState {
  const playerPositions = getInitialPositions();
  const stars = placeInitialStar(playerPositions);
  const grid = generateGrid();
  stars.forEach((star) => {
    grid[star.y][star.x] = "star";
  });

  return {
    status: "active",
    currentRound: 1,
    currentTurn: 1,
    currentPlayer: 0, // Human goes first
    turnsRemaining: TOTAL_TURNS_PER_ROUND * 4,
    team1: [PLAYER_IDS[0], PLAYER_IDS[1]], // human, bot1
    team2: [PLAYER_IDS[2], PLAYER_IDS[3]], // bot2, bot3
    team1Score: 0,
    team2Score: 0,
    roundScores: [],
    grid,
    playerPositions,
    playerLocks: getInitialLocks(),
    stars,
    turnsSinceLastStar: 0,
    turnStartTime: Date.now(),
    gameActions: [],
  };
}

// Execute a move for a player
export function executeMove(
  state: GameState,
  playerIndex: number,
  direction: Direction
): GameState {
  if (state.currentPlayer !== playerIndex) return state;
  if (state.playerLocks[playerIndex]?.isLocked) return state;

  const currentPos = state.playerPositions[playerIndex];
  let newX = currentPos.x;
  let newY = currentPos.y;

  switch (direction) {
    case "up": newY = Math.max(0, currentPos.y - 1); break;
    case "down": newY = Math.min(9, currentPos.y + 1); break;
    case "left": newX = Math.max(0, currentPos.x - 1); break;
    case "right": newX = Math.min(9, currentPos.x + 1); break;
  }

  // Check bounds
  if (newX === currentPos.x && newY === currentPos.y) return state;

  // Check occupied
  const isOccupied = state.playerPositions.some(
    (pos, i) => i !== playerIndex && pos.x === newX && pos.y === newY
  );
  if (isOccupied) return state;

  // Update position
  const newPositions = [...state.playerPositions];
  newPositions[playerIndex] = { x: newX, y: newY };

  // Check star harvest
  let newGrid = state.grid.map((row) => [...row]);
  let newStars = [...state.stars];
  let scoreIncrease = 0;
  let result: GameAction["result"] = undefined;

  if (newGrid[newY][newX] === "star") {
    newGrid[newY][newX] = "empty";
    scoreIncrease = 1;
    result = state.status === "overtime" ? "harvested_overtime_win" : "harvested";
    newStars = newStars.filter((s) => !(s.x === newX && s.y === newY));
  }

  let newTeam1Score = state.team1Score;
  let newTeam2Score = state.team2Score;
  if (playerIndex < 2) {
    newTeam1Score += scoreIncrease;
  } else {
    newTeam2Score += scoreIncrease;
  }

  // Log action
  const action: GameAction = {
    playerId: PLAYER_IDS[playerIndex],
    action: "move",
    fromX: currentPos.x,
    fromY: currentPos.y,
    toX: newX,
    toY: newY,
    direction,
    result,
    round: state.currentRound,
    turn: state.currentTurn,
    timestamp: Date.now(),
  };

  let newState: GameState = {
    ...state,
    playerPositions: newPositions,
    grid: newGrid,
    stars: newStars,
    team1Score: newTeam1Score,
    team2Score: newTeam2Score,
    gameActions: [...state.gameActions, action],
  };

  // Overtime win
  if (result === "harvested_overtime_win") {
    const updatedRoundScores = [...newState.roundScores];
    if (updatedRoundScores.length > 0) {
      updatedRoundScores[updatedRoundScores.length - 1] = {
        team1: newTeam1Score,
        team2: newTeam2Score,
      };
    }
    return {
      ...newState,
      status: "game_finished",
      roundScores: updatedRoundScores,
    };
  }

  return advanceTurn(newState);
}

// Execute a lock action
export function executeLock(
  state: GameState,
  playerIndex: number,
  direction: Direction
): GameState {
  if (state.currentPlayer !== playerIndex) return state;
  if (state.playerLocks[playerIndex]?.isLocked) return state;

  const currentPos = state.playerPositions[playerIndex];

  // Find first player in beam path
  let targetPlayer = -1;
  let closestDistance = Infinity;

  for (let i = 0; i < 4; i++) {
    if (i === playerIndex) continue;
    const targetPos = state.playerPositions[i];
    let isInBeamPath = false;
    let distance = 0;

    switch (direction) {
      case "up":
        isInBeamPath = targetPos.x === currentPos.x && targetPos.y < currentPos.y;
        distance = currentPos.y - targetPos.y;
        break;
      case "down":
        isInBeamPath = targetPos.x === currentPos.x && targetPos.y > currentPos.y;
        distance = targetPos.y - currentPos.y;
        break;
      case "left":
        isInBeamPath = targetPos.y === currentPos.y && targetPos.x < currentPos.x;
        distance = currentPos.x - targetPos.x;
        break;
      case "right":
        isInBeamPath = targetPos.y === currentPos.y && targetPos.x > currentPos.x;
        distance = targetPos.x - currentPos.x;
        break;
    }

    if (isInBeamPath && distance < closestDistance) {
      targetPlayer = i;
      closestDistance = distance;
    }
  }

  let result: "locked" | "missed" = "missed";
  const newPlayerLocks = [...state.playerLocks];

  if (targetPlayer !== -1) {
    newPlayerLocks[targetPlayer] = { isLocked: true, turnsRemaining: 12 };
    result = "locked";
  }

  const action: GameAction = {
    playerId: PLAYER_IDS[playerIndex],
    action: "lock",
    fromX: currentPos.x,
    fromY: currentPos.y,
    direction,
    targetPlayer: targetPlayer !== -1 ? targetPlayer : undefined,
    result,
    round: state.currentRound,
    turn: state.currentTurn,
    timestamp: Date.now(),
  };

  return advanceTurn({
    ...state,
    playerLocks: newPlayerLocks,
    gameActions: [...state.gameActions, action],
  });
}

// Execute an unlock action
export function executeUnlock(
  state: GameState,
  playerIndex: number,
  direction: Direction
): GameState {
  if (state.currentPlayer !== playerIndex) return state;
  if (state.playerLocks[playerIndex]?.isLocked) return state;

  const currentPos = state.playerPositions[playerIndex];

  let firstPlayerHit = -1;
  let closestDistance = Infinity;

  for (let i = 0; i < 4; i++) {
    if (i === playerIndex) continue;
    const targetPos = state.playerPositions[i];
    let isInBeamPath = false;
    let distance = 0;

    switch (direction) {
      case "up":
        isInBeamPath = targetPos.x === currentPos.x && targetPos.y < currentPos.y;
        distance = currentPos.y - targetPos.y;
        break;
      case "down":
        isInBeamPath = targetPos.x === currentPos.x && targetPos.y > currentPos.y;
        distance = targetPos.y - currentPos.y;
        break;
      case "left":
        isInBeamPath = targetPos.y === currentPos.y && targetPos.x < currentPos.x;
        distance = currentPos.x - targetPos.x;
        break;
      case "right":
        isInBeamPath = targetPos.y === currentPos.y && targetPos.x > currentPos.x;
        distance = targetPos.x - currentPos.x;
        break;
    }

    if (isInBeamPath && distance < closestDistance) {
      firstPlayerHit = i;
      closestDistance = distance;
    }
  }

  let result: "unlocked" | "missed" = "missed";
  const newPlayerLocks = [...state.playerLocks];

  if (firstPlayerHit !== -1 && state.playerLocks[firstPlayerHit]?.isLocked) {
    newPlayerLocks[firstPlayerHit] = { isLocked: false, turnsRemaining: 0 };
    result = "unlocked";
  }

  const action: GameAction = {
    playerId: PLAYER_IDS[playerIndex],
    action: "unlock",
    fromX: currentPos.x,
    fromY: currentPos.y,
    direction,
    targetPlayer: firstPlayerHit !== -1 ? firstPlayerHit : undefined,
    result,
    round: state.currentRound,
    turn: state.currentTurn,
    timestamp: Date.now(),
  };

  return advanceTurn({
    ...state,
    playerLocks: newPlayerLocks,
    gameActions: [...state.gameActions, action],
  });
}

// Record a locked turn (player was locked and couldn't move)
export function recordLockedTurn(state: GameState, playerIndex: number): GameState {
  const currentPos = state.playerPositions[playerIndex];
  const action: GameAction = {
    playerId: PLAYER_IDS[playerIndex],
    action: "locked",
    fromX: currentPos.x,
    fromY: currentPos.y,
    round: state.currentRound,
    turn: state.currentTurn,
    timestamp: Date.now(),
  };

  return advanceTurn({
    ...state,
    gameActions: [...state.gameActions, action],
  });
}

// Record a timeout (human didn't move in time)
export function recordTimeout(state: GameState, playerIndex: number): GameState {
  const currentPos = state.playerPositions[playerIndex];
  const action: GameAction = {
    playerId: PLAYER_IDS[playerIndex],
    action: "timeout",
    fromX: currentPos.x,
    fromY: currentPos.y,
    round: state.currentRound,
    turn: state.currentTurn,
    timestamp: Date.now(),
  };

  return advanceTurn({
    ...state,
    gameActions: [...state.gameActions, action],
  });
}

// Advance to next turn
function advanceTurn(state: GameState): GameState {
  const currentIndex = TURN_ORDER.indexOf(state.currentPlayer);
  const nextIndex = (currentIndex + 1) % TURN_ORDER.length;
  const nextPlayer = TURN_ORDER[nextIndex];
  const newCurrentTurn = state.currentTurn + 1;
  const newTurnsRemaining = state.status === "overtime" ? state.turnsRemaining : state.turnsRemaining - 1;

  // Update locks
  const newPlayerLocks = state.playerLocks.map((lock) => ({
    isLocked: lock.isLocked && lock.turnsRemaining > 1,
    turnsRemaining: Math.max(0, lock.turnsRemaining - 1),
  }));

  // Update star ages
  let newStars = state.stars.map((star) => ({
    ...star,
    turnsAlive: star.turnsAlive + 1,
  }));
  let newGrid = state.grid.map((row) => [...row]);

  // Remove old stars
  newStars = newStars.filter((star) => {
    if (star.turnsAlive >= 16 && Math.random() < 0.8) {
      newGrid[star.y][star.x] = "empty";
      return false;
    }
    return true;
  });

  // Spawn new star
  let newTurnsSinceLastStar = (state.turnsSinceLastStar || 0) + 1;
  if (newTurnsSinceLastStar >= 4 && Math.random() < 0.75) {
    const emptyPositions: { x: number; y: number }[] = [];
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (!state.playerPositions.some((pos) => pos.x === x && pos.y === y)) {
          emptyPositions.push({ x, y });
        }
      }
    }

    if (emptyPositions.length > 0) {
      const randomPos = emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
      newStars.push({ x: randomPos.x, y: randomPos.y, turnsAlive: 0 });
      newGrid[randomPos.y][randomPos.x] = "star";
      newTurnsSinceLastStar = 0;
    }
  }

  // Check if round is over
  if (newTurnsRemaining <= 0 && state.status !== "overtime") {
    return endRound({
      ...state,
      playerLocks: newPlayerLocks,
      stars: newStars,
      grid: newGrid,
      turnsSinceLastStar: newTurnsSinceLastStar,
    });
  }

  return {
    ...state,
    currentPlayer: nextPlayer,
    currentTurn: newCurrentTurn,
    turnsRemaining: newTurnsRemaining,
    playerLocks: newPlayerLocks,
    stars: newStars,
    grid: newGrid,
    turnsSinceLastStar: newTurnsSinceLastStar,
    turnStartTime: Date.now(),
  };
}

// End a round
function endRound(state: GameState): GameState {
  const newRoundScores = [
    ...state.roundScores,
    { team1: state.team1Score, team2: state.team2Score },
  ];

  if (state.currentRound === TOTAL_ROUNDS) {
    // End of final round
    const totalTeam1 = newRoundScores.reduce((sum, r) => sum + r.team1, 0);
    const totalTeam2 = newRoundScores.reduce((sum, r) => sum + r.team2, 0);

    if (totalTeam1 === totalTeam2) {
      // Overtime
      return {
        ...state,
        status: "overtime",
        turnsRemaining: 999,
        roundScores: newRoundScores,
        turnStartTime: Date.now(),
      };
    } else {
      return {
        ...state,
        status: "game_finished",
        roundScores: newRoundScores,
      };
    }
  } else {
    // Resting phase between rounds
    return {
      ...state,
      status: "resting",
      roundScores: newRoundScores,
      restingPhaseEndTime: Date.now() + 10000,
    };
  }
}

// Start next round after resting
export function startNextRound(state: GameState): GameState {
  const playerPositions = getInitialPositions();
  const stars = placeInitialStar(playerPositions);
  const grid = generateGrid();
  stars.forEach((star) => {
    grid[star.y][star.x] = "star";
  });

  return {
    ...state,
    status: "active",
    currentRound: state.currentRound + 1,
    currentTurn: 1,
    currentPlayer: 0,
    turnsRemaining: TOTAL_TURNS_PER_ROUND * 4,
    team1Score: 0,
    team2Score: 0,
    grid,
    playerPositions,
    playerLocks: getInitialLocks(),
    stars,
    turnsSinceLastStar: 0,
    turnStartTime: Date.now(),
    restingPhaseEndTime: undefined,
    countdownStartTime: undefined,
    countdownDuration: undefined,
  };
}

// Get bot decision for current player
export function getBotDecision(state: GameState): BotGameState & { decision: ReturnType<typeof getIngroupBotMove> } {
  const botGameState: BotGameState = {
    playerPositions: state.playerPositions,
    stars: state.stars,
    team1Score: state.team1Score,
    team2Score: state.team2Score,
    currentPlayer: state.currentPlayer,
    playerLocks: state.playerLocks,
  };

  const decision = getIngroupBotMove(botGameState, state.currentPlayer);
  return { ...botGameState, decision };
}

// Execute bot's turn
export function executeBotTurn(state: GameState): GameState {
  const playerIndex = state.currentPlayer;

  // Check if locked
  if (state.playerLocks[playerIndex]?.isLocked) {
    return recordLockedTurn(state, playerIndex);
  }

  const { decision } = getBotDecision(state);

  if (decision.action === "move") {
    return executeMove(state, playerIndex, decision.direction);
  } else if (decision.action === "lock") {
    return executeLock(state, playerIndex, decision.direction);
  } else if (decision.action === "unlock") {
    return executeUnlock(state, playerIndex, decision.direction);
  }

  return state;
}

// Check if current player is a bot
export function isCurrentPlayerBot(state: GameState): boolean {
  return state.currentPlayer !== 0; // Player 0 is human, rest are bots
}
