import { z } from "zod";
import { defineSchema, defineTable, defineRef } from "../../src/index.ts";

const ProjectStatus = z.enum(["planning", "active", "blocked", "done"]);
const TaskStatus = z.enum(["todo", "in_progress", "done"]);
const TaskPriority = z.enum(["low", "medium", "high"]);

const schema = defineSchema({
  users: defineTable({
    deviceId: z.string(),
    createdAt: z.number(),
  }),
  projects: defineTable({
    name: z.string(),
    userId: defineRef("users"),
    status: ProjectStatus,
    description: z.string().optional(),
    createdAt: z.number(),
  }).index("by_userId", ["userId"]),
  projectDetails: defineTable({
    description: z.string(),
    projectId: defineRef("projects"),
    testField: z.string(),
    createdAt: z.number(),
  }).index("by_projectId", ["projectId"]),
  tasks: defineTable({
    projectId: defineRef("projects"),
    title: z.string(),
    status: TaskStatus,
    priority: TaskPriority,
    createdAt: z.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_status", ["status"]),
});

export default schema;
