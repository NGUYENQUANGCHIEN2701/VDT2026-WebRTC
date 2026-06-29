# Phase 6: Horizontal Scaling - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

The system runs as **2+ signaling instances behind an nginx load balancer** with **no
instance-local authoritative state** — a 1-1 call connects (signaling flows end-to-end) even
when caller and callee are connected to **different instances**, via Redis pub/sub routing.
All shared state (presence, routing map, call/room state) lives in Redis so presence and busy
status are consistent regardless of which instance a user lands on.

Covers SCAL-01, SCAL-02. This phase **swaps the local impls behind the Phase 2 seams**
(`PresenceService`, `MessageRouter`) for Redis-backed implementations — the interfaces and
their callers do not change (Phase 2 D-01 mandate). Call state is already in Redis from Phase 4
(`call:{id}`, `user-call:{id}`), so the "call state in Redis" half of SCAL-02 is already done.

**Not in this phase:**
- Group mesh / rooms (Phase 7).
- Full one-command compose with frontend + Prometheus + Grafana (INFR-02, Phase 9). Phase 6
  adds only nginx LB + a second backend instance — the minimum to prove cross-instance routing.
- Per-instance metrics dashboards (Phase 9). Instance tagging of metrics is a Phase 9 concern.
- Changes to the realtime signaling/call semantics themselves (Phase 3/4) — routing changes how
  a message reaches the peer, not what the messages mean.

</domain>

<decisions>
## Implementation Decisions

### Cross-instance routing (SCAL-01)
- **D-01:** **Routing map + per-instance channel.** Redis stores `route:{userId} → instanceId`.
  Each instance SUBSCRIBEs to its own pub/sub channel (e.g. `inst:{instanceId}`). `MessageRouter.sendToUser`
  looks up the callee's instance in the route map and PUBLISHes the message to that instance's
  channel; only the owning instance receives it and writes to the local WS. (Rejected: per-user
  channels — too many dynamic subscriptions; fanout-to-all — wastes traffic, doesn't scale cleanly.)
- **D-02:** **Route map lifecycle = write-on-connect + TTL-refresh-by-heartbeat.** On successful WS
  handshake, SET `route:{userId}=instanceId` with a TTL (~60s, same cadence as presence). The WS
  heartbeat refreshes both presence and route TTLs. WS close deletes the entry. `instanceId` comes
  from an env var (e.g. `INSTANCE_ID` / container `HOSTNAME`). TTL means a crashed instance's route
  entries self-expire (no manual cleanup needed).

### Presence & busy consistency (SCAL-02)
- **D-03:** **`presence-changed` broadcast channel.** A shared pub/sub channel (e.g. `presence-events`).
  Whatever instance mutates presence (join/leave/status change) PUBLISHes a signal; every instance
  receives it, re-reads the current snapshot from Redis, and pushes the **full snapshot** to its own
  local clients. Preserves the Phase 2 D-03 full-snapshot model across instances (not delta events).
- **D-04:** **Single source of truth for online + busy.** Online set = Redis `presence:{userId}` TTL
  keys (refreshed by heartbeat). `IN_CALL`/busy is **derived at snapshot-build time** directly from the
  existing Redis call state (`user-call:{userId}` present ⇒ in a call) — status is NOT duplicated into a
  separate store. (Rejected: a separate status hash updated on transitions — risks drift.)

### Instance death / stale state
- **D-05:** **Reuse Phase 4 grace→dropped flow** when an instance holding one party crashes. The party's
  WS simply drops; the surviving peer experiences the normal Phase 4 grace-period → `dropped` outcome.
  The dead instance's `route:{userId}` and `presence:{userId}` entries self-expire via TTL (D-02/D-04).
  No separate instance-crash detection mechanism (avoids over-engineering for the demo). A user
  reconnecting after a crash lands on any live instance (round-robin) and re-registers its route on
  connect (D-02), so signaling resumes on the new instance with no special handling.

### Demo & test scope (SCAL-01 success criterion #3)
- **D-06:** **Cross-instance integration test = two Spring contexts + Testcontainers Redis.** Spin up two
  app contexts (two simulated instances) in one test JVM sharing a single Redis Testcontainer; drive two
  `StandardWebSocketClient`s pinned to different contexts; place a call and assert signaling crosses the
  Redis pub/sub routing to the correct peer. This is the "standing test" the success criteria require and
  runs on CI (`mvn verify`). (Rejected: real `docker compose up` + external test — too slow/heavy for a
  standing verify-stage test.)
- **D-07:** **Compose adds nginx LB + a second backend only.** Add an nginx load balancer (round-robin,
  **no sticky sessions** — Redis routing makes affinity unnecessary, per CLAUDE.md) in front of
  `backend-1`/`backend-2`, with the WebSocket upgrade headers (`proxy_http_version 1.1`,
  `Upgrade`/`Connection`). Frontend service + Prometheus/Grafana stay out (Phase 9, INFR-02).

### Claude's Discretion
- How to enumerate the online set in Redis (maintain a Redis SET of online userIds vs `SCAN` over
  `presence:{userId}` keys — avoid `KEYS`). Planner/researcher choose.
- Concrete pub/sub wiring: `RedisMessageListenerContainer` topic registration, channel naming, how each
  instance discovers/owns its channel — Claude's, guided by D-01.
- Redis CAS approach for any cross-instance state mutations that need atomicity (Lua vs `WATCH/MULTI`) —
  flagged in STATE.md as a planning validation pass; Claude's, but call it out in RESEARCH.
- Exact TTL values and heartbeat coupling (presence vs route) — Claude's, consistent with Phase 2 D-04
  (~25s heartbeat / ~60s offline).
- The `RedisPresenceService` and `RedisMessageRouter` internals, as long as they are drop-in swaps for
  the Phase 2 interfaces with no caller changes.
- `SessionRegistry` stays instance-local (it holds non-serializable `WebSocketSession` objects) — only
  the routing/presence/call state is shared in Redis. Confirm this boundary during planning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 6: Horizontal Scaling" — goal, 3 success criteria, requirement IDs
- `.planning/REQUIREMENTS.md` — SCAL-01 (2+ instances behind nginx, cross-instance Redis pub/sub routing),
  SCAL-02 (all shared state in Redis, no instance-local authoritative state) (lines ~71-72)

### The scale seams (built local in Phase 2, swapped to Redis here)
- `.planning/phases/02-realtime-presence-websocket-layer/02-CONTEXT.md` — D-01 (PresenceService/MessageRouter
  are the design-for-scale seams; Phase 6 swaps in Redis with NO caller changes), D-03 (full-snapshot model),
  D-04 (~25s heartbeat / ~60s offline timing)
- `backend/src/main/java/com/vdt/webrtc/ws/MessageRouter.java` — the interface to implement (note the inline
  comment: "Phase 6: PUBLISH lên Redis channel")
- `backend/src/main/java/com/vdt/webrtc/presence/PresenceService.java` — the interface to implement
- `backend/src/main/java/com/vdt/webrtc/ws/LocalMessageRouter.java`,
  `backend/src/main/java/com/vdt/webrtc/presence/LocalPresenceService.java` — current local impls (reference
  behavior to preserve; the synchronized-per-session write pattern in LocalMessageRouter is the local-send path)

### Call state already in Redis (Phase 4)
- `.planning/phases/04-call-lifecycle-in-call-experience/04-CONTEXT.md` — server-authoritative state machine,
  grace→dropped flow (reused by D-05), end-reason taxonomy
- `backend/src/main/java/com/vdt/webrtc/call/CallStateRepository.java` — `call:{id}` hash + `user-call:{userId}`
  key (the IN_CALL source for D-04; the cross-instance shared call state)

### Stack & infra (locked)
- `CLAUDE.md` §"Infrastructure (Docker Compose services)" — backend x2, nginx LB `upstream` over
  backend-1/backend-2 with `proxy_http_version 1.1` + Upgrade/Connection headers, round-robin (no affinity),
  Redis pub/sub via `RedisMessageListenerContainer`, Lettuce (do NOT switch to Jedis), presence TTL keys
  (`presence:{userId}` EX) refreshed by WS heartbeat + a pub/sub channel per user or per instance for routing
- `CLAUDE.md` §"Database & Data Layer" — Redis 7-alpine, Lettuce client
- `CLAUDE.md` §"Testing" — `StandardWebSocketClient` for signaling integration tests; two app contexts +
  Testcontainers Redis to integration-test cross-instance routing ("the highest-value backend test in this
  project")
- `docker-compose.yml` — current services (single `backend`, postgres, coturn, redis, rabbitmq; NO nginx yet,
  backend not yet replicated) — the file D-07 modifies

### Project state notes
- `.planning/STATE.md` §Blockers/Concerns — "Phase 6: Redis CAS approach (Lua vs WATCH/MULTI) and
  cross-instance integration test design deserve a validation pass during planning"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/.../ws/MessageRouter.java` + `LocalMessageRouter.java` — the seam: add `RedisMessageRouter`
  implementing the same interface (route-map lookup + PUBLISH for `sendToUser`; for `broadcast`, the local
  path stays for same-instance sessions, with cross-instance fanout via `presence-events` per D-03).
- `backend/.../presence/PresenceService.java` + `LocalPresenceService.java` + `PresenceSweeper.java` — add
  `RedisPresenceService` using `presence:{userId}` TTL keys; the TTL replaces the local scheduled sweeper.
- `backend/.../ws/SessionRegistry.java` — stays instance-local (holds live `WebSocketSession` objects);
  `get(userId)` is the local-delivery endpoint after a routed message arrives on the owning instance.
- `backend/.../ws/PresenceWebSocketHandler.java` — connect/heartbeat/close hooks are where route-map
  write/refresh/delete (D-02) and presence-changed PUBLISH (D-03) get wired.
- `backend/.../call/CallStateRepository.java` — `user-call:{userId}` is the IN_CALL signal for D-04.
- Redis is already a dependency + compose service (Phase 4) — no new infra dependency, only new keys/channels
  and a `RedisMessageListenerContainer` + listener beans.

### Established Patterns
- Phase 2 D-01 swap-the-impl seam: implement Redis variants behind existing interfaces; callers unchanged.
  May need `@Primary`/profile-based bean selection to switch local↔Redis impls.
- Phase 4 server-authoritative + opaque-relay separation preserved: routing changes transport, not call
  semantics.
- Jackson serialization in routers uses `tools.jackson.databind.ObjectMapper` (Boot 4 / Jackson 3), per the
  existing `LocalMessageRouter` — Redis pub/sub payloads should reuse the same serializer.

### Integration Points
- WS handshake/heartbeat/close → route-map write/refresh/delete (D-02) + presence TTL (D-04).
- `sendToUser` → route-map lookup → PUBLISH to `inst:{instanceId}` → receiving instance → `SessionRegistry.get`
  → local WS write (D-01).
- presence mutation → PUBLISH `presence-events` → every instance re-reads Redis snapshot → pushes to its
  local clients (D-03).
- docker-compose: nginx LB upstream over backend-1/backend-2 + WS upgrade headers (D-07).

</code_context>

<specifics>
## Specific Ideas

- "All shared state in Redis" should be demonstrably true: the cross-instance integration test (D-06) is the
  proof artifact, and the manual demo is two browsers landing on different instances (round-robin) completing
  a call.
- Keep the change surgical — this phase is mostly new Redis-backed impls behind unchanged interfaces plus
  compose/LB wiring, not a rewrite.

</specifics>

<deferred>
## Deferred Ideas

- Full one-command compose with frontend service + Prometheus + Grafana (INFR-02) → Phase 9.
- Per-instance metrics tagging / scale-visibility dashboards → Phase 9.
- Active crash-detection (instance heartbeat for faster "dropped") → deferred (D-05 reuses grace timeout); revisit
  only if grace latency feels bad in the demo.
- Sticky-session / session-affinity LB mode → explicitly rejected (round-robin + Redis routing is the demo point).
- Room/group state in Redis → Phase 7 (mesh) consumes this phase's shared-state guarantees.

</deferred>

---

*Phase: 6-horizontal-scaling*
*Context gathered: 2026-06-29*
