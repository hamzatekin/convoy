// convoy/functions/projects.ts
import { defineRef } from '../../../src/index.ts';
import { z } from 'zod';
import { authMutation, authQuery, requireAuth } from './_auth';
import { query } from '@avvos/convoy';

const ProjectStatus = z.enum(['planning', 'active', 'blocked', 'done']);

export const createProject = authMutation({
  input: {
    name: z.string(),
    status: ProjectStatus.optional(),
    description: z.string().optional(),
  },
  handler: async (ctx, input) => {
    const auth = requireAuth(ctx);
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
  handler: async (ctx) => {
    const auth = requireAuth(ctx as any);
    return ctx.db
      .query('projects')
      .withIndex('by_userId', (q: any) => q.eq('userId', auth.userId))
      .order('desc', 'createdAt')
      .collect();
  },
});

export const updateProjectStatus = authMutation({
  input: { projectId: defineRef('projects'), status: ProjectStatus },
  handler: async (ctx, input) => {
    requireAuth(ctx);
    return ctx.db.patch('projects', input.projectId, {
      status: input.status,
    });
  },
});
