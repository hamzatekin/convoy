# Convoy Roadmap (V1+)

Convex-style DX on user-owned Postgres with JSONB as the default model.

## Foundations (current)

- Schema-first JSONB tables + indexes (done for POC)
- Typed query/mutation functions (done for POC)
- HTTP API + generated bindings (done for POC)

## M0 - Dev DX + HTTP baseline

Deliverables:

- [Improvement] `convoy dev` watches schema/functions and starts the local HTTP server (done)
- [Improvement] Standard `/api/query|mutation/:name` router using `_generated/functions.ts` (done)
- [Improvement] Structured error responses + request size limits (done)
- [Improvement] Example playground using the generated server (no Vite middleware) (done)

Cut line:

- No realtime support
- No TanStack Query integration

Done when:

- A project can run `convoy dev` and the app can call queries/mutations end-to-end

Status:

- Done. Remaining polish tracked in "Polish / Later".

## M1 - Safe schema sync

Deliverables:

- [New] `convoy sync` (server/CI) separate from `convoy dev` (pending)
- [Improvement] "Never drop" default + `--dry-run` schema diff output (pending)
- [New] Schema hash + sync log table (pending)
- [Improvement] Docs for running sync only in server/CI contexts (pending)

Cut line:

- No relational promotion yet

Done when:

- Schema updates are applied only through controlled server/CI paths

Status:

- Not started. Needs CLI split (`convoy sync`) and schema diff tracking.

## M2 - Type safety + client integration

Deliverables:

- [Improvement] Generated `api.d.ts`, `server.d.ts`, `dataModel.d.ts` (no server code in client bundles) (done)
- [New] Optional TanStack Query adapter (`@convoy/react-query`) (pending)
- [Improvement] Clear docs on typed refs + hooks (partial)
- [New] Enforce read-only queries (no writes in queries) with runtime guard + typings (pending)

Cut line:

- No realtime invalidation yet

Done when:

- Client DX matches Convex-style type safety without bundling server code

Status:

- In progress. Types are generated; docs + read-only enforcement remain.

## M3 - Auth + policy layer

Deliverables:

- [New] Standard `ctx.auth` shape (pending)
- [New] Middleware for auth extraction (pending)
- [New] Table-level read/write rules (pending)
- [Improvement] Tests for enforcement + examples (pending)

Cut line:

- No multi-tenant row-level security in SQL yet

Done when:

- Teams can implement allow/deny rules without per-function guards

Status:

- Not started. Needs auth context and policy middleware.

## M4 - JSONB to relational promotion

Deliverables:

- [New] `convoy promote` to generate SQL for columns + indexes (pending)
- [New] Dual-read/dual-write helpers (pending)
- [New] Backfill tool + migration docs (pending)

Cut line:

- No automated rollback

Done when:

- Hot fields can be promoted without breaking API types

Status:

- Not started. Needs promote tooling + migration story.

Status:

- Partial. Invalidation + SSE broadcast done; ElectricSQL plan + WebSocket pending.

## Polish / Later

- [Polish] Ship a `convoy` CLI wrapper/binary so `convoy dev` works without TS loaders (pending)
