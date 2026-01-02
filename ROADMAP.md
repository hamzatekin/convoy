# Convoy Roadmap

This roadmap shows where Convoy is today and what lies ahead.  
The goal of **v1** is not more features, but **stability, trust, and production readiness**.

---

## ✅ MVP (DONE)

> Proof that the core idea works and the DX is real.

- [x] Postgres-backed **JSONB document model**
- [x] **Schema-first** design using Zod (runtime validation + type inference)
- [x] **Queries & mutations** as server functions (no user-defined routes)
- [x] CLI that:
  - watches schema & functions
  - syncs DB tables and indexes (create-if-missing)
  - generates typed client APIs
  - starts the runtime server
- [x] **End-to-end type safety** (schema → server → client hooks)
- [x] HTTP gateway as a transport detail
- [x] **Reactive queries**
  - SSE subscriptions
  - server-pushed authoritative updates
- [x] Postgres **LISTEN / NOTIFY**–based invalidation
- [x] Automatic UI updates without manual refetch
- [x] Fully **self-hosted** (users own their Postgres)

---

## 🎯 v1 (NEXT)

> Make Convoy something you can confidently run in production.

### Runtime & Sync Hardening

- [x] Stable SSE reconnect behavior
- [x] Full re-sync on reconnect or missed events
- [x] Limits & safeguards:
  - [x] max concurrent subscriptions
  - [x] payload size limits
- [x] Deterministic query execution guarantees
- [x] Clear mutation boundaries (no partial state leaks)

### Error Handling & DX Polish

- [x] Structured error codes (`UNAUTHORIZED`, `INVALID_ARGS`, etc.)
- [x] Typed error responses (not just strings)
- [x] Better client-side error states in hooks
- [x] Clear loading / stale / reconnect states

### Auth as First-Class Context (Not a Service)

- [ ] Official `createContext(req)` pattern
- [ ] Auth resolved once per request
- [ ] Example integrations:
  - JWT
  - Cookie-based sessions
- [ ] Documentation for auth best practices
- [ ] No auth lock-in or hosted auth dependency

### Schema & Deployment Workflow

- [ ] Clear separation between:
  - `convoy dev` (auto-sync, fast iteration)
  - `convoy deploy` / `convoy migrate` (explicit, safe)
- [ ] Warnings for destructive or incompatible schema changes
- [ ] Non-destructive defaults
- [ ] Clear production deployment guidance

### Escape Hatches (Trust Builders)

- [ ] Raw SQL escape hatch (`ctx.db.raw(...)`)
- [ ] Ability to opt out of Convoy for specific tables
- [ ] Clear guidance on mixing Convoy with traditional backends
- [ ] Documented “how to eject” story

### Documentation & Positioning

- [ ] Clear mental model documentation
- [ ] Data flow diagrams (simple, high-level)
- [ ] “What Convoy is / is not”
- [ ] Comparison with REST and Convex
- [ ] Explicit tradeoffs and limitations

---

## 🚀 Post-v1 (FUTURE)

> Power features that build on a stable core.

- [ ] WebSocket transport (alternative to SSE)
- [ ] Mobile-friendly subscription transport
- [ ] Optional advanced client adapters (e.g. TanStack Query)
- [ ] Guided JSONB → relational “graduation” tooling
- [ ] Schema drift analysis & reporting
- [ ] Observability hooks (logging, metrics)
- [ ] Optional managed hosting (Convoy Cloud)
- [ ] Team / multi-project tooling

---

## v1 Definition of Done

Convoy can be considered **v1** when:

- It is stable under real production load
- Reactive queries are reliable and predictable
- Auth and errors are well-defined and boring
- Schema and deployment workflows are explicit
- Users feel confident they can escape or extend when needed
