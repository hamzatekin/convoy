import { defineRef } from '../../../src/index.ts';
import { mutation, query } from '../_generated/server';
import { z } from 'zod';

const TaskStatus = z.enum(['todo', 'in_progress', 'done']);
const TaskPriority = z.enum(['low', 'medium', 'high']);

export const createTask = mutation({
  args: {
    projectId: defineRef('projects'),
    title: z.string(),
    status: TaskStatus.optional(),
    priority: TaskPriority.optional(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('tasks', {
      projectId: args.projectId,
      title: args.title,
      status: args.status ?? 'todo',
      priority: args.priority ?? 'medium',
      createdAt: Date.now(),
    });
  },
});

export const listTasks = query({
  args: { projectId: defineRef('projects') },
  handler: async (ctx, args) => {
    return ctx.db
      .query('tasks')
      .withIndex('by_projectId', (q) => q.eq('projectId', args.projectId))
      .order('desc', 'createdAt')
      .collect();
  },
});

export const updateTaskStatus = mutation({
  args: { taskId: defineRef('tasks'), status: TaskStatus },
  handler: async (ctx, args) => {
    return ctx.db.patch('tasks', args.taskId, {
      status: args.status,
    });
  },
});
