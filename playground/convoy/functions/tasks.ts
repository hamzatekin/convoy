import { defineRef } from '../../../src/index.ts';
import { mutation, query } from '../_generated/server';
import { z } from 'zod';
import { requireAuth } from './_auth';

const TaskStatus = z.enum(['todo', 'in_progress', 'done']);
const TaskPriority = z.enum(['low', 'medium', 'high']);

export const createTask = mutation({
  input: {
    projectId: defineRef('projects'),
    title: z.string(),
    status: TaskStatus.optional(),
    priority: TaskPriority.optional(),
  },
  handler: async (ctx, input) => {
    requireAuth(ctx as any);
    return ctx.db.insert('tasks', {
      projectId: input.projectId,
      title: input.title,
      status: input.status ?? 'todo',
      priority: input.priority ?? 'medium',
      createdAt: Date.now(),
    });
  },
});

export const listTasks = query({
  input: { projectId: defineRef('projects') },
  handler: async (ctx, input) => {
    requireAuth(ctx as any);
    return ctx.db
      .query('tasks')
      .withIndex('by_projectId', (q) => q.eq('projectId', input.projectId))
      .order('desc', 'createdAt')
      .collect();
  },
});

export const updateTaskStatus = mutation({
  input: { taskId: defineRef('tasks'), status: TaskStatus },
  handler: async (ctx, input) => {
    requireAuth(ctx as any);
    return ctx.db.patch('tasks', input.taskId, {
      status: input.status,
    });
  },
});
