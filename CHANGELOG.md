# Changelog

All notable changes to Convoy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- (upcoming changes go here)

### Changed

- (upcoming changes go here)

### Fixed

- (upcoming changes go here)

---

## [0.0.1] - 2026-01-15

### Added

**Core**

- JSONB document model on Postgres
- Schema-first design with Zod validation
- `defineSchema`, `defineTable`, `defineRef` API
- Index definitions with `.index()`
- Unmanaged tables with `.unmanaged()`

**Database Operations**

- `db.insert()` — Create documents
- `db.get()` — Fetch by ID
- `db.patch()` — Partial updates
- `db.query()` — Query builder with `.withIndex()`, `.order()`, `.collect()`, `.first()`
- `db.raw()` — Raw SQL escape hatch

**Server Runtime**

- `query()` and `mutation()` function definitions
- Input validation via Zod
- `createContext()` for request-scoped auth
- Structured error handling with `convoyError()`

**Reactivity**

- SSE-based subscriptions
- Postgres LISTEN/NOTIFY for invalidation
- Automatic reconnect with full re-sync

**Client**

- `createConvoyClient()` for browser/Node
- `useQuery()` React hook with `skipToken`
- `useMutation()` and `useMutationState()` hooks
- Connection state tracking (`isStale`, `isReconnecting`)

**CLI**

- `convoy dev` — Watch mode with sync + generation + server
- `convoy migrate` — Production-safe schema sync
- Auto-generation of typed client API

**Documentation**

- README with quickstart and examples
- Auth patterns (JWT, cookie sessions)
- Escape hatches and mixing with traditional backends

---

[Unreleased]: https://github.com/hamzatekin/convoy/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/hamzatekin/convoy/releases/tag/v0.0.1
