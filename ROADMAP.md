# Convoy Roadmap

This roadmap shows where Convoy is today and what's next.

---

## ✅ Completed (v0.0.x — MVP)

The foundation is built and working:

- [x] Postgres-backed JSONB document model
- [x] Schema-first design with Zod (runtime validation + type inference)
- [x] Queries & mutations as server functions
- [x] CLI: watch → sync → generate → serve
- [x] End-to-end type safety (schema → server → client hooks)
- [x] Reactive queries via SSE with server-pushed updates
- [x] Postgres LISTEN/NOTIFY invalidation
- [x] Stable SSE reconnect with full re-sync
- [x] Structured error codes and typed responses
- [x] Auth via `createContext(req, base)` pattern
- [x] Raw SQL escape hatch (`ctx.db.raw()`)
- [x] Unmanaged tables (`.unmanaged()`)
- [x] Clear dev vs deploy workflows (`convoy dev` / `convoy migrate`)

---

## 🎯 v1.0 (Next)

> Make Convoy production-ready.

### Critical Gaps

- [x] **`db.delete()`** — Complete CRUD operations ✅
- [x] **Transaction support** — `ctx.db.transaction()` for atomic mutations ✅
- [x] **One-click deploy** — Dockerfile + docker-compose.yml + Railway template ✅
- [ ] **`create-convoy-app` CLI** — `npx create-convoy-app my-app` for instant setup

### Developer Experience

- [x] CLI progress indicators during generation ✅
- [x] Better error messages for schema sync failures ✅
- [ ] Hot reload improvements (faster watch cycles)

### Documentation

- [x] Production deployment guide ✅ (see `deploy/DEPLOY.md`)
- [x] Auth integration examples ✅ (see `docs/AUTH.md`)
- [x] Migration from Convex guide ✅ (see `docs/MIGRATION_FROM_CONVEX.md`)

---

## 🚀 v1.x (Soon)

> Expand compatibility and reduce friction.

- [ ] **Pluggable database drivers** — Support `postgres` (postgresjs), `@neondatabase/serverless`
- [ ] **Auth adapters package** — `@avvos/convoy-auth` with common providers
- [x] **Batch operations** — `db.insertMany()`, `db.deleteMany()` ✅
- [x] **Query pagination** — `.limit()`, `.offset()`, cursor-based pagination ✅
- [ ] **Observability hooks** — Logging, metrics, tracing integration points
- [ ] **Generated OpenAPI spec** — For teams that need REST documentation

---

## 💭 Future (Considering)

> Nice-to-haves based on community feedback.

- [ ] WebSocket transport (alternative to SSE for specific use cases)
- [ ] Optimistic update helpers in React hooks
- [ ] TanStack Query adapter
- [ ] JSONB → relational migration tooling
- [ ] Schema drift detection and warnings
- [ ] Multi-database support (read replicas)
- [ ] Optional managed hosting (Convoy Cloud)

---

## Definition of Done (v1.0)

Convoy is **v1.0** when:

- Full CRUD: insert, get, patch, delete, query
- Transactions work reliably
- A new user can go from `npx create-convoy-app` to deployed in under 10 minutes
- At least one production app is running on it (yours counts!)
