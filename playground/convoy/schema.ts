import { z } from "zod";
import { defineSchema, defineTable, defineRef } from "../../src/index.ts";

const schema = defineSchema({
  users: defineTable({
    deviceId: z.string(),
    createdAt: z.number(),
  }),
  projects: defineTable({
    name: z.string(),
    userId: defineRef("users"),
    createdAt: z.number(),
  }).index("by_userId", ["userId"]),
  projectDetails: defineTable({
    description: z.string(),
    projectId: defineRef("projects"),
    testField: z.string(),
    createdAt: z.number(),
  }).index("by_projectId", ["projectId"]),
});

export default schema;
