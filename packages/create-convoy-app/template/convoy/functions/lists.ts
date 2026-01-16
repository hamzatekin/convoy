import { z } from 'zod';
import { query, mutation } from '../_generated/server';
import type { Id } from '@avvos/convoy';

export const list = query({
  input: {},
  handler: async (ctx) => {
    return ctx.db.query('lists').order('desc', 'createdAt').collect();
  },
});

export const create = mutation({
  input: { name: z.string().min(1) },
  handler: async (ctx, { name }) => {
    return ctx.db.insert('lists', {
      name,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  input: { id: z.string() },
  handler: async (ctx, { id }) => {
    // Use a transaction to delete the list and all its todos atomically
    return ctx.db.transaction(async (tx) => {
      // First, get all todos for this list
      const todos = await tx
        .query('todos')
        .withIndex('by_listId', (q) => q.eq('listId', id as Id<'lists'>))
        .collect();

      // Delete all todos using deleteMany
      if (todos.length > 0) {
        const todoIds = todos.map((t) => t.id);
        await tx.deleteMany('todos', todoIds);
      }

      // Delete the list itself
      return tx.delete(id as Id<'lists'>);
    });
  },
});
