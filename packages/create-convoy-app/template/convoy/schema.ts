import { z } from 'zod';
import { defineSchema, defineTable, defineRef } from '@avvos/convoy';

const schema = defineSchema({
  lists: defineTable({
    name: z.string(),
    createdAt: z.number(),
  }),
  todos: defineTable({
    listId: defineRef('lists'),
    text: z.string(),
    completed: z.boolean(),
    createdAt: z.number(),
  }).index('by_listId', ['listId']),
});

export default schema;
