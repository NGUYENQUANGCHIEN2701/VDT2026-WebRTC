# Roadmap: VDT WebRTC — Realtime Video Call

## Overview

The journey runs identity → connectivity → core call → robustness → data & admin → scale → architecture-exercising features → operations. Phase 1 establishes auth, persistence, and the Docker/CI skeleton. Phase 2 adds the authenticated WebSocket layer and Redis-backed presence with the routing abstractions that make later scaling a swap, not a rewrite. Phase 3 delivers the core value — a 1-1 P2P video call that works across real NATs (coturn + HTTPS from day one) with perfect negotiation and candidate buffering in the first commit. Phase 4 builds the server-authoritative call state machine and full in-call experience (ringing, busy, missed, glare, reconnection). Phase 5 wires the RabbitMQ history pipeline and admin tooling on top of the state machine's guarantees. Phase 6 demonstrates horizontal scaling across 2 instances via Redis pub/sub. Phases 7-8 exercise the architecture with group mesh calls, screen sharing, recording, and device control. Phase 9 caps delivery with monitoring, E2E call tests in CI, and the one-command `docker compose up` demo.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation — Auth, Roles & Project Skeleton** - JWT register/login with Admin/User roles, PostgreSQL + Flyway, React shell, Compose + CI skeleton ✅
- [x] **Phase 2: Realtime Presence & WebSocket Layer** - Authenticated WebSocket, Redis TTL presence, realtime online-user list, single-session policy ✅
- [x] **Phase 3: 1-1 P2P Call Core & NAT Traversal** - Working P2P video call with perfect negotiation, coturn TURN relay, HTTPS/WSS, quality diagnostics ✅
- [x] **Phase 4: Call Lifecycle & In-Call Experience** - Server-authoritative state machine: ringing, busy, missed, glare, hangup reasons, reconnection, in-call UX ✅
- [x] **Phase 5: Call History & Admin** - Async history via RabbitMQ, user history view, admin user management and live dashboard ✅
- [x] **Phase 6: Horizontal Scaling** - 2+ signaling instances behind nginx, Redis pub/sub cross-instance routing, all shared state in Redis ✅
- [ ] **Phase 7: Group Mesh Calls** - Room-based P2P mesh calls up to 4 people with server-enforced cap and bitrate management *(planned; ready to execute)*
- [x] **Phase 8: Screen Share, Recording & Device Control** - Screen sharing, client-side 1-1 recording, camera/mic/speaker selection mid-call
- [ ] **Phase 9: Monitoring, CI/CD & Full Delivery** - Prometheus + Grafana per-instance metrics, Playwright E2E call test in CI, one-command full-stack startup

## Phase Details

### Phase 1: Foundation — Auth, Roles & Project Skeleton

**Goal**: Users can create accounts and securely access a running app skeleton delivered as versioned, reproducible infrastructure
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-05, INFR-07
**Success Criteria** (what must be TRUE):

  1. User can register with username/email and password, then log in and receive a JWT; the session persists across browser refresh
  2. User can log out from any page and is returned to the login screen
  3. Admin-only REST endpoints reject regular users; role checks are enforced server-side for both roles
  4. Backend + frontend + PostgreSQL start via Docker Compose; the database schema is applied through versioned Flyway SQL migrations with setup documentation

**Plans:** 4 plansPlans:
**Wave 1**

- [ ] 01-01-PLAN.md — Monorepo scaffold: pom.xml, package.json, Flyway migrations V1+V2, Docker Compose full stack, Wave 0 test stubs

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Register + login vertical slice: User/Auth/Security backend + React auth context + Login/Register/Home pages

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Refresh token rotation + session persistence + logout

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 01-04-PLAN.md — Admin RBAC (AdminController + AdminPage) + Docker Compose smoke test + docs/setup.md

**UI hint**: yes

### Phase 2: Realtime Presence & WebSocket Layer

**Goal**: Logged-in users see who is online in realtime over an authenticated WebSocket whose identity the server owns
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: AUTH-04, PRES-01, PRES-02, PRES-03
**Success Criteria** (what must be TRUE):

  1. User sees a realtime list of online users with status (online / in-call) that updates without refresh as others connect and disconnect
  2. A WebSocket connection without a valid JWT is rejected at handshake; every message is attributed server-side from the authenticated principal (client `from` field never trusted)
  3. Killing a client or instance without a clean disconnect shows that user offline automatically within ~60s (Redis TTL heartbeat)
  4. Opening a new tab or device kicks the old session — only one active session per user

**Plans:** 3 plans
**Wave 0/1**

- [ ] 02-01-PLAN.md — Wave 0 test scaffolding: Awaitility + StandardWebSocketClient harness, five backend WS integration tests, Vitest + red wsClient unit test

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-02-PLAN.md — Authenticated WS + in-memory presence backend: sealed envelope, PresenceService/MessageRouter seam, handshake interceptor, handler (single-session + heartbeat), TTL sweeper, /ws wiring

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 02-03-PLAN.md — Frontend realtime slice: native WS wrapper, presenceStore, presence UI (list/indicator/kick notice), HomePage online list, App/logout wiring + cross-browser verification

**UI hint**: yes

### Phase 3: 1-1 P2P Call Core & NAT Traversal

**Goal**: Two users on different real networks can place a video/audio call where media flows peer-to-peer, with connection quality visible
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: CALL-01, MEDIA-02, MEDIA-05, STAB-03, STAB-04, INFR-01, INFR-03
**Success Criteria** (what must be TRUE):

  1. User can call an online user and both parties see and hear each other; media flows peer-to-peer (SDP/ICE relayed opaquely over WebSocket, perfect negotiation + candidate buffering from the first implementation)
  2. User sees a mirrored self-view preview before the call; getUserMedia failures (permission denied, no device, device busy) show actionable errors with an audio-only fallback
  3. Calls connect across real NATs via coturn with ephemeral HMAC credentials; a forced-relay test mode (`iceTransportPolicy: 'relay'`) proves TURN relaying works
  4. The app is served over HTTPS/WSS so getUserMedia works on devices other than localhost
  5. In-call user sees a network quality indicator (RTT/packet loss) and a debug panel showing codec, bitrate, resolution, and ICE candidate type (host/srflx/relay)

**Plans:** 5 plans
**Wave 1** *(Wave 0 test scaffolding)*

- [ ] 03-01-PLAN.md — Wave 0 RED tests: CallSignalingTest + TurnControllerTest (BE), PeerManager/media/stats Vitest (FE)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 03-02-PLAN.md — Backend signaling slice: call message records + sealed envelope, SessionRegistry, sendToUser impl, opaque routing, TURN ephemeral-HMAC endpoint

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 03-03-PLAN.md — Frontend call core slice (STUN): media.ts, PeerManager (perfect negotiation + buffering), callStore, signaling dispatch, call UI (/call route, self-view, incoming card, hang up) — the core-value slice

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 03-04-PLAN.md — Quality + diagnostics slice: stats.ts (getStats), QualityIndicator + togglable DebugPanel wired into CallPage

**Wave 5** *(blocked on Waves 2-4 completion)*

- [ ] 03-05-PLAN.md — NAT traversal + HTTPS slice: coturn service + turnserver.conf, forced-relay proof, mkcert HTTPS/WSS, setup docs, 2-device verification

**UI hint**: yes

### Phase 4: Call Lifecycle & In-Call Experience

**Goal**: Calls behave like a real product through every lifecycle edge — ringing, busy, missed, glare, clean endings, and recovery from network blips
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: CALL-02, CALL-03, CALL-04, CALL-05, CALL-06, CALL-07, CALL-08, MEDIA-01, MEDIA-06, STAB-01, STAB-02
**Success Criteria** (what must be TRUE):

  1. Callee sees an incoming-call screen with ringtone and can accept or reject; caller can cancel while ringing; an unanswered call times out (~30s) and is recorded as missed
  2. Calling a user already in a call returns "busy" immediately without ringing the callee; simultaneous mutual calls (glare) resolve cleanly on both clients
  3. Either party can hang up and both sides see the end reason (completed/rejected/cancelled/missed/busy/dropped); the lifecycle is owned by a server-authoritative state machine in Redis with CAS transitions — clients send intents and render state
  4. User can mute mic and toggle camera without renegotiation; the remote party sees mute/camera-off indicators; in-call UI shows duration, connection status, and a local PiP self-view with echo cancellation/noise suppression on by default
  5. After a network blip, the WebSocket reconnects with backoff and resyncs state; media recovers via ICE restart; a page refresh or drop within the grace period (~10-15s) does not end the call

**Plans:** 7 plans

**Wave 1** *(Wave 0 RED test scaffolding)*

- [ ] 04-01-PLAN.md — RED tests: CallLifecycleTest + CallStateMachineTest + Testcontainers Redis (BE), callStore/mediaControls stubs (FE)

**Wave 2** *(blocked on Wave 1)*

- [ ] 04-02-PLAN.md — Redis infra + CAS core: pom/compose/yaml, Lua scripts, CallStateMachine, CallTimerService, CallStateRepository, new message records (CALL-08)

**Wave 3** *(blocked on Wave 2)*

- [ ] 04-03-PLAN.md — Control-plane refactor: CallService + PresenceWebSocketHandler dispatch, glare/busy/missed/grace timers, broadcast CallStateChanged (CALL-02..08, STAB-01/02 server side)

**Wave 4** *(blocked on Wave 3)*

- [ ] 04-04-PLAN.md — Frontend render-state slice: callStore/callActions refactor, incoming ringtone + accept/reject/cancel, busy + missed toasts, glare loser auto-callee (CALL-02..08)

**Wave 5** *(blocked on Wave 4)*

- [ ] 04-05-PLAN.md — In-call experience: mute/cam via track.enabled + relay, remote indicators, PiP, duration timer, EC/NS (MEDIA-01, MEDIA-06)

**Wave 6** *(blocked on Wave 5)*

- [ ] 04-06-PLAN.md — Recovery + end-of-call: WS reconnect resync, ICE restart, grace rejoin via sessionStorage, ReconnectOverlay, shared CallSummaryScreen (CALL-07, STAB-01, STAB-02)

**Wave 7** *(blocked on Wave 6)*

- [ ] 04-07-PLAN.md — Integration wrap-up: full suites + populated validation map + manual 2-browser/2-device verification

**UI hint**: yes

### Phase 5: Call History & Admin

**Goal**: Every call is durably recorded without touching the realtime path, and admins can manage users and observe the system live
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: HIST-01, HIST-02, HIST-03, ADMN-01, ADMN-02, ADMN-03
**Success Criteria** (what must be TRUE):

  1. After any call outcome, the user sees it in their call history with direction (incoming/outgoing/missed), duration, and timestamps
  2. Call lifecycle events are published to RabbitMQ on state transitions and persisted asynchronously — the realtime path never waits on the database; writes are idempotent (keyed by callId + event type) with a DLQ for failed messages
  3. Admin can view users, lock/unlock them, and change roles; a locked user is force-disconnected immediately
  4. Admin can view system-wide call history and a live dashboard showing online users, active calls, and daily stats

**Plans:** 4 plans
**Wave 1**

- [ ] 05-01-PLAN.md — Wave 0 RED test scaffolding: pom.xml RabbitMQ TC dep, TestcontainersConfiguration RabbitMQContainer, 8 RED test stubs (ConsumerTest, PublisherTest, ApiTest, AdminLockTest, AdminLockWsTest, AdminServiceTest, AdminHistoryApiTest, AdminDashboardApiTest)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 05-02-PLAN.md — Async history pipeline + user history UI: RabbitMQ infra (docker-compose, yaml, pom), Flyway V3 migration, RabbitMqConfig, history domain classes, CallService publisher wiring, HistoryController, HistoryPage (useInfiniteQuery, day-grouped)

**Wave 3** *(blocked on Waves 1-2 completion)*

- [ ] 05-03-PLAN.md — Admin user management: AdminService lock/unlock/changeRole + force-disconnect, AdminController PATCH endpoints, self-protection D-10, ConfirmModal, AdminPage inline actions

**Wave 4** *(blocked on Waves 1-3 completion)*

- [ ] 05-04-PLAN.md — Admin dashboard + system history: CallMetrics (AtomicLong + @Scheduled reset), CallService metric wiring, GET /api/admin/dashboard, GET /api/admin/history, DashboardCards (5s poll), SystemHistoryTable (username filter), AdminPage tabs

**UI hint**: yes

### Phase 6: Horizontal Scaling

**Goal**: The system runs as 2+ signaling instances with no instance-local authoritative state — a call connects even when caller and callee are on different instances
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: SCAL-01, SCAL-02
**Success Criteria** (what must be TRUE):

  1. Docker Compose runs 2+ backend instances behind nginx; a call connects when caller and callee are connected to different instances (Redis pub/sub routing via the route map)
  2. All shared state (presence, routing map, call/room state) lives in Redis — presence and busy status are consistent regardless of which instance a user lands on
  3. A standing integration test pins two users to different instances and verifies the call connects (cross-instance ring is the demo)

**Plans:** 4 plans

**Wave 1** *(TDD Wave 0 — RED tests + codebase pre-conditions)*

- [ ] 06-01-PLAN.md — RED test scaffold: CrossInstanceCallTest (3 tests, two SpringApplicationBuilder contexts, Testcontainers Redis/Postgres/RabbitMQ); refactor WsTestSupport to use PresenceService interface; refactor PresenceSweeper to use StringRedisTemplate directly

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 06-02-PLAN.md — Redis impl swap: RedisConfig + RedisMessageListenerContainer, RedisMessageRouter (@Primary, route-map PUBLISH), RoutingMessageListener, RoutedEnvelope, RedisPresenceService (@Primary, TTL keys + SET + IN_CALL derivation), PresenceEventListener; PresenceWebSocketHandler route-map hooks + cross-instance session-superseded kick; Local impls lose @Service

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 06-03-PLAN.md — Compose + nginx: backend-1/backend-2 with INSTANCE_ID, nginx:1.27-alpine LB (round-robin, WS upgrade headers, 3600s timeout), application.yaml app.instance-id

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 06-04-PLAN.md — Full suite gate + manual compose demo checkpoint: two browsers on different instances complete a call; redis-cli confirms distinct route:{userId} per instance

### Phase 7: Group Mesh Calls

**Goal**: Up to 4 users can join a room-based group call over P2P mesh without degrading each other's experience
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: ADV-03
**Success Criteria** (what must be TRUE):

  1. Up to 4 users can join the same group call and each participant sees and hears all others (P2P mesh, joiner-initiates protocol, per-pair politeness)
  2. A 5th join attempt is rejected server-side with a clear message (cap enforced by the server, not the client)
  3. A participant leaving (or dropping) does not break the remaining peers' connections; partial-mesh failures are surfaced in the UI
  4. Per-sender bitrate caps apply when more than 2 participants are in the room (verifiable in the debug panel)

**Plans:** 5 plans

**Wave 1** *(TDD Wave 0 — RED tests + compatibility guards)*

- [x] 07-01-PLAN.md — RED test scaffold: RoomStateMachineTest, RoomMeshTest, CrossInstanceRoomTest, MeshManager bitrate tests, and PeerManager additive mesh seam coverage

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-02-PLAN.md — Backend room state + signaling: Redis room membership, Lua atomic 4-user cap, joiner-initiates member list, participant fanout, disconnect/leave cleanup

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 07-03-PLAN.md — Frontend mesh core: additive PeerManager seams, MeshManager per-peer ownership, roomStore/realtime room actions, per-pair politeness, dynamic bitrate caps

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 07-04-PLAN.md — Group call UX: GroupCallPage, participant tiles, group invite flow, multi-select presence UI, toasts, debug panel mesh visibility

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 07-05-PLAN.md — Full suite gate + manual group-call checkpoint: 4-user cross-instance mesh, 5th-user rejection, participant leave/drop resilience, bitrate-cap proof, final 1-1 smoke check

**UI hint**: yes

### Phase 8: Screen Share, Recording & Device Control

**Goal**: In-call users get full control over what they share and which devices they use
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: ADV-01, ADV-02, MEDIA-03, MEDIA-04
**Success Criteria** (what must be TRUE):

  1. User can share their screen during a call and the remote party sees it; stopping via the browser bar reverts to the camera automatically (track.onended handled)
  2. User can record a 1-1 call client-side and download the file (MediaRecorder with codec fallback ladder); the remote party sees a recording indicator while it runs
  3. User can switch camera and microphone before and during a call without dropping the connection (replaceTrack)
  4. User can select the audio output device on supported browsers; the control is hidden where setSinkId is unsupported

**Plans**: 5 plans in 5 waves
**Wave 1** *(TDD Wave 0 — RED tests)*

- [x] 08-01-PLAN.md — RED test scaffold: PeerManager replacement helpers, MeshManager fan-out, RecordingController MIME+cleanup, RecordingSignalingTest backend validation

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-02-PLAN.md — Foundation implementation: PeerManager/MeshManager helpers, mediaDevices.ts, callActions screen share + device switching, roomActions group equivalents, store fields, backend RecordingState/RecordingStateRelay + areActiveCallPeers

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 08-03-PLAN.md — Recording engine + UI wiring: RecordingController impl (canvas compositor, audio mixer, MIME fallback), MorePanel, RecordingPreviewModal, CallPage full wiring, GroupCallPage full wiring, ParticipantTile extensions

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 08-04-PLAN.md — Polish + hardening: error handling toasts, state preservation edge cases (cam-off after share, mute after mic switch), unsupported-browser gates, responsive CSS, full test suite pass

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 08-05-PLAN.md — Full verification gate: manual checklist (screen share browser-bar stop, composited recording, device switching, speaker selector), 1-1 smoke test, 08-VALIDATION.md, ROADMAP update

**UI hint**: yes

### Phase 9: Monitoring, CI/CD & Full Delivery

**Goal**: The entire system is observable, continuously tested with a real E2E call, and starts with one command for the demo
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: INFR-02, INFR-04, INFR-05, INFR-06
**Success Criteria** (what must be TRUE):

  1. One `docker compose up` starts the entire system — backend x2, frontend, nginx, PostgreSQL, Redis, RabbitMQ, coturn, Prometheus, Grafana — with healthchecks on every service
  2. Grafana dashboards show per-instance metrics: WebSocket sessions, active calls, and call success rate (scaling demo visible in graphs)
  3. GitHub Actions CI builds, runs backend + frontend tests, and packages Docker images on every push
  4. A Playwright E2E test places a real call between two browser contexts (fake media devices) and passes in CI

**Plans:** 1/5 plans executed

**Wave 1** *(parallel — no file overlap)*

- [x] 09-01-PLAN.md — Backend metrics instrumentation: Micrometer Counter/Gauge wiring (vdt_calls_ended_total, vdt_calls_active, vdt_ws_sessions_active), instance/call_type/end_reason tags, replaces AtomicLong CallMetrics
- [ ] 09-02-PLAN.md — Full-stack compose + observability infra: frontend Dockerfile folded into nginx (D-02), Prometheus + Grafana services with provisioning-as-code, VDT WebRTC Overview dashboard
- [ ] 09-03-PLAN.md — GitHub Actions CI: backend (mvn verify), frontend (lint+vitest+build), docker-build (no push) as 3 parallel jobs on push/PR to main

**Wave 2** *(blocked on 09-03 completion — shares .github/workflows/ci.yml)*

- [ ] 09-04-PLAN.md — Playwright E2E: data-testid selectors, 2-context fake-media 1-1 call spec, 4th CI job (GitHub Actions service containers, no full compose)

**Wave 3** *(blocked on Waves 1-2 completion)*

- [ ] 09-05-PLAN.md — Full suite gate + manual checkpoint: automated suites green, docker compose up walkthrough, docs/setup.md update, 09-VALIDATION.md + ROADMAP closure

**UI hint**: no (containerizes existing frontend; adds a data-testid selector; no new screens)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Auth, Roles & Project Skeleton | 4/4 | ✅ Complete | 2026-06-14 |
| 2. Realtime Presence & WebSocket Layer | 3/3 | ✅ Complete | 2026-06-17 |
| 3. 1-1 P2P Call Core & NAT Traversal | 5/5 | ✅ Complete | 2026-06-18 |
| 4. Call Lifecycle & In-Call Experience | 7/7 | ✅ Complete | 2026-06-28 |
| 5. Call History & Admin | 4/4 | ✅ Complete | 2026-06-28 |
| 6. Horizontal Scaling | 4/4 | ✅ Complete | 2026-06-29 |
| 7. Group Mesh Calls | 5/5 | ✅ Complete | 2026-06-30 |
| 8. Screen Share, Recording & Device Control | 5/5 | ✅ Complete | 2026-07-01 |
| 9. Monitoring, CI/CD & Full Delivery | 1/5 | In Progress|  |

---
*Roadmap created: 2026-06-11*
*Coverage: 44/44 v1 requirements mapped*
*Phase 1 planned: 2026-06-12 — 4 plans in 4 waves*
*Phase 2 planned: 2026-06-14 — 3 plans in 3 waves*
*Phase 3 planned: 2026-06-18 — 5 plans in 5 waves*
*Phase 4 planned: 2026-06-26 — 7 plans in 7 waves*
*Phase 5 planned: 2026-06-28 — 4 plans in 4 waves*
*Phase 6 planned: 2026-06-29 — 4 plans in 4 waves*
*Phase 7 completed: 2026-06-30 — Wave 5 full verification passed; Phase 7 CLOSED*
*Phase 8 completed: 2026-07-01 — Wave 5 full verification passed; Phase 8 CLOSED*
