# Convoy Roadmap (V1+)

Convex-style DX on user-owned Postgres with JSONB as the default model.

## Foundations (current)
- Schema-first JSONB tables + indexes (done for POC)
- Typed query/mutation functions (done for POC)
- HTTP API + generated bindings (done for POC)

## M0 - Dev DX + HTTP baseline

Deliverables:
- [Improvement] `convoy dev` watches schema/functions and starts the local HTTP server
- [Improvement] Standard `/api/query|mutation/:name` router using `_generated/functions.ts`
- [Improvement] Structured error responses + request size limits
- [Improvement] Example playground using the generated server (no Vite middleware)

Cut line:
- No realtime support
- No TanStack Query integration

Done when:
- A project can run `convoy dev` and the app can call queries/mutations end-to-end

## M1 - Safe schema sync

Deliverables:
- [New] `convoy sync` (server/CI) separate from `convoy dev`
- [Improvement] "Never drop" default + `--dry-run` schema diff output
- [New] Schema hash + sync log table
- [Improvement] Docs for running sync only in server/CI contexts

Cut line:
- No relational promotion yet

Done when:
- Schema updates are applied only through controlled server/CI paths

## M2 - Type safety + client integration

Deliverables:
- [Improvement] Generated `api.d.ts`, `server.d.ts`, `dataModel.d.ts` (no server code in client bundles)
- [New] Optional TanStack Query adapter (`@convoy/react-query`)
- [Improvement] Clear docs on typed refs + hooks

Cut line:
- No realtime invalidation yet

Done when:
- Client DX matches Convex-style type safety without bundling server code

## M3 - Auth + policy layer

Deliverables:
- [New] Standard `ctx.auth` shape
- [New] Middleware for auth extraction
- [New] Table-level read/write rules
- [Improvement] Tests for enforcement + examples

Cut line:
- No multi-tenant row-level security in SQL yet

Done when:
- Teams can implement allow/deny rules without per-function guards

## M4 - JSONB to relational promotion

Deliverables:
- [New] `convoy promote` to generate SQL for columns + indexes
- [New] Dual-read/dual-write helpers
- [New] Backfill tool + migration docs

Cut line:
- No automated rollback

Done when:
- Hot fields can be promoted without breaking API types

## M5 - Realtime + sync path

Deliverables:
- [New] Mutation invalidation events (LISTEN/NOTIFY or pub/sub adapter)
- [New] Server broadcast layer
- [New] ElectricSQL integration plan + starter adapter

Cut line:
- Offline/CRDT support not in scope

Done when:
- Mutations trigger deterministic invalidation and a sync path is defined
