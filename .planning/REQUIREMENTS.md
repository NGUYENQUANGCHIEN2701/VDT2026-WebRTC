# Requirements: VDT WebRTC — Realtime Video Call

**Defined:** 2026-06-11
**Core Value:** Hai người dùng gọi video 1-1 cho nhau ổn định, realtime, theo đúng mô hình peer-to-peer WebRTC

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Authorization

- [ ] **AUTH-01**: User can register an account with username/email and password
- [ ] **AUTH-02**: User can log in and receive a short-lived access token (15-30 min) + refresh token; the session auto-renews (axios interceptor on 401, refresh rotation) and persists across browser refresh
- [ ] **AUTH-03**: System enforces two roles (Admin, User) on both REST API and WebSocket
- [ ] **AUTH-04**: WebSocket connections are authenticated at handshake; server binds identity server-side (client `from` field never trusted)
- [ ] **AUTH-05**: User can log out from any page

### Presence & User List

- [ ] **PRES-01**: User sees a realtime list of online users with their status (online / in-call)
- [ ] **PRES-02**: Presence is tracked via Redis TTL heartbeat — crashed clients/instances go offline automatically within ~60s
- [ ] **PRES-03**: Only one active session per user — opening a new tab/device kicks the old session

### 1-1 Call & Lifecycle

- [ ] **CALL-01**: User can start a video/audio call to an online user; media flows peer-to-peer via WebRTC (SDP/ICE signaling over WebSocket)
- [ ] **CALL-02**: Callee sees an incoming-call screen with ringtone and can accept or reject
- [ ] **CALL-03**: Caller can cancel a call while it is ringing
- [ ] **CALL-04**: Unanswered call times out (~30s) and is recorded as missed for the callee
- [ ] **CALL-05**: Calling a user who is already in a call returns "busy" immediately (server-enforced, callee never rings)
- [ ] **CALL-06**: Simultaneous mutual calls (glare) are resolved cleanly without breaking either client
- [ ] **CALL-07**: Either party can hang up; both sides are notified with the end reason (completed/rejected/cancelled/missed/busy/dropped)
- [ ] **CALL-08**: Call lifecycle is owned by a server-authoritative state machine in Redis (clients send intents, render state)

### In-Call Media & Devices

- [ ] **MEDIA-01**: User can mute/unmute mic and turn camera on/off without renegotiation; remote party sees a mute/camera-off indicator
- [ ] **MEDIA-02**: User sees a self-view preview (mirrored) before accepting/starting a call
- [ ] **MEDIA-03**: User can select camera and microphone before and during a call (mid-call switch via replaceTrack)
- [ ] **MEDIA-04**: User can select audio output device (setSinkId; control hidden on unsupported browsers)
- [ ] **MEDIA-05**: getUserMedia failures (permission denied, no device, device busy) show actionable errors with audio-only fallback
- [ ] **MEDIA-06**: In-call UI shows call duration, connection status, and local PiP self-view; echo cancellation/noise suppression on by default

### Stability & Quality

- [ ] **STAB-01**: WebSocket reconnects automatically with backoff and resyncs state (presence snapshot, current call) after network blips
- [ ] **STAB-02**: Media connection recovers via ICE restart when the connection fails; in-call grace period (~10-15s) tolerates page refresh/drop before ending the call
- [ ] **STAB-03**: User sees a network quality indicator (RTT/packet loss from getStats)
- [ ] **STAB-04**: In-call debug panel shows technical stats: codec, bitrate, resolution, ICE candidate type (host/srflx/relay)

### Call History

- [ ] **HIST-01**: Call lifecycle events are published to RabbitMQ on state transitions and persisted asynchronously (realtime path never waits on the DB)
- [ ] **HIST-02**: User can view their own call history (incoming/outgoing/missed, duration, timestamps)
- [ ] **HIST-03**: History writes are idempotent (keyed by callId + event type) with DLQ for failed messages

### Advanced Call Features

- [ ] **ADV-01**: User can share their screen during a call (getDisplayMedia + replaceTrack, browser-bar stop handled)
- [ ] **ADV-02**: User can record a 1-1 call client-side (MediaRecorder, codec fallback ladder) and download the file; remote party sees a recording indicator
- [ ] **ADV-03**: Users can join group calls up to 4 people via P2P mesh (room model, joiner-initiates protocol, server-enforced cap, bitrate caps)

### Admin

- [ ] **ADMN-01**: Admin can view, lock/unlock users and change roles; locked users are force-disconnected immediately
- [ ] **ADMN-02**: Admin can view system-wide call history
- [ ] **ADMN-03**: Admin sees a live dashboard: online users, active calls, daily stats

### Scaling & Infrastructure

- [ ] **SCAL-01**: System runs 2+ signaling instances behind nginx; a call connects when caller and callee are on different instances (Redis pub/sub routing)
- [ ] **SCAL-02**: All shared state (presence, routing map, call/room state) lives in Redis — no instance-local authoritative state
- [ ] **INFR-01**: Calls work across real NATs via coturn (STUN+TURN) with ephemeral HMAC credentials; forced-relay test mode proves TURN works
- [ ] **INFR-02**: Entire system starts with one `docker compose up` (backend x2, frontend, nginx, PostgreSQL, Redis, RabbitMQ, coturn, Prometheus, Grafana) with healthchecks
- [ ] **INFR-03**: App is served over HTTPS/WSS for cross-device demos (getUserMedia secure-context requirement)
- [x] **INFR-04**: Prometheus + Grafana dashboards show per-instance metrics (WS sessions, active calls, call success rate)
- [x] **INFR-05**: GitHub Actions CI builds, tests (backend + frontend), and packages Docker images
- [x] **INFR-06**: E2E test places a real call between two browser contexts (Playwright, fake media devices) in CI
- [ ] **INFR-07**: Database schema is delivered as versioned SQL migrations (Flyway) with setup documentation

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Media & Calls

- **ADV-04**: SFU media server for group calls >4 people (room model designed as the upgrade seam)
- **ADV-05**: Group-call recording with canvas/AudioContext compositing
- **STAB-05**: One-time WebSocket ticket auth hardening (replaces query-param JWT)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| SFU / group calls >4 người | Mesh không chịu được; trái mô hình P2P của đề bài; v2 |
| Server-side recording | Media phải đi qua server — vi phạm ràng buộc P2P |
| Meeting model (link mời, lịch họp, waiting room) | Khác sản phẩm — đây là directory-call model |
| Chat/nhắn tin text | Không thuộc đề bài, là một project riêng |
| Gọi user offline / push notification | Web Push wake-up cho call phức tạp và không ổn định |
| Virtual background / blur | ML segmentation nặng CPU — thảm họa với mesh |
| Mobile app | Web-first |
| Custom E2EE | DTLS-SRTP mặc định của WebRTC là đủ |
| PSTN / SIP interop | Hố đen telephony |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 1 | Pending |
| PRES-01 | Phase 2 | Pending |
| PRES-02 | Phase 2 | Pending |
| PRES-03 | Phase 2 | Pending |
| CALL-01 | Phase 3 | Pending |
| CALL-02 | Phase 4 | Pending |
| CALL-03 | Phase 4 | Pending |
| CALL-04 | Phase 4 | Pending |
| CALL-05 | Phase 4 | Pending |
| CALL-06 | Phase 4 | Pending |
| CALL-07 | Phase 4 | Pending |
| CALL-08 | Phase 4 | Pending |
| MEDIA-01 | Phase 4 | Pending |
| MEDIA-02 | Phase 3 | Pending |
| MEDIA-03 | Phase 8 | Pending |
| MEDIA-04 | Phase 8 | Pending |
| MEDIA-05 | Phase 3 | Pending |
| MEDIA-06 | Phase 4 | Pending |
| STAB-01 | Phase 4 | Pending |
| STAB-02 | Phase 4 | Pending |
| STAB-03 | Phase 3 | Pending |
| STAB-04 | Phase 3 | Pending |
| HIST-01 | Phase 5 | Pending |
| HIST-02 | Phase 5 | Pending |
| HIST-03 | Phase 5 | Pending |
| ADV-01 | Phase 8 | Pending |
| ADV-02 | Phase 8 | Pending |
| ADV-03 | Phase 7 | Pending |
| ADMN-01 | Phase 5 | Pending |
| ADMN-02 | Phase 5 | Pending |
| ADMN-03 | Phase 5 | Pending |
| SCAL-01 | Phase 6 | Pending |
| SCAL-02 | Phase 6 | Pending |
| INFR-01 | Phase 3 | Pending |
| INFR-02 | Phase 9 | Pending |
| INFR-03 | Phase 3 | Pending |
| INFR-04 | Phase 9 | Complete |
| INFR-05 | Phase 9 | Complete |
| INFR-06 | Phase 9 | Complete |
| INFR-07 | Phase 1 | Pending |

**Coverage:**

- v1 requirements: 44 total *(corrected from 38 — recount during roadmap creation)*
- Mapped to phases: 44
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-11*
*Last updated: 2026-06-11 after roadmap creation (traceability populated)*
