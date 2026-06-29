# Phase 6: Horizontal Scaling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 6-horizontal-scaling
**Areas discussed:** Routing cross-instance, Presence & busy sync, Instance death & stale routing, Demo & test scope

---

## Routing cross-instance

| Option | Description | Selected |
|--------|-------------|----------|
| Routing map + channel per-instance | `route:{userId}→instanceId`; each instance subscribes its own channel; sendToUser PUBLISHes to target instance channel | ✓ |
| Channel per-user | One channel per user; dynamic subscribe/unsubscribe per served user | |
| Fanout broadcast | One shared channel; every instance receives, owner writes | |

**User's choice:** Routing map + channel per-instance.
**Notes:** Standard production approach, least Redis traffic, highest learning value.

| Option | Description | Selected |
|--------|-------------|----------|
| Write on connect, TTL refresh by heartbeat | SET route on handshake w/ TTL ~60s, heartbeat refreshes, delete on close, instanceId from env; TTL self-cleans stale | ✓ |
| Write on connect, explicit delete, no TTL | SET on connect / DEL on disconnect, no TTL (risks stuck entries on crash) | |
| You decide | Defer to planner | |

**User's choice:** Write on connect, TTL refresh by heartbeat.

---

## Presence & busy sync

| Option | Description | Selected |
|--------|-------------|----------|
| `presence-changed` broadcast channel | Mutating instance PUBLISHes signal; all instances re-read snapshot from Redis and push to local clients (full-snapshot model) | ✓ |
| Each instance polls Redis periodically | Periodic diff + push; simpler but polling latency/cost | |
| You decide | Defer to planner | |

**User's choice:** `presence-changed` broadcast channel.

| Option | Description | Selected |
|--------|-------------|----------|
| Online from presence TTL; IN_CALL derived from call state | Online set = presence TTL keys; IN_CALL derived from existing Redis `user-call:{userId}` at snapshot time | ✓ |
| Separate presence hash, write status on call change | Explicit status hash updated on transitions (risks drift) | |
| You decide | Defer to planner | |

**User's choice:** Online from presence TTL; IN_CALL derived from call state (single source of truth).

---

## Instance death & stale routing

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Phase 4 grace→dropped | Instance crash = WS drop; surviving peer gets normal grace→dropped; route/presence self-expire via TTL | ✓ |
| Add active crash detection | Separate instance-heartbeat mechanism for faster dropped | |
| You decide | Defer to planner | |

**User's choice:** Reuse Phase 4 grace→dropped flow.
**Notes:** Route map TTL (D-02) already self-cleans stale entries; reconnect lands on any live instance and re-registers route.

---

## Demo & test scope

| Option | Description | Selected |
|--------|-------------|----------|
| Two Spring contexts + Testcontainers Redis | Two app contexts in one JVM share a Redis container; two WS clients pinned to different contexts; assert signaling crosses pub/sub | ✓ |
| Real `docker compose up` + external test | Boot full stack, test from outside (Playwright/HTTP) — slower, heavier | |
| You decide | Defer to planner | |

**User's choice:** Two Spring contexts + Testcontainers Redis.

| Option | Description | Selected |
|--------|-------------|----------|
| nginx LB + 2 backend (minimal) | Add nginx LB (round-robin, no sticky) over backend-1/backend-2; frontend + Prometheus/Grafana stay for Phase 9 | ✓ |
| Full stack incl. frontend | Add LB + 2 backend + frontend service now (encroaches on INFR-02/Phase 9) | |
| You decide | Defer to planner | |

**User's choice:** nginx LB + 2 backend (minimal).

---

## Claude's Discretion

- Online-set enumeration in Redis (maintain a SET vs SCAN; avoid KEYS).
- Pub/sub wiring details: `RedisMessageListenerContainer` registration, channel naming, instance channel ownership.
- Redis CAS approach for atomic cross-instance mutations (Lua vs WATCH/MULTI) — RESEARCH validation pass.
- Exact TTL/heartbeat coupling (consistent with Phase 2 D-04).
- `RedisPresenceService` / `RedisMessageRouter` internals (drop-in swaps for the interfaces).
- Confirm `SessionRegistry` stays instance-local (non-serializable WebSocketSession objects).

## Deferred Ideas

- Full one-command compose w/ frontend + Prometheus + Grafana (INFR-02) → Phase 9.
- Per-instance metrics tagging / scale dashboards → Phase 9.
- Active crash-detection for faster dropped → revisit only if grace latency feels bad.
- Sticky-session LB mode → rejected (round-robin + Redis routing is the demo point).
- Room/group state in Redis → Phase 7.
