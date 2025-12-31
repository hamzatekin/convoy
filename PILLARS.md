# Convoy Pillars (V1)

## Purpose

Convex-style developer experience on top of user-owned Postgres, with JSONB as the default data model.

## Pillars

1) Schema-first JSONB on Postgres (POC done)
- `defineSchema` declares tables, indexes, and references.
- CLI keeps tables + JSONB indexes present (create-if-missing).

2) Typed functions + HTTP API
- Users write `query`/`mutation` functions.
- Generated server exposes them as `/api/query|mutation/:name`.
- Requests validate inputs and return structured errors.

3) End-to-end type safety
- Generate typed API refs for client + React hooks.
- No SQL in client code.

4) Minimal operational burden
- One command for dev: watch + generate + run server.
- Single Postgres database (no hosted backend dependency).

5) Extensible sync path
- V1 ships without sync/realtime.
- Later: ElectricSQL for syncing and offline support.

## V1 Non-goals

- JSONB to relational promotion/migrations
- Advanced auth/ACL framework (basic context only)
- Realtime invalidation and offline support
