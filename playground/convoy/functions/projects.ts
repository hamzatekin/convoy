import { defineRef } from '../../../src/index.ts';
import { mutation, query } from '../_generated/server';
import { z } from 'zod';

const ProjectStatus = z.enum(['planning', 'active', 'blocked', 'done']);

export const createProject = mutation({
  input: {
    userId: defineRef('users'),
    name: z.string(),
    status: ProjectStatus.optional(),
    description: z.string().optional(),
  },
  handler: async (ctx, input) => {
    return ctx.db.insert('projects', {
      name: input.name,
      userId: input.userId,
      status: input.status ?? 'active',
      description: input.description,
      createdAt: Date.now(),
    });
  },
});

export const listProjects = query({
  input: { userId: defineRef('users') },
  handler: async (ctx, input) => {
    return ctx.db
      .query('projects')
      .withIndex('by_userId', (q) => q.eq('userId', input.userId))
      .order('desc', 'createdAt')
      .collect();
  },
});

export const updateProjectStatus = mutation({
  input: { projectId: defineRef('projects'), status: ProjectStatus },
  handler: async (ctx, input) => {
    return ctx.db.patch('projects', input.projectId, {
      status: input.status,
    });
  },
});
