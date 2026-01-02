import { defineRef } from '../../../src/index.ts';
import { mutation, query } from '../_generated/server';
import { z } from 'zod';
import { requireAuth } from './_auth';

const ProjectStatus = z.enum(['planning', 'active', 'blocked', 'done']);

export const createProject = mutation({
  input: {
    name: z.string(),
    status: ProjectStatus.optional(),
    description: z.string().optional(),
  },
  handler: async (ctx, input) => {
    const auth = requireAuth(ctx as any);
    return ctx.db.insert('projects', {
      name: input.name,
      userId: auth.userId,
      status: input.status ?? 'active',
      description: input.description,
      createdAt: Date.now(),
    });
  },
});

export const listProjects = query({
  input: {},
  handler: async (ctx, input) => {
    const auth = requireAuth(ctx as any);
    return ctx.db
      .query('projects')
      .withIndex('by_userId', (q) => q.eq('userId', auth.userId))
      .order('desc', 'createdAt')
      .collect();
  },
});

export const updateProjectStatus = mutation({
  input: { projectId: defineRef('projects'), status: ProjectStatus },
  handler: async (ctx, input) => {
    requireAuth(ctx as any);
    return ctx.db.patch('projects', input.projectId, {
      status: input.status,
    });
  },
});
