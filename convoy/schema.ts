import { z } from "zod";
import { defineSchema, defineTable } from "convoy";

const schema = defineSchema({
  users: defineTable({
    deviceId: z.string(),
    createdAt: z.number(),
  }),
});

export default schema;
