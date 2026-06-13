# Walking Skeleton — VDT WebRTC

**Phase:** 1
**Generated:** 2026-06-12

## Capability Proven End-to-End

A registered user can create an account, log in, see a greeting page showing their username and role, and log out — with the full stack (React → Spring Boot → PostgreSQL) running via Docker Compose and database schema applied through versioned Flyway migrations.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Spring Boot 4.0.x (backend) + React 19 + Vite 8 (frontend) | Spring Boot locked to 4.0.x latest patch per CLAUDE.md (NOT 4.1.0); Vite 8 is API-compatible with the locked 7.x spec and is the current stable. Locked per CLAUDE.md and RESEARCH.md. |
| API style | Spring MVC REST (JSON) | Plain MVC REST is the right choice for a learning project; WebSocket signaling added in Phase 2. |
| Data layer | PostgreSQL 17 via Spring Data JPA + Flyway migrations | Flyway owns schema (V1__create_tables.sql, V2__seed_admin.sql); Hibernate set to `ddl-auto: validate`. Satisfies INFR-07 deliverable. |
| Auth | JJWT 0.13 HS256 access JWT (15 min, in-memory on client) + httpOnly SameSite=Lax refresh token cookie (7 days, server-side hash in `refresh_tokens` table) | D-01/D-02/D-03 locked decisions. Stateless access token avoids session state; server-side refresh enables instant revocation when admin locks a user. |
| RBAC | Spring Security 7 `SecurityFilterChain` lambda DSL + `@PreAuthorize("hasRole('ADMIN')")` | Two roles: USER, ADMIN. Enforced server-side (SecurityFilterChain + method security) and client-side (React ProtectedRoute). |
| Directory layout | Monorepo: `backend/` + `frontend/` at repo root; backend uses package-by-feature (`auth/`, `user/`, `config/`, `common/`); frontend uses feature folders (`api/`, `auth/`, `pages/`, `components/`) | D-05 (monorepo) + D-07 (package-by-feature) locked decisions. |
| Deployment target | Docker Compose (full stack: backend + nginx-served frontend + postgres); dev hot-reload with only postgres in Docker | D-06 locked decision. `docker-compose.yml` for demo/handoff, `docker-compose.dev.yml` (postgres only) for daily dev. |
| Styling | Tailwind CSS 4.3.0 (CSS-first, `@import "tailwindcss"`) | No component library (greenfield, learning-oriented). Hand-rolled Button/Input/FormField/Badge/AuthCard/AppShell components. Locked per RESEARCH.md and UI-SPEC. |
| State management | Zustand 5 (auth state) + module-level JS variable for access token | Access token NOT in localStorage (D-03). In-memory variable + Zustand `user` object covers Phase 1 needs. TanStack Query installed now to avoid Phase 2 refactor. |

## Stack Touched in Phase 1

- [x] Project scaffold — `backend/pom.xml` (Spring Boot 4.0.x + JJWT 0.13 + Flyway + Testcontainers), `frontend/package.json` (React 19, Vite 8, axios, react-router 7, Zustand 5, Vitest 4, Tailwind 4), Maven wrapper
- [x] Routing — React Router v7 `createBrowserRouter`; `/login`, `/register`, `/`, `/admin` routes with ProtectedRoute guards
- [x] Database — Flyway V1 creates `users` + `refresh_tokens`; V2 seeds admin; register writes a user row; login reads it
- [x] UI — Login form → POST /api/auth/login → access JWT stored in-memory → home page displays username + role badge
- [x] Deployment — `docker-compose.yml` (backend + frontend nginx + postgres with healthchecks); `docker-compose.dev.yml` (postgres-only for hot-reload)

## Out of Scope (Deferred to Later Slices)

- WebSocket connections and WS auth (AUTH-04 → Phase 2)
- Presence / online-user list (Phase 2)
- Video/audio calls, ICE/STUN/TURN (Phase 3+)
- HTTPS/WSS (Phase 3 — HTTP localhost is sufficient for Phase 1)
- Email verification, password reset, OAuth/social login (out of v1 scope)
- Admin user management UI, call history (Phase 5)
- Redis, RabbitMQ, monitoring (Phase 2+)
- One-time WebSocket ticket auth hardening (STAB-05 v2)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton:

- Phase 2: Authenticated WebSocket handshake + Redis TTL presence + realtime online-user list
- Phase 3: 1-1 P2P video call via coturn TURN, HTTPS/WSS, quality diagnostics
- Phase 4: Call lifecycle state machine (ringing, busy, glare, hangup, reconnection)
- Phase 5: RabbitMQ call history pipeline + admin user management UI
- Phase 6: Horizontal scaling (2+ instances, Redis pub/sub cross-instance routing)
- Phase 7: Group mesh calls up to 4 people
- Phase 8: Screen share, client-side recording, device control
- Phase 9: Prometheus + Grafana, Playwright E2E, one-command full-stack demo
