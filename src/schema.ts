import { z } from "zod";
import { defineTable } from "./utils/define-table";
import { defineSchema } from "./utils/define-schema";

const schema = defineSchema({
  users: defineTable({
    deviceId: z.string(),
    autumnCustomerId: z.string().optional(),
    subscriptionTier: z.string().optional(),
    roomsCreated: z.number().optional(),
    sessionsCompleted: z.number().optional(),
    setsLogged: z.number().optional(),
    createdAt: z.number(),
  }),
});

export default schema;
