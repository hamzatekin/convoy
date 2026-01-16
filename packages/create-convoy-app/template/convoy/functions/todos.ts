import { z } from 'zod';
import { defineRef } from '@avvos/convoy';
import { query, mutation } from '../_generated/server';

export const list = query({
  input: {
    listId: defineRef('lists'),
    limit: z.number().optional(),
    offset: z.number().optional(),
  },
  handler: async (ctx, { listId, limit, offset }) => {
    let q = ctx.db
      .query('todos')
      .withIndex('by_listId', (q) => q.eq('listId', listId))
      .order('desc', 'createdAt');

    // Demonstrate pagination with limit and offset
    if (limit !== undefined) {
      q = q.limit(limit);
    }
    if (offset !== undefined) {
      q = q.offset(offset);
    }

    return q.collect();
  },
});

export const create = mutation({
  input: {
    listId: defineRef('lists'),
    text: z.string().min(1),
  },
  handler: async (ctx, { listId, text }) => {
    return ctx.db.insert('todos', {
      listId,
      text,
      completed: false,
      createdAt: Date.now(),
    });
  },
});

export const toggle = mutation({
  input: { id: defineRef('todos') },
  handler: async (ctx, { id }) => {
    const todo = await ctx.db.get(id);
    if (!todo) {
      throw new Error('Todo not found');
    }
    return ctx.db.patch(id, { completed: !todo.completed });
  },
});

export const remove = mutation({
  input: { id: defineRef('todos') },
  handler: async (ctx, { id }) => {
    return ctx.db.delete(id);
  },
});

export const clearCompleted = mutation({
  input: { listId: defineRef('lists') },
  handler: async (ctx, { listId }) => {
    // Get all completed todos for this list
    const todos = await ctx.db
      .query('todos')
      .withIndex('by_listId', (q) => q.eq('listId', listId))
      .collect();

    const completedIds = todos.filter((t) => t.completed).map((t) => t.id);

    if (completedIds.length === 0) {
      return 0;
    }

    // Delete all completed todos in one batch
    return ctx.db.deleteMany('todos', completedIds);
  },
});
