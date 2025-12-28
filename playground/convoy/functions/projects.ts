import { defineRef } from "../../../src/index.ts";
import { mutation, query } from "../_generated/server";
import { z } from "zod";

export const createProject = mutation({
  args: { userId: defineRef("users"), name: z.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("projects", {
      name: args.name,
      userId: args.userId,
      createdAt: Date.now(),
    });
  },
});

export const listProjects = query({
  args: { userId: defineRef("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc", "createdAt")
      .collect();
  },
});
