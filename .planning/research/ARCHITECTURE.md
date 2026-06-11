# Architecture Patterns

**Domain:** Realtime P2P WebRTC video calling (1-1 + small mesh groups), Spring Boot signaling, horizontally scaled
**Researched:** 2026-06-11
**Overall confidence:** HIGH for WebRTC client patterns (MDN-verified this session), MEDIUM-HIGH for server patterns (well-established practice, not re-verified online)

## Recommended Architecture

### System Overview

```
                                ┌─────────────────────────────────────────────┐
                                │                Docker Compose               │
 Browser A ──── HTTPS/WSS ────► │  ┌───────┐                                  │
 (React+TS)                     │  │ nginx │── /api,/ws ──┬─► backend-1 ──┐   │
     │                          │  │  LB   │              └─► backend-2 ──┤   │
     │  media (SRTP, P2P)       │  └───┬───┘   (Spring Boot x2)           │   │
     │                          │      │                                  │   │
 Browser B ◄───────────────────►│      │          ┌────── Redis ◄─────────┤   │
     ▲    direct or via TURN    │      │          │  pub/sub routing      │   │
     │                          │      │          │  presence, call state │   │
     └──── UDP ── coturn ───────│──────┘          │                       │   │
           (STUN/TURN relay     │                 ├────── RabbitMQ ◄──────┤   │
            fallback only)      │                 │  call.events queue    │   │
                                │                 │       │ consumer      │   │
                                │                 └─► PostgreSQL ◄────────┘   │
                                │                    users, call_history     │
                                │                                            │
                                │   Prometheus ──► scrapes /actuator/...     │
                                │   Grafana    ──► dashboards                │
                                └─────────────────────────────────────────────┘
```

Two planes, strictly separated:

- **Signaling plane** (server-mediated): auth, presence, call control (invite/accept/reject), SDP/ICE relay. Goes through nginx → Spring Boot → Redis pub/sub between instances.
- **Media plane** (peer-to-peer): audio/video flows browser↔browser over DTLS-SRTP. The server never touches media. coturn assists only with NAT traversal (STUN) and relays as last resort (TURN).

### Component Boundaries

| Component | Responsibility | Communicates With | Must NOT do |
|-----------|---------------|-------------------|-------------|
| **nginx** | TLS termination, LB for REST + WebSocket upgrade, serve React static build | Browsers, backend-1/2 | Hold session state; no sticky-session logic needed |
| **Spring Boot — REST module** | Auth (register/login, JWT issue), user mgmt, call history read API, admin API, ICE-server config endpoint (TURN credentials) | PostgreSQL, Redis (read presence for admin stats) | Touch WebSocket sessions directly |
| **Spring Boot — Signaling module** | WS handshake auth, local session registry, signaling message validation/routing, call state machine, presence heartbeats | Redis (pub/sub + state), RabbitMQ (publish call events) | Write call history to PostgreSQL synchronously; relay media |
| **Spring Boot — History consumer** | `@RabbitListener` consuming call events, persist to PostgreSQL | RabbitMQ, PostgreSQL | Block or be called by the realtime path |
| **Redis** | (a) userId→instanceId routing map, (b) presence (online set + TTL), (c) pub/sub channels for cross-instance signaling, (d) authoritative call/room state | Both backend instances | Be treated as durable storage |
| **RabbitMQ** | Durable async pipeline for call-history events | Backend (producer + consumer) | Carry signaling messages (latency-sensitive → Redis pub/sub instead) |
| **PostgreSQL** | Users, roles, call_history | REST module, history consumer | Hold presence or live call state |
| **coturn** | STUN binding discovery, TURN relay fallback, time-limited credential auth | Browsers directly (UDP/TCP); shares a secret with backend | Anything signaling-related |
| **React client** | UI, `RTCPeerConnection` lifecycle, perfect negotiation, getUserMedia, screen share, MediaRecorder | nginx (REST+WS), coturn, other browsers (media) | Trust its own call state over the server's |

---

## Key Design Decisions

### 1. Signaling Protocol Design

Single JSON envelope over one WebSocket connection per client:

```typescript
interface SignalMessage {
  type: MessageType;
  callId?: string;       // every call/room interaction carries this
  from?: string;         // filled by SERVER from authenticated principal — never trusted from client
  to?: string;           // target userId (1-1); for rooms, server fans out
  payload?: unknown;     // SDP, ICE candidate, reject reason, etc.
  ts: number;
}
```

**Message types — keep call control and media negotiation as separate sub-protocols:**

| Plane | Type | Direction | Notes |
|-------|------|-----------|-------|
| Call control | `CALL_INVITE` | caller→server→callee | callee userId, media kind (audio/video) |
| Call control | `CALL_RINGING` | callee→server→caller | callee client confirmed incoming-call UI shown |
| Call control | `CALL_ACCEPT` | callee→server→caller | triggers negotiation start |
| Call control | `CALL_REJECT` | callee→server→caller | reason: declined |
| Call control | `CALL_CANCEL` | caller→server→callee | caller hung up before answer → callee logs "missed" |
| Call control | `CALL_BUSY` | **server**→caller | server detects callee already in an active call |
| Call control | `CALL_TIMEOUT` | **server**→both | no answer within ring timeout (~30s) → "missed" |
| Call control | `CALL_HANGUP` | either→server→other | ends an active call |
| Negotiation | `SDP_OFFER` / `SDP_ANSWER` | peer→server→peer | opaque relay; server does not parse SDP |
| Negotiation | `ICE_CANDIDATE` | peer→server→peer | opaque relay |
| Room | `ROOM_JOIN` / `ROOM_LEAVE` | client→server | roomId |
| Room | `ROOM_PEERS` | server→client | snapshot of current members on join |
| Room | `PEER_JOINED` / `PEER_LEFT` | server→members | drives mesh setup/teardown |
| Presence | `PRESENCE_SNAPSHOT` | server→client | full online list on connect |
| Presence | `PRESENCE_UPDATE` | server→all clients | userId + online/offline/in-call |
| System | `ERROR`, `ACK` | server→client | code + correlationId |

**Why split control from negotiation:** SDP/ICE only flows after `CALL_ACCEPT`. The server enforces the state machine on control messages but relays negotiation opaquely. This is exactly the seam that allows an SFU in v2: control plane stays identical, only the negotiation counterpart changes (other browser → SFU).

**Use raw Spring WebSocket (`TextWebSocketHandler`), not STOMP.** STOMP + SockJS pulls in broker semantics and HTTP fallback transports that reintroduce sticky-session requirements and hide the routing you're trying to learn. A custom JSON protocol over plain WS is the norm for WebRTC signaling. (Confidence: MEDIUM-HIGH.)

### 2. WebSocket Sessions Across Instances: Redis Routing, Not Sticky Sessions

**Key insight: sticky sessions do not solve your problem.** Stickiness keeps *one user's* connection on one instance — but caller and callee can land on *different* instances regardless. Cross-instance routing is mandatory; once you have it, stickiness buys nothing. And since you use plain WebSocket (no SockJS fallback), a WS connection is one long-lived TCP connection that naturally stays on whichever upstream nginx picked — no LB stickiness needed at all.

**Recommended pattern (route by user→instance map):**

1. Each instance gets a unique `instanceId` (UUID at startup) and subscribes to its own Redis channel `signal:instance:{instanceId}`.
2. On WS connect, instance writes `route:user:{userId} = instanceId` (with TTL, heartbeat-refreshed) and stores the `WebSocketSession` in a local in-memory map.
3. To deliver to user X: local map has X → send directly; else `GET route:user:X` → `PUBLISH signal:instance:{thatId}`; no route key → user offline → respond per state machine.
4. On WS disconnect, delete route key and presence entries.

Simpler alternative — one global channel all instances subscribe to, filtering by local sessions — is acceptable at 2 instances, but the per-instance-channel pattern is what scales and is barely more code; build it directly.

**Design for this from day one:** put delivery behind a `MessageRouter` interface (`LocalMessageRouter` first, `RedisMessageRouter` in the scaling phase). Makes scale-out a contained refactor, not a rewrite.

### 3. Presence: TTL Keys + Pub/Sub Together (Not Either/Or)

They solve different problems — use both:

- **Truth with self-healing:** `ZADD presence:online <epochMillis> <userId>` refreshed by heartbeat (~25s, client ping or server WS ping/pong). "Online users" = `ZRANGEBYSCORE presence:online (now-60s) +inf`. A crashed instance's users age out automatically — the property pub/sub alone cannot give you.
- **Realtime notification:** on connect/disconnect, publish `{userId, online|offline}` to `presence:events`; each instance forwards `PRESENCE_UPDATE` to its connected clients. Pub/sub is fire-and-forget — late-connecting clients get the ZSET snapshot (`PRESENCE_SNAPSHOT` on connect).

The route key from §2 doubles as the per-user presence detail (instanceId, lastSeen, status `online|in-call`). Avoid Redis keyspace expiry notifications for offline detection — expiry firing is lazy and easy to miss; the ZSET score-window query is deterministic.

### 4. Room Model for Mesh Group Calls

Model **every call as a room** — a 1-1 call is a 2-person room created implicitly by `CALL_INVITE`. This unifies code paths and is the SFU seam.

Room state lives in **Redis** (any instance can serve any member):

```
room:{roomId}          → hash { state, createdBy, createdAt, type: direct|group }
room:{roomId}:members  → set of userIds
user:{userId}:room     → roomId   (BUSY detection: key exists ⇒ user in a call)
```

**Mesh topology:** N members ⇒ N(N−1)/2 peer connections; each client holds N−1 `RTCPeerConnection`s and encodes video N−1 times. 4 people = 6 connections, 3 uplink encodes per client — the practical ceiling, matching your scope. Client keeps `Map<peerId, PeerConnection>` in a `PeerManager`.

**Join flow:** newcomer sends `ROOM_JOIN` → server adds to member set, sends newcomer `ROOM_PEERS`, broadcasts `PEER_JOINED` → **newcomer initiates an offer to each existing peer** (exactly one side initiates per pair on join — no glare). `PEER_LEFT` → everyone closes that peer's connection; remaining mesh untouched (no renegotiation — a key mesh advantage).

**Politeness assignment per pair (for perfect negotiation):** `polite = (myUserId < peerUserId)` lexicographically. Deterministic, symmetric, no extra signaling.

**SFU upgrade path (v2):** room model, membership, control plane, presence — unchanged. Replace client `PeerManager` (N−1 browser connections) with a single connection to the SFU and point the negotiation relay at the SFU. Document this seam explicitly; it justifies the room abstraction now.

### 5. Perfect Negotiation (client-side) — verified against MDN

Implement on every peer connection:

- Per-pair roles: **polite** (rolls back its own offer on collision) vs **impolite** (ignores colliding offers). Identical code on both sides; behavior driven by the `polite` flag (§4).
- Three flags: `makingOffer` (set around `onnegotiationneeded` → `setLocalDescription()`), `ignoreOffer` (impolite peer discarding a colliding offer — also suppresses errors from that offer's trailing ICE candidates), `isSettingRemoteAnswerPending`.
- Use argument-less `setLocalDescription()` (auto-creates offer/answer); `setRemoteDescription(offer)` performs implicit rollback on the polite peer.
- Collision check: `offerCollision = incoming.type === "offer" && (makingOffer || !(signalingState === "stable" || isSettingRemoteAnswerPending))`.

**Why it matters here:** mute/unmute, screen share (add/replace tracks), and mid-call renegotiation all fire `onnegotiationneeded`. Without perfect negotiation, screen sharing while the other side toggles camera produces glare and broken calls; with it, renegotiation is a non-event. (Confidence: HIGH — MDN, fetched 2026-06-11.)

Also **buffer remote ICE candidates** that arrive before `setRemoteDescription` completes — the most common signaling race in homegrown implementations.

### 6. JWT Auth Over the WebSocket Handshake

The browser `WebSocket` API cannot set an `Authorization` header. Options, in order:

1. **(Recommended v1)** JWT as query parameter: `wss://host/ws?token=...`, validated in a Spring `HandshakeInterceptor.beforeHandshake`; on success put userId/roles into session attributes (or implement `DefaultHandshakeHandler.determineUser` so `session.getPrincipal()` works). Reject handshake with 401 otherwise. Downside: token may appear in nginx access logs — exclude `/ws` query strings from logs, keep JWT TTL short.
2. **(Hardening, v1.x)** One-time ticket: `POST /api/ws-ticket` with JWT → random ticket in Redis (TTL 30s, single-use) → connect with `?ticket=...`. Nothing sensitive in logs.
3. First-message auth (server closes after 5s if unauthenticated) — works, but means accepting unauthenticated sockets and more states.

Handle token expiry mid-connection by policy (pragmatic: connection lives until disconnect; re-auth on reconnect). (Confidence: MEDIUM-HIGH — verify interceptor API against current Spring docs when building.)

### 7. Call State Machine — Server-Authoritative

The **server** owns call state in Redis; clients render it. Never let clients negotiate lifecycle between themselves — that's how you get ghost "ringing" UIs and duplicate history.

```
                    CALL_INVITE
  IDLE ────────────────────────────► INVITING
                                        │  callee delivers CALL_RINGING
                                        ▼
                                     RINGING ──CALL_REJECT──► ENDED(rejected)
                                        │      ──CALL_CANCEL─► ENDED(cancelled)  [callee sees "missed"]
                                        │      ──timeout 30s─► ENDED(missed)
                                        │      ──callee busy─► ENDED(busy)       [checked at INVITE]
                                        ▼ CALL_ACCEPT
                                    CONNECTING  (SDP/ICE flowing)
                                        │  ICE connected
                                        ▼
                                     ACTIVE ───CALL_HANGUP───► ENDED(completed, duration)
                                        │
                                        └──ICE failed / WS drop──► ENDED(failed/dropped)
```

- Validate every transition (an `ACCEPT` on `ENDED` → `ERROR`). Use compare-and-set transitions in Redis (Lua or `WATCH`/`MULTI`) so two instances can't both transition the same call.
- **Busy check at INVITE:** if `user:{callee}:room` exists → server replies `CALL_BUSY` immediately; callee never rings.
- Ring timeout scheduled on the instance handling INVITE; CAS `RINGING→ENDED(missed)` on fire; call-state TTL in Redis is the backstop if that instance died.
- WS disconnect of a participant in `ACTIVE` → grace period (~10–15s) for reconnect before `ENDED(dropped)` (page refreshes happen).
- Every transition into `ENDED` publishes exactly one event to RabbitMQ (§8).

### 8. Call History via RabbitMQ — Data Flow

```
state machine transition → publish CallEvent ──► exchange "call.events" (topic)
  (CALL_STARTED, CALL_ENDED{reason,duration})         │ routing keys: call.started, call.ended
                                                      ▼
                                            queue "call-history" (durable)
                                                      │ competing consumers
                                                      ▼
                                  @RabbitListener on both instances → INSERT call_history
                                                      │ failure → retry → DLQ "call-history.dlq"
```

- **One-way flow:** the realtime path publishes and forgets; nothing in a live call waits on PostgreSQL — DB latency/outage cannot break calls. That's the whole point.
- Both instances consume the same queue (competing consumers) — each event processed once.
- **Idempotency:** unique constraint on `(call_id, event_type)`; duplicate-key treated as success (RabbitMQ is at-least-once).
- Manual ack, DLQ for poison messages, durable queue + persistent messages.
- Single-publish guarantee comes from the CAS transition in §7: only the instance that won the `→ENDED` transition publishes.
- History reads are plain REST → PostgreSQL; ms-level eventual consistency is invisible.

### 9. nginx Load Balancing WebSocket in Docker Compose

```nginx
upstream backend {
    least_conn;                      # no ip_hash needed — see §2
    server backend-1:8080;
    server backend-2:8080;
}
server {
    listen 443 ssl;
    location /api/ { proxy_pass http://backend; }
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;                   # required for Upgrade
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 300s;                  # must exceed heartbeat interval
    }
    location / { root /usr/share/nginx/html; try_files $uri /index.html; }
}
```

- `least_conn` spreads long-lived WS connections better than round-robin.
- `proxy_read_timeout` shorter than your heartbeat interval silently kills idle sockets — the classic "calls drop after 60s" bug.
- Browsers require HTTPS/WSS for `getUserMedia` anywhere except `localhost`. Compose demo on one machine works without TLS; add self-signed TLS in nginx to demo across LAN devices.
- Use two explicit services (`backend-1`, `backend-2`) rather than `deploy.replicas: 2` — easier to observe per-instance behavior in Grafana and to demo cross-instance routing.

### 10. Where coturn Fits

- coturn is **out of band** from signaling: browsers talk to it directly over UDP/TCP during ICE gathering and for relayed media. The backend never proxies media.
- Backend exposes `GET /api/ice-config` returning `iceServers` with **time-limited TURN credentials** (TURN REST mechanism: coturn `use-auth-secret` + `static-auth-secret`; backend computes `username = <expiryEpoch>:<userId>`, `credential = base64(HMAC-SHA1(secret, username))`). Never ship a static TURN password to all clients. (Confidence: MEDIUM-HIGH — verify flag names against coturn README in that phase.)
- **Docker gotcha (plan time for it):** TURN allocates relay ports from a UDP range; publishing thousands of UDP ports through Docker NAT is slow/broken. On Linux, run coturn with `network_mode: host` in Compose; set `external-ip` if NAT'd.
- On a single demo machine, ICE finds host-local candidates and TURN is never exercised — to *demo* TURN, force `iceTransportPolicy: "relay"` in `RTCConfiguration` (add a client debug toggle).

---

## Patterns to Follow

1. **Server-relayed opaque signaling** — server validates the envelope (auth, state machine, target) but never parses SDP/ICE payloads. Parsing SDP server-side adds fragility for zero benefit.
2. **One WebSocket, multiplexed protocols** — presence, call control, negotiation share one connection discriminated by `type`. One connection to authenticate, heartbeat, route, reconnect.
3. **Client reconnect with state resync** — on WS drop, reconnect with backoff; server replays `PRESENCE_SNAPSHOT` + current call/room state from Redis. With the §7 grace period, a mid-call page refresh rejoins instead of killing the call.
4. **Interfaces at the scale seams** — `MessageRouter`, `PresenceService`, `CallEventPublisher` as interfaces from phase 1; the scaling phase swaps implementations instead of rewriting handlers.

## Anti-Patterns to Avoid

1. **Client-authoritative call state** — ghost ringing UIs, impossible busy detection, duplicate/missing history, trivially spoofable. Server state machine in Redis instead; clients send intents, server emits state.
2. **Sticky sessions as the scaling story** — caller and callee still land on different instances; solves nothing, hides the real requirement. Redis route map + per-instance channels instead.
3. **RabbitMQ for signaling** — broker queueing semantics and latency are wrong for ephemeral sub-100ms relay traffic; Redis pub/sub fire-and-forget is exactly right. RabbitMQ only for durable history events.
4. **STOMP/SockJS for a custom signaling protocol** — SockJS fallbacks reintroduce sticky sessions; STOMP topics obscure the routing logic this project exists to teach.
5. **Skipping ICE candidate buffering** — candidates routinely arrive before the remote description is applied → intermittent one-way/no media. Queue per peer; flush after `setRemoteDescription`.

## Suggested Build Order

| # | Phase | Builds on | Delivers / Notes |
|---|-------|-----------|------------------|
| 1 | **Foundation: auth + skeleton** | — | Spring Boot + PostgreSQL + JWT (register/login, Admin/User), React shell with auth, Compose with backend x1 + Postgres, `/actuator/health`. Everything needs identity. |
| 2 | **WebSocket layer + presence (single instance)** | 1 | Handshake JWT interceptor, local session registry behind `MessageRouter`/`PresenceService` interfaces, heartbeat, online-users list in UI. |
| 3 | **1-1 call happy path** | 2 | INVITE/ACCEPT, SDP/ICE relay, `getUserMedia`, **perfect negotiation from the start** (retrofitting is painful), STUN-only. Core Value lands here. |
| 4 | **Full call lifecycle + state machine** | 3 | Ringing/reject/cancel/timeout/busy/hangup, server-authoritative state machine, mute/camera toggles, connection-state UI, reconnect grace. |
| 5 | **coturn + ICE config endpoint** | 3 | Time-limited TURN credentials, forced-relay debug mode to prove TURN works. Parallelizable with 4. |
| 6 | **Call history via RabbitMQ** | 4 | Event publish on state transitions, consumer → PostgreSQL, user history UI. Needs the state machine's single-transition guarantee. |
| 7 | **Horizontal scaling** | 2–4 | Swap in Redis implementations (route map, presence ZSET, pub/sub channels, call state), nginx LB, backend x2. Demo: caller on instance 1, callee on instance 2. |
| 8 | **Group calls (mesh rooms)** | 4, 7 | Room model in Redis, join/leave fan-out, client `PeerManager`, per-pair politeness. After scaling, so room state is Redis-native from day one of rooms. |
| 9 | **Screen share + recording** | 4 | `replaceTrack`/`addTrack` (exercises perfect negotiation), MediaRecorder. Independent of 7–8. |
| 10 | **Admin dashboard** | 6, 7 | User mgmt, system-wide history, live stats from Redis (online count, active calls). |
| 11 | **Monitoring + CI/CD** | all | Micrometer → Prometheus (WS connections, active calls, signaling latency, queue depth), Grafana, GitHub Actions. |

**Ordering rationale:** identity → connectivity → core call → robustness → infrastructure (TURN, MQ, scale) → features that exercise the architecture (mesh, screen share) → operations. The three riskiest integrations (perfect negotiation in 3, Redis routing in 7, coturn-in-Docker in 5) each sit in their own phase so failures are isolated. Phases 5 and 9 are parallelizable slack.

## Scalability Considerations

| Concern | 2 instances (demo) | 5–10 instances | Beyond / v2 |
|---------|--------------------|----------------|-------------|
| Signaling routing | Per-instance Redis channels | Same pattern, unchanged | Redis Cluster pub/sub or NATS |
| Presence | ZSET + heartbeat | Same; watch prune cost | Shard by user prefix |
| Group media | Mesh ≤4 (6 conns, 3 uplinks/client) | Mesh still ≤4 — more servers don't help media | SFU via the room seam |
| Call history | 1 queue, competing consumers | Same | Partitioned consumers |
| TURN | 1 coturn, host network | coturn per region | Managed TURN |

## Sources

- MDN — WebRTC perfect negotiation pattern (https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation) — **HIGH**, fetched and verified 2026-06-11.
- nginx WebSocket proxying (https://nginx.org/en/docs/http/websocket.html) — **HIGH**, long-stable documented behavior.
- RabbitMQ at-least-once / competing consumers / DLQ semantics — **HIGH**, core documented behavior.
- Spring Framework WebSocket (`TextWebSocketHandler`, `HandshakeInterceptor`, `DefaultHandshakeHandler`) — **MEDIUM-HIGH**, training data; API stable for years but verify signatures against current Spring docs in phase 2.
- coturn TURN REST credential mechanism (`use-auth-secret`; coturn README / draft-uberti-behave-turn-rest) — **MEDIUM-HIGH**, training data; verify flag names in phase 5.
- Redis pub/sub fire-and-forget + TTL/ZSET presence patterns — **MEDIUM-HIGH**, widely documented.
- Mesh ceiling (~4 participants due to N−1 uplink encodes) — **MEDIUM**, consistent across WebRTC literature; exact ceiling is hardware-dependent.
