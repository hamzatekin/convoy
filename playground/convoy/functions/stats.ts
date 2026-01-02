import { sql } from 'drizzle-orm';
import { authQuery } from './_auth';

export const overview = authQuery({
  input: {},
  handler: async (ctx) => {
    const [projectsRow] = await ctx.db.raw<{ total: number | string }>(
      sql`select count(*)::int as total from projects`,
    );
    const [tasksRow] = await ctx.db.raw<{ total: number | string }>(sql`select count(*)::int as total from tasks`);

    return {
      projects: Number(projectsRow?.total ?? 0),
      tasks: Number(tasksRow?.total ?? 0),
    };
  },
});
