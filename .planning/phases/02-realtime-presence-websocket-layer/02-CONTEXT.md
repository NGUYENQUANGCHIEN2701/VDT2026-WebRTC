# Phase 2: Realtime Presence & WebSocket Layer - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Logged-in users see a **realtime list of online users** (status online / in-call) over a
**JWT-authenticated WebSocket** whose **identity is owned server-side** (client `from` field
never trusted). Exactly **one active session per user** — a new tab/device kicks the old one.

Requirements: AUTH-04, PRES-01, PRES-02, PRES-03.

**In scope:** authenticated WS handshake, presence tracking + realtime online list, single-session
policy, server-bound identity, heartbeat-based offline detection.
**Out of scope:** the actual 1-1 call / signaling payloads (Phase 3), call state machine (Phase 4),
Redis-backed cross-instance presence (Phase 6 — only the *seam* is built here).

</domain>

<decisions>
## Implementation Decisions

### Presence storage & scale seam
- **D-01:** Presence runs on a **local in-memory implementation behind a `PresenceService` interface**
  (in-memory `Map` of userId → last-seen + a scheduled sweeper). **Redis is NOT introduced in Phase 2** —
  the interface is the design-for-scale seam; Phase 6 swaps in the Redis TTL implementation. PRES-02's
  "Redis TTL heartbeat" wording is satisfied at Phase 6; Phase 2 reproduces the same *behavior*
  (~60s auto-offline) with the local impl. Same pattern applies to `MessageRouter` (local now, Redis pub/sub Phase 6).

### Single-session policy (PRES-03)
- **D-02:** When a user opens a new session, the server **pushes a control message** (e.g.
  `session-superseded` / "đăng nhập ở nơi khác") to the OLD WebSocket, **then closes it**. The old
  tab shows a notice and **redirects to /login**. Not a silent disconnect.

### Online list status & update model (PRES-01)
- **D-03:** The server pushes a **full snapshot** of the online-user list on every change (join/leave/status).
  Not delta events — snapshot is simpler and robust for demo scale. The status field is a
  **forward-compatible enum**: `ONLINE` now; `IN_CALL` is wired in Phase 4 (Phase 2 only emits ONLINE/offline).

### Offline detection timing (PRES-02)
- **D-04:** Heartbeat interval **~25s**; a user is marked **offline after ~60s** with no heartbeat
  (≈2 missed beats). Matches the phase success criteria; balances responsiveness vs heartbeat traffic
  and tolerates brief network blips.

### Claude's Discretion
- **WS auth token transport** at handshake (query param vs `Sec-WebSocket-Protocol` subprotocol) —
  researcher/planner choose; reuse the existing in-memory JWT (Phase 1 D-03). Validate with the same
  `JwtService`. Reject the upgrade if token invalid/expired.
- **MessageRouter / PresenceService interface shape** (method signatures) — design so the Redis impl
  is a drop-in swap in Phase 6 (no caller changes).
- **Signaling message envelope** — sealed interface + records + Jackson `@JsonTypeInfo` per CLAUDE.md.
- **Heartbeat protocol** (ping/pong frames vs app-level heartbeat message) and reconnect/backoff details
  on the client WS wrapper.
- Raw `TextWebSocketHandler` + JSON (NOT STOMP) per CLAUDE.md tech-stack decision.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` (Phase 2 section) — goal, success criteria, the MessageRouter/PresenceService seam decision
- `.planning/REQUIREMENTS.md` — AUTH-04, PRES-01, PRES-02, PRES-03 wording

### Tech-stack decisions (locked)
- `CLAUDE.md` — raw `TextWebSocketHandler` + JSON (reject STOMP), `HandshakeInterceptor` for WS JWT,
  Lettuce/Redis (Phase 6), sealed-interface + records + `@JsonTypeInfo` signaling, native WebSocket client + custom reconnect wrapper

### Carry-forward auth context
- `.planning/phases/01-foundation-auth-roles-project-skeleton/01-CONTEXT.md` — D-03 (in-memory access token, reused for WS auth), server-owns-identity principle

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/.../config/JwtService.java` — `generateToken` / `extractUsername` / `isTokenValid`; reuse to verify the WS handshake token.
- `backend/.../config/JwtAuthFilter.java` — pattern for extracting + validating JWT and binding a principal; the WS `HandshakeInterceptor` mirrors this.
- `frontend/src/store/authStore.ts` — in-memory access token (`token`) the WS client reads to authenticate.
- `frontend/src/api/axios.ts` — established realtime-from-module pattern (`useAuthStore.getState()` outside React) applies to the WS service module.

### Established Patterns
- Feature-package structure (Phase 1 D-07) → add `ws/` and `presence/` packages.
- Server-owns-identity (Phase 1) → WS messages attributed from the authenticated principal, never client-supplied `from`.

### Integration Points
- WS handshake validates the Phase 1 JWT; presence list is the first realtime surface after the Phase 1 home page.

</code_context>

<specifics>
## Specific Ideas

- Build `PresenceService` and `MessageRouter` as interfaces with local impls now so Phase 6 is a swap, not a rewrite (explicit roadmap mandate).
- "in-call" status is a placeholder enum value in Phase 2; do not implement call detection here.

</specifics>

<deferred>
## Deferred Ideas

- Redis-backed presence + cross-instance pub/sub routing → Phase 6.
- Actual call signaling payloads over the WS → Phase 3.
- `IN_CALL` status wiring (depends on call state machine) → Phase 4.

None of these are in Phase 2 scope — only the abstractions/seam are built now.

</deferred>

---

*Phase: 02-realtime-presence-websocket-layer*
*Context gathered: 2026-06-14*
