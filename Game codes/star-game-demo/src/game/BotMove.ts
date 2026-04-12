import type { PlayerPosition, Star, PlayerLock, Direction } from "./types";

export interface BotGameState {
  playerPositions: PlayerPosition[];
  stars: Star[];
  team1Score: number;
  team2Score: number;
  currentPlayer: number;
  playerLocks: PlayerLock[];
}

export interface BotDecision {
  action: "move" | "lock" | "unlock";
  direction: Direction;
  target?: number;
}

// Ingroup bot: Team-oriented strategy
export function getIngroupBotMove(gameState: BotGameState, botPlayerIndex: number): BotDecision {
  const botPos = gameState.playerPositions[botPlayerIndex];
  const stars = gameState.stars || [];
  const isTeam1 = botPlayerIndex < 2;

  const playersInRadar = getPlayersInRadar(gameState, botPlayerIndex);

  // 1. Check if bot can unlock teammate immediately
  for (const player of playersInRadar) {
    const playerTeam = player.playerIndex < 2 ? 1 : 2;
    const botTeam = botPlayerIndex < 2 ? 1 : 2;
    if (playerTeam === botTeam && player.locked) {
      return { action: "unlock", direction: player.direction };
    }
  }

  // 2. Find nearest star
  if (stars.length === 0) {
    return getSafeMove(gameState, botPlayerIndex);
  }

  const nearestStar = getNthClosestStar(gameState, botPos, 1);
  if (!nearestStar) {
    return getSafeMove(gameState, botPlayerIndex);
  }

  // 3. Find who is closest to the nearest star
  const closestPlayerInfo = getClosestPlayerToStar(gameState, nearestStar, botPlayerIndex);
  if (!closestPlayerInfo) {
    return getMoveTowardsStar(gameState, botPlayerIndex, nearestStar);
  }

  const closestPlayerToStar = closestPlayerInfo.playerIndex;
  const botDistanceToStar = getDistance(botPos, nearestStar);

  // 4. Bot is closest or star is adjacent
  if (closestPlayerToStar === botPlayerIndex || botDistanceToStar === 1) {
    return getMoveTowardsStar(gameState, botPlayerIndex, nearestStar);
  }

  // 5. Check if competing for the same star
  const closestPlayerPos = gameState.playerPositions[closestPlayerToStar];
  const closestStarToClosestPlayer = getNthClosestStar(gameState, closestPlayerPos, 1);

  if (
    closestStarToClosestPlayer &&
    closestStarToClosestPlayer.x === nearestStar.x &&
    closestStarToClosestPlayer.y === nearestStar.y
  ) {
    const closestPlayerTeam = closestPlayerToStar < 2 ? 1 : 2;
    const botTeam = botPlayerIndex < 2 ? 1 : 2;

    if (closestPlayerTeam !== botTeam) {
      const competitorInRadar = playersInRadar.find((p) => p.playerIndex === closestPlayerToStar);
      if (competitorInRadar && !competitorInRadar.locked) {
        return { action: "lock", direction: competitorInRadar.direction };
      }
    }
  }

  return getMoveTowardsStar(gameState, botPlayerIndex, nearestStar);
}

function getMoveTowardsStar(
  gameState: BotGameState,
  botPlayerIndex: number,
  star: { x: number; y: number }
): BotDecision {
  const botPos = gameState.playerPositions[botPlayerIndex];
  const dx = star.x - botPos.x;
  const dy = star.y - botPos.y;

  const preferredDirections: Direction[] = [];
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) preferredDirections.push("right");
    if (dx < 0) preferredDirections.push("left");
    if (dy > 0) preferredDirections.push("down");
    if (dy < 0) preferredDirections.push("up");
  } else {
    if (dy > 0) preferredDirections.push("down");
    if (dy < 0) preferredDirections.push("up");
    if (dx > 0) preferredDirections.push("right");
    if (dx < 0) preferredDirections.push("left");
  }

  for (const direction of preferredDirections) {
    if (isSafeMove(gameState, botPlayerIndex, direction)) {
      return { action: "move", direction };
    }
  }

  for (const direction of preferredDirections) {
    if (isValidMove(gameState, botPlayerIndex, direction)) {
      return { action: "move", direction };
    }
  }

  return getSafeMove(gameState, botPlayerIndex);
}

function isValidMove(gameState: BotGameState, botPlayerIndex: number, direction: Direction): boolean {
  const botPos = gameState.playerPositions[botPlayerIndex];
  let newX = botPos.x;
  let newY = botPos.y;

  switch (direction) {
    case "up": newY = Math.max(0, botPos.y - 1); break;
    case "down": newY = Math.min(9, botPos.y + 1); break;
    case "left": newX = Math.max(0, botPos.x - 1); break;
    case "right": newX = Math.min(9, botPos.x + 1); break;
  }

  if (newX === botPos.x && newY === botPos.y) return false;

  const isOccupied = gameState.playerPositions.some(
    (pos, index) => index !== botPlayerIndex && pos.x === newX && pos.y === newY
  );

  return !isOccupied;
}

function isSafeMove(gameState: BotGameState, botPlayerIndex: number, direction: Direction): boolean {
  const botPos = gameState.playerPositions[botPlayerIndex];
  let newX = botPos.x;
  let newY = botPos.y;

  switch (direction) {
    case "up": newY = Math.max(0, botPos.y - 1); break;
    case "down": newY = Math.min(9, botPos.y + 1); break;
    case "left": newX = Math.max(0, botPos.x - 1); break;
    case "right": newX = Math.min(9, botPos.x + 1); break;
  }

  if (newX === botPos.x && newY === botPos.y) return false;

  const isOccupied = gameState.playerPositions.some(
    (pos, index) => index !== botPlayerIndex && pos.x === newX && pos.y === newY
  );

  return !isOccupied;
}

function getSafeMove(gameState: BotGameState, botPlayerIndex: number): BotDecision {
  const directions: Direction[] = ["up", "down", "left", "right"];
  const safeDirections = directions.filter((dir) => isSafeMove(gameState, botPlayerIndex, dir));

  if (safeDirections.length > 0) {
    const randomDirection = safeDirections[Math.floor(Math.random() * safeDirections.length)];
    return { action: "move", direction: randomDirection };
  }

  const validDirections = directions.filter((dir) => isValidMove(gameState, botPlayerIndex, dir));
  if (validDirections.length > 0) {
    const randomDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
    return { action: "move", direction: randomDirection };
  }

  return { action: "move", direction: "up" };
}

function getNthClosestStar(
  gameState: BotGameState,
  playerPos: { x: number; y: number },
  n: number
): Star | null {
  const stars = gameState.stars || [];
  if (stars.length === 0) return null;

  const distances = stars.map((star) => ({
    star,
    distance: Math.abs(star.x - playerPos.x) + Math.abs(star.y - playerPos.y),
  }));

  distances.sort((a, b) => a.distance - b.distance);
  return distances[n - 1] ? distances[n - 1].star : null;
}

function getClosestPlayerToStar(
  gameState: BotGameState,
  star: { x: number; y: number },
  currentPlayerIndex: number
): { playerIndex: number; distance: number } | null {
  let closestPlayerIndex = -1;
  let minDistance = Number.MAX_VALUE;

  for (let i = 0; i < gameState.playerPositions.length; i++) {
    const isPlayerLocked = gameState.playerLocks[i]?.isLocked || false;
    if (isPlayerLocked) continue;

    const playerPos = gameState.playerPositions[i];
    const distance = Math.abs(playerPos.x - star.x) + Math.abs(playerPos.y - star.y);

    if (distance < minDistance) {
      minDistance = distance;
      closestPlayerIndex = i;
    } else if (distance === minDistance) {
      if (closestPlayerIndex === currentPlayerIndex && i !== currentPlayerIndex) {
        closestPlayerIndex = i;
      }
    }
  }

  if (closestPlayerIndex === -1) return null;
  return { playerIndex: closestPlayerIndex, distance: minDistance };
}

function getDistance(playerPos: { x: number; y: number }, star: { x: number; y: number }): number {
  return Math.abs(playerPos.x - star.x) + Math.abs(playerPos.y - star.y);
}

function getPlayersInRadar(
  gameState: BotGameState,
  currentPlayerIndex: number
): Array<{
  playerIndex: number;
  position: PlayerPosition;
  team: number;
  locked: boolean;
  direction: Direction;
  distance: number;
}> {
  const currentPosition = gameState.playerPositions[currentPlayerIndex];
  const players = [];

  for (let i = 0; i < gameState.playerPositions.length; i++) {
    if (i === currentPlayerIndex) continue;

    const playerPosition = gameState.playerPositions[i];

    if (playerPosition.x === currentPosition.x || playerPosition.y === currentPosition.y) {
      let direction: Direction;
      if (playerPosition.y === currentPosition.y) {
        direction = playerPosition.x > currentPosition.x ? "right" : "left";
      } else {
        direction = playerPosition.y > currentPosition.y ? "down" : "up";
      }

      const distance =
        Math.abs(playerPosition.x - currentPosition.x) +
        Math.abs(playerPosition.y - currentPosition.y);
      const team = i < 2 ? 1 : 2;
      const locked = gameState.playerLocks[i]?.isLocked || false;

      players.push({ playerIndex: i, position: playerPosition, team, locked, direction, distance });
    }
  }

  // Keep only closest player per direction
  const playersInRadar = [];
  const directions: Direction[] = ["up", "down", "left", "right"];

  for (const dir of directions) {
    const playersInDirection = players.filter((p) => p.direction === dir);
    if (playersInDirection.length > 0) {
      const closestPlayer = playersInDirection.reduce((prev, curr) =>
        prev.distance < curr.distance ? prev : curr
      );
      playersInRadar.push(closestPlayer);
    }
  }

  return playersInRadar;
}
