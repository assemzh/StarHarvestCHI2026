import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  games: defineTable({
    status: v.union(v.literal("waiting"), v.literal("matched"), v.literal("active"), v.literal("game_finished"), v.literal("overtime"), v.literal("awaiting_form_submission"), v.literal("experiment_finished")),
    currentRound: v.number(),
    currentTurn: v.number(),
    currentPlayer: v.number(), // 0-3 for player index
    turnsRemaining: v.number(),
    team1: v.array(v.union(v.id("users"), v.string())),
    team2: v.array(v.union(v.id("users"), v.string())),
    team1Score: v.number(),
    team2Score: v.number(),
    roundScores: v.array(v.object({
      team1: v.number(),
      team2: v.number(),
    })),
    grid: v.array(v.array(v.union(v.literal("empty"), v.literal("star")))),
    playerPositions: v.array(v.object({
      x: v.number(),
      y: v.number(),
    })),
    playerLocks: v.optional(v.array(v.object({
      isLocked: v.boolean(),
      turnsRemaining: v.number(),
    }))),
    // New field for tracking consecutive missed turns
    playerTurnTracking: v.optional(v.array(v.object({
      consecutiveMissedTurns: v.number(),
      lastTurnTaken: v.number(),
    }))),
    stars: v.optional(v.array(v.object({
      x: v.number(),
      y: v.number(),
      turnsAlive: v.number(),
    }))),
    turnsSinceLastStar: v.optional(v.number()),
    turnStartTime: v.optional(v.number()),
    createdAt: v.number(),
    // Player replacement tracking
    originalPlayers: v.optional(v.array(v.union(v.id("users"), v.string()))), // Track original human players
    replacedPlayers: v.optional(v.array(v.object({
      originalPlayerId: v.union(v.id("users"), v.string()),
      replacementBotId: v.string(),
      replacedAt: v.number(),
      playerIndex: v.number(),
    }))),
    // Enhanced activity tracking
    lastPlayerActivity: v.optional(v.array(v.object({
      playerId: v.union(v.id("users"), v.string()),
      lastSeen: v.number(),
      isConnected: v.boolean(),
      disconnectionReason: v.optional(v.union(v.literal("leave_game"), v.literal("sign_out"), v.literal("window_close"))),
    }))),
    // Bot strategy information
    botStrategy: v.optional(v.union(v.literal("ingroup"), v.literal("outgroup"), v.literal("prosocial"), v.literal("antisocial"), v.literal("random"))),
    botCondition: v.optional(v.union(v.literal("aware"), v.literal("unaware"))),
    // Player ready states for matched games
    playersReady: v.optional(v.array(v.object({
      playerId: v.union(v.id("users"), v.string()),
      isReady: v.boolean(),
      readyAt: v.optional(v.number()),
    }))),
    // Resting state management
    isResting: v.optional(v.boolean()),
    restingPhaseEndTime: v.optional(v.number()),
    countdownStartTime: v.optional(v.number()), // For round start countdown overlay
    countdownDuration: v.optional(v.number()), // Duration in ms
  }).index("by_status", ["status"]),

  gameActions: defineTable({
    gameId: v.id("games"),
    playerId: v.union(v.id("users"), v.string()), // Allow both user IDs and bot strings
    action: v.union(v.literal("move"), v.literal("harvest"), v.literal("lock"), v.literal("unlock"), v.literal("locked"), v.literal("timeout"), v.literal("disconnected"), v.literal("replaced")),
    fromX: v.number(),
    fromY: v.number(),
    toX: v.optional(v.number()),
    toY: v.optional(v.number()),
    direction: v.optional(v.union(v.literal("up"), v.literal("down"), v.literal("left"), v.literal("right"))),
    targetPlayer: v.optional(v.number()),
    result: v.optional(v.union(v.literal("harvested"), v.literal("unlocked"), v.literal("locked"), v.literal("missed"), v.literal("harvested_overtime_win"))),
    starPositions: v.optional(v.array(v.object({
      x: v.number(),
      y: v.number(),
      turnsAlive: v.number(),
    }))),
    round: v.number(),
    turn: v.number(),
    timestamp: v.number(),
    // Additional fields for replacement tracking
    replacementInfo: v.optional(v.object({
      originalPlayerId: v.union(v.id("users"), v.string()),
      replacementBotId: v.string(),
      reason: v.union(v.literal("disconnection"), v.literal("timeout"), v.literal("immediate_disconnection")),
    })),
  }).index("by_game", ["gameId"])
    .index("by_game_round", ["gameId", "round"]),

  distributions: defineTable({
    gameId: v.id("games"),
    distributorPlayerId: v.union(v.id("users"), v.string()), // Who is distributing the points
    distributorPlayerIndex: v.number(), // 0-3 for the player index
    isWinner: v.boolean(), // Whether the distributor was on the winning team
    isTeamReward: v.boolean(), // true if distributing to own team, false if to other team
    distributions: v.array(v.object({
      recipientPlayerIndex: v.number(), // 0-3 for recipient player index
      recipientPlayerId: v.union(v.id("users"), v.string()), // The recipient's ID
      pointsGiven: v.number(), // How many points were given
    })),
    totalPointsAvailable: v.number(), // Total points that could be distributed (20 or 10)
    totalPointsDistributed: v.number(), // How many points were actually distributed
    distributionType: v.union(
      v.literal("winner_team_reward"), // Winner distributing to own team (20 points)
      v.literal("winner_other_team"), // Winner distributing to other team (10 points) 
      v.literal("loser_team_reward"), // Loser distributing to own team (10 points)
      v.literal("loser_other_team") // Loser giving to winners (20 points)
    ),
    timestamp: v.number(), // When the distribution was made
  }).index("by_game", ["gameId"])
    .index("by_distributor", ["distributorPlayerId"]),

  surveyRatings: defineTable({
    gameId: v.id("games"),
    raterPlayerId: v.union(v.id("users"), v.string()), // Who is providing the ratings
    raterPlayerIndex: v.number(), // 0-3 for the rater's player index
    ratingType: v.union(
      v.literal("overall-performance"),
      v.literal("competitiveness"),
      v.literal("collaboration"),
      v.literal("harm-intention"),
      v.literal("fairness"),
      v.literal("generosity")
    ),
    ratings: v.array(v.object({
      targetPlayerIndex: v.number(), // 0-3 for the player being rated
      targetPlayerId: v.union(v.id("users"), v.string()), // The player being rated
      rating: v.string(), // The rating value (e.g., "Very good", "Fair", etc.)
    })),
    additionalFeedback: v.optional(v.string()), // For open-ended questions like "Why do you think this user made such distribution?"
    timestamp: v.number(), // When the ratings were submitted
  }).index("by_game", ["gameId"])
    .index("by_rater", ["raterPlayerId"])
    .index("by_rating_type", ["ratingType"]),

  formProgress: defineTable({
    gameId: v.id("games"),
    playerId: v.union(v.id("users"), v.string()), // The player whose progress is being tracked
    playerIndex: v.number(), // 0-3 for the player index
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
    currentStep: v.number(), // Current step index (0-based)
    lastUpdated: v.number(), // Timestamp of last update
  }).index("by_game", ["gameId"])
    .index("by_player", ["playerId"]),

  demographics: defineTable({
    gameId: v.id("games"),
    playerId: v.union(v.id("users"), v.string()), // The player providing demographics
    playerIndex: v.number(), // 0-3 for the player index
    ageGroup: v.string(), // e.g., "18-24", "25-34", etc.
    gender: v.string(), // e.g., "Male", "Female", "Other", "Prefer not to say"
    ethnicBackground: v.string(), // e.g., "White/Caucasian", "Black/African American", etc.
    educationLevel: v.string(), // e.g., "Bachelor's degree", "High school diploma/GED", etc.
    politicalView: v.string(), // e.g., "Liberal", "Conservative", "Moderate", etc.
    religion: v.string(), // e.g., "Christianity", "Islam", "Other", "Prefer not to say"
    timestamp: v.number(), // When the demographics were submitted
  }).index("by_game", ["gameId"])
    .index("by_player", ["playerId"]),

  userProfiles: defineTable({
    userId: v.id("users"), // Link to the authenticated user
    prolificId: v.optional(v.string()), // The PROLIFIC_PID parameter from URL
    studyId: v.optional(v.string()), // The STUDY_ID parameter from URL
    sessionId: v.optional(v.string()), // The SESSION_ID parameter from URL
    createdAt: v.number(), // When the profile was created
    updatedAt: v.number(), // When the profile was last updated
    // Add other URL parameters or user metadata here as needed
    referralSource: v.optional(v.string()), // Could store utm_source or other tracking info
    sessionData: v.optional(v.any()), // Store any additional session information
    botCondition: v.optional(v.union(v.literal("aware"), v.literal("unaware"))),
  }).index("by_user", ["userId"])
    .index("by_prolific_id", ["prolificId"])
    .index("by_study_id", ["studyId"])
    .index("by_session_id", ["sessionId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
