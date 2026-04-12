// Bot Strategy Types and Interfaces
export type BotStrategy = "ingroup" | "outgroup" | "prosocial" | "antisocial" | "random";

export interface GameState {
    playerPositions: { x: number; y: number }[];
    stars: { x: number; y: number; turnsAlive: number }[];
    team1Score: number;
    team2Score: number;
    currentPlayer: number;
    playerLocks: { isLocked: boolean; turnsRemaining: number }[];
}

export interface BotDecision {
    action: "move" | "lock" | "unlock";
    direction: "up" | "down" | "left" | "right";
    target?: number;
}



// Ingroup bot: Advanced team-oriented strategy with tactical decision making (ingroupB11 implementation)
export function getIngroupBotMove(gameState: GameState, botPlayerIndex: number): BotDecision {
    const botPos = gameState.playerPositions[botPlayerIndex];
    const stars = gameState.stars || [];
    const isTeam1 = botPlayerIndex < 2;
    const teammateIndex = isTeam1 ? (botPlayerIndex === 0 ? 1 : 0) : (botPlayerIndex === 2 ? 3 : 2);
    const opponentIndices = isTeam1 ? [2, 3] : [0, 1];

    // Get players in radar (same row/column)
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

    // 3. Find who is closest to the nearest star (excluding locked players)
    const closestPlayerInfo = getClosestPlayerToStar(gameState, nearestStar, botPlayerIndex);
    if (!closestPlayerInfo) {
        return getMoveTowardsStar(gameState, botPlayerIndex, nearestStar);
    }

    const closestPlayerToStar = closestPlayerInfo.playerIndex;
    const botDistanceToStar = getDistance(botPos, nearestStar);

    // 4. Decision making based on who is closest to star
    if (closestPlayerToStar === botPlayerIndex || botDistanceToStar === 1) {
        // Bot is closest or star is adjacent, move toward star
        return getMoveTowardsStar(gameState, botPlayerIndex, nearestStar);
    }

    // 5. Check if we're competing for the same star
    const closestPlayerPos = gameState.playerPositions[closestPlayerToStar];
    const closestStarToClosestPlayer = getNthClosestStar(gameState, closestPlayerPos, 1);

    if (closestStarToClosestPlayer &&
        closestStarToClosestPlayer.x === nearestStar.x &&
        closestStarToClosestPlayer.y === nearestStar.y) {

        // We're competing for the same star
        const closestPlayerTeam = closestPlayerToStar < 2 ? 1 : 2;
        const botTeam = botPlayerIndex < 2 ? 1 : 2;

        if (closestPlayerTeam !== botTeam) {
            // Competing with opponent - try to lock them if in radar
            const competitorInRadar = playersInRadar.find(p => p.playerIndex === closestPlayerToStar);
            if (competitorInRadar && !competitorInRadar.locked) {
                return { action: "lock", direction: competitorInRadar.direction };
            }
        }
        // If competing with teammate or can't lock opponent, still move toward star
    }

    // Move toward star regardless
    return getMoveTowardsStar(gameState, botPlayerIndex, nearestStar);
}

// Outgroup bot: Same strategy as ingroup but treats opponents as teammates and teammates as opponents (outgroupB22 implementation)
export function getOutgroupBotMove(gameState: GameState, botPlayerIndex: number): BotDecision {
    const botPos = gameState.playerPositions[botPlayerIndex];
    const stars = gameState.stars || [];
    const isTeam1 = botPlayerIndex < 2;

    // Get players in radar (same row/column)
    const playersInRadar = getPlayersInRadar(gameState, botPlayerIndex);

    // 1. Check if bot can unlock "teammate" (actually opponent) immediately
    for (const player of playersInRadar) {
        const playerTeam = player.playerIndex < 2 ? 1 : 2;
        const botTeam = botPlayerIndex < 2 ? 1 : 2;

        // Treat opponents as teammates
        if (playerTeam !== botTeam && player.locked) {
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

    // 3. Find who is closest to the nearest star (excluding locked players)
    const closestPlayerInfo = getClosestPlayerToStar(gameState, nearestStar, botPlayerIndex);
    if (!closestPlayerInfo) {
        return getMoveTowardsStar(gameState, botPlayerIndex, nearestStar);
    }

    const closestPlayerToStar = closestPlayerInfo.playerIndex;
    const botDistanceToStar = getDistance(botPos, nearestStar);

    // 4. Decision making based on who is closest to star
    if (closestPlayerToStar === botPlayerIndex || botDistanceToStar === 1) {
        // Bot is closest or star is adjacent, move toward star
        return getMoveTowardsStar(gameState, botPlayerIndex, nearestStar);
    }

    // 5. Check if we're competing for the same star
    const closestPlayerPos = gameState.playerPositions[closestPlayerToStar];
    const closestStarToClosestPlayer = getNthClosestStar(gameState, closestPlayerPos, 1);

    if (closestStarToClosestPlayer &&
        closestStarToClosestPlayer.x === nearestStar.x &&
        closestStarToClosestPlayer.y === nearestStar.y) {

        // We're competing for the same star
        const closestPlayerTeam = closestPlayerToStar < 2 ? 1 : 2;
        const botTeam = botPlayerIndex < 2 ? 1 : 2;

        // Treat teammates as opponents
        if (closestPlayerTeam === botTeam) {
            // Competing with "opponent" (actually teammate) - try to lock them if in radar
            const competitorInRadar = playersInRadar.find(p => p.playerIndex === closestPlayerToStar);
            if (competitorInRadar && !competitorInRadar.locked) {
                return { action: "lock", direction: competitorInRadar.direction };
            }
        }
        // If competing with "teammate" (actually opponent) or can't lock, still move toward star
    }

    // Move toward star regardless
    return getMoveTowardsStar(gameState, botPlayerIndex, nearestStar);
}

// Prosocial bot: Team agnostic, unlocks any locked player, chases stars while avoiding blocking others (prosocialB33 implementation)
export function getProsocialBotMove(gameState: GameState, botPlayerIndex: number): BotDecision {
    const botPos = gameState.playerPositions[botPlayerIndex];
    const stars = gameState.stars || [];

    // Get players in radar (same row/column)
    const playersInRadar = getPlayersInRadar(gameState, botPlayerIndex);

    // 1. Check if bot can unlock ANY locked player (team agnostic)
    for (const player of playersInRadar) {
        if (player.locked) {
            return { action: "unlock", direction: player.direction };
        }
    }

    // 2. No locked players to unlock, chase closest star while avoiding blocking others
    if (stars.length === 0) {
        return getNonBlockingMove(gameState, botPlayerIndex);
    }

    const nearestStar = getNthClosestStar(gameState, botPos, 1);
    if (!nearestStar) {
        return getNonBlockingMove(gameState, botPlayerIndex);
    }

    // 3. Find who is closest to the nearest star (excluding locked players)
    const closestPlayerInfo = getClosestPlayerToStar(gameState, nearestStar, botPlayerIndex);
    if (!closestPlayerInfo) {
        return getMoveTowardsStarNonBlocking(gameState, botPlayerIndex, nearestStar);
    }

    const closestPlayerToStar = closestPlayerInfo.playerIndex;
    const botDistanceToStar = getDistance(botPos, nearestStar);

    // 4. Decision making based on who is closest to star
    if (closestPlayerToStar === botPlayerIndex || botDistanceToStar === 1) {
        // Bot is closest or star is adjacent, move toward star
        return getMoveTowardsStarNonBlocking(gameState, botPlayerIndex, nearestStar);
    }

    // 5. Always move toward star regardless of competition (prosocial doesn't give up)
    return getMoveTowardsStarNonBlocking(gameState, botPlayerIndex, nearestStar);
}

// Antisocial bot: Locks competitors for stars regardless of team, never unlocks, avoids being locked (antisocialB4 implementation)
export function getAntisocialBotMove(gameState: GameState, botPlayerIndex: number): BotDecision {
    const botPos = gameState.playerPositions[botPlayerIndex];
    const stars = gameState.stars || [];

    // Never unlock anyone - antisocial bots don't help others

    // Get players in radar (same row/column)
    const playersInRadar = getPlayersInRadar(gameState, botPlayerIndex);

    // If no stars, make evasive move
    if (stars.length === 0) {
        return getEvasiveMove(gameState, botPlayerIndex);
    }

    // Find closest star to bot
    const nearestStar = getNthClosestStar(gameState, botPos, 1);
    if (!nearestStar) {
        return getEvasiveMove(gameState, botPlayerIndex);
    }

    // Find who is closest to this star (excluding locked players)
    const closestPlayerInfo = getClosestPlayerToStar(gameState, nearestStar, botPlayerIndex);
    if (!closestPlayerInfo) {
        return getMoveTowardsStarEvasive(gameState, botPlayerIndex, nearestStar);
    }

    const closestPlayerToStar = closestPlayerInfo.playerIndex;

    // If bot is closest to the star, move toward it
    if (closestPlayerToStar === botPlayerIndex) {
        return getMoveTowardsStarEvasive(gameState, botPlayerIndex, nearestStar);
    }

    // Check if we're competing for the same star
    const closestPlayerPos = gameState.playerPositions[closestPlayerToStar];
    const closestStarToClosestPlayer = getNthClosestStar(gameState, closestPlayerPos, 1);

    if (closestStarToClosestPlayer &&
        closestStarToClosestPlayer.x === nearestStar.x &&
        closestStarToClosestPlayer.y === nearestStar.y) {

        // We're competing for the same star - try to lock competitor regardless of team
        const competitorInRadar = playersInRadar.find(p => p.playerIndex === closestPlayerToStar);
        if (competitorInRadar && !competitorInRadar.locked) {
            return { action: "lock", direction: competitorInRadar.direction };
        }
    }

    // Either can't lock competitor or not competing, move toward star while avoiding danger
    return getMoveTowardsStarEvasive(gameState, botPlayerIndex, nearestStar);
}

// Helper function to check if player can lock another player
export function canLockPlayer(fromPos: { x: number; y: number }, targetPos: { x: number; y: number }, allPlayerPositions: { x: number; y: number }[], botPlayerIndex: number): { canLock: boolean; direction?: "up" | "down" | "left" | "right" } {
    // Check if target is in same row or column
    let direction: "up" | "down" | "left" | "right" | null = null;

    if (fromPos.x === targetPos.x) {
        // Same column
        if (targetPos.y < fromPos.y) {
            direction = "up";
        } else if (targetPos.y > fromPos.y) {
            direction = "down";
        }
    } else if (fromPos.y === targetPos.y) {
        // Same row
        if (targetPos.x < fromPos.x) {
            direction = "left";
        } else if (targetPos.x > fromPos.x) {
            direction = "right";
        }
    }

    if (!direction) {
        return { canLock: false };
    }

    // Check if there are any players between the bot and the target
    // Find the FIRST player in the direction to see if it matches our intended target
    let closestPlayer = -1;
    let closestDistance = Infinity;

    for (let i = 0; i < allPlayerPositions.length; i++) {
        if (i === botPlayerIndex) continue;

        const playerPos = allPlayerPositions[i];
        let isInBeamPath = false;
        let distance = 0;

        switch (direction) {
            case "up":
                isInBeamPath = playerPos.x === fromPos.x && playerPos.y < fromPos.y;
                distance = fromPos.y - playerPos.y;
                break;
            case "down":
                isInBeamPath = playerPos.x === fromPos.x && playerPos.y > fromPos.y;
                distance = playerPos.y - fromPos.y;
                break;
            case "left":
                isInBeamPath = playerPos.y === fromPos.y && playerPos.x < fromPos.x;
                distance = fromPos.x - playerPos.x;
                break;
            case "right":
                isInBeamPath = playerPos.y === fromPos.y && playerPos.x > fromPos.x;
                distance = playerPos.x - fromPos.x;
                break;
        }

        if (isInBeamPath && distance < closestDistance) {
            closestPlayer = i;
            closestDistance = distance;
        }
    }

    // Only return true if the closest player in that direction is our intended target
    if (closestPlayer !== -1) {
        const closestPlayerPos = allPlayerPositions[closestPlayer];
        const isIntendedTarget = closestPlayerPos.x === targetPos.x && closestPlayerPos.y === targetPos.y;
        return { canLock: isIntendedTarget, direction };
    }

    return { canLock: false };
}

// Helper function to get safe move toward star
export function getMoveTowardsStar(gameState: GameState, botPlayerIndex: number, star: { x: number; y: number }): BotDecision {
    const botPos = gameState.playerPositions[botPlayerIndex];
    const dx = star.x - botPos.x;
    const dy = star.y - botPos.y;

    // Determine preferred directions toward star
    const preferredDirections: ("up" | "down" | "left" | "right")[] = [];

    if (Math.abs(dx) > Math.abs(dy)) {
        // Prioritize horizontal movement
        if (dx > 0) preferredDirections.push("right");
        if (dx < 0) preferredDirections.push("left");
        if (dy > 0) preferredDirections.push("down");
        if (dy < 0) preferredDirections.push("up");
    } else {
        // Prioritize vertical movement
        if (dy > 0) preferredDirections.push("down");
        if (dy < 0) preferredDirections.push("up");
        if (dx > 0) preferredDirections.push("right");
        if (dx < 0) preferredDirections.push("left");
    }

    // First, try each preferred direction with safety checks
    for (const direction of preferredDirections) {
        if (isSafeMove(gameState, botPlayerIndex, direction)) {
            return { action: "move", direction };
        }
    }

    // If no safe preferred direction, try direct moves toward star ignoring safety
    for (const direction of preferredDirections) {
        if (isValidMove(gameState, botPlayerIndex, direction)) {
            return { action: "move", direction };
        }
    }

    // If no valid moves toward star, try any safe direction
    return getSafeMove(gameState, botPlayerIndex);
}

// Helper function to get move towards star while avoiding blocking other players
export function getMoveTowardsStarNonBlocking(gameState: GameState, botPlayerIndex: number, star: { x: number; y: number }): BotDecision {
    const botPos = gameState.playerPositions[botPlayerIndex];
    const dx = star.x - botPos.x;
    const dy = star.y - botPos.y;

    // Determine preferred directions toward star
    const preferredDirections: ("up" | "down" | "left" | "right")[] = [];

    if (Math.abs(dx) > Math.abs(dy)) {
        // Prioritize horizontal movement
        if (dx > 0) preferredDirections.push("right");
        if (dx < 0) preferredDirections.push("left");
        if (dy > 0) preferredDirections.push("down");
        if (dy < 0) preferredDirections.push("up");
    } else {
        // Prioritize vertical movement
        if (dy > 0) preferredDirections.push("down");
        if (dy < 0) preferredDirections.push("up");
        if (dx > 0) preferredDirections.push("right");
        if (dx < 0) preferredDirections.push("left");
    }

    // First, try each preferred direction with non-blocking checks
    for (const direction of preferredDirections) {
        if (isNonBlockingMove(gameState, botPlayerIndex, direction)) {
            return { action: "move", direction };
        }
    }

    // If no non-blocking preferred direction, try direct moves toward star ignoring blocking
    for (const direction of preferredDirections) {
        if (isValidMove(gameState, botPlayerIndex, direction)) {
            return { action: "move", direction };
        }
    }

    // If no valid moves toward star, try any non-blocking direction
    return getNonBlockingMove(gameState, botPlayerIndex);
}

// Helper function to get move towards star while avoiding players who can lock the bot
export function getMoveTowardsStarEvasive(gameState: GameState, botPlayerIndex: number, star: { x: number; y: number }): BotDecision {
    const botPos = gameState.playerPositions[botPlayerIndex];
    const dx = star.x - botPos.x;
    const dy = star.y - botPos.y;

    // Determine preferred directions toward star
    const preferredDirections: ("up" | "down" | "left" | "right")[] = [];

    if (Math.abs(dx) > Math.abs(dy)) {
        // Prioritize horizontal movement
        if (dx > 0) preferredDirections.push("right");
        if (dx < 0) preferredDirections.push("left");
        if (dy > 0) preferredDirections.push("down");
        if (dy < 0) preferredDirections.push("up");
    } else {
        // Prioritize vertical movement
        if (dy > 0) preferredDirections.push("down");
        if (dy < 0) preferredDirections.push("up");
        if (dx > 0) preferredDirections.push("right");
        if (dx < 0) preferredDirections.push("left");
    }

    // First, try each preferred direction with evasion checks
    for (const direction of preferredDirections) {
        if (isEvasiveMove(gameState, botPlayerIndex, direction)) {
            return { action: "move", direction };
        }
    }

    // If no evasive preferred direction, try direct moves toward star ignoring evasion
    for (const direction of preferredDirections) {
        if (isValidMove(gameState, botPlayerIndex, direction)) {
            return { action: "move", direction };
        }
    }

    // If no valid moves toward star, try any evasive direction
    return getEvasiveMove(gameState, botPlayerIndex);
}

// Helper function to check if a move is valid (basic validity only)
export function isValidMove(gameState: GameState, botPlayerIndex: number, direction: "up" | "down" | "left" | "right"): boolean {
    const botPos = gameState.playerPositions[botPlayerIndex];
    let newX = botPos.x;
    let newY = botPos.y;

    switch (direction) {
        case "up":
            newY = Math.max(0, botPos.y - 1);
            break;
        case "down":
            newY = Math.min(9, botPos.y + 1);
            break;
        case "left":
            newX = Math.max(0, botPos.x - 1);
            break;
        case "right":
            newX = Math.min(9, botPos.x + 1);
            break;
    }

    // Check if move is within bounds and position changed
    if (newX === botPos.x && newY === botPos.y) {
        return false; // Hit boundary
    }

    // Check if position is occupied by another player
    const isOccupied = gameState.playerPositions.some((pos, index) =>
        index !== botPlayerIndex && pos.x === newX && pos.y === newY
    );

    return !isOccupied;
}

// Helper function to check if a move is safe
export function isSafeMove(gameState: GameState, botPlayerIndex: number, direction: "up" | "down" | "left" | "right"): boolean {
    const botPos = gameState.playerPositions[botPlayerIndex];
    let newX = botPos.x;
    let newY = botPos.y;

    switch (direction) {
        case "up":
            newY = Math.max(0, botPos.y - 1);
            break;
        case "down":
            newY = Math.min(9, botPos.y + 1);
            break;
        case "left":
            newX = Math.max(0, botPos.x - 1);
            break;
        case "right":
            newX = Math.min(9, botPos.x + 1);
            break;
    }

    // Check if move is within bounds and position changed
    if (newX === botPos.x && newY === botPos.y) {
        return false; // Hit boundary
    }

    // Check if position is occupied by another player
    const isOccupied = gameState.playerPositions.some((pos, index) =>
        index !== botPlayerIndex && pos.x === newX && pos.y === newY
    );

    if (isOccupied) {
        return false;
    }

    const isTeam1 = botPlayerIndex < 2;
    const teammateIndex = isTeam1 ? (botPlayerIndex === 0 ? 1 : 0) : (botPlayerIndex === 2 ? 3 : 2);
    const opponentIndices = isTeam1 ? [2, 3] : [0, 1];
    const teammatePos = gameState.playerPositions[teammateIndex];

    // 5. Safety checks

    // Check if move puts bot in danger (same row/column as opponents)
    // Only avoid opponents who are NOT locked (since locked opponents can't move)
    for (const opponentIndex of opponentIndices) {
        const opponentPos = gameState.playerPositions[opponentIndex];
        const isOpponentLocked = gameState.playerLocks[opponentIndex]?.isLocked || false;

        // Only consider unlocked opponents as dangerous
        if (!isOpponentLocked && (newX === opponentPos.x || newY === opponentPos.y)) {
            // Would be in danger from unlocked opponent, this move is less safe
            // But we might still use it if no other choice
        }
    }

    // Check if move blocks teammate (borders with teammate)
    const isAdjacentToTeammate = (
        (Math.abs(newX - teammatePos.x) === 1 && newY === teammatePos.y) ||
        (Math.abs(newY - teammatePos.y) === 1 && newX === teammatePos.x)
    );

    if (isAdjacentToTeammate) {
        // Would block teammate, less preferred but allowed if no choice
    }

    return true; // Move is valid
}

// Helper function to check if a move is non-blocking (doesn't block other players)
export function isNonBlockingMove(gameState: GameState, botPlayerIndex: number, direction: "up" | "down" | "left" | "right"): boolean {
    const botPos = gameState.playerPositions[botPlayerIndex];
    let newX = botPos.x;
    let newY = botPos.y;

    switch (direction) {
        case "up":
            newY = Math.max(0, botPos.y - 1);
            break;
        case "down":
            newY = Math.min(9, botPos.y + 1);
            break;
        case "left":
            newX = Math.max(0, botPos.x - 1);
            break;
        case "right":
            newX = Math.min(9, botPos.x + 1);
            break;
    }

    // Check if move is within bounds and position changed
    if (newX === botPos.x && newY === botPos.y) {
        return false; // Hit boundary
    }

    // Check if position is occupied by another player
    const isOccupied = gameState.playerPositions.some((pos, index) =>
        index !== botPlayerIndex && pos.x === newX && pos.y === newY
    );

    if (isOccupied) {
        return false;
    }

    // Check if move would block other players (adjacent to them)
    for (let i = 0; i < 4; i++) {
        if (i === botPlayerIndex) continue;

        const otherPlayerPos = gameState.playerPositions[i];
        const wouldBeAdjacent = (
            (Math.abs(newX - otherPlayerPos.x) === 1 && newY === otherPlayerPos.y) ||
            (Math.abs(newY - otherPlayerPos.y) === 1 && newX === otherPlayerPos.x)
        );

        if (wouldBeAdjacent) {
            // This would block another player, avoid this move
            return false;
        }
    }

    return true; // Move is valid and non-blocking
}

// Helper function to check if a move avoids being locked by other players
export function isEvasiveMove(gameState: GameState, botPlayerIndex: number, direction: "up" | "down" | "left" | "right"): boolean {
    const botPos = gameState.playerPositions[botPlayerIndex];
    let newX = botPos.x;
    let newY = botPos.y;

    switch (direction) {
        case "up":
            newY = Math.max(0, botPos.y - 1);
            break;
        case "down":
            newY = Math.min(9, botPos.y + 1);
            break;
        case "left":
            newX = Math.max(0, botPos.x - 1);
            break;
        case "right":
            newX = Math.min(9, botPos.x + 1);
            break;
    }

    // Check if move is within bounds and position changed
    if (newX === botPos.x && newY === botPos.y) {
        return false; // Hit boundary
    }

    // Check if position is occupied by another player
    const isOccupied = gameState.playerPositions.some((pos, index) =>
        index !== botPlayerIndex && pos.x === newX && pos.y === newY
    );

    if (isOccupied) {
        return false;
    }

    // Check if this move would put bot in danger of being locked
    // A bot is in danger if it's in the same row or column as an unlocked opponent
    for (let i = 0; i < 4; i++) {
        if (i === botPlayerIndex) continue;

        const otherPlayerPos = gameState.playerPositions[i];
        const isOtherPlayerLocked = gameState.playerLocks[i]?.isLocked || false;

        // Only worry about unlocked players
        if (!isOtherPlayerLocked) {
            // Check if new position would be in same row or column as this player
            if (newX === otherPlayerPos.x || newY === otherPlayerPos.y) {
                // Would be in danger from this unlocked player
                // But still allow it if it's the only option (handled by fallback)
                return false;
            }
        }
    }

    return true; // Move is valid and evasive
}

// Helper function to get any safe move
export function getSafeMove(gameState: GameState, botPlayerIndex: number): BotDecision {
    const directions = ["up", "down", "left", "right"] as const;
    const safeDirections = directions.filter(dir => isSafeMove(gameState, botPlayerIndex, dir));

    if (safeDirections.length > 0) {
        const randomDirection = safeDirections[Math.floor(Math.random() * safeDirections.length)];
        return { action: "move", direction: randomDirection };
    }

    // If no safe directions, try any valid direction
    const validDirections = directions.filter(dir => isValidMove(gameState, botPlayerIndex, dir));
    if (validDirections.length > 0) {
        const randomDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
        return { action: "move", direction: randomDirection };
    }

    // Fallback - should rarely happen
    console.log("No safe or valid move found, falling back to up");
    return { action: "move", direction: "up" };
}

// Helper function to get any non-blocking move
export function getNonBlockingMove(gameState: GameState, botPlayerIndex: number): BotDecision {
    const directions = ["up", "down", "left", "right"] as const;
    const nonBlockingDirections = directions.filter(dir => isNonBlockingMove(gameState, botPlayerIndex, dir));

    if (nonBlockingDirections.length > 0) {
        const randomDirection = nonBlockingDirections[Math.floor(Math.random() * nonBlockingDirections.length)];
        return { action: "move", direction: randomDirection };
    }

    // If no non-blocking directions, try any valid direction
    const validDirections = directions.filter(dir => isValidMove(gameState, botPlayerIndex, dir));
    if (validDirections.length > 0) {
        const randomDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
        return { action: "move", direction: randomDirection };
    }

    // Fallback - should rarely happen  
    return getSafeMove(gameState, botPlayerIndex);
}

// Helper function to get any evasive move
export function getEvasiveMove(gameState: GameState, botPlayerIndex: number): BotDecision {
    const directions = ["up", "down", "left", "right"] as const;
    const evasiveDirections = directions.filter(dir => isEvasiveMove(gameState, botPlayerIndex, dir));

    if (evasiveDirections.length > 0) {
        const randomDirection = evasiveDirections[Math.floor(Math.random() * evasiveDirections.length)];
        return { action: "move", direction: randomDirection };
    }

    // If no evasive directions, try any valid direction
    const validDirections = directions.filter(dir => isValidMove(gameState, botPlayerIndex, dir));
    if (validDirections.length > 0) {
        const randomDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
        return { action: "move", direction: randomDirection };
    }

    // Fallback - should rarely happen
    return getSafeMove(gameState, botPlayerIndex);
}

// Additional helper functions

/**
 * Get the nth closest star to a player position (1-indexed)
 */
export function getNthClosestStar(gameState: GameState, playerPos: { x: number; y: number }, n: number): { x: number; y: number; turnsAlive: number } | null {
    const stars = gameState.stars || [];
    if (stars.length === 0) return null;

    const distances = stars.map(star => ({
        star,
        distance: Math.abs(star.x - playerPos.x) + Math.abs(star.y - playerPos.y)
    }));

    distances.sort((a, b) => a.distance - b.distance);
    return distances[n - 1] ? distances[n - 1].star : null;
}

/**
 * Get the closest unlocked player to a given star
 */
export function getClosestPlayerToStar(gameState: GameState, star: { x: number; y: number }, currentPlayerIndex: number): { playerIndex: number; distance: number } | null {
    let closestPlayerIndex = -1;
    let minDistance = Number.MAX_VALUE;
    let tiedPlayers: number[] = [];

    for (let i = 0; i < gameState.playerPositions.length; i++) {
        // Skip locked players
        const isPlayerLocked = gameState.playerLocks[i]?.isLocked || false;
        if (isPlayerLocked) continue;

        const playerPos = gameState.playerPositions[i];
        const distance = Math.abs(playerPos.x - star.x) + Math.abs(playerPos.y - star.y);

        if (distance < minDistance) {
            minDistance = distance;
            closestPlayerIndex = i;
            tiedPlayers = [i];
        } else if (distance === minDistance) {
            tiedPlayers.push(i);
            // If there's a tie, prefer other players over current player
            if (closestPlayerIndex === currentPlayerIndex && i !== currentPlayerIndex) {
                closestPlayerIndex = i;
            }
        }
    }

    if (closestPlayerIndex === -1) return null;

    return { playerIndex: closestPlayerIndex, distance: minDistance };
}

/**
 * Get Manhattan distance between player position and star
 */
export function getDistance(playerPos: { x: number; y: number }, star: { x: number; y: number }): number {
    return Math.abs(playerPos.x - star.x) + Math.abs(playerPos.y - star.y);
}

/**
 * Get optimal directions to approach a star from player position
 */
export function approachStar(star: { x: number; y: number }, playerPos: { x: number; y: number }): ("up" | "down" | "left" | "right")[] {
    const xDiff = Math.abs(star.x - playerPos.x);
    const yDiff = Math.abs(star.y - playerPos.y);

    // If star is one step away in either direction, return single direction
    if (xDiff + yDiff === 1) {
        if (yDiff === 1) {
            return [star.y > playerPos.y ? 'down' : 'up'];
        } else {
            return [star.x > playerPos.x ? 'right' : 'left'];
        }
    }

    // For stars further away, prioritize the larger difference
    const directions: ("up" | "down" | "left" | "right")[] = [];
    if (yDiff >= xDiff) {
        directions.push(star.y > playerPos.y ? 'down' : 'up');
        if (xDiff > 0) {
            directions.push(star.x > playerPos.x ? 'right' : 'left');
        }
    } else {
        directions.push(star.x > playerPos.x ? 'right' : 'left');
        if (yDiff > 0) {
            directions.push(star.y > playerPos.y ? 'down' : 'up');
        }
    }

    return directions;
}

/**
 * Outputs directions that would result in blocking teammate's movement
 * @param playerPos - Current player's position
 * @param teammatePos - Teammate's position
 * @returns Array of directions that would block teammate
 */
export function blockingDirections(playerPos: { x: number; y: number }, teammatePos: { x: number; y: number }): ("up" | "down" | "left" | "right")[] {
    const directions: ("up" | "down" | "left" | "right")[] = [];

    // Check if we're exactly 2 steps away from teammate (Manhattan distance = 2)
    const manhattanDistance = Math.abs(teammatePos.x - playerPos.x) + Math.abs(teammatePos.y - playerPos.y);

    if (manhattanDistance === 2) {
        // If we're 2 steps away, check which direction would put us next to teammate
        if (teammatePos.y > playerPos.y) directions.push('down');
        if (teammatePos.y < playerPos.y) directions.push('up');
        if (teammatePos.x > playerPos.x) directions.push('right');
        if (teammatePos.x < playerPos.x) directions.push('left');
    }

    return directions;
}

/**
 * Get all players that are in the same row or column as the current position,
 * keeping only the closest player in each direction
 * @param gameState - Current game state
 * @param currentPlayerIndex - Index of the current player
 * @returns Array of players in radar with their info
 */
export function getPlayersInRadar(gameState: GameState, currentPlayerIndex: number): Array<{
    playerIndex: number;
    position: { x: number; y: number };
    team: number;
    locked: boolean;
    direction: "up" | "down" | "left" | "right";
    distance: number;
}> {
    const currentPosition = gameState.playerPositions[currentPlayerIndex];
    const players = [];

    // Find all players in same row or column
    for (let i = 0; i < gameState.playerPositions.length; i++) {
        if (i === currentPlayerIndex) continue;

        const playerPosition = gameState.playerPositions[i];

        // Check if player is in same row or column
        if (playerPosition.x === currentPosition.x || playerPosition.y === currentPosition.y) {
            // Determine direction
            let direction: "up" | "down" | "left" | "right";
            if (playerPosition.y === currentPosition.y) {
                // Same row - left or right
                direction = playerPosition.x > currentPosition.x ? 'right' : 'left';
            } else {
                // Same column - up or down
                direction = playerPosition.y > currentPosition.y ? 'down' : 'up';
            }

            const distance = Math.abs(playerPosition.x - currentPosition.x) + Math.abs(playerPosition.y - currentPosition.y);
            const team = i < 2 ? 1 : 2; // Team 1: players 0,1; Team 2: players 2,3
            const locked = gameState.playerLocks[i]?.isLocked || false;

            players.push({
                playerIndex: i,
                position: playerPosition,
                team,
                locked,
                direction,
                distance
            });
        }
    }

    // Filter to keep only the closest player in each direction
    const playersInRadar = [];
    const directions = ["up", "down", "left", "right"] as const;

    for (const dir of directions) {
        const playersInDirection = players.filter(p => p.direction === dir);
        if (playersInDirection.length > 0) {
            // Find the closest player in this direction
            const closestPlayer = playersInDirection.reduce((prev, curr) =>
                prev.distance < curr.distance ? prev : curr
            );
            playersInRadar.push(closestPlayer);
        }
    }

    return playersInRadar;
} 