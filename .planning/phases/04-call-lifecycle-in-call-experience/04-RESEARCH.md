# Phase 4: Call Lifecycle & In-Call Experience — Research

**Researched:** 2026-06-25
**Domain:** WebRTC call state machine (Redis CAS), Spring Boot timer management, ICE restart, track.enabled mute, WebSocket resync
**Confidence:** HIGH (codebase grounded + official docs verified)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Two planes separated. Lifecycle intents (invite/accept/reject/cancel/hangup + busy/glare/timeout/dropped decided server-side) go through server-authoritative state machine: client sends intent, server validates + CAS on Redis, then broadcasts authoritative state to both for rendering. SDP/ICE remain opaque relay as in Phase 3. Refactor client-driven `callStore` to render-state.
- **D-02:** Server-authoritative state machine in Redis with CAS is the heart of this phase. Phase 4 wires Redis for the first time (`spring-boot-starter-data-redis` / Lettuce into `pom.xml`, `redis:7-alpine` into `docker-compose.yml`). Every state transition must go through compare-and-set to prevent races (glare, double-accept, simultaneous hangup). CAS mechanism (Lua vs WATCH/MULTI), key shape, state set + transition diagram are for researcher/planner to decide.
- **D-03:** Glare resolved deterministically: lower userId wins (reproducible in tests, network-delay-independent).
- **D-04:** Loser in glare automatically becomes callee for winner's call (drops own offer, treats winner's offer as incoming) — both connect in one call without redialing.
- **D-05:** Calling a user already in a call (active OR ringing/outgoing) → server rejects immediately, callee never rings. Caller sees toast "X đang bận" and stays on Home (no navigation to `/call`).
- **D-06:** busy ≠ missed. `missed` = callee was free, phone actually rang, but no answer within ~30s. `busy` = callee was occupied, never rang — not counted as missed, no badge, no persistence.
- **D-07:** 6 end-reasons: `completed / rejected / cancelled / missed / busy / dropped`. Both sides notified. One shared summary component, copy varies by reason.
- **D-08:** After end → brief summary (duration + reason) → auto-redirect Home after ~3s with "Về ngay" button. `dropped` shows as warning (red). Others neutral.
- **D-09:** `missed` for callee in Phase 4: transient toast "Bạn đã nhỡ cuộc gọi từ X" when timeout fires if app is open. No persistence — badge/history to Phase 5.
- **D-10:** During blip (before reconnect): overlay "⟳ Đang kết nối lại…" covers video, freezes last frame, mutes audio temporarily.
- **D-11:** Server (state machine) owns grace timer. Grace expired without recovery → server transitions to `dropped` and notifies both sides (prevents state divergence). Grace = 15s, configurable via env.
- **D-12:** Refresh/drop within grace does NOT end the call. `callId` lives in Redis + stored client-side (sessionStorage). Media must renegotiate (new offer/answer — acceptable ~1-2s black). WS reconnect uses backoff then resyncs state (presence snapshot + current call). ICE restart triggers when `connectionState` = `failed` OR `disconnected` sustained for a few seconds.
- **D-13:** Mute mic / toggle cam via `track.enabled` (no renegotiation). When remote cam off → show avatar/initials on dark background + cam-off icon in remote video area.
- **D-14:** Mute/cam state signaled to peer via lightweight point-to-point relay (like sdp/ice — opaque relay). Server does NOT store in state machine.
- **D-15:** PiP self-view fixed bottom-right. Duration timer starts from `'connected'` (media truly flowing). EC/NS on by default in `getUserMedia` constraints.

### Claude's Discretion

- Exact state set + transition diagram of the state machine; CAS mechanism (Lua vs WATCH/MULTI); Redis key shape; TTL strategy for call-state keys.
- Exact shape/names of intent messages (e.g. `call-invite`) vs authoritative state messages server pushes back.
- Specific threshold for "disconnected sustained for a few seconds" before ICE restart; WS backoff curve.
- Ringtone asset, reconnect overlay animation details, exact layout of summary screen.

### Deferred Ideas (OUT OF SCOPE)

- Cross-instance routing via Redis pub/sub (SCAL-01/02) → Phase 6.
- Persistent call history / RabbitMQ / missed badge (HIST-*) → Phase 5.
- Migrate presence to Redis TTL → Phase 6 (Phase 4 only wires Redis for call-state).
- Camera/mic/speaker selection, mid-call device switch (MEDIA-03/04) → Phase 8.
- Tunnel across different networks (ngrok/cloudflared) — optional demo, not in scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CALL-02 | Callee sees incoming-call screen with ringtone; can accept or reject | IncomingCallCard extension + ringtone `<audio>` + state machine `ringing` state |
| CALL-03 | Caller can cancel while ringing | Intent `call-cancel` → CAS `ringing→ended{cancelled}` |
| CALL-04 | Unanswered call times out (~30s) and recorded as missed | Server `TaskScheduler` per-call ring timer → CAS `ringing→ended{missed}` |
| CALL-05 | Calling user already in call returns "busy" immediately; callee never rings | Busy check on `call-invite`: read per-user "current call" key before creating call record |
| CALL-06 | Simultaneous mutual calls (glare) resolve cleanly on both clients | Lua CAS + lower-userId-wins deterministic rule |
| CALL-07 | Either party can hang up; both see end reason | `call-hangup` intent → CAS `active→ended{completed}`; `CallStateChanged` broadcast |
| CALL-08 | Call lifecycle owned by server-authoritative state machine in Redis with CAS; clients send intents, render state | Lua `EVAL` atomic CAS on call hash + user-call-pointer key |
| MEDIA-01 | User can mute/unmute mic and toggle camera without renegotiation; remote party sees indicators | `track.enabled` toggle + lightweight `media-state` relay message |
| MEDIA-06 | In-call UI: duration, connection status, local PiP self-view; EC/NS on by default | `CallDurationTimer`, `QualityIndicator` (Phase 3), PiP extension, `getUserMedia` constraints |
| STAB-01 | WS reconnects with backoff and resyncs state (presence snapshot + current call) | `wsClient` backoff already exists; add resync on reconnect: server sends `state-resync` |
| STAB-02 | Media recovers via ICE restart; page refresh within grace period does not end call | `restartIce()` on `failed`/sustained `disconnected`; grace timer D-11; `callId` in sessionStorage |
</phase_requirements>

---

## Summary

Phase 4 transforms Phase 3's fragile call handshake into a production-quality call lifecycle by introducing **Redis as the first persistent shared state** in the backend. The central piece is a server-authoritative state machine with Lua-script CAS transitions living in Redis hashes, replacing the current dumb opaque relay with a validated, race-free control plane. The SDP/ICE media plane (perfect negotiation, candidate buffering) is **untouched** — only the lifecycle signals change.

The two hardest technical pieces are: (1) the Redis Lua CAS script that atomically validates `from-state` and applies `to-state` with a `callId`-keyed hash plus a per-user pointer key for busy/glare detection; and (2) the server-owned `TaskScheduler` per-call timer for ring timeout (~30s) and grace period (15s), stored in a `ConcurrentHashMap<callId, ScheduledFuture>` and cancelled on any terminal transition. Both are well-supported by Spring Data Redis and Spring's `TaskScheduler` API with documented patterns.

On the frontend, the refactor from `callActions.ts`-driven to server-state-rendering is the largest change: the existing `callStore` gains `endReason`, `micMuted`, `camOff`, `remoteMicMuted`, `remoteCamOff`, `callDurationSec`, and the new `'ended'` state. Seven new UI components are needed per the UI-SPEC. ICE restart, WS resync after reconnect, and `track.enabled` mute are each well-understood patterns with concrete implementation paths.

**Primary recommendation:** Use Lua `EVAL` (not WATCH/MULTI/EXEC) for all call state transitions — it gives true atomicity at the Redis server level without client-side retry loops. Use Spring `TaskScheduler.schedule(Runnable, Instant)` returning a `ScheduledFuture` stored per callId for cancellable ring/grace timers.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Call lifecycle state + transitions | API / Backend | Redis (storage) | Server-authoritative per D-01; clients never mutate state directly |
| Busy detection | API / Backend | Redis (per-user pointer key) | Requires atomic read-check-reject; must be server-enforced (D-05) |
| Glare resolution | API / Backend | Redis (CAS Lua script) | Deterministic lower-userId rule applied during CAS (D-03) |
| Ring timeout / grace timer | API / Backend (in-process) | — | Single-instance: `TaskScheduler` with `ScheduledFuture` per callId (D-11) |
| Authoritative state broadcast | API / Backend | MessageRouter.sendToUser | After every CAS success, push `CallStateChanged` to both parties |
| SDP / ICE relay | API / Backend (opaque) | — | Server never parses; pure byte pass-through (carry-forward from Phase 3) |
| Mute/cam state relay | API / Backend (opaque) | — | Lightweight relay like sdp/ice; not persisted in state machine (D-14) |
| ICE restart trigger | Browser / Client | — | `connectionstatechange` → `restartIce()` → onnegotiationneeded → new offer |
| WS reconnect + backoff | Browser / Client | — | `wsClient.ts` already has backoff; add `resync` request on reconnect |
| State resync after WS reconnect | API / Backend | Redis (read call state) | Server reads Redis + sends `state-resync` (presence snapshot + optional call state) |
| Duration timer display | Browser / Client | — | Client starts counting from `connected` state event; pure UI |
| Ringtone playback | Browser / Client | — | `<audio autoPlay loop>` in IncomingCallCard; no server involvement |
| PiP self-view | Browser / Client | — | Local DOM manipulation; no signaling |
| EC/NS constraints | Browser / Client | — | `getUserMedia` constraints; client-side only |

---

## Standard Stack

### Core — Backend (Phase 4 additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spring-boot-starter-data-redis` | via Boot 4.0.7 BOM | RedisTemplate + Lettuce client auto-config | CLAUDE.md mandates Lettuce (Boot default); provides `StringRedisTemplate` + `RedisScript` execution |
| Lettuce | via Boot BOM (~6.5.x) | Non-blocking Redis client | Boot default, netty-based, handles pipelining; CLAUDE.md explicitly forbids Jedis/Redisson |
| `spring-scheduling` | via `spring-boot-starter-web` (already present) | `TaskScheduler` for ring/grace timers | Part of Spring Framework; no extra dep needed; `ThreadPoolTaskScheduler` provides cancellable `ScheduledFuture` |

[VERIFIED: docs.spring.io/spring-boot/reference/data/nosql.html#data.nosql.redis]

### Core — Frontend (Phase 4 additions)

No new npm packages required. All Phase 4 frontend work uses:
- Native `RTCPeerConnection.restartIce()` (W3C spec, all modern browsers) [VERIFIED: developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce]
- `track.enabled` (MediaStreamTrack spec) [VERIFIED: webrtc-developers.com]
- Native `sessionStorage` (Web Storage API)
- Existing Zustand 5.x, React 19.x stack

### Supporting — Backend Tests

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `testcontainers` GenericContainer | 1.21.0 (already in pom.xml) | Redis container for integration tests | Use `new GenericContainer<>("redis:7-alpine").withExposedPorts(6379)` with `@ServiceConnection(name="redis")` |

[VERIFIED: docs.spring.io/spring-boot/reference/testing/testcontainers.html]

### No New Frontend Packages

No npm packages are added in Phase 4. The slopcheck legitimacy audit section below confirms this.

**Installation (backend pom.xml additions):**
```xml
<!-- Runtime -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>

<!-- Test only — Testcontainers generic (testcontainers:testcontainers already in pom.xml) -->
<!-- GenericContainer is already available; no additional artifact needed -->
```

**application.yaml additions:**
```yaml
spring:
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}

call:
  ring-timeout-seconds: ${CALL_RING_TIMEOUT_SECONDS:30}
  grace-period-seconds: ${CALL_GRACE_PERIOD_SECONDS:15}
```

**docker-compose.yml addition:**
```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 10
```

---

## Package Legitimacy Audit

> This phase's only new packages are Maven/JVM artifacts, not npm. slopcheck is npm-only and
> does not apply to Maven/JVM packages. The packages below are all official Spring/Testcontainers
> artifacts with long histories.

| Package | Registry | Age | Source Repo | Disposition |
|---------|----------|-----|-------------|-------------|
| `org.springframework.boot:spring-boot-starter-data-redis` | Maven Central | ~12 yrs | github.com/spring-projects/spring-boot | Approved [VERIFIED: docs.spring.io] |
| `io.lettuce:lettuce-core` | Maven Central | ~10 yrs | github.com/lettuce-io/lettuce-core | Approved (Boot BOM manages) [VERIFIED: docs.spring.io] |
| No new npm packages | — | — | — | Not applicable |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck not run (wrong ecosystem — Maven, not npm). All packages verified via official Spring documentation.*

---

## Architecture Patterns

### System Architecture Diagram — Phase 4 Control Plane

```
CLIENT (Alice)                  BACKEND                         CLIENT (Bob)
    |                               |                               |
    |-- call-invite -->             |                               |
    |   (intent: to=Bob)            |                               |
    |                         [CAS Lua: check Bob busy?]           |
    |                         [HSET call:{callId} state=ringing]   |
    |                         [SET user-call:{Bob} callId]         |
    |                         [SET user-call:{Alice} callId]       |
    |                         [schedule ring timer 30s]            |
    |<-- CallStateChanged           |  CallStateChanged -->        |
    |   {state:ringing}             |  {state:ringing}             |
    |                               |                               |
    |           Bob accepts:        |                               |
    |                               |<-- call-accept ---           |
    |                         [cancel ring timer]                  |
    |                         [CAS Lua: ringing→active]            |
    |<-- CallStateChanged           |  CallStateChanged -->        |
    |   {state:active}              |  {state:active}              |
    |                               |                               |
    |   SDP/ICE relay (opaque, unchanged from Phase 3)            |
    |<-- sdp-received ------------  |  ----------- sdp-received -->|
    |<-- ice-candidate-received --  |  -- ice-candidate-received ->|
    |                               |                               |
    |   MEDIA FLOWS P2P (server never sees media)                  |
    |                               |                               |
    | mute-state (track.enabled)    |                               |
    |-- media-state: {mic:false} -> |  -- media-state relay -----> |
    |   (opaque relay, no Redis)    |                               |
    |                               |                               |
    | Alice hangs up:               |                               |
    |-- call-hangup -->             |                               |
    |                         [CAS Lua: active→ended{completed}]   |
    |                         [cancel grace timer if any]          |
    |                         [DEL user-call:{Alice}]              |
    |                         [DEL user-call:{Bob}]                |
    |                         [update presence: ONLINE]            |
    |<-- CallStateChanged           |  CallStateChanged -->        |
    |   {state:ended,reason:        |  {state:ended,reason:        |
    |    completed}                 |   completed}                 |
```

### Redis Key Shape (Claude's Discretion — recommended design)

```
call:{callId}          HASH
  state                ringing | active | ended
  reason               null | completed | rejected | cancelled | missed | busy | dropped
  callerId             alice
  calleeId             bob
  createdAt            epoch-ms
  activeAt             epoch-ms (set when ringing→active)
  endedAt              epoch-ms (set on terminal transition)
  TTL                  5 minutes after creation (auto-cleanup)

user-call:{userId}     STRING = callId  (EX 300)
  TTL                  5 minutes
  Purpose: busy check (exists = user has a current call);
           glare detection (compare callerIds)
```

**Key insight:** Two keys per call: the call hash (full state) and two per-user pointers (for O(1) busy check). Both get TTL 300s as safety net against leaked calls. The Lua CAS script transitions `call:{callId}.state` and manages `user-call:` pointer cleanup on terminal transitions.

### State Transition Diagram

```
                     [call-invite from Alice to Bob]
                              |
                    [busy? → ended{busy}, immediate]
                    [glare? → lower userId wins]
                              |
                           RINGING
                         /    |    \
              [call-accept] [ring  [call-reject]
              (Bob)         timeout [call-cancel]
                |           ~30s]    (Alice/Bob)
                |             |          |
              ACTIVE      ended{missed} ended{rejected|cancelled}
             /     \
    [call-hangup] [WS-disconnect sustained > grace=15s]
    (either side)  |
          |    ended{dropped}
   ended{completed}
```

All transitions are CAS; non-terminal transitions can also include:
- `disconnected` (WS drop within grace — NOT a terminal state; grace timer starts)
- `reconnecting` (internal sub-state on client only — Redis does not track this)

### Lua CAS Script Pattern

[VERIFIED: docs.spring.io/spring-data/redis/reference/redis/scripting.html]

```lua
-- transition_call.lua
-- KEYS[1] = call:{callId}
-- KEYS[2] = user-call:{userId1}  (optional cleanup on terminal)
-- KEYS[3] = user-call:{userId2}  (optional cleanup on terminal)
-- ARGV[1] = expected current state (e.g. "ringing")
-- ARGV[2] = new state (e.g. "active")
-- ARGV[3] = reason (e.g. "completed", or "" for non-terminal)
-- ARGV[4] = now-epoch-ms (for activeAt / endedAt timestamps)
-- Returns: 1 = success, 0 = wrong current state (caller must retry or fail)

local current = redis.call('HGET', KEYS[1], 'state')
if current ~= ARGV[1] then
    return 0
end
redis.call('HSET', KEYS[1], 'state', ARGV[2])
if ARGV[3] ~= '' then
    redis.call('HSET', KEYS[1], 'reason', ARGV[3])
end
if ARGV[2] == 'active' then
    redis.call('HSET', KEYS[1], 'activeAt', ARGV[4])
end
if ARGV[2] == 'ended' then
    redis.call('HSET', KEYS[1], 'endedAt', ARGV[4])
    if KEYS[2] ~= '' then redis.call('DEL', KEYS[2]) end
    if KEYS[3] ~= '' then redis.call('DEL', KEYS[3]) end
end
return 1
```

**Spring integration:**
```java
// Source: docs.spring.io/spring-data/redis/reference/redis/scripting.html
@Bean
DefaultRedisScript<Long> callTransitionScript() {
    DefaultRedisScript<Long> script = new DefaultRedisScript<>();
    script.setLocation(new ClassPathResource("scripts/transition_call.lua"));
    script.setResultType(Long.class);
    return script;
}

// In CallStateMachine:
Long result = redisTemplate.execute(
    callTransitionScript,
    List.of("call:" + callId, "user-call:" + callerId, "user-call:" + calleeId),
    expectedState, newState, reason, String.valueOf(System.currentTimeMillis())
);
boolean success = result != null && result == 1L;
```

### Server-Owned Timer Pattern

[VERIFIED: docs.spring.io/spring-framework/reference/integration/scheduling.html]

```java
// CallTimerService.java
@Service
public class CallTimerService {
    private final TaskScheduler scheduler;
    private final ConcurrentHashMap<String, ScheduledFuture<?>> ringTimers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ScheduledFuture<?>> graceTimers = new ConcurrentHashMap<>();

    // Ring timer: ~30s → missed if not accepted
    public void scheduleRingTimeout(String callId, Duration timeout, Runnable onTimeout) {
        ScheduledFuture<?> f = scheduler.schedule(() -> {
            ringTimers.remove(callId);
            onTimeout.run();
        }, Instant.now().plus(timeout));
        ringTimers.put(callId, f);
    }

    public boolean cancelRingTimer(String callId) {
        ScheduledFuture<?> f = ringTimers.remove(callId);
        return f != null && f.cancel(false);
    }

    // Grace timer: 15s after WS disconnect → dropped if not reconnected
    public void scheduleGrace(String callId, Duration grace, Runnable onExpired) {
        ScheduledFuture<?> f = scheduler.schedule(() -> {
            graceTimers.remove(callId);
            onExpired.run();
        }, Instant.now().plus(grace));
        graceTimers.put(callId, f);
    }

    public boolean cancelGrace(String callId) {
        ScheduledFuture<?> f = graceTimers.remove(callId);
        return f != null && f.cancel(false);
    }
}
```

**TaskScheduler bean (single-instance only):**
```java
@Bean
ThreadPoolTaskScheduler callTimerScheduler() {
    ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
    s.setPoolSize(4);   // 2 active calls × 2 timer types max reasonable concurrency
    s.setThreadNamePrefix("call-timer-");
    s.setWaitForTasksToCompleteOnShutdown(false);
    return s;
}
```

### Control Plane Refactor: Phase 3 → Phase 4

The key structural change is inserting `CallStateMachine`/`CallService` between the WS handler receiving client intents and `MessageRouter.sendToUser`:

```
Phase 3 (current):
  WS handler → opaque relay → sendToUser(to, received-message)

Phase 4 (new):
  WS handler → CallService.handleIntent(username, intent)
                  ↓
              Lua CAS on Redis
                  ↓ success
              manage timers (schedule/cancel)
                  ↓
              update PresenceStatus (ONLINE ↔ IN_CALL)
                  ↓
              MessageRouter.sendToUser(caller, CallStateChanged)
              MessageRouter.sendToUser(callee, CallStateChanged)
```

SDP/ICE messages bypass `CallService` and remain opaque relay (no change).

### New Message Type Design

**Rename existing intents for clarity (backward-compat within Phase 4 refactor):**

```
Client → Server (intents — renamed for precision):
  call-invite   (was: call-offer)
  call-accept   (unchanged)
  call-reject   (unchanged)
  call-cancel   (unchanged)
  call-hangup   (was: hang-up)
  media-state   (NEW: {mic: boolean, cam: boolean})
  state-resync  (NEW: client asks for current state on WS reconnect)

Server → Client (authoritative state events):
  call-state-changed  (NEW: {callId, state, reason?, callerUserId, calleeUserId})
  media-state-relay   (NEW: opaque relay of remote's media-state)
  state-resync-ack    (NEW: {presence: OnlineUser[], currentCall?: CallStateChanged})
```

**Important:** The existing `ClientMessage` sealed interface and `ServerMessage` sealed interface must be extended. New records are added to both. The `@JsonSubTypes` annotations on both sealed interfaces must be updated.

### WS Reconnect + State Resync Pattern

[ASSUMED — based on standard WebSocket resync pattern]

```typescript
// wsClient.ts: on reconnect (socket.onopen in reconnect path)
socket.onopen = () => {
  backoff = INITIAL_BACKOFF_MS
  usePresenceStore.getState().setConnState?.('open')
  startHeartbeat()
  
  // NEW: if there was an active call, request resync
  const { callId } = useCallStore.getState()
  if (callId) {
    sendSignal({ type: 'state-resync', callId })
  }
}

// Server handler for state-resync:
// 1. Read call:{callId} from Redis
// 2. Send state-resync-ack with presence snapshot + call state (if still active)
// 3. If call ended (or callId not found in Redis), send ended{dropped}
```

### ICE Restart Pattern

[VERIFIED: developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce]

```typescript
// PeerManager.ts additions:
private reconnectTimer: ReturnType<typeof setTimeout> | null = null
private readonly RECONNECT_GRACE_MS = 4000  // 4s delay on 'disconnected' before restart

private setupHandlers() {
  // ... existing handlers ...

  // Watch BOTH connectionState and iceConnectionState
  this.pc.onconnectionstatechange = () => this.handleConnectionStateChange()
}

private handleConnectionStateChange() {
  const state = this.pc.connectionState
  
  if (state === 'failed') {
    // Failed = definitive; restart ICE immediately
    this.clearReconnectTimer()
    useCallStore.getState().setCallState('reconnecting')
    this.pc.restartIce()   // triggers onnegotiationneeded → new offer with ice-restart flag
  } else if (state === 'disconnected') {
    // Disconnected = may self-recover; wait RECONNECT_GRACE_MS before restart
    useCallStore.getState().setCallState('reconnecting')
    this.reconnectTimer = setTimeout(() => {
      if (this.pc.connectionState === 'disconnected') {
        this.pc.restartIce()
      }
    }, this.RECONNECT_GRACE_MS)
  } else if (state === 'connected') {
    this.clearReconnectTimer()
    useCallStore.getState().setCallState('connected')
  }
}

private clearReconnectTimer() {
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }
}
```

**Note:** `restartIce()` triggers `onnegotiationneeded`, which calls the existing `handleNegotiationNeeded()` in PeerManager. The resulting offer automatically contains `a=ice-ufrag` and `a=ice-pwd` attributes with new values, signaling ICE restart to the remote peer. The impolite/polite role and perfect negotiation logic handle collisions. [VERIFIED: MDN restartIce docs]

### Mute/Cam — track.enabled Pattern

[VERIFIED: webrtc-developers.com/state-of-a-mediastreamtrack/]

```typescript
// In callActions.ts or new mediaControls.ts:
export function toggleMic() {
  const audioTrack = localStream?.getAudioTracks()[0]
  if (!audioTrack) return
  audioTrack.enabled = !audioTrack.enabled            // no renegotiation
  const muted = !audioTrack.enabled
  useCallStore.getState().setMicMuted(muted)
  
  // Notify remote via relay (D-14)
  const { remoteUserId, callId } = useCallStore.getState()
  if (remoteUserId && callId) {
    sendSignal({ type: 'media-state', to: remoteUserId, callId,
                 mic: audioTrack.enabled, cam: getCamEnabled() })
  }
}

export function toggleCam() {
  const videoTrack = localStream?.getVideoTracks()[0]
  if (!videoTrack) return
  videoTrack.enabled = !videoTrack.enabled
  const off = !videoTrack.enabled
  useCallStore.getState().setCamOff(off)
  
  const { remoteUserId, callId } = useCallStore.getState()
  if (remoteUserId && callId) {
    sendSignal({ type: 'media-state', to: remoteUserId, callId,
                 mic: getMicEnabled(), cam: videoTrack.enabled })
  }
}
```

**Why `track.enabled` not `replaceTrack(null)`:** `track.enabled = false` sends silence/black frames, which is faster and requires no renegotiation. The remote can detect the transition from active video to black frames but the explicit `media-state` signal is more reliable for UI updates. [VERIFIED: webrtc-developers.com]

### EC/NS getUserMedia Constraints

[ASSUMED — based on W3C Media Capture spec and common browser behavior]

```typescript
// In media.ts (Phase 3 file) — already present, confirm constraints include:
const constraints: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,   // EC on by default (D-15)
    noiseSuppression: true,   // NS on by default (D-15)
    autoGainControl: true,    // standard pairing with EC/NS
  },
  video: true,
}
```

### Recommended Project Structure (Backend additions)

```
backend/src/main/java/com/vdt/webrtc/
├── call/
│   ├── CallService.java              // orchestrates CAS + timer + presence + broadcast
│   ├── CallStateMachine.java         // wraps RedisTemplate + Lua scripts
│   ├── CallTimerService.java         // TaskScheduler wrapper; ring + grace ScheduledFutures
│   ├── CallStateRepository.java      // thin Redis CRUD (HGETALL, HSET, TTL management)
│   └── TurnController.java           // existing (Phase 3)
├── ws/
│   ├── PresenceWebSocketHandler.java // extend: route intents to CallService
│   ├── message/
│   │   ├── ClientMessage.java        // add: CallInvite, MediaState, StateResync
│   │   └── ServerMessage.java        // add: CallStateChanged, MediaStateRelay, StateResyncAck
│   └── ...
├── presence/
│   └── LocalPresenceService.java     // extend: updateStatus(userId, IN_CALL/ONLINE)
└── config/
    └── SchedulerConfig.java          // ThreadPoolTaskScheduler bean
```

```
backend/src/main/resources/
└── scripts/
    └── transition_call.lua           // Lua CAS script
```

### Frontend additions

```
frontend/src/
├── store/
│   └── callStore.ts                  // extend: endReason, micMuted, camOff, remote*, ended state
├── realtime/
│   ├── callActions.ts                // refactor: intents + handle CallStateChanged
│   ├── mediaControls.ts             // NEW: toggleMic, toggleCam
│   └── messages.ts                  // extend: new message types
├── webrtc/
│   └── PeerManager.ts               // extend: restartIce + connectionstatechange
└── components/call/
    ├── CallButtons.tsx               // extend: MuteButton, CamToggleButton
    ├── CallDurationTimer.tsx         // NEW
    ├── RemoteStatusBadge.tsx         // NEW (RemoteMuteIndicator)
    ├── RemoteCamOffOverlay.tsx       // NEW
    ├── ReconnectOverlay.tsx          // NEW
    └── CallSummaryScreen.tsx         // NEW
```

### Anti-Patterns to Avoid

- **WATCH/MULTI/EXEC for call state transitions:** WATCH/MULTI/EXEC requires client-side retry on contention and has complex error handling (stuck connections, must call DISCARD on exception). For state machine transitions where you want "transition or fail cleanly," Lua EVAL is strictly better. [VERIFIED: docs.spring.io/spring-data/redis/reference/redis/transactions.html]
- **Storing mute/cam state in Redis:** D-14 explicitly forbids this. Mute/cam is in-call media control, not lifecycle. Relay it as an opaque message just like sdp/ice.
- **Client-side ring timeout:** D-11 mandates server ownership. Client-side timers diverge across devices and tab-navigations.
- **Putting RTCPeerConnection in Zustand:** Non-serializable; causes devtools issues and re-render storms. Phase 3 already established the correct pattern (module-level `peer` variable, only derived state in Zustand).
- **`connectionState === 'disconnected'` → immediate ICE restart:** Disconnected is transient and often self-heals in 1-2s. A 4s debounce prevents unnecessary restarts on brief hiccups. [CITED: developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState]
- **`callId` client-generated without server validation:** Phase 3 has `crypto.randomUUID()` on client. Keep this but server must validate that the `callId` in intents matches the Redis record (prevent callId-injection attacks). Server generates the canonical callId on the first valid `call-invite`.
- **Blocking the WS handler thread on Redis I/O:** `PresenceWebSocketHandler` runs on the WS thread pool. Redis calls via Lettuce are synchronous by default through `RedisTemplate`. Keep Redis ops fast (Lua scripts are sub-millisecond); do not add blocking I/O (DB reads, HTTP calls) in the hot WS path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic state transition | Custom Java synchronized blocks | Lua EVAL via `RedisTemplate.execute(RedisScript)` | Server-side atomicity; Java locks don't work across restart/future instances |
| Per-call cancellable timer | `Thread.sleep` loops | `TaskScheduler.schedule(Runnable, Instant)` → `ScheduledFuture.cancel()` | Clean cancellation, thread pool managed by Spring, graceful shutdown |
| Redis test infrastructure | In-memory Redis mock | Testcontainers `GenericContainer("redis:7-alpine")` + `@ServiceConnection(name="redis")` | Tests must match production behavior; Redis command semantics (especially Lua) differ from mocks |
| ICE restart signaling | Custom offer generation | `RTCPeerConnection.restartIce()` | Spec-compliant; triggers existing `onnegotiationneeded` flow; works with perfect negotiation |
| Mute without renegotiation | `replaceTrack(null)` | `track.enabled = false` | No renegotiation needed; faster; simpler; standard pattern |

**Key insight:** The Redis Lua CAS approach elegantly solves glare, busy, and double-accept with a single mechanism. The same `transition_call.lua` script handles all lifecycle transitions; only the `ARGV` values change.

---

## Common Pitfalls

### Pitfall 1: callId ownership — who generates it?
**What goes wrong:** Phase 3 has `crypto.randomUUID()` on the client for callId. With a server-authoritative state machine, the server must own the canonical callId to prevent spoofing.
**Why it happens:** The design naturally evolved from a relay model (client generates IDs freely) to a validated model.
**How to avoid:** Server generates the callId on receiving the first `call-invite` (or validates and issues a canonical one). The server's generated callId is sent back in `CallStateChanged` and used by both sides for all subsequent intents. The client's proposed callId can be ignored or used as an idempotency hint.
**Warning signs:** If the client sends `call-accept` with a callId that doesn't exist in Redis, the CAS fails immediately.

### Pitfall 2: Glare window race condition with `user-call:` pointer
**What goes wrong:** Both Alice and Bob send `call-invite` to each other within the same millisecond. Two calls are created in Redis before either `user-call:` pointer check sees the other.
**Why it happens:** The busy check (read `user-call:{Bob}`) and the write (`SET user-call:{Bob}` = newCallId) are two separate Redis commands, creating a TOCTOU window.
**How to avoid:** The `call-invite` handler must use a separate Lua script that atomically: (1) checks `user-call:{callee}` exists → return busy, (2) checks `user-call:{caller}` exists → glare (compare callIds / userIds), (3) creates `call:{callId}` hash AND sets both `user-call:` pointers in one atomic operation.
**Warning signs:** Two concurrent invites creating two separate Redis call records with both `user-call:` pointers pointing to their respective calls.

### Pitfall 3: Grace timer not cancelled on successful WS reconnect
**What goes wrong:** Alice's WS drops, grace timer starts. Alice reconnects within 3s. If `cancelGrace(callId)` is not called on reconnect, the grace timer still fires at 15s and incorrectly transitions the call to `dropped`.
**Why it happens:** The reconnect flow (`afterConnectionEstablished` → `state-resync`) must explicitly cancel the grace timer for that callId.
**How to avoid:** After WS reconnect, when server reads Redis and finds call in `active` state, call `callTimerService.cancelGrace(callId)` before sending the resync-ack.
**Warning signs:** Test: Alice in call, kill WS, reconnect in 2s, wait 15s → call should NOT drop.

### Pitfall 4: Redis Lua script serialization mismatch
**What goes wrong:** Spring `RedisTemplate` uses Java serialization by default, so string keys like `"call:abc"` are stored with a Java-serialization prefix. The Lua script does `HGET KEYS[1]` and gets `\xac\xed\x00\x05t\x00\x08call:abc` instead of `call:abc`, causing CAS to always fail.
**Why it happens:** Default `RedisTemplate<Object, Object>` uses `JdkSerializationRedisSerializer`.
**How to avoid:** Use `StringRedisTemplate` (which uses `StringRedisSerializer` for both keys and values), or explicitly configure `RedisTemplate` with `StringRedisSerializer` for keys and `GenericToStringSerializer` for values.
**Warning signs:** Lua script always returns 0; manually inspecting Redis keys shows binary-prefixed strings.

### Pitfall 5: `connectionstatechange` vs `iceconnectionstatechange` — which to use
**What goes wrong:** Using only `iceconnectionstatechange` misses the aggregate connection state. Using only `connectionstatechange` may miss fine-grained ICE states.
**Why it happens:** MDN `restartIce` examples use `iceconnectionstatechange`; the Phase 3 `PeerManager` uses `iceconnectionstatechange`. Both are valid.
**How to avoid:** For ICE restart trigger: use `onconnectionstatechange` to check `connectionState === 'failed'` (aggregate, more reliable for "give up"). For the 4s debounce on `disconnected`: also use `onconnectionstatechange`. Keep `iceconnectionstatechange` for the existing `mapIceState()` call. [CITED: developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState]
**Warning signs:** ICE restart never fires on mobile (where `iceConnectionState` goes `disconnected` but `connectionState` stays `connected` briefly).

### Pitfall 6: `@ServiceConnection(name="redis")` requires GenericContainer explicit name
**What goes wrong:** Using `new GenericContainer<>("redis:7-alpine")` without `@ServiceConnection(name="redis")` causes Spring Boot to fail to auto-configure the Redis connection.
**Why it happens:** Spring Boot can auto-detect `RedisContainer` typed container but not `GenericContainer` without the `name` hint.
**How to avoid:** Use `@ServiceConnection(name = "redis")` on the `GenericContainer` bean in `TestcontainersConfiguration.java`.
**Warning signs:** Tests fail with `Connection refused: localhost:6379` despite the container running.

### Pitfall 7: ICE restart after page refresh (grace window) needs a new PeerManager
**What goes wrong:** Page refresh destroys the entire React app including the `PeerManager` instance. On rejoin within grace, the client has no `RTCPeerConnection` — it must create a fresh one and initiate a new offer/answer cycle (not `restartIce()` on a dead PC).
**Why it happens:** `restartIce()` operates on an existing `RTCPeerConnection`. After page refresh, the PC is gone.
**How to avoid:** On `state-resync-ack` with `currentCall.state === 'active'`, treat it like a fresh call-accept: create a new `PeerManager` and initiate a new offer. The `polite` role assignment must be consistent (e.g., callee stays polite even after rejoin). Store `polite` assignment in sessionStorage alongside `callId`.
**Warning signs:** Both rejoining peers both send offers → offer collision → one side gets stuck.

---

## Code Examples

### CAS transition with Spring RedisTemplate + Lua

```java
// Source: docs.spring.io/spring-data/redis/reference/redis/scripting.html
@Service
public class CallStateMachine {
    private final StringRedisTemplate redis;
    private final RedisScript<Long> transitionScript;

    public boolean transition(String callId, String fromState, String toState,
                              String reason, String callerId, String calleeId) {
        Long result = redis.execute(
            transitionScript,
            List.of("call:" + callId,
                    "user-call:" + callerId,
                    "user-call:" + calleeId),
            fromState, toState,
            reason != null ? reason : "",
            String.valueOf(System.currentTimeMillis())
        );
        return result != null && result == 1L;
    }
}
```

### Creating a call record atomically (call-invite handler)

```java
// New Lua script: create_call.lua
// KEYS[1] = call:{callId}
// KEYS[2] = user-call:{callerId}
// KEYS[3] = user-call:{calleeId}
// ARGV[1] = callId, ARGV[2] = callerId, ARGV[3] = calleeId, ARGV[4] = now-ms, ARGV[5] = TTL-seconds
// Returns: 0=busy, -1=glare (caller has active call), 1=success
local busyKey = redis.call('GET', KEYS[3])
if busyKey then return 0 end  -- callee busy
local callerBusy = redis.call('GET', KEYS[2])
if callerBusy then return -1 end  -- caller already in call → glare
redis.call('HSET', KEYS[1], 'state', 'ringing',
           'callerId', ARGV[2], 'calleeId', ARGV[3], 'createdAt', ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[5])
redis.call('SETEX', KEYS[2], ARGV[5], ARGV[1])
redis.call('SETEX', KEYS[3], ARGV[5], ARGV[1])
return 1
```

### Testcontainers Redis configuration for tests

```java
// Source: docs.spring.io/spring-boot/reference/testing/testcontainers.html
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {
    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>("postgres:17-alpine");
    }

    @Bean
    @ServiceConnection(name = "redis")
    GenericContainer<?> redisContainer() {
        return new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
    }
}
```

### callStore.ts extended type signatures

```typescript
// callStore.ts additions:
export type EndReason = 'completed' | 'rejected' | 'cancelled' | 'missed' | 'busy' | 'dropped'
export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connecting'
                      | 'connected' | 'reconnecting' | 'failed' | 'ended'  // + 'ended'

interface CallStoreState {
  // ... existing fields ...
  endReason: EndReason | null
  micMuted: boolean
  camOff: boolean
  remoteMicMuted: boolean
  remoteCamOff: boolean
  callDurationSec: number | null
  toastMessage: string | null
  // ... new actions ...
  setEndReason: (r: EndReason) => void
  setMicMuted: (v: boolean) => void
  setCamOff: (v: boolean) => void
  setRemoteMicMuted: (v: boolean) => void
  setRemoteCamOff: (v: boolean) => void
  setCallDurationSec: (s: number | null) => void
  setToast: (msg: string | null) => void
  endCall: (reason: EndReason, durationSec?: number) => void
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-generated callId + opaque relay | Server-authoritative callId + CAS on Redis | Phase 4 | Server can enforce lifecycle rules; no race conditions |
| `iceconnectionstatechange` only for state mapping | `connectionstatechange` (aggregate) + `iceconnectionstatechange` (granular) | MDN best practice 2024+ | More reliable detection of true failure vs transient blip |
| `webrtc-adapter` shim | Native browser APIs (Chrome/Firefox/Safari all spec-compliant) | 2022+ | Zero-dependency approach |
| `simple-peer` / `PeerJS` | Native `RTCPeerConnection` + perfect negotiation | Phase 3 decision | Already in codebase; Phase 4 extends |

**Deprecated/outdated:**
- `webrtc-adapter`: unnecessary in 2026, not in project (correct)
- STOMP Spring WebSocket: not used (correct per CLAUDE.md)
- `SessionCallback` WATCH/MULTI/EXEC for state machines: superseded by Lua EVAL for CAS scenarios

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `restartIce()` triggers `onnegotiationneeded` which the existing `handleNegotiationNeeded()` in PeerManager handles | ICE Restart Pattern | If browser requires explicit `createOffer({iceRestart:true})` instead, existing handler produces a restart offer only when `restartIce()` sets the internal flag; behavior should still be correct per MDN |
| A2 | 4s debounce on `disconnected` before triggering ICE restart is appropriate | ICE Restart Pattern | Mobile networks may take longer or shorter to self-heal; too short = premature restart, too long = user-visible freeze; 4s is a common community recommendation |
| A3 | EC/NS constraints (`echoCancellation: true, noiseSuppression: true`) are already in `media.ts` from Phase 3 (D-15 says "on by default") | EC/NS | If not present, Wave 0 must add them; low risk |
| A4 | `callId` should be server-generated (not client's `crypto.randomUUID()`) for security and state machine integrity | Pitfall 1 / call-invite flow | If client-generated UUID is kept, server must validate ownership; either approach works but server-generated is cleaner |
| A5 | WS handler (`PresenceWebSocketHandler`) is appropriate to route lifecycle intents through | Architecture | Alternatively, a separate `CallSignalingHandler` could handle call messages; planner must decide whether to split or extend the existing handler |
| A6 | `TaskScheduler` timer fires correctly even if the WS handler thread is busy | Timer Pattern | `ThreadPoolTaskScheduler` with pool-size=4 runs timers independently; should be fine for expected concurrency |

---

## Open Questions

1. **Who generates `callId` — client or server?**
   - What we know: Phase 3 uses `crypto.randomUUID()` on client; server accepts it in messages
   - What's unclear: Security and state integrity implications when server must own the record
   - Recommendation: Server generates canonical `callId` on first valid `call-invite`; discard client's proposed ID. Store client's proposed ID as `clientCallIdHint` if idempotency is needed.

2. **Glare: should the loser's offer be silently dropped, or should the server send an explicit `glare-resolved` event?**
   - What we know: D-04 says loser auto-becomes callee for winner's call
   - What's unclear: Whether the client needs a special "your role is now callee, here is the winner's callId" message vs. a standard `CallStateChanged{state:ringing, callerId:winner}` which the client interprets normally
   - Recommendation: Reuse `CallStateChanged` — server sends `{state:ringing, callerId:winner, calleeId:loser}` to both. Loser client sees `incoming` for winner's call and renders `IncomingCallCard`. No special message type needed.

3. **Should `PresenceWebSocketHandler` be split into separate handlers for presence and call signaling?**
   - What we know: Current handler is 116 lines and growing; Phase 4 adds 8+ new message types
   - What's unclear: Spring WebSocket supports only one `WebSocketHandler` per endpoint by default; wrapping with a delegating handler pattern is needed for clean separation
   - Recommendation: Create a `CallSignalingHandler` separate class that `PresenceWebSocketHandler` delegates call-related messages to; this maintains single WS endpoint while separating concerns.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Java 21 | Backend runtime | ✓ | OpenJDK 21.0.11 LTS | — |
| Docker / Docker Compose | Redis container, tests | ✓ | Docker 29.4.0 / Compose v5.1.1 | — |
| Node.js 24 | Frontend build | ✓ | v24.14.0 | — |
| Redis (runtime) | Call state machine | via Docker | 7-alpine (to be added) | — |
| `spring-boot-starter-data-redis` | Backend Redis client | Not yet (to add) | via Boot 4.0.7 BOM | — |

**Missing dependencies with no fallback:**
- Redis service in docker-compose.yml (must be added as part of Wave 0 infrastructure work)
- `spring-boot-starter-data-redis` in pom.xml (must be added)

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | JUnit 5 + Spring Boot Test + Testcontainers (existing) |
| Frontend framework | Vitest 4.1.8 + jsdom (existing) |
| Config files | `backend/src/test/java/.../TestcontainersConfiguration.java` (extend to add Redis), `frontend/vitest.config.ts` |
| Backend quick run | `./mvnw test -pl backend -Dtest=CallLifecycleTest -q` |
| Backend full suite | `./mvnw verify -pl backend` |
| Frontend quick run | `npm run test:run --prefix frontend` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALL-02 | Callee receives `call-state-changed{state:ringing}` when invited | Integration (WS) | `./mvnw test -Dtest=CallLifecycleTest#invite_triggers_ringing` | ❌ Wave 0 |
| CALL-03 | Caller cancel → both sides get `ended{cancelled}` | Integration (WS) | `./mvnw test -Dtest=CallLifecycleTest#caller_cancel_ends_call` | ❌ Wave 0 |
| CALL-04 | Ring timeout (~5s in test) → both get `ended{missed}` | Integration (WS + timer) | `./mvnw test -Dtest=CallLifecycleTest#ring_timeout_missed` | ❌ Wave 0 |
| CALL-05 | Invite while callee busy → caller gets `ended{busy}`, callee never notified | Integration (WS) | `./mvnw test -Dtest=CallLifecycleTest#busy_rejection` | ❌ Wave 0 |
| CALL-06 | Simultaneous invites → exactly one call established (lower userId wins) | Integration (WS) | `./mvnw test -Dtest=CallLifecycleTest#glare_resolution` | ❌ Wave 0 |
| CALL-07 | Hangup → both sides get `ended{completed}` with correct end-reason | Integration (WS) | `./mvnw test -Dtest=CallLifecycleTest#hangup_both_notified` | ❌ Wave 0 |
| CALL-08 | Concurrent CAS transitions — only one winner (race test with 2 threads) | Unit (CallStateMachine) | `./mvnw test -Dtest=CallStateMachineTest#concurrent_transition` | ❌ Wave 0 |
| MEDIA-01 | `media-state` message relayed opaquely to peer | Integration (WS) | `./mvnw test -Dtest=CallLifecycleTest#media_state_relay` | ❌ Wave 0 |
| MEDIA-01 FE | `track.enabled` toggled, `callStore.micMuted` updated | Unit (Vitest) | `npm run test:run --prefix frontend` (mediaControls.test.ts) | ❌ Wave 0 |
| STAB-01 | WS reconnect sends `state-resync`, server replies with current call state | Integration (WS) | `./mvnw test -Dtest=CallLifecycleTest#ws_reconnect_resync` | ❌ Wave 0 |
| STAB-02 | Grace period: WS drops then reconnects within 15s → call NOT ended | Integration (WS + timer) | `./mvnw test -Dtest=CallLifecycleTest#grace_period_rejoin` | ❌ Wave 0 |
| STAB-02 | Grace period: WS drops, no reconnect → call ended{dropped} after 5s (test timeout) | Integration (WS + timer) | `./mvnw test -Dtest=CallLifecycleTest#grace_period_drop` | ❌ Wave 0 |

**Note on timer tests:** Use an `@Value("${call.ring-timeout-seconds:5}")` override in tests (set to 2-5s instead of 30s) to keep test execution fast. Inject via `TestPropertySource` or environment variables.

### Sampling Rate
- **Per task commit:** `./mvnw test -pl backend -Dtest="CallLifecycleTest,CallStateMachineTest" -q`
- **Per wave merge:** `./mvnw verify -pl backend` (full suite)
- **Phase gate:** Full suite green + manual 2-browser call test before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `backend/src/test/java/.../ws/CallLifecycleTest.java` — covers CALL-02..08, STAB-01..02, MEDIA-01
- [ ] `backend/src/test/java/.../call/CallStateMachineTest.java` — covers CALL-08 CAS correctness
- [ ] `TestcontainersConfiguration.java` — extend to add `GenericContainer("redis:7-alpine")` with `@ServiceConnection(name="redis")`
- [ ] `frontend/src/realtime/mediaControls.test.ts` — covers MEDIA-01 frontend
- [ ] `frontend/src/store/callStore.test.ts` — covers new state fields + `endCall` action

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` from config.json.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (existing) | JWT filter chain + WS handshake interceptor (Phase 2/3) — unchanged in Phase 4 |
| V3 Session Management | Yes | `callId` lifecycle bounded by Redis TTL (300s); grace period has server-side timeout |
| V4 Access Control | Yes | Server reads `from` principal from WS session attributes (NOT from message body); enforced since Phase 2 |
| V5 Input Validation | Yes | `callId` in intents validated against Redis record; intent types validated via sealed interface + `@JsonSubTypes` |
| V6 Cryptography | No | No new crypto in Phase 4; TURN credentials remain Phase 3 HMAC approach |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| callId injection (send intents for someone else's call) | Spoofing | Server validates callId ownership: Redis `HGET call:{id}.callerId` or `.calleeId` must match WS principal |
| Glare exploitation (intentional simultaneous calls to force busy state) | DoS | Lua CAS is atomic; at most one call created per user-pair; `user-call:` TTL prevents permanent busy lock |
| Grace period abuse (keep reconnecting to hold call open indefinitely) | DoS | Each WS reconnect restarts grace timer from scratch; timer is server-owned; Redis TTL 300s is hard ceiling |
| Redis state leak on server crash | Tampering | TTL 300s on all call keys; `user-call:` pointers auto-expire; server restart clears in-process timers but Redis TTL catches lingering state |
| Message spoofing (`from` field in body) | Spoofing | Already mitigated in Phase 2/3: server overwrites `from` with WS principal; `ClientMessage.from` is unused |

---

## Sources

### Primary (HIGH confidence — verified via official docs)
- `docs.spring.io/spring-data/redis/reference/redis/scripting.html` — Lua RedisScript execution, DefaultRedisScript, execute() API
- `docs.spring.io/spring-data/redis/reference/redis/transactions.html` — WATCH/MULTI/EXEC, SessionCallback, Lua vs transactions comparison
- `docs.spring.io/spring-boot/reference/data/nosql.html#data.nosql.redis` — spring-boot-starter-data-redis auto-config, YAML properties, Lettuce default
- `docs.spring.io/spring-boot/reference/testing/testcontainers.html` — @ServiceConnection with GenericContainer + name="redis" pattern
- `docs.spring.io/spring-framework/reference/integration/scheduling.html` — TaskScheduler, schedule(Runnable, Instant), ScheduledFuture, cancellation
- `developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce` — restartIce() mechanism, onnegotiationneeded trigger
- `developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState` — connectionState values, failed vs disconnected semantics
- `webrtc-developers.com/state-of-a-mediastreamtrack/` — track.enabled mute pattern, need for signaling remote state

### Secondary (MEDIUM confidence — cross-verified)
- `oneuptime.com/blog/post/2026-03-31-redis-distributed-state-machine/view` — Redis hash per workflow, key shape recommendations
- `oneuptime.com/blog/post/2026-03-31-redis-implement-atomic-compare-and-swap-in-redis-lua/view` — Lua CAS script pattern, Spring RedisTemplate integration example
- Existing codebase inspection: `WsTestSupport.java`, `CallSignalingTest.java`, `PeerManager.ts`, `callStore.ts`, `wsClient.ts`, `callActions.ts` — direct inspection, HIGH confidence on carry-forward behavior

### Tertiary (LOW confidence — needs validation)
- ICE restart 4s debounce threshold — community best practice, not in MDN; flagged as A2
- `autoGainControl: true` as standard pairing with EC/NS in getUserMedia — common but not verified against specific spec requirement

---

## Metadata

**Confidence breakdown:**
- Standard stack (Redis/Lettuce/TaskScheduler): HIGH — verified against official Spring Boot docs
- Redis CAS Lua pattern: HIGH — verified against Spring Data Redis scripting docs + cross-verified with implementation examples
- ICE restart mechanism: HIGH — verified against MDN
- Disconnect debounce threshold: LOW — community best practice only
- Architecture patterns (key shapes, timer service): MEDIUM — derived from docs + codebase inspection; planner should review

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 (Spring Data Redis 4.x is stable; WebRTC APIs are stable)
