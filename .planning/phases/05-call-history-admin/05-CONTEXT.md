# Phase 5: Call History & Admin - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Every call is durably recorded **without touching the realtime path** (lifecycle events
published to RabbitMQ and persisted asynchronously), users can view their own call history,
and admins can manage users (lock/unlock, change role, force-disconnect) and observe the
system via a live dashboard + system-wide history.

Covers HIST-01, HIST-02, HIST-03, ADMN-01, ADMN-02, ADMN-03. Introduces RabbitMQ into the
backend for the FIRST time (parallel to how Phase 4 introduced Redis).

**Not in this phase:** changes to the realtime call/signaling path itself (Phase 4); cross-instance
scaling (Phase 6); device selection (Phase 8). The async pipeline must NOT make the realtime
path wait on the DB.

</domain>

<decisions>
## Implementation Decisions

### Call history display (HIST-02)
- **D-01:** Each row shows the FULL set: peer (đối phương), direction icon (incoming/outgoing/missed), duration, timestamp, and an outcome label.
- **D-02:** Group entries by day (Hôm nay / Hôm qua / specific date headers), newest→oldest within each group.
- **D-03:** Infinite scroll / pagination keeping ALL history (no cap). Use TanStack Query `useInfiniteQuery`.
- **D-04:** Read-only — users CANNOT delete or clear history in this phase (MVP simplicity; no delete endpoints).

### What gets recorded (HIST-01)
- **D-05:** Record all end-reasons EXCEPT `busy`. `busy` is never logged (consistent with Phase 4 D-06: busy never rang, doesn't count as missed). So logged reasons: completed, missed, rejected, cancelled, dropped.
- **D-06:** Per-side labelling — each party sees their own perspective. E.g. a missed call shows as "Cuộc gọi nhỡ" for the callee and "Gọi đi không trả lời" for the caller. Direction (in/out) is relative to the viewer.
- **D-07:** Any call that reached `active` counts as completed with its real duration — no minimum-duration threshold (a 2-second call is still a completed call).

### Admin user management (ADMN-01)
- **D-08:** Lock/unlock + role change are INLINE in the existing admin users table (per-row Lock/Unlock button + role dropdown). Extends the existing `AdminPage` table.
- **D-09:** Confirmation prompt required before sensitive actions (lock, change role) — avoid mis-clicking and accidentally disconnecting an active user.
- **D-10:** Self-protection — an admin CANNOT lock or demote their own account. Enforced on the backend (authoritative) AND hidden/disabled on the frontend.
- **D-11:** Locking a user who is mid-call force-disconnects their WS immediately; the surviving peer experiences this as the normal grace→`dropped` flow from Phase 4. (ADMN-01 "force-disconnected immediately" is locked by success criteria.)

### Admin system history (ADMN-02)
- **D-12:** System-wide history is a table of ALL calls (both parties shown) with a filter by username. Newest→oldest, paginated.

### Live dashboard (ADMN-03)
- **D-13:** Metrics: online users count, active calls count, and daily stats (calls started / completed / missed).
- **D-14:** Daily stats are counted per server-local calendar day, reset at 00:00 (not a rolling 24h window).
- **D-15:** Updates via periodic REST polling (~5s, TanStack Query `refetchInterval`) — NOT a dedicated WS push channel. Simple, "live enough" for the demo.
- **D-16:** Display as stat cards (large numbers), no charts in this phase.

### Claude's Discretion
- RabbitMQ topology (exchange/queue/routing keys), DLQ config, publisher confirms, retry/backoff — locked by stack + success criteria; planner/researcher decide specifics.
- Idempotency mechanism (keyed by callId + event type) — required by HIST-03; implementation approach is Claude's.
- call_history table schema, JPA entity, Flyway migration — Claude's.
- Exact event trigger points in `CallService` (which transitions publish) such that history shows one logical entry per call — Claude's, guided by D-05/D-06.
- Where dashboard counts come from (Redis presence/active-calls vs DB aggregate) — Claude's.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 5: Call History & Admin" — goal, success criteria, requirement IDs
- `.planning/REQUIREMENTS.md` — HIST-01/02/03, ADMN-01/02/03 (lines ~53-67)

### Stack & conventions (locked)
- `CLAUDE.md` §"Messaging" — RabbitMQ 4.1 (`rabbitmq:4.1-management`), Spring AMQP, `JacksonJsonMessageConverter` (NOT `Jackson2JsonMessageConverter` — deprecated for removal in Spring AMQP 4.0; see RESEARCH.md §Pitfall 1), publisher confirms, DLQ via `x-dead-letter-exchange`, retry with backoff
- `CLAUDE.md` §"Database & Data Layer" — Flyway versioned SQL migrations (the DB-script deliverable), Hibernate `ddl-auto: validate`
- `CLAUDE.md` §"Monitoring" — custom Micrometer metrics (calls started/completed/missed counters) feed dashboard demo
  NOTE: daily stats use AtomicLong + @Scheduled(cron) reset, NOT Micrometer Counter (monotonic, no daily reset) — see RESEARCH.md §Pattern 7 and §Pitfall.

### Cross-phase dependencies
- `.planning/phases/04-call-lifecycle-in-call-experience/04-CONTEXT.md` — 6 end-reason taxonomy (D-07), busy≠missed (D-06), server-authoritative state machine — the events Phase 5 records originate here
- `.planning/phases/04-call-lifecycle-in-call-experience/04-LEARNINGS.md` — CallService transition points, Redis call/presence state for dashboard

No external ADRs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/.../admin/AdminController.java` + `AdminService.java` — existing admin endpoints (GET /api/admin/users); extend with lock/unlock, change-role, system-history, dashboard endpoints.
- `frontend/src/pages/AdminPage.tsx` — existing users table (already renders `locked` field); extend with inline Lock/Unlock + role dropdown + confirmation; add history + dashboard views.
- `backend/.../user/Role.java` + User entity with `locked` field — already present (lock plumbing partly exists from Phase 1).
- `backend/.../config/SecurityConfig.java` — RBAC filter chain; reuse for admin-only endpoint authorization.
- `backend/.../ws/SessionRegistry.java` — `get(userId)` + session close → force-disconnect a locked user (mirrors superseded-session close in PresenceWebSocketHandler).
- `backend/.../call/CallService.java` — terminal transitions (`broadcast(... "ended", reason ...)`) are the natural publish points for history events.
- `backend/.../presence/` (LocalPresenceService) — online-users count for dashboard.
- Redis `call:{id}` / `user-call:{id}` state (Phase 4) — active-calls count for dashboard.
- TanStack Query — `useInfiniteQuery` (history), `refetchInterval` (dashboard poll).

### Established Patterns
- Spring AMQP will be NEW (no amqp in pom.xml / docker-compose yet) — add like Redis was added in Phase 4 (starter dep + compose service + config).
- Flyway migrations already drive schema (Phase 1) — add `V?__call_history.sql`.
- Server-authoritative + opaque-relay separation from Phase 4 must be preserved: publishing history is fire-and-forget from CallService, never blocking the broadcast.

### Integration Points
- CallService terminal transition → publish event to RabbitMQ (async) → consumer persists to `call_history` (idempotent, DLQ).
- AdminService.lockUser → persist locked + `SessionRegistry` force-close + block future login (auth path checks `locked`).
- Dashboard endpoint → aggregate presence (Redis) + active calls (Redis) + daily counts (DB or Micrometer).

</code_context>

<specifics>
## Specific Ideas

- History UX modeled on a familiar phone call-log (per-day grouping, direction icons, per-side perspective).
- Dashboard should read clearly during a live demo (big stat-card numbers, ~5s refresh).

</specifics>

<deferred>
## Deferred Ideas

- Delete / clear call history (per-row or bulk) — out of MVP scope (D-04); future phase.
- WS-pushed realtime dashboard (instead of polling) — deferred (D-15); revisit if poll feels laggy.
- Dashboard charts / daily trend visualization — deferred (D-16); stat cards only for now.
- Logging `busy` events / busy analytics — intentionally excluded (D-05).
- Carry-over from Phase 4 backlog (not this phase): CR-02(a) caller-busy wrong toast, CR-04 duration-after-reconnect, WARNINGs (WR-01/02/09) — a future "polish" pass.

</deferred>

---

*Phase: 5-call-history-admin*
*Context gathered: 2026-06-28*
