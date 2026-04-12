import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// ⚠️ IMPORTANT: Replace this with your actual email address
// This email will be the only one allowed to access the admin dashboard
const ADMIN_EMAIL = "assem@gmail.com"; // TODO: Change this to your email

// Check if the current user is an admin
export const isAdmin = query({
    args: {},
    returns: v.boolean(),
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return false;
        }

        const user = await ctx.db.get(userId);
        if (!user) {
            return false;
        }

        // In Convex Auth, email is stored in the user document
        return user.email === ADMIN_EMAIL;
    },
});

// Get all games with comprehensive statistics for admin dashboard
export const getAllGames = query({
    args: {
        limit: v.optional(v.number()),
        status: v.optional(v.union(
            v.literal("waiting"),
            v.literal("matched"),
            v.literal("active"),
            v.literal("game_finished"),
            v.literal("overtime"),
            v.literal("awaiting_form_submission"),
            v.literal("experiment_finished")
        )),
    },
    returns: v.array(v.object({
        _id: v.id("games"),
        _creationTime: v.number(),
        status: v.union(v.literal("waiting"), v.literal("matched"), v.literal("active"), v.literal("game_finished"), v.literal("overtime"), v.literal("awaiting_form_submission"), v.literal("experiment_finished")),
        currentRound: v.number(),
        currentTurn: v.number(),
        team1Score: v.number(),
        team2Score: v.number(),
        team1: v.array(v.union(v.id("users"), v.string())),
        team2: v.array(v.union(v.id("users"), v.string())),
        botStrategy: v.optional(v.union(v.literal("ingroup"), v.literal("outgroup"), v.literal("prosocial"), v.literal("antisocial"), v.literal("random"))),
        createdAt: v.number(),
        roundScores: v.array(v.object({
            team1: v.number(),
            team2: v.number(),
        })),
        originalPlayers: v.optional(v.array(v.union(v.id("users"), v.string()))),
        replacedPlayers: v.optional(v.array(v.object({
            originalPlayerId: v.union(v.id("users"), v.string()),
            replacementBotId: v.string(),
            replacedAt: v.number(),
            playerIndex: v.number(),
        }))),
        // Computed fields
        duration: v.number(),
        totalScore: v.object({
            team1: v.number(),
            team2: v.number(),
        }),
        humanPlayerCount: v.number(),
        botPlayerCount: v.number(),
        gameOutcome: v.union(v.literal("team1_wins"), v.literal("team2_wins"), v.literal("tie"), v.literal("in_progress")),
    })),
    handler: async (ctx, args) => {
        // Check admin access first
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to access admin functions");
        }

        const user = await ctx.db.get(userId);
        if (!user || user.email !== ADMIN_EMAIL) {
            throw new Error("Unauthorized: Admin access required");
        }

        // Get games with proper filtering
        let games;
        if (args.status) {
            // Filter by status using index
            games = await ctx.db
                .query("games")
                .withIndex("by_status", (q) => q.eq("status", args.status!))
                .order("desc")
                .collect();
        } else {
            // Get all games
            games = await ctx.db
                .query("games")
                .order("desc")
                .collect();
        }

        // Apply limit if provided
        if (args.limit) {
            games = games.slice(0, args.limit);
        }

        // Transform games with computed statistics
        return games.map(game => {
            // Calculate total scores across all rounds
            const totalScore = game.roundScores?.reduce(
                (acc, round) => ({
                    team1: acc.team1 + round.team1,
                    team2: acc.team2 + round.team2
                }),
                { team1: 0, team2: 0 }
            ) || { team1: game.team1Score, team2: game.team2Score };

            // Calculate game duration
            const duration = Date.now() - game.createdAt;

            // Count human vs bot players
            const allPlayers = [...game.team1, ...game.team2];
            const botPlayerCount = allPlayers.filter(playerId =>
                typeof playerId === "string" && (
                    playerId === "bot1" ||
                    playerId === "bot2" ||
                    playerId === "bot3" ||
                    playerId.startsWith("bot_replacement_")
                )
            ).length;
            const humanPlayerCount = allPlayers.length - botPlayerCount;

            // Determine game outcome
            let gameOutcome: "team1_wins" | "team2_wins" | "tie" | "in_progress";
            if (game.status === "game_finished" || game.status === "experiment_finished") {
                if (totalScore.team1 > totalScore.team2) {
                    gameOutcome = "team1_wins";
                } else if (totalScore.team2 > totalScore.team1) {
                    gameOutcome = "team2_wins";
                } else {
                    gameOutcome = "tie";
                }
            } else {
                gameOutcome = "in_progress";
            }

            return {
                _id: game._id,
                _creationTime: game._creationTime,
                status: game.status,
                currentRound: game.currentRound,
                currentTurn: game.currentTurn,
                team1Score: game.team1Score,
                team2Score: game.team2Score,
                team1: game.team1,
                team2: game.team2,
                botStrategy: game.botStrategy,
                createdAt: game.createdAt,
                roundScores: game.roundScores,
                originalPlayers: game.originalPlayers,
                replacedPlayers: game.replacedPlayers,
                // Computed fields
                duration,
                totalScore,
                humanPlayerCount,
                botPlayerCount,
                gameOutcome,
            };
        });
    },
});

// Get aggregated statistics for the admin dashboard
export const getGameStatistics = query({
    args: {},
    returns: v.object({
        totalGames: v.number(),
        gamesByStatus: v.object({
            waiting: v.number(),
            active: v.number(),
            finished: v.number(),
            overtime: v.number(),
            awaiting_form_submission: v.number(),
            experiment_finished: v.number(),
        }),
        gamesByBotStrategy: v.object({
            ingroup: v.number(),
            outgroup: v.number(),
            prosocial: v.number(),
            antisocial: v.number(),
            random: v.number(),
            unknown: v.number(),
        }),
        gamesByOutcome: v.object({
            team1_wins: v.number(),
            team2_wins: v.number(),
            tie: v.number(),
            in_progress: v.number(),
        }),
        averageGameDuration: v.number(),
        totalHumanPlayers: v.number(),
        totalBotPlayers: v.number(),
        gamesWithReplacements: v.number(),
        recentActivity: v.object({
            gamesLast24h: v.number(),
            gamesLast7d: v.number(),
            gamesLast30d: v.number(),
        }),
    }),
    handler: async (ctx) => {
        // Check admin access first
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to access admin functions");
        }

        const user = await ctx.db.get(userId);
        if (!user || user.email !== ADMIN_EMAIL) {
            throw new Error("Unauthorized: Admin access required");
        }

        // Get all games
        const allGames = await ctx.db.query("games").collect();

        // Calculate basic statistics
        const totalGames = allGames.length;

        // Count games by status
        const gamesByStatus = {
            waiting: 0,
            active: 0,
            finished: 0,
            overtime: 0,
            awaiting_form_submission: 0,
            experiment_finished: 0,
        };

        // Count games by bot strategy
        const gamesByBotStrategy = {
            ingroup: 0,
            outgroup: 0,
            prosocial: 0,
            antisocial: 0,
            random: 0,
            unknown: 0,
        };

        // Count games by outcome
        const gamesByOutcome = {
            team1_wins: 0,
            team2_wins: 0,
            tie: 0,
            in_progress: 0,
        };

        let totalDuration = 0;
        let finishedGamesCount = 0;
        let totalHumanPlayers = 0;
        let totalBotPlayers = 0;
        let gamesWithReplacements = 0;

        // Time boundaries for recent activity
        const now = Date.now();
        const day24h = 24 * 60 * 60 * 1000;
        const day7d = 7 * day24h;
        const day30d = 30 * day24h;

        let gamesLast24h = 0;
        let gamesLast7d = 0;
        let gamesLast30d = 0;

        for (const game of allGames) {
            // Count by status
            // Map "game_finished" to "finished" for status counting
            const statusKey = game.status === "game_finished" ? "finished" : game.status;
            if (statusKey in gamesByStatus) {
                gamesByStatus[statusKey as keyof typeof gamesByStatus]++;
            }

            // Count by bot strategy
            if (game.botStrategy) {
                gamesByBotStrategy[game.botStrategy]++;
            } else {
                gamesByBotStrategy.unknown++;
            }

            // Calculate game outcome
            const totalScore = game.roundScores?.reduce(
                (acc, round) => ({
                    team1: acc.team1 + round.team1,
                    team2: acc.team2 + round.team2
                }),
                { team1: 0, team2: 0 }
            ) || { team1: game.team1Score, team2: game.team2Score };

            if (game.status === "game_finished" || game.status === "experiment_finished") {
                if (totalScore.team1 > totalScore.team2) {
                    gamesByOutcome.team1_wins++;
                } else if (totalScore.team2 > totalScore.team1) {
                    gamesByOutcome.team2_wins++;
                } else {
                    gamesByOutcome.tie++;
                }

                // Calculate duration for finished games
                totalDuration += now - game.createdAt;
                finishedGamesCount++;
            } else {
                gamesByOutcome.in_progress++;
            }

            // Count players
            const allPlayers = [...game.team1, ...game.team2];
            const botCount = allPlayers.filter(playerId =>
                typeof playerId === "string" && (
                    playerId === "bot1" ||
                    playerId === "bot2" ||
                    playerId === "bot3" ||
                    playerId.startsWith("bot_replacement_")
                )
            ).length;

            totalBotPlayers += botCount;
            totalHumanPlayers += allPlayers.length - botCount;

            // Count games with replacements
            if (game.replacedPlayers && game.replacedPlayers.length > 0) {
                gamesWithReplacements++;
            }

            // Count recent activity
            const gameAge = now - game.createdAt;
            if (gameAge <= day24h) gamesLast24h++;
            if (gameAge <= day7d) gamesLast7d++;
            if (gameAge <= day30d) gamesLast30d++;
        }

        const averageGameDuration = finishedGamesCount > 0 ? totalDuration / finishedGamesCount : 0;

        return {
            totalGames,
            gamesByStatus,
            gamesByBotStrategy,
            gamesByOutcome,
            averageGameDuration,
            totalHumanPlayers,
            totalBotPlayers,
            gamesWithReplacements,
            recentActivity: {
                gamesLast24h,
                gamesLast7d,
                gamesLast30d,
            },
        };
    },
});

// Get detailed game actions for a specific game (for admin analysis)
export const getGameDetails = query({
    args: {
        gameId: v.id("games"),
    },
    returns: v.union(
        v.object({
            game: v.any(), // Simplified to avoid validator mismatch
            actions: v.array(v.any()), // Simplified to avoid validator mismatch
            distributions: v.array(v.any()), // Simplified to avoid validator mismatch
            surveyRatings: v.array(v.any()), // Simplified to avoid validator mismatch
        }),
        v.null()
    ),
    handler: async (ctx, args) => {
        // Check admin access first
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to access admin functions");
        }

        const user = await ctx.db.get(userId);
        if (!user || user.email !== ADMIN_EMAIL) {
            throw new Error("Unauthorized: Admin access required");
        }

        // Get the game
        const game = await ctx.db.get(args.gameId);
        if (!game) {
            return null;
        }

        // Get all game actions
        const actions = await ctx.db
            .query("gameActions")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();

        // Get distributions
        const distributions = await ctx.db
            .query("distributions")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();

        // Get survey ratings
        const surveyRatings = await ctx.db
            .query("surveyRatings")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();

        return {
            game,
            actions,
            distributions,
            surveyRatings,
        };
    },
});

export const clearAllGames = mutation({
    args: {},
    returns: v.null(),
    handler: async (ctx) => {
        // Check admin access first
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to access admin functions");
        }

        const user = await ctx.db.get(userId);
        if (!user || user.email !== ADMIN_EMAIL) {
            throw new Error("Unauthorized: Admin access required");
        }

        // Clear all games
        const games = await ctx.db.query("games").collect();
        for (const game of games) {
            await ctx.db.delete(game._id);
        }

        // Clear related data
        const gameActions = await ctx.db.query("gameActions").collect();
        for (const action of gameActions) {
            await ctx.db.delete(action._id);
        }

        const distributions = await ctx.db.query("distributions").collect();
        for (const distribution of distributions) {
            await ctx.db.delete(distribution._id);
        }

        const surveyRatings = await ctx.db.query("surveyRatings").collect();
        for (const rating of surveyRatings) {
            await ctx.db.delete(rating._id);
        }

        const formProgress = await ctx.db.query("formProgress").collect();
        for (const progress of formProgress) {
            await ctx.db.delete(progress._id);
        }

        return null;
    },
});

export const resetGame = mutation({
    args: { gameId: v.id("games") },
    returns: v.null(),
    handler: async (ctx, args) => {
        // Check admin access
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated");
        }

        const user = await ctx.db.get(userId);
        if (!user || user.email !== ADMIN_EMAIL) {
            throw new Error("Unauthorized: Admin access required");
        }

        // Delete the game and related data
        await ctx.db.delete(args.gameId);

        // Clean up related records
        const gameActions = await ctx.db
            .query("gameActions")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();

        for (const action of gameActions) {
            await ctx.db.delete(action._id);
        }

        return null;
    },
});

// Get all user profiles for admin analysis
export const getAllUserProfiles = query({
    args: {},
    returns: v.array(v.object({
        _id: v.id("userProfiles"),
        userId: v.id("users"),
        prolificId: v.optional(v.string()),
        studyId: v.optional(v.string()),
        sessionId: v.optional(v.string()),
        referralSource: v.optional(v.string()),
        sessionData: v.optional(v.any()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })),
    handler: async (ctx) => {
        // Check admin access
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to access admin functions");
        }

        const user = await ctx.db.get(userId);
        if (!user || user.email !== ADMIN_EMAIL) {
            throw new Error("Unauthorized: Admin access required");
        }

        return await ctx.db.query("userProfiles").collect();
    },
});

// Get user profile by prolific ID (admin function)
export const getUserByProlificId = query({
    args: { prolificId: v.string() },
    returns: v.union(v.object({
        profile: v.object({
            _id: v.id("userProfiles"),
            userId: v.id("users"),
            prolificId: v.optional(v.string()),
            studyId: v.optional(v.string()),
            sessionId: v.optional(v.string()),
            referralSource: v.optional(v.string()),
            sessionData: v.optional(v.any()),
            createdAt: v.number(),
            updatedAt: v.number(),
        }),
        user: v.object({
            _id: v.id("users"),
            _creationTime: v.number(),
            email: v.optional(v.string()),
            name: v.optional(v.string()),
            isAnonymous: v.optional(v.boolean()),
        }),
    }), v.null()),
    handler: async (ctx, args) => {
        // Check admin access
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to access admin functions");
        }

        const user = await ctx.db.get(userId);
        if (!user || user.email !== ADMIN_EMAIL) {
            throw new Error("Unauthorized: Admin access required");
        }

        const profile = await ctx.db
            .query("userProfiles")
            .withIndex("by_prolific_id", (q) => q.eq("prolificId", args.prolificId))
            .first();

        if (!profile) {
            return null;
        }

        const userData = await ctx.db.get(profile.userId);
        if (!userData) {
            return null;
        }

        return {
            profile,
            user: userData,
        };
    },
});

// Get user profiles by study ID (admin function)
export const getUsersByStudyId = query({
    args: { studyId: v.string() },
    returns: v.array(v.object({
        profile: v.object({
            _id: v.id("userProfiles"),
            userId: v.id("users"),
            prolificId: v.optional(v.string()),
            studyId: v.optional(v.string()),
            sessionId: v.optional(v.string()),
            referralSource: v.optional(v.string()),
            sessionData: v.optional(v.any()),
            createdAt: v.number(),
            updatedAt: v.number(),
        }),
        user: v.object({
            _id: v.id("users"),
            _creationTime: v.number(),
            email: v.optional(v.string()),
            name: v.optional(v.string()),
            isAnonymous: v.optional(v.boolean()),
        }),
    })),
    handler: async (ctx, args) => {
        // Check admin access
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to access admin functions");
        }

        const user = await ctx.db.get(userId);
        if (!user || user.email !== ADMIN_EMAIL) {
            throw new Error("Unauthorized: Admin access required");
        }

        const profiles = await ctx.db
            .query("userProfiles")
            .withIndex("by_study_id", (q) => q.eq("studyId", args.studyId))
            .collect();

        const results = [];
        for (const profile of profiles) {
            const userData = await ctx.db.get(profile.userId);
            if (userData) {
                results.push({
                    profile,
                    user: userData,
                });
            }
        }

        return results;
    },
});

// Get user profile by session ID (admin function)
export const getUserBySessionId = query({
    args: { sessionId: v.string() },
    returns: v.union(v.object({
        profile: v.object({
            _id: v.id("userProfiles"),
            userId: v.id("users"),
            prolificId: v.optional(v.string()),
            studyId: v.optional(v.string()),
            sessionId: v.optional(v.string()),
            referralSource: v.optional(v.string()),
            sessionData: v.optional(v.any()),
            createdAt: v.number(),
            updatedAt: v.number(),
        }),
        user: v.object({
            _id: v.id("users"),
            _creationTime: v.number(),
            email: v.optional(v.string()),
            name: v.optional(v.string()),
            isAnonymous: v.optional(v.boolean()),
        }),
    }), v.null()),
    handler: async (ctx, args) => {
        // Check admin access
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Must be authenticated to access admin functions");
        }

        const user = await ctx.db.get(userId);
        if (!user || user.email !== ADMIN_EMAIL) {
            throw new Error("Unauthorized: Admin access required");
        }

        const profile = await ctx.db
            .query("userProfiles")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .first();

        if (!profile) {
            return null;
        }

        const userData = await ctx.db.get(profile.userId);
        if (!userData) {
            return null;
        }

        return {
            profile,
            user: userData,
        };
    },
}); 