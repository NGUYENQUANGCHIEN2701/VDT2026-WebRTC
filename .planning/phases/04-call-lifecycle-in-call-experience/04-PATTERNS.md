# Phase 4: Call Lifecycle & In-Call Experience — Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 23 new/modified files (11 backend, 12 frontend)
**Analogs found:** 22 / 23

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/.../call/CallService.java` | service | event-driven | `backend/.../presence/LocalPresenceService.java` | role-match |
| `backend/.../call/CallStateMachine.java` | service | request-response | `backend/.../ws/LocalMessageRouter.java` | partial (Redis EVAL pattern from RESEARCH.md) |
| `backend/.../call/CallTimerService.java` | service | event-driven | `backend/.../presence/PresenceSweeper.java` | role-match |
| `backend/.../call/CallStateRepository.java` | service | CRUD | `backend/.../presence/LocalPresenceService.java` | role-match |
| `backend/.../config/SchedulerConfig.java` | config | — | `backend/.../config/CorsConfig.java` | exact |
| `backend/.../ws/message/CallInvite.java` | model | — | `backend/.../ws/message/CallOffer.java` | exact |
| `backend/.../ws/message/CallStateChanged.java` | model | — | `backend/.../ws/message/CallOfferReceived.java` | exact |
| `backend/.../ws/message/MediaState.java` | model | — | `backend/.../ws/message/HangUp.java` | exact |
| `backend/.../ws/message/MediaStateRelay.java` | model | — | `backend/.../ws/message/SdpReceived.java` | exact |
| `backend/.../ws/message/StateResync.java` | model | — | `backend/.../ws/message/CallOffer.java` | exact |
| `backend/.../ws/message/StateResyncAck.java` | model | — | `backend/.../ws/message/PresenceSnapshot.java` | exact |
| `backend/.../ws/message/ClientMessage.java` (modify) | model | — | self | — |
| `backend/.../ws/message/ServerMessage.java` (modify) | model | — | self | — |
| `backend/.../ws/PresenceWebSocketHandler.java` (modify) | middleware | request-response | self | — |
| `backend/pom.xml` (modify) | config | — | self | — |
| `docker-compose.yml` (modify) | config | — | self | — |
| `backend/.../resources/application.yaml` (modify) | config | — | self | — |
| `frontend/src/store/callStore.ts` (modify) | store | event-driven | self + `presenceStore.ts` | exact |
| `frontend/src/realtime/callActions.ts` (modify) | service | event-driven | self | — |
| `frontend/src/realtime/messages.ts` (modify) | model | — | self | — |
| `frontend/src/realtime/mediaControls.ts` (NEW) | service | event-driven | `callActions.ts` | exact |
| `frontend/src/webrtc/PeerManager.ts` (modify) | service | event-driven | self | — |
| `frontend/src/components/call/CallButtons.tsx` (modify) | component | request-response | self | — |
| `frontend/src/components/call/CallDurationTimer.tsx` (NEW) | component | event-driven | `QualityIndicator.tsx` | role-match |
| `frontend/src/components/call/RemoteStatusBadge.tsx` (NEW) | component | event-driven | `QualityIndicator.tsx` | role-match |
| `frontend/src/components/call/RemoteCamOffOverlay.tsx` (NEW) | component | event-driven | `IncomingCallCard.tsx` | role-match |
| `frontend/src/components/call/ReconnectOverlay.tsx` (NEW) | component | event-driven | `IncomingCallCard.tsx` | role-match |
| `frontend/src/components/call/CallSummaryScreen.tsx` (NEW) | component | event-driven | `IncomingCallCard.tsx` | role-match |
| `frontend/src/pages/CallPage.tsx` (modify) | component | event-driven | self | — |
| `frontend/src/components/call/CallLayer.tsx` (modify) | component | event-driven | self | — |
| `frontend/src/components/call/IncomingCallCard.tsx` (modify) | component | event-driven | self | — |
| `backend/src/test/.../ws/CallLifecycleTest.java` (NEW) | test | event-driven | `CallSignalingTest.java` | exact |
| `backend/src/test/.../call/CallStateMachineTest.java` (NEW) | test | request-response | `WsTestSupport.java` | role-match |
| `backend/src/test/.../TestcontainersConfiguration.java` (modify) | config | — | self | — |

---

## Pattern Assignments

### `backend/.../call/CallService.java` (service, event-driven)

**Analog:** `backend/src/main/java/com/vdt/webrtc/presence/LocalPresenceService.java`

**Package / imports pattern** (LocalPresenceService lines 1-10):
```java
package com.vdt.webrtc.call;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.vdt.webrtc.ws.MessageRouter;
import com.vdt.webrtc.ws.message.ServerMessage;

import lombok.extern.slf4j.Slf4j;
```

**Class wiring pattern** (LocalPresenceService lines 12-20):
```java
@Slf4j
@Service
public class CallService {
    private final CallStateMachine stateMachine;
    private final CallTimerService timerService;
    private final MessageRouter router;
    private final PresenceService presence;   // to update ONLINE/IN_CALL

    public CallService(CallStateMachine stateMachine, CallTimerService timerService,
                       MessageRouter router, PresenceService presence) {
        this.stateMachine = stateMachine;
        this.timerService = timerService;
        this.router = router;
        this.presence = presence;
    }
```

**Broadcast pattern** (PresenceWebSocketHandler lines 108-111 + LocalMessageRouter lines 53-76):
```java
// After every CAS success: broadcast authoritative state to both parties
private void notifyBoth(String callerId, String calleeId, ServerMessage msg) {
    router.sendToUser(callerId, msg);
    router.sendToUser(calleeId, msg);
}
```

**Error handling pattern** (LocalMessageRouter lines 29-36):
```java
// Wrap Jackson + swallow IO errors on WS send — same as LocalMessageRouter
try {
    json = mapper.writeValueAsString(message);
} catch (JacksonException e) {
    log.error("Không serialize được message", e);
    return;
}
```

---

### `backend/.../call/CallStateMachine.java` (service, request-response)

**Analog:** No direct codebase analog — uses RESEARCH.md Lua CAS pattern. Closest structural analog for Spring `@Service` wiring: `LocalPresenceService.java`.

**Class wiring + StringRedisTemplate injection** (from RESEARCH.md):
```java
package com.vdt.webrtc.call;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class CallStateMachine {
    private final StringRedisTemplate redis;
    private final RedisScript<Long> transitionScript;
    private final RedisScript<Long> createCallScript;

    public CallStateMachine(StringRedisTemplate redis,
                            RedisScript<Long> transitionScript,
                            RedisScript<Long> createCallScript) {
        this.redis = redis;
        this.transitionScript = transitionScript;
        this.createCallScript = createCallScript;
    }
```

**CAS execute pattern** (RESEARCH.md lines 697-710):
```java
// Use StringRedisTemplate (NOT RedisTemplate<Object,Object>) to avoid
// Java serialization prefix on keys — see Pitfall 4 in RESEARCH.md
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
```

**RedisScript bean** (RESEARCH.md lines 322-334):
```java
@Bean
DefaultRedisScript<Long> transitionScript() {
    DefaultRedisScript<Long> script = new DefaultRedisScript<>();
    script.setLocation(new ClassPathResource("scripts/transition_call.lua"));
    script.setResultType(Long.class);
    return script;
}
```

---

### `backend/.../call/CallTimerService.java` (service, event-driven)

**Analog:** `backend/src/main/java/com/vdt/webrtc/presence/PresenceSweeper.java`

**Scheduling import pattern** (PresenceSweeper lines 1-13):
```java
package com.vdt.webrtc.call;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;
```

**ConcurrentHashMap + ScheduledFuture pattern** (RESEARCH.md lines 346-378):
```java
@Slf4j
@Service
public class CallTimerService {
    private final TaskScheduler scheduler;
    private final ConcurrentHashMap<String, ScheduledFuture<?>> ringTimers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ScheduledFuture<?>> graceTimers = new ConcurrentHashMap<>();

    public CallTimerService(TaskScheduler callTimerScheduler) {
        this.scheduler = callTimerScheduler;  // inject by name (SchedulerConfig bean name)
    }

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
    // Same pattern for graceTimers / scheduleGrace / cancelGrace
}
```

**Note on PresenceSweeper pattern:** PresenceSweeper uses `@Scheduled(fixedDelay)` for periodic work. CallTimerService uses `TaskScheduler.schedule(Runnable, Instant)` for one-shot cancellable timers. The difference is intentional — use RESEARCH.md's pattern, not PresenceSweeper's `@Scheduled`.

---

### `backend/.../call/CallStateRepository.java` (service, CRUD)

**Analog:** `backend/src/main/java/com/vdt/webrtc/presence/LocalPresenceService.java`

**Pattern:** Thin Redis CRUD wrapper — HGETALL for reading call hash, EXPIRE for TTL management. Uses `StringRedisTemplate.opsForHash()`. Follow the same `@Service` constructor-injection wiring as LocalPresenceService lines 13-19.

```java
package com.vdt.webrtc.call;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Service
public class CallStateRepository {
    private final StringRedisTemplate redis;

    public CallStateRepository(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public Optional<Map<Object, Object>> findCall(String callId) {
        Map<Object, Object> entries = redis.opsForHash().entries("call:" + callId);
        return entries.isEmpty() ? Optional.empty() : Optional.of(entries);
    }

    public Optional<String> findUserCallId(String userId) {
        return Optional.ofNullable(redis.opsForValue().get("user-call:" + userId));
    }
}
```

---

### `backend/.../config/SchedulerConfig.java` (config, —)

**Analog:** `backend/src/main/java/com/vdt/webrtc/config/CorsConfig.java`

**Config class pattern** (CorsConfig lines 1-14):
```java
package com.vdt.webrtc.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration
public class SchedulerConfig {

    @Bean("callTimerScheduler")
    ThreadPoolTaskScheduler callTimerScheduler() {
        ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
        s.setPoolSize(4);
        s.setThreadNamePrefix("call-timer-");
        s.setWaitForTasksToCompleteOnShutdown(false);
        return s;
    }
}
```

**Also in SchedulerConfig — RedisScript beans** (RESEARCH.md lines 322-334):
```java
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.script.DefaultRedisScript;

@Bean
DefaultRedisScript<Long> transitionScript() {
    DefaultRedisScript<Long> script = new DefaultRedisScript<>();
    script.setLocation(new ClassPathResource("scripts/transition_call.lua"));
    script.setResultType(Long.class);
    return script;
}

@Bean
DefaultRedisScript<Long> createCallScript() {
    DefaultRedisScript<Long> script = new DefaultRedisScript<>();
    script.setLocation(new ClassPathResource("scripts/create_call.lua"));
    script.setResultType(Long.class);
    return script;
}
```

---

### `backend/.../ws/message/CallInvite.java` (model, —)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/message/CallOffer.java` (lines 1-4)

**Record pattern** (CallOffer.java lines 1-4):
```java
package com.vdt.webrtc.ws.message;

// Phase 4 renames "call-offer" intent to "call-invite" for precision (RESEARCH.md)
// callId is now server-generated; client sends it as a hint (ignored or used for idempotency)
public record CallInvite(String to, String callId) implements ClientMessage {
}
```

**Same pattern for:** `CallHangup.java` (replaces `HangUp.java` name "hang-up" → "call-hangup"):
```java
public record CallHangup(String to, String callId) implements ClientMessage {
}
```

---

### `backend/.../ws/message/CallStateChanged.java` (model, —)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/message/CallOfferReceived.java`

**Record pattern** (CallOfferReceived.java lines 1-4):
```java
package com.vdt.webrtc.ws.message;

// The authoritative state event — server pushes this to both parties after every CAS
public record CallStateChanged(
    String callId,
    String state,           // ringing | active | ended
    String reason,          // null | completed | rejected | cancelled | missed | busy | dropped
    String callerUserId,
    String calleeUserId
) implements ServerMessage {
}
```

---

### `backend/.../ws/message/MediaState.java` (model, —)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/message/HangUp.java` (lines 1-4)

```java
package com.vdt.webrtc.ws.message;

// Client → server: lightweight relay for mute/cam state (D-14: NOT stored in Redis)
public record MediaState(String to, String callId, boolean mic, boolean cam) implements ClientMessage {
}
```

---

### `backend/.../ws/message/MediaStateRelay.java` (model, —)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/message/SdpReceived.java`

```java
package com.vdt.webrtc.ws.message;

// Server → client: opaque relay of remote's media-state (same relay pattern as SdpReceived)
public record MediaStateRelay(String from, String callId, boolean mic, boolean cam) implements ServerMessage {
}
```

---

### `backend/.../ws/message/StateResync.java` (model, —)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/message/CallOffer.java`

```java
package com.vdt.webrtc.ws.message;

// Client → server on WS reconnect: ask for current state
public record StateResync(String callId) implements ClientMessage {
}
```

---

### `backend/.../ws/message/StateResyncAck.java` (model, —)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/message/PresenceSnapshot.java` (lines 1-7)

```java
package com.vdt.webrtc.ws.message;

import java.util.List;

// Server → client on reconnect: presence snapshot + optional current call state
public record StateResyncAck(
    List<OnlineUser> users,
    CallStateChanged currentCall   // null if no active call for this user
) implements ServerMessage {
}
```

---

### `backend/.../ws/message/ClientMessage.java` (MODIFY — model)

**Analog:** self (lines 1-23)

**@JsonSubTypes extension pattern** — add new entries following exact same style (lines 9-18):
```java
@JsonSubTypes({
    @JsonSubTypes.Type(value = Ping.class, name = "ping"),
    // RENAME: call-offer → call-invite (Phase 4)
    @JsonSubTypes.Type(value = CallInvite.class, name = "call-invite"),
    @JsonSubTypes.Type(value = CallAccept.class, name = "call-accept"),
    @JsonSubTypes.Type(value = CallReject.class, name = "call-reject"),
    @JsonSubTypes.Type(value = CallCancel.class, name = "call-cancel"),
    // RENAME: hang-up → call-hangup (Phase 4)
    @JsonSubTypes.Type(value = CallHangup.class, name = "call-hangup"),
    @JsonSubTypes.Type(value = SdpMessage.class, name = "sdp"),
    @JsonSubTypes.Type(value = IceCandidateMessage.class, name = "ice-candidate"),
    // NEW in Phase 4:
    @JsonSubTypes.Type(value = MediaState.class, name = "media-state"),
    @JsonSubTypes.Type(value = StateResync.class, name = "state-resync"),
})
public sealed interface ClientMessage
    permits Ping, CallInvite, CallAccept, CallReject, CallCancel, CallHangup,
            SdpMessage, IceCandidateMessage, MediaState, StateResync {
}
```

**Note:** Keep backward-compatible `call-offer` and `hang-up` entries during transition, or rename and update frontend simultaneously. Phase 4 PLAN must decide.

---

### `backend/.../ws/message/ServerMessage.java` (MODIFY — model)

**Analog:** self (lines 1-21)

**@JsonSubTypes extension pattern** — add after `HangUpReceived` entry (lines 15-20):
```java
@JsonSubTypes({
    // ... existing entries unchanged ...
    @JsonSubTypes.Type(value = HangUpReceived.class, name = "hang-up-received"),
    @JsonSubTypes.Type(value = SdpReceived.class, name = "sdp-received"),
    @JsonSubTypes.Type(value = IceCandidateReceived.class, name = "ice-candidate-received"),
    // NEW in Phase 4:
    @JsonSubTypes.Type(value = CallStateChanged.class, name = "call-state-changed"),
    @JsonSubTypes.Type(value = MediaStateRelay.class, name = "media-state-relay"),
    @JsonSubTypes.Type(value = StateResyncAck.class, name = "state-resync-ack"),
})
public sealed interface ServerMessage permits PresenceSnapshot, SessionSuperseded, Pong,
        CallOfferReceived, CallAcceptReceived, CallRejectReceived, CallCancelReceived,
        HangUpReceived, SdpReceived, IceCandidateReceived,
        CallStateChanged, MediaStateRelay, StateResyncAck {
}
```

---

### `backend/.../ws/PresenceWebSocketHandler.java` (MODIFY — middleware)

**Analog:** self (lines 1-116)

**Key insertion point** (lines 65-96): Replace the lifecycle intent relay block with CallService dispatch. SDP/ICE blocks stay unchanged (opaque relay).

**Existing import block to extend** (lines 1-33):
```java
// ADD:
import com.vdt.webrtc.call.CallService;
import com.vdt.webrtc.ws.message.CallInvite;
import com.vdt.webrtc.ws.message.CallHangup;
import com.vdt.webrtc.ws.message.MediaState;
import com.vdt.webrtc.ws.message.StateResync;
```

**Constructor wiring pattern** (lines 44-50) — add CallService:
```java
private final CallService callService;

public PresenceWebSocketHandler(PresenceService presence, MessageRouter router,
        ObjectMapper mapper, SessionRegistry sessionRegistry, CallService callService) {
    this.presence = presence;
    this.router = router;
    this.mapper = mapper;
    this.sessionRegistry = sessionRegistry;
    this.callService = callService;
}
```

**Phase 4 dispatch pattern** — insert between receive and relay (lines 71-86 become):
```java
// LIFECYCLE INTENTS → CallService (replaces direct relay)
} else if (clientMessage instanceof CallInvite invite) {
    callService.handleInvite(username, invite.to(), invite.callId());
} else if (clientMessage instanceof CallAccept accept) {
    callService.handleAccept(username, accept.callId());
} else if (clientMessage instanceof CallReject reject) {
    callService.handleReject(username, reject.callId());
} else if (clientMessage instanceof CallCancel cancel) {
    callService.handleCancel(username, cancel.callId());
} else if (clientMessage instanceof CallHangup hangUp) {
    callService.handleHangup(username, hangUp.callId());
// MEDIA STATE → opaque relay (NOT through state machine, D-14)
} else if (clientMessage instanceof MediaState mediaState) {
    router.sendToUser(mediaState.to(), new MediaStateRelay(username, mediaState.callId(), mediaState.mic(), mediaState.cam()));
// STATE RESYNC → read Redis + reply
} else if (clientMessage instanceof StateResync resync) {
    callService.handleResync(username, resync.callId(), session);
// SDP/ICE → opaque relay, unchanged from Phase 3
} else if (clientMessage instanceof SdpMessage sdpMessage) {
    ...
```

**afterConnectionClosed addition** — start grace timer:
```java
@Override
public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    String username = username(session);
    if (sessionRegistry.deregister(username, session)) {
        presence.leave(username);
        broadcastSnapshot();
        // Phase 4: if user has an active call, start grace timer
        callService.handleDisconnect(username);
    }
}
```

---

### `backend/pom.xml` (MODIFY — config)

**Analog:** self — follow the existing `<!-- websocket -->` comment block style (lines 58-62)

**Redis dependency block** — insert after websocket starter (after line 62):
```xml
<!-- redis (call state machine — Phase 4) -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

**Testcontainers GenericContainer** — no new artifact needed; `testcontainers:testcontainers` is already pulled transitively by `spring-boot-testcontainers` (pom.xml line 95-98). No new `<dependency>` block needed for tests.

---

### `docker-compose.yml` (MODIFY — config)

**Analog:** self — follow the `postgres` service block style (lines 6-20)

**Redis service block** — insert before `backend` service:
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

**Backend `depends_on` update** (lines 27-29) — add redis:
```yaml
backend:
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
```

**Backend `environment` update** — add Redis connection env vars:
```yaml
environment:
  # ... existing vars ...
  REDIS_HOST: redis
  REDIS_PORT: 6379
  CALL_RING_TIMEOUT_SECONDS: 30
  CALL_GRACE_PERIOD_SECONDS: 15
```

---

### `backend/src/main/resources/application.yaml` (MODIFY — config)

**Analog:** self — follow existing `${ENV_VAR:default}` pattern (lines 1-35)

**Add after `spring.flyway` block:**
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

---

### `frontend/src/store/callStore.ts` (MODIFY — store)

**Analog:** self (lines 1-43) + `presenceStore.ts` (lines 1-23) for Zustand create pattern

**Extended type additions** (after line 13 of existing):
```typescript
export type EndReason = 'completed' | 'rejected' | 'cancelled' | 'missed' | 'busy' | 'dropped'

// Extend CallState with 'ended' (line 13 of existing file)
export type CallState =
    | 'idle' | 'outgoing' | 'incoming' | 'connecting'
    | 'connected' | 'reconnecting' | 'failed'
    | 'ended'   // NEW: terminal state, triggers CallSummaryScreen
```

**Extended interface additions** (after line 22 of existing):
```typescript
interface CallStoreState {
    // ... existing fields (lines 17-22) ...
    endReason: EndReason | null       // NEW
    micMuted: boolean                  // NEW
    camOff: boolean                    // NEW
    remoteMicMuted: boolean            // NEW
    remoteCamOff: boolean              // NEW
    callDurationSec: number | null     // NEW
    toastMessage: string | null        // NEW

    // NEW actions (follow set({}) pattern from lines 37-42):
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

**Zustand create pattern** (lines 31-43 of existing — follow exactly):
```typescript
export const useCallStore = create<CallStoreState>((set) => ({
    // ... existing initial values ...
    endReason: null,
    micMuted: false,
    camOff: false,
    remoteMicMuted: false,
    remoteCamOff: false,
    callDurationSec: null,
    toastMessage: null,

    setEndReason: (endReason) => set({ endReason }),
    setMicMuted: (micMuted) => set({ micMuted }),
    // ... same pattern for all new setters ...
    endCall: (reason, durationSec) => set({
        callState: 'ended',
        endReason: reason,
        callDurationSec: durationSec ?? null,
    }),
    // extend reset() to clear new fields too
    reset: () => set({
        callState: 'idle', remoteUserId: null, callId: null,
        mediaMode: null, mediaError: null,
        endReason: null, micMuted: false, camOff: false,
        remoteMicMuted: false, remoteCamOff: false,
        callDurationSec: null, toastMessage: null,
    }),
}))
```

---

### `frontend/src/realtime/callActions.ts` (MODIFY — service)

**Analog:** self (lines 1-110)

**Key refactors:**

1. Replace intent type names (lines 51, 59, 65-67):
```typescript
// BEFORE: sendSignal({ type: 'call-offer', to: remoteUsername, callId })
// AFTER:
sendSignal({ type: 'call-invite', to: remoteUsername, callId })
// hang-up → call-hangup:
sendSignal({ type: 'call-hangup', to: remoteUserId, callId })
```

2. Replace `handleServerSignal` switch cases — render server state (lines 86-106):
```typescript
// NEW: handle call-state-changed (authoritative server state)
case 'call-state-changed': {
    const { state, reason, callerUserId, calleeUserId } = msg
    const call = useCallStore.getState()
    if (state === 'ringing') {
        // Server says ringing: incoming for callee, outgoing for caller
        const myUsername = useAuthStore.getState().username
        if (myUsername === calleeUserId) {
            call.startIncoming(callerUserId, msg.callId)
        } // else: caller already set outgoing locally
    } else if (state === 'active') {
        // Both sides: create peer if caller (callee created on call-accept action)
        if (!peer) {
            const myUsername = useAuthStore.getState().username
            const isCallee = myUsername === calleeUserId
            createPeer(isCallee ? callerUserId : calleeUserId, msg.callId, isCallee)
                .then(() => call.setCallState('connecting'))
        }
    } else if (state === 'ended') {
        const durationSec = useCallStore.getState().callDurationSec
        teardownMedia()
        call.endCall(reason as EndReason, durationSec ?? undefined)
    }
    break
}
```

3. `teardown()` splits into `teardownMedia()` (stops tracks, closes peer) and `reset()` — endCall replaces reset on terminal (so `callState: 'ended'` renders `CallSummaryScreen` before going idle).

---

### `frontend/src/realtime/messages.ts` (MODIFY — model)

**Analog:** self (lines 1-34)

**New server signal types** (after line 16):
```typescript
export type CallServerSignal =
    // ... existing types ...
    | { type: 'call-state-changed'; callId: string; state: string; reason: string | null;
        callerUserId: string; calleeUserId: string }
    | { type: 'media-state-relay'; from: string; callId: string; mic: boolean; cam: boolean }
    | { type: 'state-resync-ack'; users: OnlineUser[]; currentCall: CallServerSignal | null }
```

**New client message types** (after line 33):
```typescript
export type ClientMessage =
    // ... existing types (rename call-offer → call-invite, hang-up → call-hangup) ...
    | { type: 'call-invite'; to: string; callId: string }      // renamed
    | { type: 'call-hangup'; to: string; callId: string }      // renamed
    | { type: 'media-state'; to: string; callId: string; mic: boolean; cam: boolean }  // NEW
    | { type: 'state-resync'; callId: string }                 // NEW
```

---

### `frontend/src/realtime/mediaControls.ts` (NEW — service)

**Analog:** `frontend/src/realtime/callActions.ts` (lines 1-15 for module-scope vars + import pattern)

**Module-level var pattern** (callActions.ts lines 9-14):
```typescript
// frontend/src/realtime/mediaControls.ts
import { sendSignal } from './wsClient'
import { useCallStore } from '../store/callStore'
import { getLocalStream } from './callActions'

// track.enabled toggle — no renegotiation (CLAUDE.md + D-13)
export function toggleMic(): void {
    const audioTrack = getLocalStream()?.getAudioTracks()[0]
    if (!audioTrack) return
    audioTrack.enabled = !audioTrack.enabled
    const muted = !audioTrack.enabled
    useCallStore.getState().setMicMuted(muted)
    const { remoteUserId, callId, camOff } = useCallStore.getState()
    if (remoteUserId && callId) {
        sendSignal({ type: 'media-state', to: remoteUserId, callId,
                     mic: audioTrack.enabled, cam: !camOff })
    }
}

export function toggleCam(): void {
    const videoTrack = getLocalStream()?.getVideoTracks()[0]
    if (!videoTrack) return
    videoTrack.enabled = !videoTrack.enabled
    const off = !videoTrack.enabled
    useCallStore.getState().setCamOff(off)
    const { remoteUserId, callId, micMuted } = useCallStore.getState()
    if (remoteUserId && callId) {
        sendSignal({ type: 'media-state', to: remoteUserId, callId,
                     mic: !micMuted, cam: videoTrack.enabled })
    }
}
```

---

### `frontend/src/webrtc/PeerManager.ts` (MODIFY — service)

**Analog:** self (lines 1-145)

**New private fields** (after line 26 of existing):
```typescript
private reconnectTimer: ReturnType<typeof setTimeout> | null = null
private readonly RECONNECT_GRACE_MS = 4000   // 4s debounce on 'disconnected'
```

**setupHandlers() addition** (after line 119 `oniceconnectionstatechange`):
```typescript
// NEW: watch connectionState for ICE restart trigger (RESEARCH.md Pitfall 5)
this.pc.onconnectionstatechange = () => this.handleConnectionStateChange()
```

**New private method** (after `mapIceState()` line 143):
```typescript
private handleConnectionStateChange() {
    const state = this.pc.connectionState
    if (state === 'failed') {
        this.clearReconnectTimer()
        useCallStore.getState().setCallState('reconnecting')
        this.pc.restartIce()   // triggers onnegotiationneeded → existing handleNegotiationNeeded
    } else if (state === 'disconnected') {
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

**close() extension** (line 93):
```typescript
close() {
    this.clearReconnectTimer()   // ADD before pc.close()
    this.pc.close()
    this.remoteStream = null
}
```

---

### `frontend/src/components/call/CallButtons.tsx` (MODIFY — component)

**Analog:** self (lines 1-49)

**New button exports** — follow existing button pattern (lines 12-18 for base style, lines 39-48 for circular):

```typescript
// MuteButton: 44px circular, mic icon, green when active / border when muted
export function MuteButton({ muted, onClick }: { muted: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick}
            aria-label={muted ? 'Bật mic' : 'Tắt mic'}
            style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none',
                background: muted ? 'var(--border)' : '#16a34a',
                color: muted ? 'var(--text)' : '#fff',
                fontSize: 20, cursor: 'pointer',
            }}>
            {muted ? '🚫' : '🎤'}
        </button>
    )
}

// CamToggleButton: same shape as MuteButton
export function CamToggleButton({ off, onClick }: { off: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick}
            aria-label={off ? 'Bật camera' : 'Tắt camera'}
            style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none',
                background: off ? 'var(--border)' : '#16a34a',
                color: off ? 'var(--text)' : '#fff',
                fontSize: 20, cursor: 'pointer',
            }}>
            📷
        </button>
    )
}
```

---

### `frontend/src/components/call/CallDurationTimer.tsx` (NEW — component)

**Analog:** `frontend/src/components/call/QualityIndicator.tsx` (lines 1-32)

**Import + conditional render pattern** (QualityIndicator lines 1-3):
```typescript
import { useEffect, useState } from 'react'
import { useCallStore } from '../../store/callStore'

// Counts up from 0 when callState === 'connected'. Format: MM:SS then H:MM:SS.
export default function CallDurationTimer() {
    const callState = useCallStore((s) => s.callState)
    const [seconds, setSeconds] = useState(0)

    useEffect(() => {
        if (callState !== 'connected') { setSeconds(0); return }
        const id = setInterval(() => setSeconds((s) => s + 1), 1000)
        return () => clearInterval(id)
    }, [callState])

    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    const fmt = h > 0
        ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
        : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`

    return (
        <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
            {fmt}
        </span>
    )
}
```

---

### `frontend/src/components/call/RemoteStatusBadge.tsx` (NEW — component)

**Analog:** `frontend/src/components/call/QualityIndicator.tsx` (lines 15-32 for conditional render + role="status")

```typescript
// Shows when remote muted mic — small badge, absolute top-left of remote video area
// position: absolute is set by the parent (CallPage), not this component
export function RemoteMuteIndicator() {
    return (
        <div role="status" aria-label="Đối phương đã tắt mic"
            style={{
                position: 'absolute', top: 8, left: 8,
                background: 'rgba(0,0,0,0.6)', color: '#fff',
                borderRadius: 4, padding: '4px 8px', fontSize: 12,
                display: 'flex', gap: 4, alignItems: 'center',
            }}>
            🔇 Đã tắt mic
        </div>
    )
}
```

---

### `frontend/src/components/call/RemoteCamOffOverlay.tsx` (NEW — component)

**Analog:** `frontend/src/components/call/IncomingCallCard.tsx` (lines 10-35 for overlay div + card div pattern)

```typescript
interface Props { remoteUsername: string }

// Replaces remote video content when remote cam off.
// Parent hides <video> with display:none; this sits in same container.
export default function RemoteCamOffOverlay({ remoteUsername }: Props) {
    const initial = remoteUsername.charAt(0).toUpperCase()
    return (
        <div style={{
            position: 'absolute', inset: 0,
            background: '#1f2028',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
            <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: '#6b7280',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 600, color: '#fff',
            }}>
                {initial}
            </div>
            <span style={{ color: 'var(--text)', fontSize: 14 }}>
                {remoteUsername} đã tắt camera
            </span>
        </div>
    )
}
```

---

### `frontend/src/components/call/ReconnectOverlay.tsx` (NEW — component)

**Analog:** `frontend/src/components/call/IncomingCallCard.tsx` (lines 13-35 for fixed-inset backdrop + centered card)

```typescript
// Full-screen overlay, z-index > all call elements, shown when callState === 'reconnecting'
export default function ReconnectOverlay() {
    return (
        <div
            role="status"
            aria-live="assertive"
            style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 100,
            }}
        >
            <span style={{ color: '#fff', fontSize: 20, fontWeight: 600 }}>
                ⟳ Đang kết nối lại…
            </span>
        </div>
    )
}
```

---

### `frontend/src/components/call/CallSummaryScreen.tsx` (NEW — component)

**Analog:** `frontend/src/components/call/IncomingCallCard.tsx` (full — card shape, aria pattern, button pattern)

**IncomingCallCard card shape** (lines 21-34):
```typescript
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EndReason } from '../../store/callStore'
import { useCallStore } from '../../store/callStore'

interface Props {
    reason: EndReason
    remoteUsername: string | null
    durationSec: number | null
}

function formatDuration(sec: number): string {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
                 : `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
}

export default function CallSummaryScreen({ reason, remoteUsername, durationSec }: Props) {
    const navigate = useNavigate()
    const reset = useCallStore((s) => s.reset)

    useEffect(() => {
        const id = setTimeout(() => { reset(); navigate('/') }, 3000)
        return () => clearTimeout(id)
    }, [navigate, reset])

    const isDropped = reason === 'dropped'

    return (
        // IncomingCallCard's fixed overlay pattern (lines 13-20):
        <div role="dialog" aria-modal="true" aria-labelledby="summary-heading"
            style={{ position: 'fixed', inset: 0, display: 'flex',
                     alignItems: 'center', justifyContent: 'center',
                     background: 'rgba(0,0,0,0.5)', zIndex: 200 }}>
            // IncomingCallCard's card shape (lines 21-23):
            <div style={{ background: 'var(--code-bg)', borderRadius: 12, padding: 24,
                          maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)',
                          textAlign: 'center' }}>
                {/* heading + body vary by reason — see UI-SPEC.md CallSummaryScreen section */}
                <h2 id="summary-heading"
                    style={{ color: isDropped ? '#dc2626' : 'var(--text-h)' }}>
                    {/* copy from UI-SPEC.md */}
                </h2>
                {reason === 'completed' && durationSec != null && (
                    <p>Thời lượng: {formatDuration(durationSec)}</p>
                )}
                <button onClick={() => { reset(); navigate('/') }}
                    style={{ background: 'var(--border)', color: 'var(--text-h)',
                             minWidth: 120, height: 44, borderRadius: 8,
                             border: 'none', cursor: 'pointer', fontSize: 16 }}>
                    Về ngay
                </button>
                <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 8 }}>
                    Tự về trang chủ sau 3 giây…
                </p>
            </div>
        </div>
    )
}
```

---

### `frontend/src/pages/CallPage.tsx` (MODIFY — component)

**Analog:** self (lines 1-58)

**Key additions:**

1. Import new components (after line 9 of existing):
```typescript
import { MuteButton, CamToggleButton } from '../components/call/CallButtons'
import CallDurationTimer from '../components/call/CallDurationTimer'
import { RemoteMuteIndicator } from '../components/call/RemoteStatusBadge'
import RemoteCamOffOverlay from '../components/call/RemoteCamOffOverlay'
import ReconnectOverlay from '../components/call/ReconnectOverlay'
import CallSummaryScreen from '../components/call/CallSummaryScreen'
import { toggleMic, toggleCam } from '../realtime/mediaControls'
```

2. Read new store fields (after `remoteUserId` line 13):
```typescript
const micMuted = useCallStore((s) => s.micMuted)
const camOff = useCallStore((s) => s.camOff)
const remoteMicMuted = useCallStore((s) => s.remoteMicMuted)
const remoteCamOff = useCallStore((s) => s.remoteCamOff)
const endReason = useCallStore((s) => s.endReason)
const callDurationSec = useCallStore((s) => s.callDurationSec)
```

3. Top bar: add `CallDurationTimer` between QualityIndicator and DebugToggle (line 35-38):
```tsx
<div style={{ height: 44, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', padding: '0 16px' }}>
    <QualityIndicator callState={callState} stats={stats} />
    <CallDurationTimer />        {/* NEW */}
    <DebugToggle open={debugOpen} onClick={() => setDebugOpen((v) => !v)} />
</div>
```

4. Video area: add overlays (lines 41-46):
```tsx
<div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
    <video ref={remoteRef} ... style={{ display: remoteCamOff ? 'none' : undefined, ... }} />
    {remoteCamOff && <RemoteCamOffOverlay remoteUsername={remoteUserId ?? ''} />}
    {remoteMicMuted && <RemoteMuteIndicator />}
    {/* PiP: existing selfRef video — unchanged except cam-off avatar when camOff */}
    {callState === 'reconnecting' && <ReconnectOverlay />}
</div>
```

5. Control bar: add MuteButton + CamToggleButton (lines 49-51):
```tsx
<div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: 16 }}>
    <MuteButton muted={micMuted} onClick={toggleMic} />
    <CamToggleButton off={camOff} onClick={toggleCam} />
    <HangUpButton onClick={hangUp} />
    <DebugToggle open={debugOpen} onClick={() => setDebugOpen((v) => !v)} />
</div>
```

6. Summary screen — render on `ended` (after DebugPanel, or as absolute overlay):
```tsx
{callState === 'ended' && endReason && endReason !== 'busy' && (
    <CallSummaryScreen reason={endReason} remoteUsername={remoteUserId} durationSec={callDurationSec} />
)}
```

---

### `frontend/src/components/call/CallLayer.tsx` (MODIFY — component)

**Analog:** self (lines 1-42)

**Navigation update** (lines 19-23) — add 'ended' to IN_CALL and handle busy toast:
```typescript
// 'ended' stays on /call to show CallSummaryScreen (CallPage renders the overlay)
const IN_CALL = ['connecting', 'connected', 'reconnecting', 'failed', 'ended']  // ADD 'ended'

// busy: never navigates to /call (D-05); callSummaryScreen NOT shown; toast only
// Handle in wsClient/callActions: on call-state-changed{reason:'busy'}, show toast + stay home
```

---

### `frontend/src/components/call/IncomingCallCard.tsx` (MODIFY — component)

**Analog:** self (lines 1-35)

**Ringtone addition** (useEffect pattern from SelfViewPreview lines 21-25):
```typescript
import { useEffect, useRef } from 'react'

// Inside IncomingCallCard component, before return:
const audioRef = useRef<HTMLAudioElement>(null)

useEffect(() => {
    audioRef.current?.play().catch(() => {})  // autoplay may need user gesture; ignore error
    return () => {
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.currentTime = 0
        }
    }
}, [])
```

```tsx
// In JSX, before closing </div>:
<audio ref={audioRef} src="/ringtone.mp3" loop style={{ display: 'none' }} />
```

---

### `backend/src/test/.../ws/CallLifecycleTest.java` (NEW — test)

**Analog:** `backend/src/test/java/com/vdt/webrtc/ws/CallSignalingTest.java` (full — lines 1-95)

**Test class structure** (CallSignalingTest lines 1-22):
```java
package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

class CallLifecycleTest extends WsTestSupport {

    @Test
    void invite_triggers_ringing() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        connect(mintToken("bob"), hBob);
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());

        alice.sendMessage(new TextMessage(
            "{\"type\":\"call-invite\",\"to\":\"bob\",\"callId\":\"test-call-1\"}"));

        String frame = hBob.awaitMatching(f -> f.contains("call-state-changed"), 2000);
        assertThat(frame).isNotNull();
        assertThat(frame).contains("\"state\":\"ringing\"");
        assertThat(frame).contains("\"callerUserId\":\"alice\"");
    }
    // ... more tests following same WsTestSupport pattern
}
```

**`awaitMatching` predicate pattern** (WsTestSupport lines 103-113): Use the existing `awaitMatching(Predicate<String>, long timeoutMs)` — it handles presence snapshots as noise.

**Timer test override** (RESEARCH.md): Use `@TestPropertySource(properties = "call.ring-timeout-seconds=2")` on the test class to keep ring tests fast.

---

### `backend/src/test/.../call/CallStateMachineTest.java` (NEW — test)

**Analog:** `backend/src/test/java/com/vdt/webrtc/TestcontainersConfiguration.java` + `WsTestSupport.java`

**Redis Testcontainer pattern** (RESEARCH.md lines 737-751):
```java
package com.vdt.webrtc.call;

import com.vdt.webrtc.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Import(TestcontainersConfiguration.class)  // after adding redis to TestcontainersConfiguration
class CallStateMachineTest {

    @Autowired
    CallStateMachine stateMachine;

    @Test
    void concurrent_transition_only_one_winner() throws Exception {
        // Setup ringing call in Redis first
        // Then two threads call transition(callId, "ringing", "active", null, ...) simultaneously
        // Assert exactly one returns true (CAS enforces winner)
    }
}
```

---

### `backend/src/test/.../TestcontainersConfiguration.java` (MODIFY — config)

**Analog:** self (lines 1-16)

**Add Redis container** (RESEARCH.md lines 748-751):
```java
import org.testcontainers.containers.GenericContainer;

@Bean
@ServiceConnection(name = "redis")   // name="redis" required for GenericContainer (Pitfall 6 in RESEARCH.md)
GenericContainer<?> redisContainer() {
    return new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
}
```

---

## Shared Patterns

### ObjectMapper Import (CRITICAL — Boot 4 / Jackson 3)

**Source:** `backend/src/main/java/com/vdt/webrtc/ws/LocalMessageRouter.java` (lines 13-15)
**Apply to:** All new backend files that use ObjectMapper or Jackson annotations

```java
// CORRECT (Boot 4 / Jackson 3):
import tools.jackson.databind.ObjectMapper;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;

// WRONG — do NOT use:
// import com.fasterxml.jackson.databind.ObjectMapper;
```

This project uses Boot 4 with Jackson 3, which relocated to `tools.jackson.*`. See memory note `jackson3-boot4-objectmapper.md`.

### Server-Owns-Identity

**Source:** `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java` (lines 53-54, 73)
**Apply to:** All CallService intent handlers

```java
// ALWAYS read username from WS session attributes, NEVER from message body:
String username = (String) session.getAttributes().get("username");
// In CallService: first parameter is always the authenticated principal from WS session
```

### @Slf4j Logging

**Source:** `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java` (line 35)
**Apply to:** All new backend `@Service` and `@Component` classes

```java
@Slf4j
@Service
public class CallService { ... }
// Use: log.info("..."), log.warn("..."), log.error("...", e)
// Vietnamese log messages are established convention (see LocalMessageRouter lines 34, 36)
```

### synchronized(session) for WS send

**Source:** `backend/src/main/java/com/vdt/webrtc/ws/LocalMessageRouter.java` (lines 41-44, 65-67)
**Apply to:** Any new code that calls `session.sendMessage()`

```java
synchronized (session) {   // sendMessage is NOT thread-safe
    if (session.isOpen()) {
        session.sendMessage(textMessage);
    }
}
```

### Zustand selector pattern

**Source:** `frontend/src/pages/CallPage.tsx` (lines 11-18)
**Apply to:** All new React components that read from callStore/presenceStore

```typescript
// Select only what you need — avoids re-renders on unrelated state changes:
const callState = useCallStore((s) => s.callState)   // not useCallStore() (subscribes to everything)
const micMuted = useCallStore((s) => s.micMuted)
```

### useRef for MediaStream (not state)

**Source:** `frontend/src/components/call/SelfViewPreview.tsx` (lines 17-25) + `frontend/src/pages/CallPage.tsx` (lines 20-23)
**Apply to:** Any new component that references `<video>` elements

```typescript
const videoRef = useRef<HTMLVideoElement>(null)
useEffect(() => {
    if (videoRef.current && stream) {
        videoRef.current.srcObject = stream  // MUST set via ref, not JSX prop
    }
}, [stream])
```

### Inline styles + CSS custom properties

**Source:** `frontend/src/components/call/IncomingCallCard.tsx` (lines 13-34)
**Apply to:** All new frontend components (no Tailwind, no shadcn — UI-SPEC.md)

```typescript
// Pattern: inline style objects using var(--token) for design tokens
style={{ background: 'var(--code-bg)', borderRadius: 12, padding: 24, boxShadow: 'var(--shadow)' }}
// Do NOT hardcode token values (e.g. #1f2028) except for semantic colors not in token system
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/main/resources/scripts/transition_call.lua` | config | — | No Lua scripts exist in codebase; use RESEARCH.md lines 289-316 as the template |
| `backend/src/main/resources/scripts/create_call.lua` | config | — | No Lua scripts exist in codebase; use RESEARCH.md lines 721-730 as the template |
| `frontend/public/ringtone.mp3` | asset | — | No audio assets in codebase; executor must source royalty-free 1-2s loop (UI-SPEC.md) |

---

## Metadata

**Analog search scope:** `backend/src/main/java/com/vdt/webrtc/`, `backend/src/test/java/`, `frontend/src/`
**Files read:** 34 source files
**Pattern extraction date:** 2026-06-25
