# Project Research Summary

**Project:** VDT WebRTC — Realtime Video Call
**Domain:** Realtime P2P WebRTC video calling (directory-call model: 1-1 + small-group mesh, Spring Boot signaling, horizontally scaled)
**Researched:** 2026-06-11
**Confidence:** HIGH (patterns/architecture) / MEDIUM (exact versions, coturn specifics)

## Executive Summary

This is a **directory-call product** (like Zalo/Messenger/Discord DM calls — logged-in users see who's online and call them directly), not a meeting product (Meet/Zoom links, scheduling, lobbies). That distinction drives everything: ringing, busy state, missed calls, and presence are table stakes; shareable links, waiting rooms, and chat are anti-features. Experts build this as two strictly separated planes — a **signaling plane** (nginx → Spring Boot x2 → Redis pub/sub) that handles auth, presence, and call control, and a **media plane** where audio/video flows browser-to-browser over DTLS-SRTP, with coturn assisting NAT traversal only. The server never touches media.

The recommended approach: Java 21 + Spring Boot 4.0.x with **raw `TextWebSocketHandler` and a custom JSON signaling protocol (NOT STOMP)**, Redis for cross-instance routing/presence/call state, RabbitMQ strictly for durable call-history events, PostgreSQL + Flyway for persistence; React 19 + TypeScript + Vite + Zustand on the client using **native WebRTC APIs with MDN's perfect-negotiation pattern (no wrapper libraries — all are stale)**. The single most important design artifact is a **server-authoritative call state machine** (invite/ringing/accept/reject/cancel/timeout/busy/hangup) living in Redis — busy detection, missed calls, glare resolution, and correct history events are all states of this one machine, and retrofitting it into ad-hoc messages is the classic rewrite.

The key risks are all "works on my machine, dies at the demo" failures: STUN-only setups that fail across real NATs (~10–20% of peer pairs need TURN), coturn misconfigured inside Docker bridge networking (silent failure), `getUserMedia` requiring HTTPS off-localhost, ICE candidate races, and cross-instance message routing. Mitigation: TURN configured from day one of the call phase with a forced-relay test mode, coturn on host networking with `external-ip`, the TLS story decided in the infra phase, candidate buffering and perfect negotiation in the very first signaling commit, and a `MessageRouter`/`sendToUser` abstraction from phase 1 so scaling out is a swap, not a rewrite.

## Key Findings

### Recommended Stack

Backend: Java 21 LTS + Spring Boot 4.0.x (Maven), with starters for web, websocket, security, data-jpa, data-redis, amqp, actuator, validation. JJWT for tokens, Flyway for migrations (doubles as the required DB-script deliverable), Lettuce (Boot default) for Redis. Frontend: React 19 + TypeScript 5.9 + Vite 7, Zustand for call state (usable from outside React), TanStack Query for server state, native WebRTC and WebSocket APIs throughout. Infra: Docker Compose with 2 backend replicas, nginx LB, postgres:17-alpine, redis:7-alpine, rabbitmq:4.1-management, coturn, Prometheus + Grafana. Testing: JUnit 5 + Testcontainers + Awaitility, Vitest + RTL, Playwright with fake-media flags for E2E call tests.

**Core technologies:**
- Spring Boot 4.0.x raw WebSocket (`TextWebSocketHandler`): signaling — STOMP's broker model conflicts with Redis pub/sub routing and hides the mechanics being learned
- Native `RTCPeerConnection` + perfect negotiation: peer connections — simple-peer/PeerJS are stale or replace the signaling server entirely
- Redis 7: cross-instance routing map + presence (TTL/ZSET) + authoritative call/room state — the entire scaling story
- RabbitMQ 4.1: durable async call-history pipeline only — never signaling (latency-wrong)
- coturn with ephemeral HMAC credentials (TURN REST spec): never ship static TURN passwords to browsers
- Flyway + PostgreSQL 17: versioned SQL in-repo; `ddl-auto: validate`

**Critical version caveat:** live version lookup was unavailable during research. Pin exact versions at Phase 1 setup via start.spring.io and `npm view` (checklist in STACK.md).

### Expected Features

FEATURES.md flags a significant set of **table-stakes features missing from the original project scope** — these make the difference between a toy demo and a product and must enter requirements.

**Must have (table stakes):**
- Auth + roles, online list with Redis TTL presence, 1-1 P2P call, ringing/accept/reject, missed calls, mute/camera toggles, call history, screen share, TURN fallback (already in scope)
- **Full call state machine**: busy handling, ring timeout (~30s), caller cancel, glare handling, hangup with end-reasons (MISSING from scope — flag for requirements)
- **getUserMedia failure handling** (permission denied / no device / device busy) with audio-only fallback (MISSING)
- **Device preview + camera/mic selection** before and during call; speaker selection via `setSinkId` (hide on Safari) (MISSING)
- **Reconnection handling**: WS reconnect with state resync + ICE restart — the hardest table-stakes item (MISSING)
- Network quality indicator (`getStats`), remote mute indicators, duration timer, mirrored self-view, multi-tab policy (single session, kick old), echo-cancellation constraints on by default (MISSING)

**Should have (competitive/differentiators):**
- Group mesh calls (≤4, server-enforced cap, bitrate caps) — demonstrates room architecture
- Horizontal scaling demo (caller on instance 1, callee on instance 2) — the standout engineering differentiator
- Client-side recording (1-1 only; group needs compositing — defer), admin dashboard + user management, stats/debug panel showing candidate type (host/srflx/relay), Prometheus/Grafana + CI/CD

**Defer (v2+ / anti-features):**
- Virtual backgrounds, server-side recording, SFU/>4 participants, meeting model (links/scheduling/lobbies), text chat, calling offline users/push, PSTN, custom E2EE, group-call recording compositing

### Architecture Approach

Two planes strictly separated: server-mediated signaling (one WebSocket per client, single JSON envelope multiplexing presence + call control + opaque SDP/ICE relay) and pure P2P media. The server **owns call state** in Redis with compare-and-set transitions; clients send intents and render state. Cross-instance delivery uses a `route:user:{userId} → instanceId` map plus per-instance Redis channels — **sticky sessions are explicitly the wrong answer** (caller and callee land on different instances regardless). Every call is modeled as a room (1-1 = implicit 2-person room), which unifies code paths and is the documented SFU seam for v2. Call control and SDP negotiation are separate sub-protocols: server enforces the state machine on control, relays negotiation opaquely.

**Major components:**
1. nginx — TLS, LB for REST + WS upgrade (`proxy_http_version 1.1`, `least_conn`, `proxy_read_timeout` > heartbeat), serves React build
2. Spring Boot x2 — REST module (auth, history reads, admin, TURN-credential endpoint) + signaling module (handshake auth, state machine, routing) + RabbitMQ history consumer
3. Redis — routing map, presence (ZSET + TTL heartbeat), pub/sub channels, call/room state (never durable storage)
4. RabbitMQ — durable call-event queue, competing consumers, idempotent insert keyed on `(call_id, event_type)`, DLQ
5. coturn — STUN/TURN out-of-band; host networking; ephemeral credentials minted by backend
6. React client — `PeerManager` class holding `Map<peerId, RTCPeerConnection>` outside React state; perfect negotiation per pair with deterministic politeness (`myUserId < peerUserId`)

### Critical Pitfalls

1. **No/broken TURN — works on LAN, fails at the demo** — STUN+TURN from day one of the call phase; forced-relay (`iceTransportPolicy: 'relay'`) smoke test in the pre-demo checklist
2. **coturn in Docker bridge networking** — silent failure (advertises 172.x IPs, relay ports unmapped); use `network_mode: host`, `external-ip`, narrow relay range (~40 ports)
3. **ICE candidate race** — buffer candidates per-peer, flush after `setRemoteDescription`; must be in the first signaling implementation
4. **Glare / offer collision** — perfect negotiation (polite/impolite, `makingOffer` flag) from the start of 1-1; retrofitting is painful; per-peer state machines in mesh
5. **Secure context** — `getUserMedia` is undefined on `http://192.168.x.x`; decide HTTPS/WSS story (mkcert/self-signed/tunnel) in the infra phase, before any cross-device demo
6. **Cross-instance routing** — local session maps silently fail; route everything through `sendToUser` abstraction from phase 1; standing pinned-instance integration test
7. **Client-authoritative call state** — ghost ringing, no busy detection, spoofable (`from` field must be set by server from the authenticated principal, never trusted from the client)

## Implications for Roadmap

Based on combined research (ARCHITECTURE.md build order, FEATURES.md dependency graph, PITFALLS.md phase warnings), the suggested structure:

### Phase 1: Foundation — Auth, Persistence, Skeleton
**Rationale:** Everything needs identity; lowest-risk start; establishes Compose + CI skeleton early.
**Delivers:** Spring Boot + PostgreSQL + Flyway + JWT (register/login, Admin/User), React shell with auth/routing, Compose (backend x1 + Postgres), actuator health, GitHub Actions skeleton. Pin all versions per STACK.md checklist.
**Addresses:** Register/login + roles.
**Avoids:** Pitfall #12 groundwork — decide the WS auth pattern (ticket vs query param) now, even though WS lands in Phase 2.

### Phase 2: WebSocket Layer + Presence (single instance)
**Rationale:** Signaling transport and presence are prerequisites for any call; the scaling seams must exist before call code is written on top.
**Delivers:** Handshake JWT interceptor with server-side identity binding, heartbeat, online-users list. **`MessageRouter`/`PresenceService` interfaces from day one** (local implementations first).
**Addresses:** Online list, realtime presence, multi-tab policy.
**Avoids:** #9 (ghost presence — TTL keys + connection counting), #12 (never trust client `from`), #6 (routing abstraction now, not later).

### Phase 3: 1-1 Call Core (happy path + negotiation correctness)
**Rationale:** Core product value; the riskiest client-side work, isolated in its own phase.
**Delivers:** INVITE/ACCEPT, opaque SDP/ICE relay, getUserMedia with full error handling, **perfect negotiation + per-peer candidate buffering from the first commit**, STUN+TURN URLs configured (even before coturn phase via public STUN), `PeerManager` encapsulating one peer connection (mesh-ready shape).
**Addresses:** 1-1 audio/video call, getUserMedia failure handling, audio constraints.
**Avoids:** #3 (candidate race), #4 (glare), #1 (STUN-only habit).

### Phase 4: Full Call Lifecycle — Server-Authoritative State Machine
**Rationale:** Busy/timeout/cancel/missed/glare/history-reasons are all one state machine; it must be designed completely before features pile on. Highest product-quality leverage.
**Delivers:** Redis-backed state machine with CAS transitions (ringing/reject/cancel/timeout/busy/hangup, end-reasons), ringtone + accept/reject UI, mute/camera toggles with remote indicators, connection-status UI, duration timer, reconnect grace period (~10–15s), WS reconnect with state resync.
**Addresses:** Ringing, missed calls, busy, cancel, glare, reconnection, in-call UX basics.
**Avoids:** #13 (lifecycle edge cases), #8 (reconnect desync), #14 (autoplay).

### Phase 5: coturn + ICE Config Endpoint (parallelizable with 4)
**Rationale:** The #1 demo-failure risk; isolated so failures don't block feature work. Also where the HTTPS/TLS decision lands.
**Delivers:** coturn on host networking with `external-ip`, narrow relay range, `GET /api/ice-config` minting ephemeral HMAC credentials, forced-relay debug toggle, self-signed/mkcert TLS in nginx for cross-device demos.
**Avoids:** #1, #2, #5.

### Phase 6: Call History via RabbitMQ
**Rationale:** Depends on the state machine's single-transition guarantee (only the instance winning the CAS publishes).
**Delivers:** Topic exchange, durable queue, competing consumers, idempotent insert on `(call_id, event_type)`, DLQ + retry, user history UI (TanStack Query).
**Avoids:** #13 history correctness (single-writer emission).

### Phase 7: Horizontal Scaling (2 instances)
**Rationale:** Interfaces from Phases 2/4 make this a contained implementation swap; the cross-instance ring is itself the demo.
**Delivers:** Redis route map + per-instance channels, presence ZSET, Redis call state shared, nginx LB with correct upgrade headers/timeouts, backend x2 as explicit named services. Standing test: users pinned to different instances, call connects.
**Avoids:** #6 (wrong-instance routing), #16 (compose gotchas).

### Phase 8: Group Mesh Calls (rooms, ≤4)
**Rationale:** After scaling so room state is Redis-native from day one of rooms; reuses `PeerManager` per pair.
**Delivers:** Room model in Redis, joiner-initiates join protocol, `ROOM_PEERS`/`PEER_JOINED`/`PEER_LEFT` fan-out, server-side cap of 4, per-sender bitrate caps (`setParameters` maxBitrate, ~360p when >2), per-pair politeness, partial-mesh failure surfaced in UI.
**Avoids:** #7 (CPU wall, join storm).

### Phase 9: Screen Share + Recording (parallelizable with 7–8)
**Rationale:** Both touch track management; require solid 1-1 track handling and exercise perfect negotiation.
**Delivers:** `getDisplayMedia` + centralized `setOutgoingVideoTrack` helper looping all senders, `track.onended` revert (browser-bar stop path tested), `contentHint = 'detail'`; MediaRecorder with `isTypeSupported` ladder + timeslice, **1-1 recording only**, recording-consent indicator.
**Avoids:** #10 (ended-track/mesh fan-out), #11 (codec roulette, in-memory blob).

### Phase 10: Admin Dashboard + User Management
**Rationale:** Depends on Redis presence/call state (7) and history pipeline (6).
**Delivers:** Live online/active-call stats, system-wide history, lock/unlock with force-disconnect via Redis control event, role management.

### Phase 11: Monitoring + CI/CD Completion
**Rationale:** Caps everything; per-instance metrics make the scaling demo visible.
**Delivers:** Micrometer custom metrics (WS sessions, active calls, call setup success, signaling latency) tagged by instance, Grafana dashboards as code, Playwright E2E call test with fake-media flags in CI, pre-demo checklist automation.
**Avoids:** #15 (untestable WebRTC).

### Phase Ordering Rationale

- **Identity → connectivity → core call → robustness → infrastructure → architecture-exercising features → operations** — matches both the FEATURES.md dependency graph and ARCHITECTURE.md build order.
- The three riskiest integrations (perfect negotiation in 3, coturn-in-Docker in 5, Redis routing in 7) each sit in isolated phases so failures don't cascade. Phases 5 and 9 are parallelizable slack.
- Scaling abstractions (`MessageRouter`, `PresenceService`, room-as-call model) are designed in Phases 2–4 but demonstrated in 7–8 — this is the explicit "design for scale day one, implement scale later" seam all three of STACK/ARCHITECTURE/PITFALLS independently converge on.
- The state machine (Phase 4) precedes history (6), scaling (7), and mesh (8) because all three consume its guarantees.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-plan-phase --research-phase`):
- **Phase 5 (coturn/TLS):** MEDIUM-confidence area; verify coturn flag names (`external-ip`, `static-auth-secret`, port ranges) against the coturn README for the chosen image version; TLS approach (mkcert vs tunnel vs VPS) needs a decision with demo-logistics implications.
- **Phase 9 (Recording):** scope decision with real effort implications — local-only vs composited both-sides (canvas + AudioContext); WebM duration-metadata fix approach.
- **Phase 7 (Scaling):** patterns are well-understood, but the cross-instance integration test design and Redis CAS (Lua vs WATCH/MULTI) choice deserve a quick validation pass.

Phases with standard patterns (skip research-phase):
- **Phases 1, 2, 6, 10, 11:** Spring Boot auth/JWT, WebSocket handshake, RabbitMQ DLQ/idempotency, admin CRUD, Micrometer/Prometheus — all exhaustively documented; ARCHITECTURE.md and STACK.md already specify the patterns.
- **Phases 3, 4:** perfect negotiation and the state machine are fully specified in ARCHITECTURE.md (MDN-verified this session); execution risk, not research risk.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH (choices) / MEDIUM (versions) | Stable ecosystem; live version lookup unavailable — pin at Phase 1 via STACK.md checklist |
| Features | MEDIUM-HIGH | API capabilities MDN-verified; product norms from stable training-data knowledge of Meet/Zoom/Discord |
| Architecture | HIGH (client) / MEDIUM-HIGH (server) | Perfect negotiation fetched from MDN 2026-06-11; Spring/Redis/RabbitMQ patterns are established practice, verify API signatures in-phase |
| Pitfalls | HIGH (browser/WebRTC) / MEDIUM (coturn, Spring specifics) | MDN-verified for negotiation, secure contexts, MediaRecorder; coturn guidance needs in-phase verification |

**Overall confidence:** HIGH for architecture and roadmap structure; MEDIUM for exact versions and coturn configuration details.

### Gaps to Address

- **Exact dependency versions** (Boot 4.0.x patch, Vite major, JJWT 0.12 vs 0.13, springdoc major): run the STACK.md Version Verification Checklist at Phase 1 setup.
- **coturn flags for the chosen image** (`external-ip`, `min/max-port`, `static-auth-secret`): verify against coturn README in Phase 5.
- **Cross-device demo TLS approach** (mkcert vs tunnel vs VPS): decide in Phase 5; affects demo logistics.
- **Recording scope** (local-only vs composited): design decision in Phase 9 planning with explicit effort tradeoff.
- **Missing table-stakes features** (state-machine edges, device selection, reconnection, quality indicator): must be added to REQUIREMENTS — they are not in the original project scope.

## Sources

### Primary (HIGH confidence)
- MDN WebRTC Perfect Negotiation — fetched/verified 2026-06-11 — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
- MDN Secure Contexts, MediaRecorder, setSinkId, getStats — verified 2026-06-11
- nginx WebSocket proxying — https://nginx.org/en/docs/http/websocket.html
- RabbitMQ at-least-once / competing consumers / DLQ semantics — core documented behavior

### Secondary (MEDIUM confidence)
- Spring WebSocket (`TextWebSocketHandler`, `HandshakeInterceptor`), Redis TTL/ZSET presence, coturn TURN REST credentials — established practice from training data; verify API/flag details in-phase
- Product feature norms (Meet/Zoom/Teams/Discord/Jitsi), mesh ceiling (~4), TURN relay rates (~10–20%) — stable community knowledge

### Tertiary (LOW confidence)
- Exact patch versions of all dependencies — training-data snapshot; must be pinned at setup (live lookup unavailable during research)

---
*Research completed: 2026-06-11*
*Ready for roadmap: yes*
