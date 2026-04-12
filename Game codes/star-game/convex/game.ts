import { v } from "convex/values";
import { query, mutation, internalMutation, internalAction, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
    type BotStrategy,
    type GameState,
    type BotDecision,
    getIngroupBotMove,
    getOutgroupBotMove,
    getProsocialBotMove,
    getAntisocialBotMove
} from "./BotMove";

// Game configuration constants
export const TOTAL_TURNS_PER_ROUND = 30; // Total turns per round for each player
const RESTING_TIME_SECONDS = 10; // Resting time between rounds

// Generate random bot strategy for the game
async function generateBotStrategy(ctx: any, botCondition: "aware" | "unaware"): Promise<BotStrategy> {
    // const strategies: BotStrategy[] = ["ingroup"];
    const strategies: BotStrategy[] = ["ingroup", "outgroup", "prosocial", "antisocial"];

    // Get all games with the same botCondition to count strategy usage
    const allGames = await ctx.db.query("games")
        .filter((q: any) => q.eq(q.field("botCondition"), botCondition))
        .collect();

    // Count each strategy
    const strategyCounts: Record<BotStrategy, number> = {
        "ingroup": 0,
        "outgroup": 0,
        "prosocial": 0,
        "antisocial": 0,
        "random": 0
    };

    for (const game of allGames) {
        if (game.botStrategy && (game.botStrategy as BotStrategy) in strategyCounts) {
            strategyCounts[game.botStrategy as BotStrategy]++;
        }
    }

    // Find minimum count among the 4 main strategies
    const relevantCounts = strategies.map(strategy => strategyCounts[strategy]);
    const minCount = Math.min(...relevantCounts);

    // Get strategies with minimum count
    const leastCommonStrategies = strategies.filter(strategy => strategyCounts[strategy] === minCount);

    // Return random strategy from least common ones
    // return leastCommonStrategies[Math.floor(Math.random() * leastCommonStrategies.length)];
    return "prosocial";
}
// Generate a random 10x10 grid (initially empty)
function generateGrid(): ("empty" | "star")[][] {
    const grid: ("empty" | "star")[][] = [];
    for (let i = 0; i < 10; i++) {
        grid[i] = [];
        for (let j = 0; j < 10; j++) {
            grid[i][j] = "empty";
        }
    }
    return grid;
}

// Get random initial player positions
function getInitialPositions() {
    const positions = [];
    const usedPositions = new Set<string>();

    // Generate 4 random unique positions
    while (positions.length < 4) {
        const x = Math.floor(Math.random() * 10);
        const y = Math.floor(Math.random() * 10);
        const posKey = `${x},${y}`;

        if (!usedPositions.has(posKey)) {
            positions.push({ x, y });
            usedPositions.add(posKey);
        }
    }

    return positions;
}

// Initialize player lock states
function getInitialLocks() {
    return [
        { isLocked: false, turnsRemaining: 0 },
        { isLocked: false, turnsRemaining: 0 },
        { isLocked: false, turnsRemaining: 0 },
        { isLocked: false, turnsRemaining: 0 },
    ];
}

// Initialize player turn tracking
function getInitialTurnTracking() {
    return [
        { consecutiveMissedTurns: 0, lastTurnTaken: 0 },
        { consecutiveMissedTurns: 0, lastTurnTaken: 0 },
        { consecutiveMissedTurns: 0, lastTurnTaken: 0 },
        { consecutiveMissedTurns: 0, lastTurnTaken: 0 },
    ];
}

// Place initial star
function placeInitialStar(): { x: number; y: number; turnsAlive: number }[] {
    const x = Math.floor(Math.random() * 10);
    const y = Math.floor(Math.random() * 10);
    return [{ x, y, turnsAlive: 0 }];
}

export const joinQueue = mutation({
    args: {
        botCondition: v.optional(v.union(v.literal("aware"), v.literal("unaware"))),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to join game");
        }

        // Check if user is already in a game
        const activeGames = await ctx.db
            .query("games")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .collect();

        const existingActiveGame = activeGames.find(game =>
            game.team1.includes(userId) || game.team2.includes(userId)
        );

        if (existingActiveGame) {
            return existingActiveGame._id;
        }

        // Check if user is already in a waiting game
        const waitingGames = await ctx.db
            .query("games")
            .withIndex("by_status", (q) => q.eq("status", "waiting"))
            .collect();

        const existingWaitingGame = waitingGames.find(game =>
            game.team1.includes(userId) || game.team2.includes(userId)
        );

        if (existingWaitingGame) {
            return existingWaitingGame._id;
        }

        // Look for a valid waiting game to join
        // A valid waiting game should have:
        // 1. Status "waiting"
        // 2. Only team1 filled (with 2 players: 1 human + 1 bot)
        // 3. team2 empty
        // 4. Recent activity (within last 5 minutes to avoid stale games)
        // 5. botCondition matches the botCondition of the user
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

        const validWaitingGame = waitingGames.find(game =>
            game.team1.length === 2 && // team1 should have human + bot1
            game.team2.length === 0 && // team2 should be empty
            game.createdAt > fiveMinutesAgo && // created recently
            game.team1.some(playerId => playerId !== "bot1" && playerId !== "bot2" && playerId !== "bot3") && // has at least one human
            game.botCondition === (args.botCondition || "aware") // botCondition matches the user's botCondition
        );

        if (validWaitingGame) {
            // Join existing valid waiting game as second player
            const initialActivity = [
                { playerId: validWaitingGame.team1[0], lastSeen: Date.now(), isConnected: true },
                { playerId: userId, lastSeen: Date.now(), isConnected: true },
            ];

            // Initialize player ready states for both players
            const playersReady = [
                { playerId: validWaitingGame.team1[0], isReady: false },
                { playerId: userId, isReady: false },
            ];

            await ctx.db.patch(validWaitingGame._id, {
                team2: [userId, "bot2"], // Add human player and bot to team 2
                status: "matched", // Players are matched, waiting for ready confirmation
                originalPlayers: [validWaitingGame.team1[0], userId],
                lastPlayerActivity: initialActivity,
                playerTurnTracking: getInitialTurnTracking(),
                playersReady,
            });

            // After patching game to matched state in joinQueue, schedule ready timeout (60 seconds)
            await ctx.scheduler.runAfter(60000, internal.game.handleReadyTimeout, { gameId: validWaitingGame._id });

            return validWaitingGame._id;
        } else {
            // Clean up any invalid/stale waiting games before creating a new one
            const staleGames = waitingGames.filter(game =>
                game.createdAt <= fiveMinutesAgo || // older than 5 minutes
                game.team2.length > 0 || // team2 not empty (shouldn't happen for waiting games)
                !game.team1.some(playerId => playerId !== "bot1" && playerId !== "bot2" && playerId !== "bot3") // no human players
            );

            // Delete stale games
            for (const staleGame of staleGames) {
                await ctx.db.delete(staleGame._id);
            }

            // Create new waiting game with first human player
            const initialStars = placeInitialStar();
            const grid = generateGrid();
            const playerPositions = getInitialPositions();

            // Place initial star on grid (make sure it doesn't overlap with players)
            initialStars.forEach(star => {
                // If star overlaps with a player, find a new position
                while (playerPositions.some(pos => pos.x === star.x && pos.y === star.y)) {
                    star.x = Math.floor(Math.random() * 10);
                    star.y = Math.floor(Math.random() * 10);
                }
                grid[star.y][star.x] = "star";
            });

            // Generate bot strategy for this game
            const botStrategy = await generateBotStrategy(ctx, args.botCondition || "aware");

            // Generate bot condition for this game
            const gameId = await ctx.db.insert("games", {
                status: "waiting", // Wait for second player
                currentRound: 1,
                currentTurn: 1,
                currentPlayer: 0,
                turnsRemaining: TOTAL_TURNS_PER_ROUND * 4,
                team1: [userId, "bot1"], // Human player and bot on team 1
                team2: [], // Empty until second player joins
                team1Score: 0,
                team2Score: 0,
                roundScores: [],
                grid,
                playerPositions,
                playerLocks: getInitialLocks(),
                playerTurnTracking: getInitialTurnTracking(),
                stars: initialStars,
                turnsSinceLastStar: 0,
                turnStartTime: Date.now(),
                createdAt: Date.now(),
                originalPlayers: [userId],
                lastPlayerActivity: [{ playerId: userId, lastSeen: Date.now(), isConnected: true }],
                botStrategy,
                botCondition: args.botCondition || "unaware",
            });

            return gameId;
        }
    },
});

export const getGame = query({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return null;
        }

        const game = await ctx.db.get(args.gameId);
        if (!game) {
            return null;
        }

        // Note: Player activity is updated through separate mutation calls

        // Check if user is part of this game (including original players who were replaced)
        const allPlayers = [...game.team1, ...game.team2];
        const originalPlayers = game.originalPlayers || [];
        if (!allPlayers.includes(userId) && !originalPlayers.includes(userId)) {
            return null;
        }

        // Get player index (check if player was replaced)
        let playerIndex = -1;
        let teamNumber = 0;

        // First check current teams
        if (game.team1.includes(userId)) {
            playerIndex = game.team1.indexOf(userId);
            teamNumber = 1;
        } else if (game.team2.includes(userId)) {
            playerIndex = game.team2.indexOf(userId) + 2;
            teamNumber = 2;
        } else {
            // Player might have been replaced, find their original position
            const replacedPlayer = game.replacedPlayers?.find(rp => rp.originalPlayerId === userId);
            if (replacedPlayer) {
                playerIndex = replacedPlayer.playerIndex;
                teamNumber = playerIndex < 2 ? 1 : 2;
            }
        }

        return {
            ...game,
            playerIndex,
            teamNumber,
            isCurrentPlayer: game.currentPlayer === playerIndex,
        };
    },
});

export const getBotInfo = query({
    args: { gameId: v.id("games") },
    returns: v.union(
        v.object({
            strategy: v.union(v.literal("ingroup"), v.literal("outgroup"), v.literal("prosocial"), v.literal("antisocial"), v.literal("random")),
            condition: v.union(v.literal("aware"), v.literal("unaware")),
            botCount: v.number(),
        }),
        v.null()
    ),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return null;
        }

        const game = await ctx.db.get(args.gameId);
        if (!game) {
            return null;
        }

        // Check if user is part of this game
        const allPlayers = [...game.team1, ...game.team2];
        const originalPlayers = game.originalPlayers || [];
        if (!allPlayers.includes(userId) && !originalPlayers.includes(userId)) {
            return null;
        }

        // Count bots in the game
        const botCount = allPlayers.filter(playerId =>
            playerId === "bot1" || playerId === "bot2" || playerId === "bot3" ||
            (typeof playerId === "string" && playerId.startsWith("bot_replacement_"))
        ).length;

        return {
            strategy: game.botStrategy || "ingroup",
            condition: game.botCondition || "unaware",
            botCount,
        };
    },
});

export const getGameActions = query({
    args: {
        gameId: v.id("games"),
        limit: v.optional(v.number())
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return [];
        }

        const game = await ctx.db.get(args.gameId);
        if (!game) {
            return [];
        }

        // Check if user is part of this game
        const allPlayers = [...game.team1, ...game.team2];
        const originalPlayers = game.originalPlayers || [];
        if (!allPlayers.includes(userId) && !originalPlayers.includes(userId)) {
            return [];
        }

        // Get all actions for the game
        const baseQuery = ctx.db
            .query("gameActions")
            .withIndex("by_game", (q) =>
                q.eq("gameId", args.gameId)
            );

        // Apply limit if provided
        const actions = args.limit
            ? await baseQuery.take(args.limit)
            : await baseQuery.collect();

        return actions;
    },
});

export const updatePlayerActivity = mutation({
    args: {
        gameId: v.id("games"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return;
        }
        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "waiting" && game.status !== "matched")) {
            return;
        }

        const currentActivity = game.lastPlayerActivity || [];
        const updatedActivity = currentActivity.map(activity =>
            activity.playerId === userId
                ? { ...activity, lastSeen: Date.now(), isConnected: true }
                : activity
        );

        // If player not found in activity list, add them
        if (!currentActivity.some(activity => activity.playerId === userId)) {
            updatedActivity.push({ playerId: userId, lastSeen: Date.now(), isConnected: true });
        }

        await ctx.db.patch(args.gameId, {
            lastPlayerActivity: updatedActivity,
        });
    },
});

export const markPlayerDisconnected = mutation({
    args: {
        gameId: v.id("games"),
        reason: v.union(v.literal("leave_game"), v.literal("sign_out"), v.literal("window_close")),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return;
        }

        const game = await ctx.db.get(args.gameId);
        if (!game) {
            return;
        }

        // Update player activity to mark as disconnected
        const currentActivity = game.lastPlayerActivity || [];
        const updatedActivity = currentActivity.map(activity =>
            activity.playerId === userId
                ? { ...activity, lastSeen: Date.now(), isConnected: false, disconnectionReason: args.reason }
                : activity
        );

        await ctx.db.patch(args.gameId, {
            lastPlayerActivity: updatedActivity,
        });

        // If game is waiting, handle immediate removal
        if (game.status === "waiting" || game.status === "matched") {
            const newTeam1 = game.team1.filter(id => id !== userId);
            const newTeam2 = game.team2.filter(id => id !== userId);
            const remainingHumans = [...newTeam1, ...newTeam2].filter(id =>
                id !== "bot1" && id !== "bot2" && id !== "bot3" && !id.startsWith("bot_replacement_")
            );

            if (remainingHumans.length === 0) {
                // Delete game if no human players remain
                await ctx.db.delete(args.gameId);
            } else if (game.status === "matched" && (newTeam1.length < 2 || newTeam2.length < 2)) {
                // If we're in matched state but don't have complete teams, reset to waiting
                await ctx.db.patch(args.gameId, {
                    team1: newTeam1.length > 0 ? newTeam1 : [],
                    team2: newTeam2.length > 0 ? newTeam2 : [],
                    status: newTeam1.length > 0 || newTeam2.length > 0 ? "waiting" : "waiting", // Reset to waiting
                    playersReady: undefined, // Clear ready states
                });
            } else {
                await ctx.db.patch(args.gameId, {
                    team1: newTeam1,
                    team2: newTeam2,
                    status: "waiting", // Reset to waiting if one player leaves during match confirmation
                    playersReady: undefined, // Clear ready states
                });
            }
        }
        // Note: Removed immediate replacement for active/overtime games - only 5 missed turns will trigger replacement
    },
});

export const checkPlayerActivity = internalAction({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const game = await ctx.runQuery(internal.game.getGameInternal, {
            gameId: args.gameId,
        });

        if (!game || game.status !== "active") {
            return;
        }

        const originalPlayers = game.originalPlayers || [];
        const replacedPlayers = game.replacedPlayers || [];

        // Check which original human players need to be replaced due to missed turns
        const disconnectedPlayers = [];

        for (const playerId of originalPlayers) {
            // Skip if already replaced
            if (replacedPlayers.some(rp => rp.originalPlayerId === playerId)) {
                continue;
            }

            // Check if this player has missed 5 consecutive turns
            const playerIndex = [...game.team1, ...game.team2].indexOf(playerId);
            if (playerIndex !== -1) {
                const turnTracking = game.playerTurnTracking?.[playerIndex];
                if (turnTracking && turnTracking.consecutiveMissedTurns >= 5) {
                    disconnectedPlayers.push(playerId);
                }
            }
        }

        // If both human players disconnected, end the game
        const activeHumanPlayers = originalPlayers.filter(playerId => {
            if (replacedPlayers.some(rp => rp.originalPlayerId === playerId)) {
                return false; // Already replaced
            }
            const playerIndex = [...game.team1, ...game.team2].indexOf(playerId);
            if (playerIndex !== -1) {
                const turnTracking = game.playerTurnTracking?.[playerIndex];
                return !(turnTracking && turnTracking.consecutiveMissedTurns >= 5);
            }
            return true;
        });

        if (activeHumanPlayers.length === 0) {
            await ctx.runMutation(internal.game.endGameDueToDisconnection, {
                gameId: args.gameId,
            });
            return;
        }

        // Replace disconnected players with bots
        for (const disconnectedPlayerId of disconnectedPlayers) {
            await ctx.runMutation(internal.game.replacePlayerWithBot, {
                gameId: args.gameId,
                disconnectedPlayerId,
                reason: "disconnection",
            });
        }

        // Continue monitoring if game is still active
        const updatedGame = await ctx.runQuery(internal.game.getGameInternal, {
            gameId: args.gameId,
        });

        if (updatedGame && updatedGame.status === "active") {
            await ctx.scheduler.runAfter(30000, internal.game.checkPlayerActivity, {
                gameId: args.gameId,
            });
        }
    },
});

export const replacePlayerWithBot = internalMutation({
    args: {
        gameId: v.id("games"),
        disconnectedPlayerId: v.union(v.id("users"), v.string()),
        reason: v.union(v.literal("disconnection"), v.literal("timeout"), v.literal("immediate_disconnection")),
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) {
            return;
        }

        // Find player position
        let playerIndex = -1;
        let isTeam1 = false;

        if (game.team1.includes(args.disconnectedPlayerId)) {
            playerIndex = game.team1.indexOf(args.disconnectedPlayerId);
            isTeam1 = true;
        } else if (game.team2.includes(args.disconnectedPlayerId)) {
            playerIndex = game.team2.indexOf(args.disconnectedPlayerId) + 2;
            isTeam1 = false;
        }

        if (playerIndex === -1) {
            return; // Player not found
        }

        // Generate unique bot ID
        const botId = `bot_replacement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Update team with bot replacement
        let newTeam1 = [...game.team1];
        let newTeam2 = [...game.team2];

        if (isTeam1) {
            newTeam1[playerIndex] = botId;
        } else {
            newTeam2[playerIndex - 2] = botId;
        }

        // Record the replacement
        const newReplacedPlayers = [...(game.replacedPlayers || [])];
        newReplacedPlayers.push({
            originalPlayerId: args.disconnectedPlayerId,
            replacementBotId: botId,
            replacedAt: Date.now(),
            playerIndex,
        });

        // Update game state
        await ctx.db.patch(args.gameId, {
            team1: newTeam1,
            team2: newTeam2,
            replacedPlayers: newReplacedPlayers,
        });

        // Log the replacement action
        const currentPos = game.playerPositions[playerIndex];
        await ctx.db.insert("gameActions", {
            gameId: args.gameId,
            playerId: args.disconnectedPlayerId,
            action: "replaced",
            fromX: currentPos.x,
            fromY: currentPos.y,
            round: game.currentRound,
            turn: game.currentTurn,
            timestamp: Date.now(),
            replacementInfo: {
                originalPlayerId: args.disconnectedPlayerId,
                replacementBotId: botId,
                reason: args.reason,
            },
        });
    },
});

export const endGameDueToDisconnection = internalMutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            return;
        }

        await ctx.db.patch(args.gameId, {
            status: "game_finished",
        });

        // Log disconnection actions for all original players
        const originalPlayers = game.originalPlayers || [];
        for (const playerId of originalPlayers) {
            const playerIndex = [...game.team1, ...game.team2].indexOf(playerId);
            if (playerIndex !== -1) {
                const currentPos = game.playerPositions[playerIndex];
                await ctx.db.insert("gameActions", {
                    gameId: args.gameId,
                    playerId: playerId,
                    action: "disconnected",
                    fromX: currentPos.x,
                    fromY: currentPos.y,
                    round: game.currentRound,
                    turn: game.currentTurn,
                    timestamp: Date.now(),
                });
            }
        }
    },
});

export const makeMove = mutation({
    args: {
        gameId: v.id("games"),
        direction: v.union(v.literal("up"), v.literal("down"), v.literal("left"), v.literal("right")),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated");
        }

        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) { // Allow moves in overtime
            throw new Error("Game not found or not in a movable state");
        }

        // Get player index (check both current teams and original players)
        const allPlayers = [...game.team1, ...game.team2];
        let playerIndex = allPlayers.indexOf(userId);

        // If not found in current teams, check if player was replaced
        if (playerIndex === -1) {
            const replacedPlayer = game.replacedPlayers?.find(rp => rp.originalPlayerId === userId);
            if (replacedPlayer) {
                throw new Error("You have been replaced by a bot due to disconnection");
            }
            throw new Error("Player not in this game");
        }

        if (game.currentPlayer !== playerIndex) {
            throw new Error("Not your turn");
        }

        // Check if player is locked - this should be handled automatically by the scheduler
        if (game.playerLocks && game.playerLocks[playerIndex]?.isLocked) {
            throw new Error("Player is locked and cannot move");
        }

        await ctx.runMutation(internal.game.executeMoveInternal, {
            gameId: args.gameId,
            playerIndex,
            direction: args.direction,
            isBot: false,
        });
    },
});

export const lockPlayer = mutation({
    args: {
        gameId: v.id("games"),
        direction: v.union(v.literal("up"), v.literal("down"), v.literal("left"), v.literal("right")),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated");
        }

        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) { // Allow lock in overtime
            throw new Error("Game not found or not in an actionable state");
        }

        // Get player index
        const allPlayers = [...game.team1, ...game.team2];
        let playerIndex = allPlayers.indexOf(userId);

        if (playerIndex === -1) {
            const replacedPlayer = game.replacedPlayers?.find(rp => rp.originalPlayerId === userId);
            if (replacedPlayer) {
                throw new Error("You have been replaced by a bot due to disconnection");
            }
            throw new Error("Player not in this game");
        }

        if (game.currentPlayer !== playerIndex) {
            throw new Error("Not your turn");
        }

        // Check if player is locked
        if (game.playerLocks && game.playerLocks[playerIndex]?.isLocked) {
            throw new Error("Player is locked and cannot perform actions");
        }

        await ctx.runMutation(internal.game.executeLockInternal, {
            gameId: args.gameId,
            playerIndex,
            direction: args.direction,
        });
    },
});

export const unlockPlayer = mutation({
    args: {
        gameId: v.id("games"),
        direction: v.union(v.literal("up"), v.literal("down"), v.literal("left"), v.literal("right")),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated");
        }

        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) { // Allow unlock in overtime
            throw new Error("Game not found or not in an actionable state");
        }

        // Get player index
        const allPlayers = [...game.team1, ...game.team2];
        let playerIndex = allPlayers.indexOf(userId);

        if (playerIndex === -1) {
            const replacedPlayer = game.replacedPlayers?.find(rp => rp.originalPlayerId === userId);
            if (replacedPlayer) {
                throw new Error("You have been replaced by a bot due to disconnection");
            }
            throw new Error("Player not in this game");
        }

        if (game.currentPlayer !== playerIndex) {
            throw new Error("Not your turn");
        }

        // Check if player is locked
        if (game.playerLocks && game.playerLocks[playerIndex]?.isLocked) {
            throw new Error("Player is locked and cannot perform actions");
        }

        await ctx.runMutation(internal.game.executeUnlockInternal, {
            gameId: args.gameId,
            playerIndex,
            direction: args.direction,
        });
    },
});

export const executeLockInternal = internalMutation({
    args: {
        gameId: v.id("games"),
        playerIndex: v.number(),
        direction: v.union(v.literal("up"), v.literal("down"), v.literal("left"), v.literal("right")),
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) { // Allow lock in overtime
            return;
        }

        if (game.currentPlayer !== args.playerIndex) {
            return;
        }

        const currentPos = game.playerPositions[args.playerIndex];

        // Find the FIRST player in the direction of the beam
        let targetPlayer = -1;
        let closestDistance = Infinity;

        for (let i = 0; i < 4; i++) {
            if (i === args.playerIndex) continue;

            const targetPos = game.playerPositions[i];
            let isInBeamPath = false;
            let distance = 0;

            switch (args.direction) {
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

        // Lock the target player if found
        if (targetPlayer !== -1) {
            const newPlayerLocks = [...(game.playerLocks || getInitialLocks())];
            newPlayerLocks[targetPlayer] = { isLocked: true, turnsRemaining: 12 };

            await ctx.db.patch(args.gameId, {
                playerLocks: newPlayerLocks,
            });

            result = "locked";
        }

        // Log the action
        const allPlayers = [...game.team1, ...game.team2];
        const playerId = allPlayers[args.playerIndex];
        await ctx.db.insert("gameActions", {
            gameId: args.gameId,
            playerId: playerId,
            action: "lock",
            fromX: currentPos.x,
            fromY: currentPos.y,
            direction: args.direction,
            targetPlayer: targetPlayer !== -1 ? targetPlayer : undefined,
            result,
            starPositions: game.stars || [],
            round: game.currentRound,
            turn: game.currentTurn,
            timestamp: Date.now(),
        });

        // Update turn tracking for this player (they took their turn)
        await ctx.runMutation(internal.game.updatePlayerTurnTracking, {
            gameId: args.gameId,
            playerIndex: args.playerIndex,
            turnTaken: true,
        });

        // Advance turn immediately (removed artificial delay)
        await ctx.runMutation(internal.game.advanceTurn, { gameId: args.gameId });
    },
});

export const executeUnlockInternal = internalMutation({
    args: {
        gameId: v.id("games"),
        playerIndex: v.number(),
        direction: v.union(v.literal("up"), v.literal("down"), v.literal("left"), v.literal("right")),
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) { // Allow unlock in overtime
            return;
        }

        if (game.currentPlayer !== args.playerIndex) {
            return;
        }

        const currentPos = game.playerPositions[args.playerIndex];

        // Find the FIRST player in the direction of the beam (regardless of lock status)
        let firstPlayerHit = -1;
        let closestDistance = Infinity;

        for (let i = 0; i < 4; i++) {
            if (i === args.playerIndex) continue;

            const targetPos = game.playerPositions[i];
            let isInBeamPath = false;
            let distance = 0;

            switch (args.direction) {
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

        // Only unlock if the first player hit is actually locked
        if (firstPlayerHit !== -1 && game.playerLocks && game.playerLocks[firstPlayerHit]?.isLocked) {
            const newPlayerLocks = [...(game.playerLocks || getInitialLocks())];
            newPlayerLocks[firstPlayerHit] = { isLocked: false, turnsRemaining: 0 };

            await ctx.db.patch(args.gameId, {
                playerLocks: newPlayerLocks,
            });

            result = "unlocked";
        }

        // Log the action
        const allPlayers = [...game.team1, ...game.team2];
        const playerId = allPlayers[args.playerIndex];
        await ctx.db.insert("gameActions", {
            gameId: args.gameId,
            playerId: playerId,
            action: "unlock",
            fromX: currentPos.x,
            fromY: currentPos.y,
            direction: args.direction,
            targetPlayer: firstPlayerHit !== -1 ? firstPlayerHit : undefined,
            result,
            starPositions: game.stars || [],
            round: game.currentRound,
            turn: game.currentTurn,
            timestamp: Date.now(),
        });

        // Update turn tracking for this player (they took their turn)
        await ctx.runMutation(internal.game.updatePlayerTurnTracking, {
            gameId: args.gameId,
            playerIndex: args.playerIndex,
            turnTaken: true,
        });

        // Advance turn immediately (removed artificial delay)
        await ctx.runMutation(internal.game.advanceTurn, { gameId: args.gameId });
    },
});

export const executeMoveInternal = internalMutation({
    args: {
        gameId: v.id("games"),
        playerIndex: v.number(),
        direction: v.union(v.literal("up"), v.literal("down"), v.literal("left"), v.literal("right")),
        isBot: v.boolean(),
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) { // Allow moves in overtime
            return;
        }

        if (game.currentPlayer !== args.playerIndex) {
            return;
        }

        // Check if player is locked
        if (game.playerLocks && game.playerLocks[args.playerIndex]?.isLocked) {
            // Skip turn but still advance
            // Log locked action and skip turn
            await ctx.runMutation(internal.game.recordLockedTurn, {
                gameId: args.gameId,
                playerIndex: game.currentPlayer
            });
            // recordLockedTurn now calls advanceTurn, so just return
            return;
        }

        const currentPos = game.playerPositions[args.playerIndex];
        let newX = currentPos.x;
        let newY = currentPos.y;

        // Calculate new position
        switch (args.direction) {
            case "up":
                newY = Math.max(0, currentPos.y - 1);
                break;
            case "down":
                newY = Math.min(9, currentPos.y + 1);
                break;
            case "left":
                newX = Math.max(0, currentPos.x - 1);
                break;
            case "right":
                newX = Math.min(9, currentPos.x + 1);
                break;
        }

        // Check if position changed (valid move)
        if (newX === currentPos.x && newY === currentPos.y) {
            // For bots, try a different direction
            if (args.isBot) {
                const directions = ["up", "down", "left", "right"] as const;
                const otherDirections = directions.filter(d => d !== args.direction);
                if (otherDirections.length > 0) {
                    const randomDirection = otherDirections[Math.floor(Math.random() * otherDirections.length)];
                    await ctx.runMutation(internal.game.executeMoveInternal, {
                        gameId: args.gameId,
                        playerIndex: args.playerIndex,
                        direction: randomDirection,
                        isBot: true,
                    });
                }
                return;
            } else {
                throw new Error("Invalid move - can't move outside grid");
            }
        }

        // Check if target position is occupied by another player
        const isOccupied = game.playerPositions.some((pos, index) =>
            index !== args.playerIndex && pos.x === newX && pos.y === newY
        );

        if (isOccupied) {
            if (args.isBot) {
                // For bots, try a different direction
                const directions = ["up", "down", "left", "right"] as const;
                const otherDirections = directions.filter(d => d !== args.direction);
                if (otherDirections.length > 0) {
                    const randomDirection = otherDirections[Math.floor(Math.random() * otherDirections.length)];
                    await ctx.runMutation(internal.game.executeMoveInternal, {
                        gameId: args.gameId,
                        playerIndex: args.playerIndex,
                        direction: randomDirection,
                        isBot: true,
                    });
                }
                return;
            } else {
                throw new Error("Invalid move - cell is occupied by another player");
            }
        }

        // Update player position
        const newPositions = [...game.playerPositions];
        newPositions[args.playerIndex] = { x: newX, y: newY };

        // Check if there's a star to harvest
        let newGrid = game.grid.map(row => [...row]);
        let newStars = [...(game.stars || [])];
        let scoreIncrease = 0;
        let result: "harvested" | "harvested_overtime_win" | undefined = undefined;

        if (newGrid[newY][newX] === "star") {
            newGrid[newY][newX] = "empty"; // Set back to empty instead of harvested
            scoreIncrease = 1;
            result = game.status === "overtime" ? "harvested_overtime_win" : "harvested";

            // Remove star from stars array
            newStars = newStars.filter(star => !(star.x === newX && star.y === newY));
        }

        // Update scores
        let newTeam1Score = game.team1Score;
        let newTeam2Score = game.team2Score;

        if (args.playerIndex < 2) { // Team 1
            newTeam1Score += scoreIncrease;
        } else { // Team 2
            newTeam2Score += scoreIncrease;
        }

        // Update game state (patching playerPositions, grid, stars, scores)
        // If it's an overtime win, status will be updated later.
        await ctx.db.patch(args.gameId, {
            playerPositions: newPositions,
            grid: newGrid,
            stars: newStars,
            team1Score: newTeam1Score,
            team2Score: newTeam2Score,
        });

        // Log the action for ALL players (including bots)
        const allPlayers = [...game.team1, ...game.team2];
        const playerId = allPlayers[args.playerIndex];

        await ctx.db.insert("gameActions", {
            gameId: args.gameId,
            playerId: playerId,
            action: "move",
            fromX: currentPos.x,
            fromY: currentPos.y,
            toX: newX,
            toY: newY,
            direction: args.direction,
            result, // This can now be "harvested_overtime_win"
            starPositions: game.stars || [], // stars before this harvest
            round: game.currentRound,
            turn: game.currentTurn,
            timestamp: Date.now(),
        });

        if (result === "harvested_overtime_win") {
            // A star was harvested during overtime - game ends immediately
            // Fetch the latest game state to ensure roundScores is current before modification
            const currentGame = await ctx.db.get(args.gameId);
            if (!currentGame) return; // Should not happen if we got here

            const updatedRoundScores = [...currentGame.roundScores];
            if (updatedRoundScores.length > 0) {
                // Update the last round's score (which is the overtime round)
                const lastRoundIndex = updatedRoundScores.length - 1;
                updatedRoundScores[lastRoundIndex] = {
                    team1: newTeam1Score, // these are the scores including the overtime star
                    team2: newTeam2Score,
                };
            }

            await ctx.db.patch(args.gameId, {
                status: "game_finished",
                team1Score: newTeam1Score, // Ensure final scores are on the game doc
                team2Score: newTeam2Score,
                roundScores: updatedRoundScores, // Patch the updated roundScores
                // overtimeWinnerPlayerInfo: { playerId: playerId, playerIndex: args.playerIndex }, // This line will be removed
            });

            // Game over, do not advance turn or update turn tracking further for this player
            return;
        }

        // Update turn tracking for this player (they took their turn)
        await ctx.runMutation(internal.game.updatePlayerTurnTracking, {
            gameId: args.gameId,
            playerIndex: args.playerIndex,
            turnTaken: true,
        });

        // Advance turn (only if not an overtime win)
        await ctx.runMutation(internal.game.advanceTurn, { gameId: args.gameId });
    },
});

export const updateGameStatus = mutation({
    args: {
        gameId: v.id("games"),
        status: v.union(v.literal("active"), v.literal("overtime"), v.literal("game_finished"), v.literal("awaiting_form_submission"), v.literal("experiment_finished")),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.gameId, {
            status: args.status,
        });
    },
});

export const getGameStatus = query({
    args: {
        gameId: v.id("games"),
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        return game?.status;
    },
});

export const updatePlayerTurnTracking = internalMutation({
    args: {
        gameId: v.id("games"),
        playerIndex: v.number(),
        turnTaken: v.boolean(),
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) { // Allow during overtime
            return;
        }

        const currentTracking = game.playerTurnTracking || getInitialTurnTracking();
        const newTracking = [...currentTracking];

        if (args.turnTaken) {
            // Player took their turn - reset missed turn counter
            newTracking[args.playerIndex] = {
                consecutiveMissedTurns: 0,
                lastTurnTaken: game.currentTurn,
            };
        } else {
            // Player missed their turn - increment counter
            newTracking[args.playerIndex] = {
                consecutiveMissedTurns: currentTracking[args.playerIndex].consecutiveMissedTurns + 1,
                lastTurnTaken: currentTracking[args.playerIndex].lastTurnTaken,
            };
        }

        await ctx.db.patch(args.gameId, {
            playerTurnTracking: newTracking,
        });
    },
});

export const advanceTurn = internalMutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) { // Allow advanceTurn in overtime
            return;
        }

        // Calculate next turn
        const turnOrder = [0, 2, 1, 3]; // human purple, human orange, bot purple, bot orange
        const currentIndex = turnOrder.indexOf(game.currentPlayer);
        const nextIndex = (currentIndex + 1) % turnOrder.length;
        const nextPlayer = turnOrder[nextIndex];
        const newCurrentTurn = game.currentTurn + 1;

        // Decrement turnsRemaining after every individual player action
        const newTurnsRemaining = game.turnsRemaining - 1;

        // Update player locks (reduce turns remaining)
        const newPlayerLocks = (game.playerLocks || getInitialLocks()).map(lock => ({
            isLocked: lock.isLocked && lock.turnsRemaining > 1,
            turnsRemaining: Math.max(0, lock.turnsRemaining - 1),
        }));

        // Update star ages and handle star mechanics
        let newStars = (game.stars || []).map(star => ({ ...star, turnsAlive: star.turnsAlive + 1 }));
        let newGrid = game.grid.map(row => [...row]);

        // Remove old stars (80% chance after 16 turns)
        newStars = newStars.filter(star => {
            if (star.turnsAlive >= 16 && Math.random() < 0.8) {
                newGrid[star.y][star.x] = "empty";
                return false;
            }
            return true;
        });

        // Add new star (50% chance every 2 turns)
        let newTurnsSinceLastStar = (game.turnsSinceLastStar || 0) + 1;
        if (newTurnsSinceLastStar >= 4 && Math.random() < 0.75) {
            // Find empty positions (only exclude player positions)
            const emptyPositions = [];
            for (let y = 0; y < 10; y++) {
                for (let x = 0; x < 10; x++) {
                    // Only check if position is not occupied by a player
                    if (!game.playerPositions.some(pos => pos.x === x && pos.y === y)) {
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
        if (newTurnsRemaining <= 0 && game.status !== "overtime") { // Do not end round if in overtime based on turns
            await ctx.scheduler.runAfter(0, internal.game.endRound, {
                gameId: args.gameId,
                team1Score: game.team1Score, // Current round's team1 score
                team2Score: game.team2Score, // Current round's team2 score
            });
            // game state will be updated by endRound or subsequent advanceTurn from new round/overtime start
            // No need to patch here if endRound is called, as it will handle the transition.
            // However, we need to update turnStartTime for the next player if endRound doesn't immediately end the game.
            // Let's let endRound handle the full patch and scheduling for next phase.
            // For now, we'll patch the turn advancement essentials if not ending round immediately.
        }

        // Update game state
        const newTurnTimestamp = Date.now();
        await ctx.db.patch(args.gameId, {
            currentPlayer: nextPlayer,
            currentTurn: newCurrentTurn,
            turnsRemaining: game.status === "overtime" ? game.turnsRemaining : newTurnsRemaining, // Keep turns if overtime
            playerLocks: newPlayerLocks,
            stars: newStars,
            grid: newGrid,
            turnsSinceLastStar: newTurnsSinceLastStar,
            turnStartTime: newTurnTimestamp,  // Use the stored timestamp
        });

        // Schedule next move check if needed (only if round isn't over or game is in overtime)
        // If game.status became "game_finished" due to endRound, this won't run.
        // If endRound scheduled a new round or overtime, it would have its own scheduleBotMove.
        // This is for continuing current active/overtime round.
        const potentiallyUpdatedGame = await ctx.db.get(args.gameId);
        if (potentiallyUpdatedGame && (potentiallyUpdatedGame.status === "active" || potentiallyUpdatedGame.status === "overtime")) {
            if (potentiallyUpdatedGame.turnsRemaining > 0 || potentiallyUpdatedGame.status === "overtime") {
                await ctx.scheduler.runAfter(1000, internal.game.scheduleBotMove, {
                    gameId: args.gameId,
                });

                await ctx.scheduler.runAfter(10000, internal.game.handleTurnTimeout, {
                    gameId: args.gameId,
                    expectedPlayer: nextPlayer,
                    turnStartTime: newTurnTimestamp, // Use the same stored timestamp
                });
            }
        }
    },
});

export const scheduleBotMove = internalAction({
    args: {
        gameId: v.id("games"),
    },
    handler: async (ctx, args) => {
        const game = await ctx.runQuery(internal.game.getGameInternal, {
            gameId: args.gameId,
        });

        if (!game || (game.status !== "active" && game.status !== "overtime")) { // Allow during overtime
            return;
        }

        const allPlayers = [...game.team1, ...game.team2];
        const currentPlayerId = allPlayers[game.currentPlayer];

        // Check if current player is locked (human or bot)
        if (game.playerLocks && game.playerLocks[game.currentPlayer]?.isLocked) {
            // Record locked action and skip turn
            await ctx.runMutation(internal.game.recordLockedTurn, {
                gameId: args.gameId,
                playerIndex: game.currentPlayer
            });
            return;
        }

        // Check if current player is a bot (including replacement bots)
        const isBot = currentPlayerId === "bot1" || currentPlayerId === "bot2" || currentPlayerId === "bot3" ||
            currentPlayerId.startsWith("bot_replacement_");

        if (isBot) {
            // Add 1-second delay before bot moves so users can track movements easily
            // await new Promise(resolve => setTimeout(resolve, 200));

            // Get bot strategy from game or fallback to original logic
            let botDecision: BotDecision;

            if (game.botStrategy) {
                const gameState: GameState = {
                    playerPositions: game.playerPositions,
                    stars: game.stars || [],
                    team1Score: game.team1Score,
                    team2Score: game.team2Score,
                    currentPlayer: game.currentPlayer,
                    playerLocks: game.playerLocks || getInitialLocks(),
                };

                switch (game.botStrategy) {
                    case "ingroup":
                        botDecision = getIngroupBotMove(gameState, game.currentPlayer);
                        break;
                    case "outgroup":
                        botDecision = getOutgroupBotMove(gameState, game.currentPlayer);
                        break;
                    case "prosocial":
                        botDecision = getProsocialBotMove(gameState, game.currentPlayer);
                        break;
                    case "antisocial":
                        botDecision = getAntisocialBotMove(gameState, game.currentPlayer);
                        break;
                    default:
                        // Fallback to original strategy
                        botDecision = getIngroupBotMove(gameState, game.currentPlayer);
                }
            } else {
                // Fallback to original simple strategy for legacy bots
                const gameState: GameState = {
                    playerPositions: game.playerPositions,
                    stars: game.stars || [],
                    team1Score: game.team1Score,
                    team2Score: game.team2Score,
                    currentPlayer: game.currentPlayer,
                    playerLocks: game.playerLocks || getInitialLocks(),
                };
                botDecision = getIngroupBotMove(gameState, game.currentPlayer);
            }

            // Execute the bot's decision
            if (botDecision.action === "move") {
                await ctx.runMutation(internal.game.executeMoveInternal, {
                    gameId: args.gameId,
                    playerIndex: game.currentPlayer,
                    direction: botDecision.direction,
                    isBot: true,
                });
            } else if (botDecision.action === "lock") {
                await ctx.runMutation(internal.game.executeLockInternal, {
                    gameId: args.gameId,
                    playerIndex: game.currentPlayer,
                    direction: botDecision.direction,
                });
            } else if (botDecision.action === "unlock") {
                await ctx.runMutation(internal.game.executeUnlockInternal, {
                    gameId: args.gameId,
                    playerIndex: game.currentPlayer,
                    direction: botDecision.direction,
                });
            }
        }
    },
});

export const recordLockedTurn = internalMutation({
    args: { gameId: v.id("games"), playerIndex: v.number() },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) return; // Allow during overtime

        const allPlayers = [...game.team1, ...game.team2];
        const playerId = allPlayers[args.playerIndex];
        const currentPos = game.playerPositions[args.playerIndex];

        // Log locked action for ALL players (including bots)
        await ctx.db.insert("gameActions", {
            gameId: args.gameId,
            playerId: playerId,
            action: "locked",
            fromX: currentPos.x,
            fromY: currentPos.y,
            starPositions: game.stars || [],
            round: game.currentRound,
            turn: game.currentTurn,
            timestamp: Date.now(),
        });

        await ctx.runMutation(internal.game.advanceTurn, { gameId: args.gameId });
    },
});

export const getGameInternal = internalQuery({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.gameId);
    },
});

export const endRound = internalMutation({
    args: {
        gameId: v.id("games"),
        team1Score: v.number(), // Score for the round that just ended for team 1
        team2Score: v.number(), // Score for the round that just ended for team 2
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            return;
        }

        // Add current round's scores to the history
        const newRoundScores = [
            ...game.roundScores,
            { team1: args.team1Score, team2: args.team2Score },
        ];

        if (game.currentRound === 3) {
            // End of 3rd round. Calculate total scores across all 3 rounds.
            const totalTeam1ScoreAllRounds = newRoundScores.reduce((sum, round) => sum + round.team1, 0);
            const totalTeam2ScoreAllRounds = newRoundScores.reduce((sum, round) => sum + round.team2, 0);

            if (totalTeam1ScoreAllRounds === totalTeam2ScoreAllRounds) {
                // Tie after 3 rounds, seamlessly transition to "sudden death" overtime.
                // The board state (grid, players, stars) and current round scores persist.
                await ctx.db.patch(args.gameId, {
                    status: "overtime",
                    // currentRound remains 3 (or could be a conceptual 3.5, but status handles it)
                    // currentTurn, currentPlayer are handled by advanceTurn before this is called
                    turnsRemaining: 999, // Effectively infinite for sudden death
                    roundScores: newRoundScores, // Keep scores of the first 3 rounds
                    // team1Score and team2Score (for current "overtime" period) are args.team1Score, args.team2Score
                    // which are the scores at the moment overtime began. They will be updated if a star is harvested.
                    // No change to grid, playerPositions, stars, playerLocks, playerTurnTracking
                    turnStartTime: Date.now(), // Reset turn timer for the next player
                });

                // Schedule next player's move in overtime
                // advanceTurn would have set the next player, so we just need to ensure bot/timeout logic continues
                const nextPlayerInOvertime = (await ctx.db.get(args.gameId))!.currentPlayer;
                await ctx.scheduler.runAfter(1000, internal.game.scheduleBotMove, {
                    gameId: args.gameId, // scheduleBotMove will check if it's a bot's turn
                });
                await ctx.scheduler.runAfter(10000, internal.game.handleTurnTimeout, {
                    gameId: args.gameId,
                    expectedPlayer: nextPlayerInOvertime,
                    turnStartTime: Date.now(), // Corresponds to the turnStartTime set above
                });
                return; // Game continues in overtime mode
            } else {
                // Not a tie after 3 rounds, game is finished
                await ctx.db.patch(args.gameId, {
                    status: "game_finished",
                    roundScores: newRoundScores,
                    // team1Score and team2Score on game doc are from the last round (round 3)
                });
                return;
            }
        } else if (game.currentRound < 3) {
            // Start next round (round 2 or 3)
            // Instead of immediately starting, initiate resting phase.
            await ctx.db.patch(args.gameId, {
                isResting: true,
                restingPhaseEndTime: Date.now() + RESTING_TIME_SECONDS * 1000,
                roundScores: newRoundScores, // Persist scores for the round that just ended
                team1Score: args.team1Score, // Persist current scores as they were at end of round
                team2Score: args.team2Score,
            });

            await ctx.scheduler.runAfter(RESTING_TIME_SECONDS * 1000, internal.game.finalizeNextRoundStart, {
                gameId: args.gameId,
            });
        }
    },
});

export const finalizeNextRoundStart = internalMutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || !game.isResting) {
            // Game might have been deleted or resting phase was cancelled/already processed
            return;
        }

        // Ensure we are at or past the resting phase end time
        if (Date.now() < (game.restingPhaseEndTime || 0)) {
            // This shouldn't happen if scheduler works as expected, but good to check.
            // Reschedule for the remaining time, or simply return and let the next scheduled call handle it.
            console.warn(`finalizeNextRoundStart called too early for game ${args.gameId}. Rescheduling or waiting.`);
            // To be safe, we can reschedule it, though runAfter should ideally prevent this.
            const remainingTimeMs = (game.restingPhaseEndTime || Date.now()) - Date.now();
            if (remainingTimeMs > 0) {
                await ctx.scheduler.runAfter(remainingTimeMs, internal.game.finalizeNextRoundStart, { gameId: args.gameId });
            }
            return;
        }

        // Proceed to set up the next round (Round 2 or 3)
        const initialStars = placeInitialStar();
        const grid = generateGrid();
        const playerPositions = getInitialPositions();

        initialStars.forEach(star => {
            while (playerPositions.some(pos => pos.x === star.x && pos.y === star.y)) {
                star.x = Math.floor(Math.random() * 10);
                star.y = Math.floor(Math.random() * 10);
            }
            grid[star.y][star.x] = "star";
        });

        const countdownDuration = 4000;
        const countdownStartTime = Date.now();

        await ctx.db.patch(args.gameId, {
            isResting: false,
            restingPhaseEndTime: undefined, // Clear the end time
            currentRound: game.currentRound + 1,
            currentTurn: 1,
            currentPlayer: 0, // Reset to first player for the new round
            turnsRemaining: TOTAL_TURNS_PER_ROUND * 4,
            team1Score: 0, // Reset for the new round
            team2Score: 0, // Reset for the new round
            // roundScores was already updated when isResting was set
            grid,
            playerPositions,
            playerLocks: getInitialLocks(),
            playerTurnTracking: getInitialTurnTracking(),
            stars: initialStars,
            turnsSinceLastStar: 0,
            countdownStartTime,
            countdownDuration,
            turnStartTime: undefined, // Explicitly clear turnStartTime until countdown is over
        });

        // Schedule the start of the first turn after the countdown
        await ctx.scheduler.runAfter(countdownDuration, internal.game.startFirstTurnAfterCountdown, {
            gameId: args.gameId,
        });
    }
});

export const startFirstTurnAfterCountdown = internalMutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game) return;
        // Only start the turn if the game is not finished or overtime (shouldn't be, but safe)
        if (game.status !== "active") return;
        // Only start if turnStartTime is not already set (avoid double start)
        if (game.turnStartTime) return;
        const now = Date.now();
        await ctx.db.patch(args.gameId, {
            turnStartTime: now,
        });
        // Schedule bot move and timeout for the first player
        await ctx.scheduler.runAfter(1000, internal.game.scheduleBotMove, {
            gameId: args.gameId,
        });
        await ctx.scheduler.runAfter(10000, internal.game.handleTurnTimeout, {
            gameId: args.gameId,
            expectedPlayer: 0, // First player of new round
            turnStartTime: now,
        });
    }
});

export const leaveGame = mutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return;
        }

        // Mark player as disconnected due to leaving
        await ctx.runMutation(internal.game.markPlayerDisconnectedInternal, {
            gameId: args.gameId,
            userId,
            reason: "leave_game",
        });
    },
});

export const markPlayerDisconnectedInternal = internalMutation({
    args: {
        gameId: v.id("games"),
        userId: v.union(v.id("users"), v.string()),
        reason: v.union(v.literal("leave_game"), v.literal("sign_out"), v.literal("window_close")),
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            return;
        }

        // Update player activity to mark as disconnected
        const currentActivity = game.lastPlayerActivity || [];
        const updatedActivity = currentActivity.map(activity =>
            activity.playerId === args.userId
                ? { ...activity, lastSeen: Date.now(), isConnected: false, disconnectionReason: args.reason }
                : activity
        );

        await ctx.db.patch(args.gameId, {
            lastPlayerActivity: updatedActivity,
        });

        // If game is waiting, handle immediate removal
        if (game.status === "waiting" || game.status === "matched") {
            const newTeam1 = game.team1.filter(id => id !== args.userId);
            const newTeam2 = game.team2.filter(id => id !== args.userId);
            const remainingHumans = [...newTeam1, ...newTeam2].filter(id =>
                id !== "bot1" && id !== "bot2" && id !== "bot3" && !id.startsWith("bot_replacement_")
            );

            if (remainingHumans.length === 0) {
                // Delete game if no human players remain
                await ctx.db.delete(args.gameId);
            } else if (game.status === "matched" && (newTeam1.length < 2 || newTeam2.length < 2)) {
                // If we're in matched state but don't have complete teams, reset to waiting
                await ctx.db.patch(args.gameId, {
                    team1: newTeam1.length > 0 ? newTeam1 : [],
                    team2: newTeam2.length > 0 ? newTeam2 : [],
                    status: newTeam1.length > 0 || newTeam2.length > 0 ? "waiting" : "waiting", // Reset to waiting
                    playersReady: undefined, // Clear ready states
                });
            } else {
                await ctx.db.patch(args.gameId, {
                    team1: newTeam1,
                    team2: newTeam2,
                    status: "waiting", // Reset to waiting if one player leaves during match confirmation
                    playersReady: undefined, // Clear ready states
                });
            }
        }
        // Note: Removed immediate replacement for active/overtime games - only 5 missed turns will trigger replacement
    },
});

export const handleTurnTimeout = internalAction({
    args: {
        gameId: v.id("games"),
        expectedPlayer: v.number(),
        turnStartTime: v.number(),
    },
    handler: async (ctx, args) => {
        const game = await ctx.runQuery(internal.game.getGameInternal, {
            gameId: args.gameId,
        });

        if (!game || (game.status !== "active" && game.status !== "overtime")) {
            return;
        }

        // Check if it's still the same player's turn and the turn hasn't been taken
        if (game.currentPlayer === args.expectedPlayer &&
            game.turnStartTime === args.turnStartTime) {

            const allPlayers = [...game.team1, ...game.team2];
            const currentPlayerId = allPlayers[args.expectedPlayer];

            // If it's a human player who timed out, update their turn tracking
            if (currentPlayerId !== "bot1" && currentPlayerId !== "bot2" && currentPlayerId !== "bot3" &&
                !currentPlayerId.startsWith("bot_replacement_")) {

                // Update turn tracking for missed turn
                await ctx.runMutation(internal.game.updatePlayerTurnTracking, {
                    gameId: args.gameId,
                    playerIndex: args.expectedPlayer,
                    turnTaken: false,
                });

                // Check if this player should be replaced (5 consecutive missed turns)
                const updatedGame = await ctx.runQuery(internal.game.getGameInternal, {
                    gameId: args.gameId,
                });

                if (updatedGame &&
                    updatedGame.playerTurnTracking &&
                    updatedGame.playerTurnTracking[args.expectedPlayer] &&
                    updatedGame.playerTurnTracking[args.expectedPlayer].consecutiveMissedTurns >= 5) {
                    await ctx.runMutation(internal.game.replacePlayerWithBot, {
                        gameId: args.gameId,
                        disconnectedPlayerId: currentPlayerId,
                        reason: "timeout",
                    });
                }
            }

            // Skip the turn due to timeout
            await ctx.runMutation(internal.game.recordTimeoutTurn, {
                gameId: args.gameId,
                playerIndex: args.expectedPlayer
            });
        }
    },
});

export const recordTimeoutTurn = internalMutation({
    args: { gameId: v.id("games"), playerIndex: v.number() },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || (game.status !== "active" && game.status !== "overtime")) return;

        const allPlayers = [...game.team1, ...game.team2];
        const playerId = allPlayers[args.playerIndex];
        const currentPos = game.playerPositions[args.playerIndex];

        // Log timeout action
        await ctx.db.insert("gameActions", {
            gameId: args.gameId,
            playerId: playerId,
            action: "timeout",
            fromX: currentPos.x,
            fromY: currentPos.y,
            starPositions: game.stars || [],
            round: game.currentRound,
            turn: game.currentTurn,
            timestamp: Date.now(),
        });

        await ctx.runMutation(internal.game.advanceTurn, { gameId: args.gameId });
    },
});

// Get lobby statistics for display
export const getLobbyStats = query({
    args: {},
    handler: async (ctx) => {
        const waitingGames = await ctx.db
            .query("games")
            .withIndex("by_status", (q) => q.eq("status", "waiting"))
            .collect();

        const activeGames = await ctx.db
            .query("games")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .collect();

        return {
            playersWaiting: waitingGames.length,
            activeGames: activeGames.length,
        };
    },
});

export const getPlayerInteractionStats = query({
    args: { gameId: v.id("games") },
    returns: v.record(v.string(), v.record(v.string(), v.string())),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            // Or throw an error, depending on desired public/private nature
            return {};
        }

        const game = await ctx.db.get(args.gameId);
        if (!game) {
            // Consider throwing an error or returning a specific "not found"
            return {};
        }

        // Ensure user is part of this game to view stats (optional, depends on requirements)
        const allGamePlayers = [...new Set([...game.team1, ...game.team2, ...(game.originalPlayers || [])])];
        if (!allGamePlayers.includes(userId)) {
            // Or throw an error if stats are private to game participants
            // return {}; 
        }

        const playerIdsInOrder = [...game.team1, ...game.team2];
        if (playerIdsInOrder.length === 0 || (game.team1.length === 0 && game.team2.length === 0)) {
            // Game might be in a very early stage or malformed, return empty if no players defined in teams
            return {};
        }


        const actions = await ctx.db
            .query("gameActions")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .filter((q) =>
                q.or(
                    q.eq(q.field("action"), "lock"),
                    q.eq(q.field("action"), "unlock")
                )
            )
            .collect();

        const interactionStats: Record<string, Record<string, { locks: number; unlocks: number }>> = {};

        for (const action of actions) {
            const actorId = action.playerId;
            const targetPlayerIndex = action.targetPlayer;

            if (targetPlayerIndex !== undefined && targetPlayerIndex >= 0 && targetPlayerIndex < playerIdsInOrder.length) {
                const targetId = playerIdsInOrder[targetPlayerIndex];

                if (actorId === targetId) {
                    // Skip self-interactions for lock/unlock counts
                    continue;
                }

                if (!interactionStats[actorId]) {
                    interactionStats[actorId] = {};
                }
                if (!interactionStats[actorId][targetId]) {
                    interactionStats[actorId][targetId] = { locks: 0, unlocks: 0 };
                }

                if (action.action === "lock" && action.result === "locked") {
                    interactionStats[actorId][targetId].locks++;
                } else if (action.action === "unlock" && action.result === "unlocked") {
                    interactionStats[actorId][targetId].unlocks++;
                }
            }
        }

        const resultMatrix: Record<string, Record<string, string>> = {};
        for (const p1 of playerIdsInOrder) { // Actor
            resultMatrix[p1] = {};
            for (const p2 of playerIdsInOrder) { // Target
                if (p1 === p2) {
                    resultMatrix[p1][p2] = "-";
                } else {
                    const stats = interactionStats[p1]?.[p2] || { locks: 0, unlocks: 0 };
                    resultMatrix[p1][p2] = `${stats.locks} Lock, ${stats.unlocks} Unlock`;
                }
            }
        }
        return resultMatrix;
    },
});

export const saveDistribution = mutation({
    args: {
        gameId: v.id("games"),
        distributorPlayerIndex: v.number(),
        isWinner: v.boolean(),
        isTeamReward: v.boolean(),
        distributions: v.array(v.object({
            recipientPlayerIndex: v.number(),
            pointsGiven: v.number(),
        })),
        totalPointsAvailable: v.number(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to save distribution");
        }

        // Get the game to verify access and get player data
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            throw new Error("Game not found");
        }

        // Get all players from both teams
        const allPlayers = [...game.team1, ...game.team2];
        const distributorPlayerId = allPlayers[args.distributorPlayerIndex];

        // Verify the current user is the distributor
        if (distributorPlayerId !== userId) {
            throw new Error("You can only save your own distributions");
        }

        // Calculate total points distributed
        const totalPointsDistributed = args.distributions.reduce(
            (total, dist) => total + dist.pointsGiven,
            0
        );

        // Determine distribution type
        let distributionType: "winner_team_reward" | "winner_other_team" | "loser_team_reward" | "loser_other_team";
        if (args.isWinner && args.isTeamReward) {
            distributionType = "winner_team_reward";
        } else if (args.isWinner && !args.isTeamReward) {
            distributionType = "winner_other_team";
        } else if (!args.isWinner && args.isTeamReward) {
            distributionType = "loser_team_reward";
        } else {
            distributionType = "loser_other_team";
        }

        // Build the distributions array with recipient player IDs
        const distributionsWithIds = args.distributions.map(dist => ({
            recipientPlayerIndex: dist.recipientPlayerIndex,
            recipientPlayerId: allPlayers[dist.recipientPlayerIndex],
            pointsGiven: dist.pointsGiven,
        }));

        // Save the distribution to the database
        await ctx.db.insert("distributions", {
            gameId: args.gameId,
            distributorPlayerId: userId,
            distributorPlayerIndex: args.distributorPlayerIndex,
            isWinner: args.isWinner,
            isTeamReward: args.isTeamReward,
            distributions: distributionsWithIds,
            totalPointsAvailable: args.totalPointsAvailable,
            totalPointsDistributed,
            distributionType,
            timestamp: Date.now(),
        });

        // Generate and save bot distributions for this game
        await ctx.runMutation(internal.game.generateBotDistributions, {
            gameId: args.gameId,
        });

        return null;
    },
});

// Internal mutation to generate and save bot distributions
export const generateBotDistributions = internalMutation({
    args: {
        gameId: v.id("games"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            return null;
        }

        // Get existing distributions to avoid duplicates
        const existingDistributions = await ctx.db
            .query("distributions")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();

        const playersWithDistributions = new Set(existingDistributions.map(d => d.distributorPlayerIndex));

        // Determine game outcome for bot behavior
        const totalScores = game.roundScores?.reduce(
            (acc, round) => ({
                team1: acc.team1 + round.team1,
                team2: acc.team2 + round.team2
            }),
            { team1: 0, team2: 0 }
        ) || { team1: 0, team2: 0 };

        const winnerTeam = totalScores.team1 > totalScores.team2 ? 1 :
            totalScores.team2 > totalScores.team1 ? 2 : 1; // Default to team 1 if tie

        const allPlayers = [...game.team1, ...game.team2];
        const replacedPlayers = game.replacedPlayers || [];

        // Generate distributions for each bot that doesn't have distributions yet
        for (let playerIndex = 0; playerIndex < 4; playerIndex++) {
            const playerId = allPlayers[playerIndex];

            // Check if this is a bot (original bots or replacement bots)
            const isBot = playerId === "bot1" || playerId === "bot2" || playerId === "bot3" ||
                (typeof playerId === "string" && playerId.startsWith("bot_replacement_"));

            // Check if this player position had a disconnected/replaced player
            const replacedPlayer = replacedPlayers.find(rp => rp.playerIndex === playerIndex);
            const isReplacedPlayer = replacedPlayer !== undefined;

            // Skip if not a bot, not a replaced player, or already has distributions
            if ((!isBot && !isReplacedPlayer) || playersWithDistributions.has(playerIndex)) {
                continue;
            }

            const isTeam1 = playerIndex === 0 || playerIndex === 1;
            const playerTeam = isTeam1 ? 1 : 2;
            const isWinner = playerTeam === winnerTeam;

            // Use the bot's ID for both bots and replaced players
            const distributorPlayerId = playerId;

            // Generate both distribution types for this bot or replaced player
            await generateSingleBotDistribution(ctx, args.gameId, distributorPlayerId, playerIndex, isWinner, true, allPlayers, game.botStrategy || "ingroup");
            await generateSingleBotDistribution(ctx, args.gameId, distributorPlayerId, playerIndex, isWinner, false, allPlayers, game.botStrategy || "ingroup");
        }

        return null;
    },
});

// Helper function to generate a single bot distribution
async function generateSingleBotDistribution(
    ctx: any,
    gameId: Id<"games">,
    botPlayerId: string,
    botPlayerIndex: number,
    isWinner: boolean,
    isTeamReward: boolean,
    allPlayers: (Id<"users"> | string)[],
    botStrategy: BotStrategy
) {
    const totalPoints = isTeamReward ? (isWinner ? 20 : 10) : (isWinner ? 10 : 20);
    const isTeam1 = botPlayerIndex === 0 || botPlayerIndex === 1;

    let distributions: Array<{
        recipientPlayerIndex: number;
        recipientPlayerId: Id<"users"> | string;
        pointsGiven: number;
    }> = [];

    if (botStrategy === "antisocial") {
        // Antisocial bots give all points to themselves and zero to others
        if (isTeamReward) {
            // Distributing to own team - give all to self, zero to teammate
            const teammateIndex = isTeam1 ? (botPlayerIndex === 0 ? 1 : 0) : (botPlayerIndex === 2 ? 3 : 2);
            distributions = [
                {
                    recipientPlayerIndex: teammateIndex,
                    recipientPlayerId: allPlayers[teammateIndex],
                    pointsGiven: 0,
                },
                {
                    recipientPlayerIndex: botPlayerIndex,
                    recipientPlayerId: allPlayers[botPlayerIndex],
                    pointsGiven: totalPoints,
                },
            ];
        } else {
            // Distributing to other team - give zero to both opponents, all to self
            const otherTeam = isTeam1 ? [2, 3] : [0, 1];
            distributions = [
                {
                    recipientPlayerIndex: otherTeam[0],
                    recipientPlayerId: allPlayers[otherTeam[0]],
                    pointsGiven: 0,
                },
                {
                    recipientPlayerIndex: otherTeam[1],
                    recipientPlayerId: allPlayers[otherTeam[1]],
                    pointsGiven: 0,
                }
            ];
        }
    } else if (botStrategy === "ingroup") {
        if (isTeamReward) {
            // Distributing to own team - give proportional to stars harvested
            const teammateIndex = isTeam1 ? (botPlayerIndex === 0 ? 1 : 0) : (botPlayerIndex === 2 ? 3 : 2);

            // Count stars harvested by each team member
            const starCounts = await getStarCountsForPlayers(ctx, gameId, [botPlayerIndex, teammateIndex]);
            const botStars = starCounts[botPlayerIndex] || 0;
            const teammateStars = starCounts[teammateIndex] || 0;
            const totalStars = botStars + teammateStars;

            let toBotSelf = 0;
            let toTeammate = 0;

            if (totalStars === 0) {
                // If no stars harvested by team, split equally
                toBotSelf = Math.floor(totalPoints / 2);
                toTeammate = totalPoints - toBotSelf;
            } else {
                // Distribute proportionally based on stars
                toBotSelf = Math.floor((botStars / totalStars) * totalPoints);
                toTeammate = totalPoints - toBotSelf;
            }

            distributions = [
                {
                    recipientPlayerIndex: teammateIndex,
                    recipientPlayerId: allPlayers[teammateIndex],
                    pointsGiven: toTeammate,
                },
                {
                    recipientPlayerIndex: botPlayerIndex,
                    recipientPlayerId: allPlayers[botPlayerIndex],
                    pointsGiven: toBotSelf,
                },
            ];
        } else {
            // Distributing to other team - give zero to both opponents
            const otherTeam = isTeam1 ? [2, 3] : [0, 1];
            distributions = [
                {
                    recipientPlayerIndex: otherTeam[0],
                    recipientPlayerId: allPlayers[otherTeam[0]],
                    pointsGiven: 0,
                },
                {
                    recipientPlayerIndex: otherTeam[1],
                    recipientPlayerId: allPlayers[otherTeam[1]],
                    pointsGiven: 0,
                }
            ];
        }
    } else if (botStrategy === "outgroup") {
        if (isTeamReward) {
            // Distributing to own team - give all to self, zero to teammate
            const teammateIndex = isTeam1 ? (botPlayerIndex === 0 ? 1 : 0) : (botPlayerIndex === 2 ? 3 : 2);
            distributions = [
                {
                    recipientPlayerIndex: teammateIndex,
                    recipientPlayerId: allPlayers[teammateIndex],
                    pointsGiven: 0,
                },
                {
                    recipientPlayerIndex: botPlayerIndex,
                    recipientPlayerId: allPlayers[botPlayerIndex],
                    pointsGiven: totalPoints,
                },
            ];
        } else {
            // Distributing to other team - give proportional to stars harvested by opponents
            const otherTeam = isTeam1 ? [2, 3] : [0, 1];

            // Count stars harvested by each opponent
            const starCounts = await getStarCountsForPlayers(ctx, gameId, otherTeam);
            const opponent1Stars = starCounts[otherTeam[0]] || 0;
            const opponent2Stars = starCounts[otherTeam[1]] || 0;
            const totalOpponentStars = opponent1Stars + opponent2Stars;

            let toOpponent1 = 0;
            let toOpponent2 = 0;

            if (totalOpponentStars === 0) {
                // If no stars harvested by opponents, split equally
                toOpponent1 = Math.floor(totalPoints / 2);
                toOpponent2 = totalPoints - toOpponent1;
            } else {
                // Distribute proportionally based on stars
                toOpponent2 = Math.floor((opponent2Stars / totalOpponentStars) * totalPoints);
                toOpponent1 = totalPoints - toOpponent2;
            }

            distributions = [
                {
                    recipientPlayerIndex: otherTeam[0],
                    recipientPlayerId: allPlayers[otherTeam[0]],
                    pointsGiven: toOpponent1,
                },
                {
                    recipientPlayerIndex: otherTeam[1],
                    recipientPlayerId: allPlayers[otherTeam[1]],
                    pointsGiven: toOpponent2,
                }
            ];
        }
    } else if (botStrategy === "prosocial") {
        if (isTeamReward) {
            // Distributing to own team - based on lock/unlock behavior
            const teammateIndex = isTeam1 ? (botPlayerIndex === 0 ? 1 : 0) : (botPlayerIndex === 2 ? 3 : 2);
            const teamIndices = [botPlayerIndex, teammateIndex];

            // Get lock/unlock counts for team members
            const lockUnlockCounts = await getLockUnlockCountsForPlayers(ctx, gameId, teamIndices);

            // Split points in half
            const unlockPoints = Math.floor(totalPoints / 2);
            const lockPunishmentPoints = totalPoints - unlockPoints;

            // Calculate unlock-based distribution (proportional to unlocks)
            const totalUnlocks = teamIndices.reduce((sum, idx) => sum + lockUnlockCounts[idx].unlocks, 0);
            let botUnlockPoints = 0;
            let teammateUnlockPoints = 0;

            if (totalUnlocks === 0) {
                // If no unlocks, split unlock points equally
                botUnlockPoints = unlockPoints / 2;
                teammateUnlockPoints = unlockPoints - botUnlockPoints;
            } else {
                // Distribute proportionally to unlocks
                botUnlockPoints = (lockUnlockCounts[botPlayerIndex].unlocks / totalUnlocks) * unlockPoints;
                teammateUnlockPoints = unlockPoints - botUnlockPoints;
            }

            // Calculate lock punishment distribution (inverse proportional to locks)
            const botLocks = lockUnlockCounts[botPlayerIndex].locks;
            const teammateLocks = lockUnlockCounts[teammateIndex].locks;
            const totalLocks = botLocks + teammateLocks;

            let botLockPenaltyPoints = 0;
            let teammateLockPenaltyPoints = 0;

            if (totalLocks === 0) {
                // If no locks, split penalty points equally
                botLockPenaltyPoints = lockPunishmentPoints / 2;
                teammateLockPenaltyPoints = lockPunishmentPoints - botLockPenaltyPoints;
            } else {
                // Distribute inverse proportionally to locks (fewer locks = more points)
                // Give more points to whoever has fewer locks
                botLockPenaltyPoints = (teammateLocks / totalLocks) * lockPunishmentPoints;
                teammateLockPenaltyPoints = lockPunishmentPoints - botLockPenaltyPoints;
            }

            distributions = [
                {
                    recipientPlayerIndex: teammateIndex,
                    recipientPlayerId: allPlayers[teammateIndex],
                    pointsGiven: Math.ceil(teammateUnlockPoints + teammateLockPenaltyPoints),
                },
                {
                    recipientPlayerIndex: botPlayerIndex,
                    recipientPlayerId: allPlayers[botPlayerIndex],
                    pointsGiven: Math.floor(botUnlockPoints + botLockPenaltyPoints),
                },
            ];
        } else {
            // Distributing to other team - based on their lock/unlock behavior
            const otherTeam = isTeam1 ? [2, 3] : [0, 1];

            // Get lock/unlock counts for opponents
            const lockUnlockCounts = await getLockUnlockCountsForPlayers(ctx, gameId, otherTeam);

            // Split points in half
            const unlockPoints = Math.floor(totalPoints / 2);
            const lockPunishmentPoints = totalPoints - unlockPoints;

            // Calculate unlock-based distribution (proportional to unlocks)
            const totalUnlocks = otherTeam.reduce((sum, idx) => sum + lockUnlockCounts[idx].unlocks, 0);
            let opponent1UnlockPoints = 0;
            let opponent2UnlockPoints = 0;

            if (totalUnlocks === 0) {
                // If no unlocks, split unlock points equally
                opponent1UnlockPoints = unlockPoints / 2;
                opponent2UnlockPoints = unlockPoints - opponent1UnlockPoints;
            } else {
                // Distribute proportionally to unlocks
                opponent1UnlockPoints = (lockUnlockCounts[otherTeam[0]].unlocks / totalUnlocks) * unlockPoints;
                opponent2UnlockPoints = unlockPoints - opponent1UnlockPoints;
            }

            // Calculate lock punishment distribution (inverse proportional to locks)
            const opponent1Locks = lockUnlockCounts[otherTeam[0]].locks;
            const opponent2Locks = lockUnlockCounts[otherTeam[1]].locks;
            const totalLocks = opponent1Locks + opponent2Locks;

            let opponent1LockPenaltyPoints = 0;
            let opponent2LockPenaltyPoints = 0;

            if (totalLocks === 0) {
                // If no locks, split penalty points equally
                opponent1LockPenaltyPoints = lockPunishmentPoints / 2;
                opponent2LockPenaltyPoints = lockPunishmentPoints - opponent1LockPenaltyPoints;
            } else {
                // Distribute inverse proportionally to locks (fewer locks = more points)
                opponent1LockPenaltyPoints = (opponent2Locks / totalLocks) * lockPunishmentPoints;
                opponent2LockPenaltyPoints = lockPunishmentPoints - opponent1LockPenaltyPoints;
            }

            distributions = [
                {
                    recipientPlayerIndex: otherTeam[0],
                    recipientPlayerId: allPlayers[otherTeam[0]],
                    pointsGiven: Math.ceil(opponent1UnlockPoints + opponent1LockPenaltyPoints),
                },
                {
                    recipientPlayerIndex: otherTeam[1],
                    recipientPlayerId: allPlayers[otherTeam[1]],
                    pointsGiven: Math.floor(opponent2UnlockPoints + opponent2LockPenaltyPoints),
                }
            ];
        }
    } else {
        // Original behavior for non-antisocial bots
        if (isTeamReward) {
            // Distributing to own team
            const teammateIndex = isTeam1 ? (botPlayerIndex === 0 ? 1 : 0) : (botPlayerIndex === 2 ? 3 : 2);

            // Randomly distribute between self and teammate, favoring teammate
            const toTeammate = Math.floor(Math.random() * (totalPoints - 5)) + 5; // 5 to (totalPoints-1) points to teammate
            const toSelf = totalPoints - toTeammate; // Remainder to self

            distributions = [
                {
                    recipientPlayerIndex: teammateIndex,
                    recipientPlayerId: allPlayers[teammateIndex],
                    pointsGiven: toTeammate,
                },
                {
                    recipientPlayerIndex: botPlayerIndex,
                    recipientPlayerId: allPlayers[botPlayerIndex],
                    pointsGiven: toSelf,
                },
            ];
        } else {
            // Distributing to other team
            const otherTeam = isTeam1 ? [2, 3] : [0, 1];

            // Randomly split between the two other team members
            const toFirst = Math.floor(Math.random() * (totalPoints + 1)); // 0 to totalPoints
            const toSecond = totalPoints - toFirst;

            distributions = [
                {
                    recipientPlayerIndex: otherTeam[0],
                    recipientPlayerId: allPlayers[otherTeam[0]],
                    pointsGiven: toFirst,
                },
                {
                    recipientPlayerIndex: otherTeam[1],
                    recipientPlayerId: allPlayers[otherTeam[1]],
                    pointsGiven: toSecond,
                },
            ];
        }
    }

    // Calculate total points distributed
    const totalPointsDistributed = distributions.reduce(
        (total, dist) => total + dist.pointsGiven,
        0
    );

    // Determine distribution type
    let distributionType: "winner_team_reward" | "winner_other_team" | "loser_team_reward" | "loser_other_team";
    if (isWinner && isTeamReward) {
        distributionType = "winner_team_reward";
    } else if (isWinner && !isTeamReward) {
        distributionType = "winner_other_team";
    } else if (!isWinner && isTeamReward) {
        distributionType = "loser_team_reward";
    } else {
        distributionType = "loser_other_team";
    }

    // Save the bot distribution to the database
    await ctx.db.insert("distributions", {
        gameId,
        distributorPlayerId: botPlayerId,
        distributorPlayerIndex: botPlayerIndex,
        isWinner,
        isTeamReward,
        distributions,
        totalPointsAvailable: totalPoints,
        totalPointsDistributed,
        distributionType,
        timestamp: Date.now(),
    });
}

// Get distribution data for a game
export const getDistributions = query({
    args: {
        gameId: v.id("games"),
    },
    returns: v.array(v.object({
        _id: v.id("distributions"),
        _creationTime: v.number(),
        gameId: v.id("games"),
        distributorPlayerId: v.union(v.id("users"), v.string()),
        distributorPlayerIndex: v.number(),
        isWinner: v.boolean(),
        isTeamReward: v.boolean(),
        distributions: v.array(v.object({
            recipientPlayerIndex: v.number(),
            recipientPlayerId: v.union(v.id("users"), v.string()),
            pointsGiven: v.number(),
        })),
        totalPointsAvailable: v.number(),
        totalPointsDistributed: v.number(),
        distributionType: v.union(
            v.literal("winner_team_reward"),
            v.literal("winner_other_team"),
            v.literal("loser_team_reward"),
            v.literal("loser_other_team")
        ),
        timestamp: v.number(),
    })),
    handler: async (ctx, args) => {
        const distributions = await ctx.db
            .query("distributions")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();

        return distributions;
    },
});

// Save survey rating data from the rating pages
export const saveSurveyRatings = mutation({
    args: {
        gameId: v.id("games"),
        ratingType: v.union(
            v.literal("overall-performance"),
            v.literal("competitiveness"),
            v.literal("collaboration"),
            v.literal("harm-intention"),
            v.literal("fairness"),
            v.literal("generosity")
        ),
        ratings: v.array(v.object({
            targetPlayerIndex: v.number(),
            rating: v.string(),
        })),
        additionalFeedback: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to save survey ratings");
        }

        // Get the game to verify access and get player data
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            throw new Error("Game not found");
        }

        // Get all players from both teams
        const allPlayers = [...game.team1, ...game.team2];

        // Find the rater's player index
        const raterPlayerIndex = allPlayers.findIndex(playerId => playerId === userId);
        if (raterPlayerIndex === -1) {
            throw new Error("You are not a player in this game");
        }

        // Build the ratings array with target player IDs
        const ratingsWithIds = args.ratings.map(rating => ({
            targetPlayerIndex: rating.targetPlayerIndex,
            targetPlayerId: allPlayers[rating.targetPlayerIndex],
            rating: rating.rating,
        }));

        // Save the ratings to the database
        await ctx.db.insert("surveyRatings", {
            gameId: args.gameId,
            raterPlayerId: userId,
            raterPlayerIndex,
            ratingType: args.ratingType,
            ratings: ratingsWithIds,
            additionalFeedback: args.additionalFeedback,
            timestamp: Date.now(),
        });

        return null;
    },
});

// Get survey ratings for a game
export const getSurveyRatings = query({
    args: {
        gameId: v.id("games"),
        ratingType: v.optional(v.union(
            v.literal("overall-performance"),
            v.literal("competitiveness"),
            v.literal("collaboration"),
            v.literal("harm-intention"),
            v.literal("fairness"),
            v.literal("generosity")
        )),
    },
    returns: v.array(v.object({
        _id: v.id("surveyRatings"),
        raterPlayerId: v.union(v.id("users"), v.string()),
        raterPlayerIndex: v.number(),
        ratingType: v.union(
            v.literal("overall-performance"),
            v.literal("competitiveness"),
            v.literal("collaboration"),
            v.literal("harm-intention"),
            v.literal("fairness"),
            v.literal("generosity")
        ),
        ratings: v.array(v.object({
            targetPlayerIndex: v.number(),
            targetPlayerId: v.union(v.id("users"), v.string()),
            rating: v.string(),
        })),
        additionalFeedback: v.optional(v.string()),
        timestamp: v.number(),
    })),
    handler: async (ctx, args) => {
        let query = ctx.db
            .query("surveyRatings")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId));

        if (args.ratingType) {
            // Filter by rating type if specified
            const allRatings = await query.collect();
            return allRatings.filter(rating => rating.ratingType === args.ratingType);
        } else {
            return await query.collect();
        }
    },
});

// Helper function to count stars harvested by specific players
async function getStarCountsForPlayers(
    ctx: any,
    gameId: Id<"games">,
    playerIndices: number[]
): Promise<Record<number, number>> {
    // Get all game actions for this game
    const actions = await ctx.db
        .query("gameActions")
        .withIndex("by_game", (q: any) => q.eq("gameId", gameId))
        .collect();

    // Count stars harvested by each player
    const starCounts: Record<number, number> = {};

    // Initialize counts for all requested players
    for (const playerIndex of playerIndices) {
        starCounts[playerIndex] = 0;
    }

    // Get all players from the game to map player IDs to indices
    const game = await ctx.db.get(gameId);
    if (!game) return starCounts;

    const allPlayers = [...game.team1, ...game.team2];

    for (const action of actions) {
        if (action.action === "move" && (action.result === "harvested" || action.result === "harvested_overtime_win")) {
            // Find the player index for this action
            const playerIndex = allPlayers.findIndex(playerId => playerId === action.playerId);

            if (playerIndex !== -1 && playerIndices.includes(playerIndex)) {
                starCounts[playerIndex] = (starCounts[playerIndex] || 0) + 1;
            }
        }
    }

    return starCounts;
}

// Helper function to count locks and unlocks performed by specific players
async function getLockUnlockCountsForPlayers(
    ctx: any,
    gameId: Id<"games">,
    playerIndices: number[]
): Promise<Record<number, { locks: number; unlocks: number }>> {
    // Get all game actions for this game
    const actions = await ctx.db
        .query("gameActions")
        .withIndex("by_game", (q: any) => q.eq("gameId", gameId))
        .collect();

    // Count locks and unlocks performed by each player
    const counts: Record<number, { locks: number; unlocks: number }> = {};

    // Initialize counts for all requested players
    for (const playerIndex of playerIndices) {
        counts[playerIndex] = { locks: 0, unlocks: 0 };
    }

    // Get all players from the game to map player IDs to indices
    const game = await ctx.db.get(gameId);
    if (!game) return counts;

    const allPlayers = [...game.team1, ...game.team2];

    for (const action of actions) {
        if (action.action === "lock" || action.action === "unlock") {
            // Find the player index for this action
            const playerIndex = allPlayers.findIndex(playerId => playerId === action.playerId);

            if (playerIndex !== -1 && playerIndices.includes(playerIndex)) {
                if (action.action === "lock" && action.result === "locked") {
                    counts[playerIndex].locks = (counts[playerIndex].locks || 0) + 1;
                } else if (action.action === "unlock" && action.result === "unlocked") {
                    counts[playerIndex].unlocks = (counts[playerIndex].unlocks || 0) + 1;
                }
            }
        }
    }

    return counts;
}

// Mark that a player has completed their survey
export const markSurveyCompleted = mutation({
    args: {
        gameId: v.id("games"),
        completionType: v.union(
            v.literal("harm-intention-completed"),
            v.literal("all-surveys-completed"),
            v.literal("extra-reward-distribution-completed")
        ),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to mark survey completion");
        }

        // Get the game to verify access and get player data
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            throw new Error("Game not found");
        }

        // Get all players from both teams
        const allPlayers = [...game.team1, ...game.team2];

        // Find the player's index
        const playerIndex = allPlayers.findIndex(playerId => playerId === userId);
        if (playerIndex === -1) {
            throw new Error("You are not a player in this game");
        }

        // Save the completion status
        await ctx.db.insert("surveyRatings", {
            gameId: args.gameId,
            raterPlayerId: userId,
            raterPlayerIndex: playerIndex,
            ratingType: "harm-intention", // Use this type for tracking completion
            ratings: [], // Empty ratings, just tracking completion
            additionalFeedback: `Survey completion marker: ${args.completionType}`,
            timestamp: Date.now(),
        });

        return null;
    },
});

// Check if all human players have completed their surveys
export const checkSurveyCompletion = query({
    args: {
        gameId: v.id("games"),
        completionType: v.union(
            v.literal("harm-intention-completed"),
            v.literal("all-surveys-completed"),
            v.literal("extra-reward-distribution-completed")
        ),
    },
    returns: v.object({
        allCompleted: v.boolean(),
        completedPlayers: v.array(v.number()),
        humanPlayerIndices: v.array(v.number()),
        hasReplacedPlayers: v.boolean(),
        replacedPlayerIndices: v.array(v.number()),
    }),
    handler: async (ctx, args) => {
        // Get the game 
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            throw new Error("Game not found");
        }

        // Get all players from both teams
        const allPlayers = [...game.team1, ...game.team2];

        // Find human players by looking at original players and current teams
        // Start with original human players
        const originalPlayers = game.originalPlayers || [];
        let humanPlayerIndices: number[] = [];

        // Find indices of original human players who are still in the game or have been replaced
        for (let i = 0; i < allPlayers.length; i++) {
            const playerId = allPlayers[i];

            // Check if this position had an original human player
            const isOriginalHuman = originalPlayers.includes(playerId);

            // Check if this position has a replaced player (meaning it was originally human)
            const wasReplaced = game.replacedPlayers?.some(rp => rp.playerIndex === i) || false;

            // Check if current player is human (not a bot)
            const isCurrentlyHuman = typeof playerId === "string" &&
                !playerId.startsWith("bot") &&
                playerId !== "bot1" &&
                playerId !== "bot2" &&
                playerId !== "bot3";

            if (isOriginalHuman || wasReplaced || isCurrentlyHuman) {
                humanPlayerIndices.push(i);
            }
        }

        // If we couldn't determine human players from the above logic, fall back to default indices
        if (humanPlayerIndices.length === 0) {
            humanPlayerIndices = [0, 2]; // Default assumption: players 0 and 2 are humans
        }

        // Get replaced player information
        const replacedPlayers = game.replacedPlayers || [];
        const replacedPlayerIndices = replacedPlayers.map(rp => rp.playerIndex);
        const hasReplacedPlayers = replacedPlayerIndices.length > 0;

        // Get survey ratings to check completion
        const surveyRatings = await ctx.db
            .query("surveyRatings")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();

        // Find completion markers
        const completionMarkers = surveyRatings.filter(rating =>
            rating.additionalFeedback?.includes(`Survey completion marker: ${args.completionType}`)
        );

        // Get player indices who have completed
        const completedPlayers = completionMarkers.map(marker => marker.raterPlayerIndex);

        // Check if all human players have completed
        const allCompleted = humanPlayerIndices.every(humanIndex =>
            completedPlayers.includes(humanIndex)
        );

        return {
            allCompleted,
            completedPlayers,
            humanPlayerIndices,
            hasReplacedPlayers,
            replacedPlayerIndices,
        };
    },
});

// Initialize form progress for a player
export const initializeFormProgress = mutation({
    args: {
        gameId: v.id("games"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to initialize form progress");
        }

        // Get the game to verify access and get player data
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            throw new Error("Game not found");
        }

        // Get all players from both teams
        const allPlayers = [...game.team1, ...game.team2];

        // Find the player's index
        const playerIndex = allPlayers.findIndex(playerId => playerId === userId);
        if (playerIndex === -1) {
            throw new Error("You are not a player in this game");
        }

        // Check if progress already exists
        const existingProgress = await ctx.db
            .query("formProgress")
            .withIndex("by_player", (q) => q.eq("playerId", userId))
            .filter((q) => q.eq(q.field("gameId"), args.gameId))
            .first();

        if (!existingProgress) {
            // Create initial progress record
            await ctx.db.insert("formProgress", {
                gameId: args.gameId,
                playerId: userId,
                playerIndex,
                completedSteps: [],
                currentStep: 0,
                lastUpdated: Date.now(),
            });
        }

        return null;
    },
});

// Get current form progress for a player
export const getFormProgress = query({
    args: {
        gameId: v.id("games"),
    },
    returns: v.union(
        v.object({
            completedSteps: v.array(v.union(
                v.literal("team-reward-distribution"),
                v.literal("other-team-distribution"),
                v.literal("overall-performance"),
                v.literal("competitiveness"),
                v.literal("collaboration"),
                v.literal("harm-intention"),
                v.literal("waiting"),
                v.literal("results"),
                v.literal("demographics")
            )),
            currentStep: v.number(),
            lastUpdated: v.number(),
        }),
        v.null()
    ),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return null;
        }

        // Get progress for this player and game
        const progress = await ctx.db
            .query("formProgress")
            .withIndex("by_player", (q) => q.eq("playerId", userId))
            .filter((q) => q.eq(q.field("gameId"), args.gameId))
            .first();

        if (!progress) {
            return null;
        }

        return {
            completedSteps: progress.completedSteps,
            currentStep: progress.currentStep,
            lastUpdated: progress.lastUpdated,
        };
    },
});

// Update form progress when a step is completed
export const updateFormProgress = mutation({
    args: {
        gameId: v.id("games"),
        stepCompleted: v.union(
            v.literal("team-reward-distribution"),
            v.literal("other-team-distribution"),
            v.literal("overall-performance"),
            v.literal("competitiveness"),
            v.literal("collaboration"),
            v.literal("harm-intention"),
            v.literal("waiting"),
            v.literal("results"),
            v.literal("demographics")
        ),
        newCurrentStep: v.number(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to update form progress");
        }

        // Get existing progress
        const existingProgress = await ctx.db
            .query("formProgress")
            .withIndex("by_player", (q) => q.eq("playerId", userId))
            .filter((q) => q.eq(q.field("gameId"), args.gameId))
            .first();

        if (!existingProgress) {
            throw new Error("Form progress not found. Please initialize first.");
        }

        // Add the completed step if not already in the list
        const updatedCompletedSteps = [...existingProgress.completedSteps];
        if (!updatedCompletedSteps.includes(args.stepCompleted)) {
            updatedCompletedSteps.push(args.stepCompleted);
        }

        // Update progress
        await ctx.db.patch(existingProgress._id, {
            completedSteps: updatedCompletedSteps,
            currentStep: args.newCurrentStep,
            lastUpdated: Date.now(),
        });

        return null;
    },
});

// Mark completion for replaced players - add this new internal mutation
export const markCompletionForReplacedPlayers = internalMutation({
    args: {
        gameId: v.id("games"),
        completionType: v.union(
            v.literal("harm-intention-completed"),
            v.literal("all-surveys-completed"),
            v.literal("extra-reward-distribution-completed")
        ),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            return null;
        }

        // Get replaced players
        const replacedPlayers = game.replacedPlayers || [];

        // Get existing completion markers to avoid duplicates
        const existingMarkers = await ctx.db
            .query("surveyRatings")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .filter((q) => q.eq(q.field("additionalFeedback"), `Survey completion marker: ${args.completionType}`))
            .collect();

        const existingCompletedIndices = new Set(existingMarkers.map(marker => marker.raterPlayerIndex));

        // Mark completion for each replaced player who hasn't been marked yet
        for (const replacedPlayer of replacedPlayers) {
            const playerIndex = replacedPlayer.playerIndex;

            // Skip if already marked as completed
            if (existingCompletedIndices.has(playerIndex)) {
                continue;
            }

            // Create completion marker for this replaced player
            await ctx.db.insert("surveyRatings", {
                gameId: args.gameId,
                raterPlayerId: replacedPlayer.replacementBotId,
                raterPlayerIndex: playerIndex,
                ratingType: "harm-intention", // Use this type for tracking completion
                ratings: [], // Empty ratings, just tracking completion
                additionalFeedback: `Survey completion marker: ${args.completionType}`,
                timestamp: Date.now(),
            });
        }

        return null;
    },
});

// Public wrapper for marking completion for replaced players
export const markCompletionForReplacedPlayersPublic = mutation({
    args: {
        gameId: v.id("games"),
        completionType: v.union(
            v.literal("harm-intention-completed"),
            v.literal("all-surveys-completed"),
            v.literal("extra-reward-distribution-completed")
        ),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to mark completion for replaced players");
        }

        // Verify user is part of this game
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            throw new Error("Game not found");
        }

        const allPlayers = [...game.team1, ...game.team2];
        const originalPlayers = game.originalPlayers || [];

        if (!allPlayers.includes(userId) && !originalPlayers.includes(userId)) {
            throw new Error("You are not authorized to modify this game");
        }

        // Call the internal mutation
        await ctx.runMutation(internal.game.markCompletionForReplacedPlayers, args);
        return null;
    },
});

export const confirmReady = mutation({
    args: {
        gameId: v.id("games"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated");
        }

        const game = await ctx.db.get(args.gameId);
        if (!game || game.status !== "matched") {
            throw new Error("Game not in matched state");
        }

        // Check if user is part of this game
        const allPlayers = [...game.team1, ...game.team2];
        if (!allPlayers.includes(userId)) {
            throw new Error("User not part of this game");
        }

        // Update player ready state
        const playersReady = (game.playersReady || []).map(playerReady =>
            playerReady.playerId === userId
                ? { ...playerReady, isReady: true, readyAt: Date.now() }
                : playerReady
        );

        await ctx.db.patch(args.gameId, {
            playersReady,
        });

        // Check if both players are ready
        const allReady = playersReady.every(p => p.isReady);
        if (allReady) {
            // Start the game
            const countdownDuration = 4000;
            const countdownStartTime = Date.now();

            await ctx.db.patch(args.gameId, {
                status: "active",
                countdownStartTime,
                countdownDuration,
                turnStartTime: undefined, // Wait for countdown to finish
            });

            // Schedule the start of the first turn after the countdown
            await ctx.scheduler.runAfter(countdownDuration, internal.game.startFirstTurnAfterCountdown, {
                gameId: args.gameId,
            });

            // Start monitoring player activity
            await ctx.scheduler.runAfter(30000, internal.game.checkPlayerActivity, {
                gameId: args.gameId,
            });
        }
    },
});

// Save demographics survey responses
export const saveDemographics = mutation({
    args: {
        gameId: v.id("games"),
        ageGroup: v.string(),
        gender: v.string(),
        ethnicBackground: v.string(),
        educationLevel: v.string(),
        politicalView: v.string(),
        religion: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to save demographics");
        }

        // Get the game to verify access and get player data
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            throw new Error("Game not found");
        }

        // Get all players from both teams
        const allPlayers = [...game.team1, ...game.team2];

        // Find the player's index
        const playerIndex = allPlayers.findIndex(playerId => playerId === userId);
        if (playerIndex === -1) {
            throw new Error("You are not a player in this game");
        }

        // Validate required fields
        if (!args.ageGroup || !args.gender || !args.ethnicBackground ||
            !args.educationLevel || !args.politicalView || !args.religion) {
            throw new Error("All demographic fields are required");
        }

        try {
            // Check if demographics already exist for this player and game
            const existingDemographics = await ctx.db
                .query("demographics")
                .withIndex("by_player", (q) => q.eq("playerId", userId))
                .filter((q) => q.eq(q.field("gameId"), args.gameId))
                .first();

            if (existingDemographics) {
                // Update existing demographics
                await ctx.db.patch(existingDemographics._id, {
                    ageGroup: args.ageGroup,
                    gender: args.gender,
                    ethnicBackground: args.ethnicBackground,
                    educationLevel: args.educationLevel,
                    politicalView: args.politicalView,
                    religion: args.religion,
                    timestamp: Date.now(),
                });
            } else {
                // Save new demographics to the database
                await ctx.db.insert("demographics", {
                    gameId: args.gameId,
                    playerId: userId,
                    playerIndex,
                    ageGroup: args.ageGroup,
                    gender: args.gender,
                    ethnicBackground: args.ethnicBackground,
                    educationLevel: args.educationLevel,
                    politicalView: args.politicalView,
                    religion: args.religion,
                    timestamp: Date.now(),
                });
            }

            return null;
        } catch (dbError) {
            console.error("Database error in saveDemographics:", dbError);
            throw new Error(`Failed to save demographics: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`);
        }
    },
});

// Get demographics data for a game
export const getDemographics = query({
    args: {
        gameId: v.id("games"),
    },
    returns: v.array(v.object({
        _id: v.id("demographics"),
        _creationTime: v.number(),
        gameId: v.id("games"),
        playerId: v.union(v.id("users"), v.string()),
        playerIndex: v.number(),
        ageGroup: v.string(),
        gender: v.string(),
        ethnicBackground: v.string(),
        educationLevel: v.string(),
        politicalView: v.string(),
        religion: v.string(),
        timestamp: v.number(),
    })),
    handler: async (ctx, args) => {
        const demographics = await ctx.db
            .query("demographics")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();

        return demographics;
    },
});

// Clean up stale waiting games periodically
export const cleanupStaleGames = internalAction({
    args: {},
    handler: async (ctx) => {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);

        // Get all waiting games
        const waitingGames = await ctx.runQuery(internal.game.getWaitingGames, {});

        // Find stale games to delete
        const staleGames = waitingGames.filter(game =>
            game.createdAt <= tenMinutesAgo || // older than 10 minutes
            game.team2.length > 0 || // team2 not empty (shouldn't happen for waiting games)
            !game.team1.some(playerId => playerId !== "bot1" && playerId !== "bot2" && playerId !== "bot3") // no human players
        );

        // Delete stale games
        for (const staleGame of staleGames) {
            await ctx.runMutation(internal.game.deleteStaleGame, { gameId: staleGame._id });
        }

        // Schedule next cleanup in 5 minutes
        await ctx.scheduler.runAfter(5 * 60 * 1000, internal.game.cleanupStaleGames, {});
    },
});

export const getWaitingGames = internalQuery({
    args: {},
    handler: async (ctx) => {
        return await ctx.db
            .query("games")
            .withIndex("by_status", (q) => q.eq("status", "waiting"))
            .collect();
    },
});

export const deleteStaleGame = internalMutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.gameId);
    },
});

// Manual cleanup function that can be called from the frontend
export const manualCleanupStaleGames = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to cleanup games");
        }

        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);

        // Get all waiting games
        const waitingGames = await ctx.db
            .query("games")
            .withIndex("by_status", (q) => q.eq("status", "waiting"))
            .collect();

        // Find stale games to delete
        const staleGames = waitingGames.filter(game =>
            game.createdAt <= tenMinutesAgo || // older than 10 minutes
            game.team2.length > 0 || // team2 not empty (shouldn't happen for waiting games)
            !game.team1.some(playerId => playerId !== "bot1" && playerId !== "bot2" && playerId !== "bot3") // no human players
        );

        // Delete stale games
        for (const staleGame of staleGames) {
            await ctx.db.delete(staleGame._id);
        }

        return { deletedGames: staleGames.length };
    },
});

// Handle ready confirmation timeout (10 seconds after players are matched)
export const handleReadyTimeout = internalMutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game) return;
        // Only proceed if the game is still in the matched state
        if (game.status !== "matched") return;

        const playersReady = game.playersReady || [];
        const readyPlayers = playersReady.filter((p) => p.isReady).map((p) => p.playerId);
        const unreadyPlayers = playersReady.filter((p) => !p.isReady).map((p) => p.playerId);

        // If everyone is ready, nothing to do
        if (unreadyPlayers.length === 0) {
            return;
        }

        // If no one confirmed, simply delete the game
        if (readyPlayers.length === 0) {
            await ctx.db.delete(args.gameId);
            return;
        }

        // Exactly one player (human) confirmed, move them back to the queue
        const readyPlayerId = readyPlayers[0];

        // Remove unready players (mark them disconnected first)
        for (const unreadyPlayerId of unreadyPlayers) {
            await ctx.runMutation(internal.game.markPlayerDisconnectedInternal, {
                gameId: args.gameId,
                userId: unreadyPlayerId,
                reason: "leave_game",
            });
        }

        // Re-structure the game so that the ready player is back in the queue (team1 with bot1)
        await ctx.db.patch(args.gameId, {
            team1: [readyPlayerId, "bot1"],
            team2: [],
            status: "waiting",
            playersReady: undefined,
            originalPlayers: [readyPlayerId],
            lastPlayerActivity: [{ playerId: readyPlayerId, lastSeen: Date.now(), isConnected: true }],
        });
    },
});
