import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Anonymous],
});

export const loggedInUser = query({
  args: {},
  returns: v.union(v.object({
    _id: v.id("users"),
    _creationTime: v.number(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
  }), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    return user;
  },
});

// Create or update user profile with URL parameters
export const saveUserProfile = mutation({
  args: {
    prolificId: v.optional(v.string()),
    studyId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    sessionData: v.optional(v.any()),
    botCondition: v.optional(v.union(v.literal("aware"), v.literal("unaware"))),
  },
  returns: v.id("userProfiles"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated to save user profile");
    }

    // Check if profile already exists
    const existingProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();

    if (existingProfile) {
      // Update existing profile
      await ctx.db.patch(existingProfile._id, {
        prolificId: args.prolificId,
        studyId: args.studyId,
        sessionId: args.sessionId,
        referralSource: args.referralSource,
        sessionData: args.sessionData,
        botCondition: args.botCondition,
        updatedAt: now,
      });
      return existingProfile._id;
    } else {
      // Create new profile
      return await ctx.db.insert("userProfiles", {
        userId,
        prolificId: args.prolificId,
        studyId: args.studyId,
        sessionId: args.sessionId,
        referralSource: args.referralSource,
        sessionData: args.sessionData,
        botCondition: args.botCondition,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Get user profile
export const getUserProfile = query({
  args: {},
  returns: v.union(v.object({
    _id: v.id("userProfiles"),
    _creationTime: v.number(),
    userId: v.id("users"),
    prolificId: v.optional(v.string()),
    studyId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    sessionData: v.optional(v.any()),
    botCondition: v.optional(v.union(v.literal("aware"), v.literal("unaware"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    return await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

// Get user profile by prolific ID (useful for admin queries)
export const getUserByProlificId = query({
  args: { prolificId: v.string() },
  returns: v.union(v.object({
    _id: v.id("userProfiles"),
    _creationTime: v.number(),
    userId: v.id("users"),
    prolificId: v.optional(v.string()),
    studyId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    sessionData: v.optional(v.any()),
    botCondition: v.optional(v.union(v.literal("aware"), v.literal("unaware"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_prolific_id", (q) => q.eq("prolificId", args.prolificId))
      .first();
  },
});
