import { defineRef } from '../../../src/index.ts';
import { mutation, query } from '../_generated/server';
import { z } from 'zod';

const ProjectStatus = z.enum(['planning', 'active', 'blocked', 'done']);

export const createProject = mutation({
  args: {
    userId: defineRef('users'),
    name: z.string(),
    status: ProjectStatus.optional(),
    description: z.string().optional(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('projects', {
      name: args.name,
      userId: args.userId,
      status: args.status ?? 'active',
      description: args.description,
      createdAt: Date.now(),
    });
  },
});

export const listProjects = query({
  args: { userId: defineRef('users') },
  handler: async (ctx, args) => {
    return ctx.db
      .query('projects')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .order('desc', 'createdAt')
      .collect();
  },
});

export const updateProjectStatus = mutation({
  args: { projectId: defineRef('projects'), status: ProjectStatus },
  handler: async (ctx, args) => {
    return ctx.db.patch('projects', args.projectId, {
      status: args.status,
    });
  },
});
