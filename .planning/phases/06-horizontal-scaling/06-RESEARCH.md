# Phase 6: Horizontal Scaling - Research

**Researched:** 2026-06-29
**Domain:** Redis pub/sub cross-instance signaling routing, Lettuce `RedisMessageListenerContainer`, nginx WS-aware LB, two-context Testcontainers integration test
**Confidence:** HIGH (core patterns verified; code examples derived from existing codebase + official Spring Data Redis docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Routing map + per-instance pub/sub channel. Redis `route:{userId}→instanceId`; each instance SUBSCRIBEs its own channel `inst:{instanceId}`; `MessageRouter.sendToUser` looks up route map and PUBLISHes to the target instance's channel.
- **D-02:** Route map write-on-WS-connect + TTL refreshed by heartbeat; instanceId from env (INSTANCE_ID/HOSTNAME); delete on WS close; TTL self-cleans crashed-instance entries.
- **D-03:** `presence-changed` broadcast channel; mutating instance PUBLISHes a signal, every instance re-reads the Redis snapshot and pushes the full snapshot to its local clients (preserve Phase 2 full-snapshot model).
- **D-04:** Online set from Redis `presence:{userId}` TTL keys; IN_CALL derived at snapshot-build time from existing Redis call state (`user-call:{userId}`). Single source of truth.
- **D-05:** Instance crash reuses Phase 4 grace→dropped flow; route/presence self-expire via TTL; no separate crash detection.
- **D-06:** Cross-instance integration test = two Spring contexts + Testcontainers Redis; two StandardWebSocketClient pinned to different contexts; assert signaling crosses the pub/sub routing.
- **D-07:** docker-compose adds nginx LB (round-robin, no sticky) + a second backend instance only; frontend/Prometheus/Grafana deferred to Phase 9.

### Claude's Discretion
- Online set enumeration approach (Redis SET vs SCAN over presence keys).
- Concrete pub/sub wiring: `RedisMessageListenerContainer` topic registration, channel naming, instance channel discovery.
- Redis CAS approach for cross-instance state mutations that need atomicity (Lua vs WATCH/MULTI).
- Exact TTL values and heartbeat coupling.
- `RedisPresenceService` and `RedisMessageRouter` internals (drop-in swaps for Phase 2 interfaces).
- `SessionRegistry` stays instance-local (confirmed — holds non-serializable `WebSocketSession` objects).

### Deferred Ideas (OUT OF SCOPE)
- Full one-command compose with frontend + Prometheus + Grafana (INFR-02) → Phase 9.
- Per-instance metrics tagging / scale-visibility dashboards → Phase 9.
- Active crash-detection (instance heartbeat) → deferred.
- Sticky-session / session-affinity LB → explicitly rejected.
- Room/group state in Redis → Phase 7.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCAL-01 | System runs 2+ signaling instances behind nginx; a call connects when caller and callee are on different instances (Redis pub/sub routing) | D-01/D-02 route-map + per-instance channel pattern; D-07 nginx config; D-06 standing integration test |
| SCAL-02 | All shared state (presence, routing map, call/room state) lives in Redis — no instance-local authoritative state | D-03/D-04 Redis presence; route-map in Redis; call state already in Redis from Phase 4; `SessionRegistry` stays local (holds WebSocketSession, not authoritative state) |
</phase_requirements>

---

## Summary

Phase 6 swaps the two Phase 2 local implementations (`LocalPresenceService`, `LocalMessageRouter`) for Redis-backed versions without changing any interface signatures or their callers. The implementation is surgical: add two new beans (`RedisPresenceService`, `RedisMessageRouter`), wire a `RedisMessageListenerContainer` that subscribes to `inst:{instanceId}` and `presence-events` channels, write route-map keys in `PresenceWebSocketHandler` hooks, and enumerate online users via a Redis `SET online-users` maintained alongside the existing `presence:{userId}` TTL keys. Call state is already in Redis from Phase 4 (`call:{id}` hash, `user-call:{userId}`) — that half of SCAL-02 is already satisfied and requires no new work.

The cross-instance integration test (D-06) is the phase's keystone artifact: two Spring `ApplicationContext`s, each with a distinct `INSTANCE_ID`, sharing a single Testcontainers Redis container. Two `StandardWebSocketClient`s connect to different contexts; the test asserts that a call-invite sent from one context arrives at the `CollectingHandler` on the other. This is the same pattern the existing `WsTestSupport` uses for single-context tests, extended to two contexts.

The compose change is a narrow addition: `backend-1` and `backend-2` services (explicit, not `--scale`, so each gets a distinct `INSTANCE_ID` env var), plus an nginx service with a `conf.d/vdt.conf` that routes `/ws` and `/api` round-robin over the two backends with the required WebSocket upgrade headers. No sticky sessions — Redis routing makes them unnecessary.

**Primary recommendation:** Implement `RedisPresenceService` (presence TTL keys + `SET online-users`) and `RedisMessageRouter` (route-map lookup + PUBLISH) as `@Primary` beans, keep `LocalMessageRouter`/`LocalPresenceService` for tests that don't need Redis pub/sub, and wire everything via a single `RedisConfig` configuration class.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route map (userId→instanceId) | Redis | — | Must be visible to all instances; a TTL key per user |
| Per-instance message delivery | Backend (receiving instance) | Redis pub/sub (transport) | Redis is transport; the receiving instance writes to local `SessionRegistry` |
| Presence snapshot (online/busy) | Redis | Backend (snapshot builder) | Source of truth is Redis; each instance builds the snapshot on demand |
| Presence change fan-out | Redis pub/sub (`presence-events`) | Backend (every instance listens) | Avoids per-instance polling; each instance pushes snapshot to its own local WS clients |
| Online-user SET | Redis | Backend (maintain SET on join/leave) | SMEMBERS is O(N-users) and safe; avoids KEYS/SCAN |
| `SessionRegistry` (userId→WebSocketSession) | Backend (instance-local) | — | WebSocketSession is non-serializable; this is per-instance state, not shared state |
| Call state machine (CAS) | Redis (Lua scripts) | Backend (CallStateMachine) | Already implemented in Phase 4 with atomic Lua scripts — no change needed |
| nginx load balancer | Infra (compose) | — | Round-robin upstream, WS upgrade headers |

---

## Standard Stack

No new library dependencies are needed for this phase. All required libraries are already in the project.

### Already Present (pom.xml verified)
| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| `spring-boot-starter-data-redis` | via Boot 4.0.7 BOM | `StringRedisTemplate`, `RedisMessageListenerContainer`, Lettuce | [VERIFIED: pom.xml in codebase] |
| `spring-boot-starter-websocket` | via Boot 4.0.7 BOM | `StandardWebSocketClient` for integration tests | [VERIFIED: pom.xml] |
| `spring-boot-starter-test` + Testcontainers | via Boot 4.0.7 BOM | JUnit 5, `GenericContainer` for Redis | [VERIFIED: TestcontainersConfiguration.java] |
| Lettuce | via `spring-boot-starter-data-redis` | Redis client; `RedisMessageListenerContainer` uses Lettuce connections | [VERIFIED: CLAUDE.md + existing code] |
| `tools.jackson.databind.ObjectMapper` | via Boot 4 / Jackson 3 | Serialize `ServerMessage` payloads to JSON for pub/sub | [VERIFIED: LocalMessageRouter.java uses tools.jackson] |
| `GenericContainer` (redis:7-alpine) | via Testcontainers | Testcontainers Redis container (already in TestcontainersConfiguration) | [VERIFIED: TestcontainersConfiguration.java] |

**No new packages to install.** `pom.xml` and docker-compose already have Redis. The only infra addition is the nginx service and `backend-2` in docker-compose.

### New Infrastructure (docker-compose only)
| Service | Image | Why |
|---------|-------|-----|
| nginx | `nginx:1.27-alpine` | LB in front of backend-1/backend-2; WebSocket upgrade headers [CITED: CLAUDE.md] |
| backend-2 | same Dockerfile as backend | Second instance with `INSTANCE_ID=backend-2` |

---

## Package Legitimacy Audit

No new external packages to install — all dependencies already in pom.xml. This section is N/A.

**Packages removed due to slopcheck:** none (no new packages)
**Packages flagged:** none

---

## Architecture Patterns

### System Architecture Diagram (Phase 6)

```
Browser-A ──WS──► nginx (round-robin)
Browser-B ──WS──► nginx

nginx ──/ws, /api──► backend-1 (port 8080)
                 └──► backend-2 (port 8081 internal)

backend-1 ◄──PUBLISH inst:backend-1──► Redis pub/sub ◄──PUBLISH inst:backend-2──► backend-2
backend-1 ──PUBLISH presence-events──► Redis ──► backend-1 (self) + backend-2
backend-1 ──SET route:{userId}──► Redis ──GET──► backend-2 (lookup on sendToUser)
backend-1 ──SET presence:{userId} EX 60──► Redis ──SMEMBERS online-users──► snapshot
backend-1, backend-2 ──read call:{id}, user-call:{userId}──► Redis (Phase 4 call state, unchanged)

SessionRegistry (userId→WebSocketSession) ──► instance-local, NOT in Redis
```

**Call routing flow (cross-instance):**
1. Alice on `backend-1` sends `call-invite` to Bob.
2. `CallService.handleInvite` calls `router.sendToUser("bob", ringEvent)`.
3. `RedisMessageRouter.sendToUser`: `GET route:bob` → returns `"backend-2"`.
4. PUBLISH to `inst:backend-2` with serialized `ServerMessage`.
5. `backend-2`'s `RedisMessageListenerContainer` receives on `inst:backend-2`.
6. Listener deserializes payload, calls `sessionRegistry.get("bob")` → writes to Bob's local WS.

**Presence fan-out flow:**
1. Alice connects to `backend-1`. `PresenceWebSocketHandler.afterConnectionEstablished` calls `presence.join("alice")`.
2. `RedisPresenceService.join`: `SET presence:alice "" EX 60`, `SADD online-users alice`.
3. `RedisMessageRouter` (or a dedicated `PresencePublisher`) PUBLISHes to `presence-events`.
4. EVERY instance (backend-1 AND backend-2) receives on `presence-events`.
5. Each instance calls `presenceWebSocketHandler.broadcastSnapshot()` → pushes full snapshot to its own local WS clients.

**Self-delivery guard:** When an instance receives `presence-events`, it pushes to ALL its local sessions — including any on the same instance as the originator. This is correct behavior and not a bug (the originating instance's local clients also need the updated snapshot).

### Recommended Project Structure (new files only)

```
backend/src/main/java/com/vdt/webrtc/
├── config/
│   └── RedisConfig.java              # RedisMessageListenerContainer + channel beans
├── ws/
│   └── RedisMessageRouter.java       # @Primary replaces LocalMessageRouter in prod
├── presence/
│   └── RedisPresenceService.java     # @Primary replaces LocalPresenceService in prod
└── (PresenceSweeper.java stays — still sweeps online-users SET for TTL-expired keys)

nginx/
└── conf.d/
    └── vdt.conf                      # upstream backend-1/backend-2, /ws + /api location

docker-compose.yml                    # adds nginx, backend-1, backend-2; removes old backend
```

### Pattern 1: RedisMessageListenerContainer Wiring

**What:** Configure a `RedisMessageListenerContainer` bean that subscribes to the instance's own channel (`inst:{instanceId}`) and the shared presence channel (`presence-events`). Each instance discovers its own channel name from `INSTANCE_ID` env var.

**When to use:** Once at application startup. The container manages the Lettuce pub/sub connection lifecycle.

```java
// Source: Spring Data Redis official docs (docs.spring.io/spring-data-redis/reference/redis/pubsub.html)
// + codebase pattern (existing @Bean in RabbitMqConfig.java for reference)
@Configuration
public class RedisConfig {

    @Value("${app.instance-id:${HOSTNAME:default}}")
    private String instanceId;

    @Bean
    public String instanceId() { return instanceId; } // injectable elsewhere

    // The per-instance channel this instance owns
    @Bean
    public ChannelTopic instanceChannel() {
        return new ChannelTopic("inst:" + instanceId);
    }

    // The shared presence-events broadcast channel
    @Bean
    public ChannelTopic presenceChannel() {
        return new ChannelTopic("presence-events");
    }

    @Bean
    public RedisMessageListenerContainer redisListenerContainer(
            RedisConnectionFactory connectionFactory,
            RoutingMessageListener routingListener,
            PresenceEventListener presenceListener) {

        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        // Subscribe to THIS instance's private channel for direct message routing (D-01)
        container.addMessageListener(routingListener, instanceChannel());
        // Subscribe to shared presence-events broadcast (D-03)
        container.addMessageListener(presenceListener, presenceChannel());
        return container;
    }
}
```

**Important:** `RedisMessageListenerContainer` uses a SEPARATE dedicated connection for SUBSCRIBE — do NOT reuse the same `Lettuce` connection used for commands. Spring Data Redis handles this automatically via the `connectionFactory`. Never try to share the pub/sub connection with `StringRedisTemplate`. [CITED: Spring Data Redis docs]

### Pattern 2: RoutingMessageListener (D-01 delivery)

**What:** Receives JSON-serialized `ServerMessage` from `inst:{instanceId}` channel, deserializes with the existing Jackson 3 `ObjectMapper`, looks up `SessionRegistry`, writes to local WebSocket.

```java
// Source: based on existing LocalMessageRouter pattern (tools.jackson ObjectMapper)
@Component
public class RoutingMessageListener implements MessageListener {
    private final ObjectMapper mapper;           // tools.jackson.databind.ObjectMapper (Boot 4)
    private final SessionRegistry sessionRegistry;

    // RoutedEnvelope: wrapper that carries targetUserId + serialized payload
    // so the receiver knows which local session to deliver to
    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            RoutedEnvelope envelope = mapper.readValue(message.getBody(), RoutedEnvelope.class);
            sessionRegistry.get(envelope.userId()).ifPresent(session -> {
                try {
                    synchronized (session) {
                        if (session.isOpen()) {
                            session.sendMessage(new TextMessage(envelope.payload()));
                        }
                    }
                } catch (IOException e) {
                    log.warn("Local delivery failed for user {}", envelope.userId(), e);
                }
            });
        } catch (JacksonException e) {
            log.error("Cannot deserialize routed envelope", e);
        }
    }
}
```

**RoutedEnvelope record** (new type needed):
```java
// payload is already-serialized JSON string (serialize once in RedisMessageRouter, store as string)
public record RoutedEnvelope(String userId, String payload) {}
```

### Pattern 3: RedisMessageRouter (D-01 send path)

**What:** `@Primary` bean replacing `LocalMessageRouter`. `sendToUser` looks up route map, PUBLISHes to target instance. Falls back to local delivery if this instance owns the session. `broadcast` sends to local sessions directly (same as `LocalMessageRouter`).

```java
// Source: derived from LocalMessageRouter.java + Spring Data Redis pub/sub pattern
@Primary
@Service
public class RedisMessageRouter implements MessageRouter {
    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;           // tools.jackson (Boot 4)
    private final SessionRegistry sessionRegistry;
    private final String instanceId;             // injected from @Bean String instanceId()

    @Override
    public void sendToUser(String userId, ServerMessage message) {
        String instanceId = redis.opsForValue().get("route:" + userId);
        if (instanceId == null) {
            log.warn("No route for user {} — offline or TTL expired", userId);
            return;
        }
        try {
            String payload = mapper.writeValueAsString(message);
            RoutedEnvelope envelope = new RoutedEnvelope(userId, payload);
            String envelopeJson = mapper.writeValueAsString(envelope);
            redis.convertAndSend("inst:" + instanceId, envelopeJson);
        } catch (JacksonException e) {
            log.error("Cannot serialize message for user {}", userId, e);
        }
    }

    @Override
    public void broadcast(ServerMessage message, Collection<WebSocketSession> localSessions) {
        // Broadcast to local sessions only — presence fan-out is done separately
        // via presence-events pub/sub (D-03). This method stays local-only.
        // (Same as LocalMessageRouter.broadcast — copy that implementation.)
    }
}
```

**Key insight:** `broadcast(message, localSessions)` is called with the caller's own local sessions. The cross-instance fan-out for presence happens through a separate path: PUBLISH to `presence-events` triggers every instance to call `broadcastSnapshot()` locally. The `broadcast` method itself does NOT need to become cross-instance — the `presence-events` channel handles that fan-out.

### Pattern 4: RedisPresenceService (D-03/D-04)

**What:** `@Primary` bean replacing `LocalPresenceService`. Maintains `presence:{userId} EX 60` TTL keys AND a `SET online-users` for O(1) membership test / O(N) enumeration.

```java
// Source: derived from LocalPresenceService.java + Redis SET pattern
@Primary
@Service
public class RedisPresenceService implements PresenceService {
    private static final int PRESENCE_TTL_SECONDS = 60;
    private final StringRedisTemplate redis;

    @Override
    public void join(String userId) {
        redis.opsForValue().set("presence:" + userId, "", Duration.ofSeconds(PRESENCE_TTL_SECONDS));
        redis.opsForSet().add("online-users", userId);
        // Caller (PresenceWebSocketHandler) publishes presence-events after calling join()
    }

    @Override
    public void heartbeat(String userId) {
        redis.expire("presence:" + userId, Duration.ofSeconds(PRESENCE_TTL_SECONDS));
        // No SADD needed — user already in SET if joined; if TTL key expires and is re-added
        // by a reconnect join(), SET membership stays consistent
    }

    @Override
    public void leave(String userId) {
        redis.delete("presence:" + userId);
        redis.opsForSet().remove("online-users", userId);
        // Caller publishes presence-events after calling leave()
    }

    @Override
    public List<OnlineUser> snapshot() {
        Set<String> online = redis.opsForSet().members("online-users");
        if (online == null) return List.of();
        return online.stream().map(userId -> {
            // D-04: derive IN_CALL from user-call:{userId} in Redis (Phase 4 call state)
            boolean inCall = Boolean.TRUE.equals(redis.hasKey("user-call:" + userId));
            PresenceStatus status = inCall ? PresenceStatus.IN_CALL : PresenceStatus.ONLINE;
            return new OnlineUser(userId, status);
        }).toList();
    }
}
```

### Pattern 5: Route Map + Heartbeat (D-02 wiring in PresenceWebSocketHandler)

The existing `PresenceWebSocketHandler` already has the right hooks. Phase 6 inserts route-map writes into those hooks without changing the method signatures:

```java
// PresenceWebSocketHandler additions (in afterConnectionEstablished, handleTextMessage for Ping, afterConnectionClosed)
// Source: existing PresenceWebSocketHandler.java + D-02 decision

// afterConnectionEstablished — after sessionRegistry.register + presence.join:
redis.opsForValue().set("route:" + username, instanceId, Duration.ofSeconds(ROUTE_TTL_SECONDS));
presencePublisher.publishPresenceChanged();  // triggers D-03 fan-out

// Ping handler — after presence.heartbeat:
redis.expire("route:" + username, Duration.ofSeconds(ROUTE_TTL_SECONDS));

// afterConnectionClosed — after sessionRegistry.deregister + presence.leave:
redis.delete("route:" + username);
presencePublisher.publishPresenceChanged();
```

**TTL recommendation:** `ROUTE_TTL_SECONDS = 60` (same as `PRESENCE_TTL_SECONDS`). Heartbeat every 25s refreshes both. A crashed instance's route entries expire within 60s (one TTL window without a heartbeat).

### Pattern 6: PresenceEventListener (D-03 receiving end)

```java
@Component
public class PresenceEventListener implements MessageListener {
    private final PresenceWebSocketHandler wsHandler;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        // Signal received: re-read Redis snapshot and push to local clients
        // (Full-snapshot model: we ignore message body — just re-query Redis)
        wsHandler.broadcastSnapshot();
    }
}
```

**Self-delivery:** An instance receives its OWN `presence-events` PUBLISH. This is intentional — `broadcastSnapshot()` pushes to its local sessions, which includes the session that triggered the change. This matches the existing `LocalPresenceService` behavior where `broadcastSnapshot()` is called immediately after `join/leave`.

### Pattern 7: Online Set Enumeration — Redis SET vs SCAN

**Recommendation: Maintain a Redis `SET online-users`** (SADD on join, SREM on leave).

**Why not SCAN over `presence:{userId}` keys:**
- `SCAN` in a loop is safe (non-blocking, cursor-based) but has O(N-keyspace) cost where N includes ALL Redis keys, not just presence keys.
- `SCAN` with `MATCH presence:*` requires multiple round-trips; result count per iteration is unpredictable.
- For a demo with tens of users this is fine, but the SET pattern is cleaner and `SMEMBERS` is one command.
- [ASSUMED] At demo scale (<100 users) either approach works; SET is the canonical pattern for tracking set membership with TTL-keyed members. [CITED: Redis documentation idiom]

**TTL reconciliation for SET:** When `presence:{userId}` TTL expires (client crash, not clean leave), the `online-users` SET still contains the userId. The existing `PresenceSweeper` can be adapted: instead of calling `evictStaleBefore`, it scans `online-users` SET members and `SREM`s any whose `presence:{userId}` key no longer exists (TTL expired). This reconciliation runs every 15s (existing schedule), fires `broadcastSnapshot()` if any member was evicted, which via `presence-events` notifies all instances.

```java
// PresenceSweeper adapted for Redis (replaces LocalPresenceService.evictStaleBefore)
@Scheduled(fixedDelay = 15_000)
public void sweep() {
    Set<String> members = redis.opsForSet().members("online-users");
    if (members == null) return;
    List<String> evicted = members.stream()
        .filter(userId -> !Boolean.TRUE.equals(redis.hasKey("presence:" + userId)))
        .peek(userId -> redis.opsForSet().remove("online-users", userId))
        .toList();
    if (!evicted.isEmpty()) {
        log.info("Sweeper evicted stale: {}", evicted);
        presencePublisher.publishPresenceChanged();
    }
}
```

**Note on multi-instance sweep:** Multiple instances will run the sweeper concurrently. `SREM` is idempotent — concurrent SREMs of the same key are safe. The `presence-events` PUBLISH may fire multiple times, but since snapshot is re-read from Redis, multiple pushes converge to the same correct snapshot. [ASSUMED]

### Pattern 8: Instance Identity (D-02)

**Recommendation: use `INSTANCE_ID` env var, fall back to `HOSTNAME`.**

```yaml
# application.yaml
app:
  instance-id: ${INSTANCE_ID:${HOSTNAME:unknown}}
```

```yaml
# docker-compose.yml
backend-1:
  environment:
    INSTANCE_ID: backend-1
backend-2:
  environment:
    INSTANCE_ID: backend-2
```

`HOSTNAME` in Docker resolves to the container ID (random), which is stable per container lifetime. Explicit `INSTANCE_ID` is preferable for human-readable pub/sub channel names (`inst:backend-1`).

### Pattern 9: Cross-Instance Integration Test (D-06)

**What:** Two `SpringApplication` contexts, each wired to the same Testcontainers Redis. Each context gets a different `INSTANCE_ID`. Two `StandardWebSocketClient`s connect to different context's server ports. A call-invite flows from one context's WS to the other via Redis pub/sub routing.

**Concrete test skeleton:**

```java
// Source: derived from existing WsTestSupport.java + two-context pattern
// Two contexts started manually (NOT via @SpringBootTest — those can't get distinct INSTANCE_ID)

class CrossInstanceCallTest {

    static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine")
            .withExposedPorts(6379);

    static ConfigurableApplicationContext ctx1;
    static ConfigurableApplicationContext ctx2;

    @BeforeAll
    static void startContexts() throws Exception {
        redis.start();
        String redisHost = redis.getHost();
        int redisPort = redis.getMappedPort(6379);

        // Context 1 — instance "inst1", random port
        ctx1 = new SpringApplicationBuilder(VdtWebrtcApplication.class)
                .properties(
                    "spring.data.redis.host=" + redisHost,
                    "spring.data.redis.port=" + redisPort,
                    "app.instance-id=inst1",
                    "server.port=0",               // random port
                    // Disable Postgres/Rabbit for this test (or use additional containers)
                    "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.amqp.RabbitAutoConfiguration",
                    "call.ring-timeout-seconds=5"
                )
                .run();

        ctx2 = new SpringApplicationBuilder(VdtWebrtcApplication.class)
                .properties(
                    "spring.data.redis.host=" + redisHost,
                    "spring.data.redis.port=" + redisPort,
                    "app.instance-id=inst2",
                    "server.port=0",
                    "spring.autoconfigure.exclude=...",
                    "call.ring-timeout-seconds=5"
                )
                .run();
    }

    @AfterAll
    static void stop() throws Exception {
        ctx1.close();
        ctx2.close();
        redis.stop();
    }

    @Test
    void crossInstance_callInvite_reachesCallee() throws Exception {
        // Get ports
        int port1 = ctx1.getBean(Environment.class).getProperty("local.server.port", Integer.class, 0);
        int port2 = ctx2.getBean(Environment.class).getProperty("local.server.port", Integer.class, 0);

        // Mint tokens from ctx1's JwtService (both contexts share same JWT_SECRET via default config)
        JwtService jwtService = ctx1.getBean(JwtService.class);
        String tokenAlice = jwtService.generateToken("alice", "USER");
        String tokenBob = jwtService.generateToken("bob", "USER");

        StandardWebSocketClient wsClient = new StandardWebSocketClient();
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();

        // Alice on inst1, Bob on inst2
        WebSocketSession alice = wsClient.execute(hAlice, "ws://localhost:" + port1 + "/ws?token=" + tokenAlice)
                .get(5, TimeUnit.SECONDS);
        WebSocketSession bob = wsClient.execute(hBob, "ws://localhost:" + port2 + "/ws?token=" + tokenBob)
                .get(5, TimeUnit.SECONDS);

        // Alice invites Bob — call-invite goes through inst1's CallService,
        // which calls router.sendToUser("bob", ...) — route:bob points to inst2,
        // PUBLISH to inst:inst2 — inst2's RoutingMessageListener delivers to Bob's session
        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));

        // Bob receives the ringing state event on inst2
        String bobFrame = hBob.awaitMatching(
                f -> f.contains("call-state-changed") && f.contains("\"state\":\"ringing\""), 5000);
        assertThat(bobFrame).as("Bob must receive ringing via cross-instance routing").isNotNull();
        assertThat(bobFrame).contains("\"callerId\":\"alice\"");

        // Alice also receives ringing confirmation (sent to inst1 directly — same instance)
        assertThat(hAlice.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 3000)).isNotNull();
    }
}
```

**Testcontainers note:** `GenericContainer` started as a static field (not `@ServiceConnection`) gives full control over lifecycle, which is needed here since two `SpringApplicationBuilder` contexts manage their own `@ServiceConnection` lookup. Starting the container manually with `.start()` and injecting the mapped host/port via properties is the correct approach for multi-context tests.

**Postgres/Rabbit:** Both contexts need Postgres (for auth/user lookups) and RabbitMQ (for call history). Options:
1. Include Postgres + RabbitMQ Testcontainers as additional static containers in the test class.
2. Disable the features that need them (autoconfigure exclusions) — but this disables call history, which is needed for a realistic call flow test.
3. **Recommended:** Add static Postgres + Rabbit containers to the cross-instance test class, passing connection strings to both contexts via properties. Reuse `TestcontainersConfiguration` image names (`postgres:17-alpine`, `rabbitmq:4.1-management`).

**`CollectingHandler` reuse:** The existing `CollectingHandler` inner class from `WsTestSupport` should be extracted to a shared test utility class (or duplicated in the cross-instance test) since `WsTestSupport` is `@SpringBootTest`-bound and cannot be reused here.

### Pattern 10: nginx WS-aware Load Balancer (D-07)

```nginx
# nginx/conf.d/vdt.conf
# Source: nginx.org/en/docs/http/websocket.html (official)

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream backend {
    server backend-1:8080;
    server backend-2:8080;
    # Round-robin (default) — no ip_hash, no sticky. Redis routing handles instance affinity.
    keepalive 32;
}

server {
    listen 80;

    # WebSocket upgrade path
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;  # long-lived WS connections; default 60s would close idle connections
        proxy_send_timeout 3600s;
    }

    # REST API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**Why `proxy_read_timeout 3600s`:** Default nginx timeout is 60s. WebSocket connections are long-lived (heartbeat every 25s keeps them alive, but idle connections may exceed 60s in some scenarios). The 25s heartbeat is well within 3600s, but the `proxy_read_timeout` is per-read-operation, not per-connection-idle. Nginx 1.27 keeps the WS connection alive as long as traffic flows; the high timeout is a safety margin. [CITED: nginx.org/en/docs/http/websocket.html]

**ALLOWED_ORIGINS update:** `WebSocketConfig` reads `app.allowed-origins`. For the nginx setup, add the nginx hostname/port to allowed origins or set it to `*` during dev demo (dev-only, not prod).

### Anti-Patterns to Avoid

- **Sticky sessions (ip_hash) in nginx upstream:** Explicitly rejected (D-07). Redis routing is the whole demo point.
- **KEYS pattern (`KEYS presence:*`):** Never use in production; blocks Redis during full-keyspace scan. Use the `online-users` SET instead.
- **Putting `WebSocketSession` in Redis:** Not serializable. `SessionRegistry` stays instance-local.
- **Shared pub/sub connection with command connection:** Lettuce's connection for SUBSCRIBE is dedicated; Spring Data Redis handles this automatically — never try to call commands on a pub/sub-subscribed connection.
- **Java object serialization in pub/sub payloads:** Use JSON (`tools.jackson ObjectMapper`), never Java serialization. Follows the existing pattern in `LocalMessageRouter` and `RabbitMqConfig.java` (`Jackson2JsonMessageConverter`).
- **`@ServiceConnection` in multi-context tests:** `@ServiceConnection` is tied to `@SpringBootTest`'s ApplicationContext; for multi-context tests, start containers manually and pass connection strings as properties.
- **Duplicate `@Primary` beans causing ambiguity:** Use `@Profile` or `@ConditionalOnProperty` to deactivate `LocalPresenceService`/`LocalMessageRouter` when the Redis impls are active. Alternatively, remove `@Service` from Local impls and leave them as plain classes instantiated only in single-instance test config. Ensure `WsTestSupport`-based tests (which inherit `TestcontainersConfiguration`) still work — they will, because `RedisPresenceService`/`RedisMessageRouter` work fine in single-context tests with a Testcontainers Redis.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis pub/sub subscription management | Manual Lettuce `StatefulRedisPubSubConnection.sync().subscribe()` calls | `RedisMessageListenerContainer` | Container manages connection lifecycle, thread pool, reconnect; manual subscribe leaks connections on context close |
| JSON serialization of `ServerMessage` over pub/sub | Custom serializer | Existing `tools.jackson.databind.ObjectMapper` (already injected in `LocalMessageRouter`) | Reuse existing pattern; consistent with existing code |
| Presence TTL expiry notifications | Redis keyspace notifications (`__keyevent@0__:expired`) | `PresenceSweeper` scanning `online-users` SET | Keyspace notifications require `notify-keyspace-events Ex` config on Redis server; TTL is unreliable as the sole delivery mechanism; sweeper approach already exists |
| Instance crash detection | Custom heartbeat mechanism | Phase 4 grace→dropped flow + TTL self-expiry | D-05 explicitly chose TTL self-expiry; no new mechanism needed |
| nginx sticky sessions for WS | `ip_hash` or `hash $cookie_SESSION` | Redis routing map | Redis routing is the demo's architectural point — affinity defeats the purpose |
| CAS for presence state | WATCH/MULTI/EXEC | Already using Lua scripts (Phase 4 pattern) | See CAS analysis below |

---

## Redis CAS Analysis (Blocker from STATE.md)

### Which Mutations Need CAS?

| Mutation | Needs CAS? | Why / Safe Pattern |
|----------|-----------|-------------------|
| `route:{userId}` write-on-connect | No | Single-writer: only the connecting instance writes its own route. No race across instances for the same user (one session policy enforces one connection = one writer). |
| `route:{userId}` TTL refresh on heartbeat | No | `EXPIRE` is idempotent; worst case two instances refresh the same TTL simultaneously — both set it to 60s, result is correct. |
| `route:{userId}` delete on close | No | `DEL` on an already-deleted key is a no-op. One-session policy means only one instance owns a given user's route. |
| `presence:{userId}` TTL set/refresh | No | Same reasoning as route TTL. SET EX and EXPIRE are safe without CAS at this scale. |
| `online-users` SADD/SREM | No | Redis SET operations are atomic individually. Concurrent SADD/SREM from different instances: SADD after SREM in a race → user appears online briefly; SREM after SADD → user dropped briefly. Both resolve on the next heartbeat or sweeper pass. Acceptable at demo scale. |
| `call:{id}` state machine transitions | YES — already solved | Phase 4 `transition_call.lua` and `create_call.lua` are atomic Lua scripts on Redis. These handle glare, double-accept, concurrent hangup. No new CAS needed. |

### Conclusion: No New CAS Required in Phase 6

All the new Redis mutations in Phase 6 (route map, presence TTL keys, online-users SET) are safe without CAS because:
1. One-session-per-user (PRES-03) makes route-map writes single-writer per user key.
2. TTL operations (EXPIRE, SET EX) are idempotent under concurrent refresh.
3. Call state transitions are already guarded by atomic Lua scripts (Phase 4).

**Recommendation:** Use plain `StringRedisTemplate` operations (no Lua, no WATCH/MULTI) for all Phase 6 new keys. Reserve Lua for the existing call state machine only.

**Lua vs WATCH/MULTI — final answer for this project:**
- Phase 4 correctly chose Lua for the call state machine (CAS on `call:{id}` state transitions where correctness requires atomicity across multiple keys in a single operation).
- WATCH/MULTI/EXEC in Lettuce is more error-prone: requires a reactive or connection-aware programming model; a failed EXEC returns null (not an exception), requiring explicit retry logic; Lettuce's async API makes WATCH particularly awkward in reactive-unaware code.
- For Phase 6's simple TTL operations, neither is needed. [ASSUMED — based on analysis of the mutation patterns; if a future requirement adds cross-key presence CAS, Lua is preferred over WATCH/MULTI.]

---

## Common Pitfalls

### Pitfall 1: pub/sub at-most-once — message lost if subscriber not yet up
**What goes wrong:** `backend-2` boots after `backend-1`. A `presence-events` PUBLISH fires before `backend-2`'s `RedisMessageListenerContainer` has connected. `backend-2`'s local clients never get the snapshot.
**Why it happens:** Redis pub/sub is fire-and-forget (at-most-once). No message queue. A subscriber that isn't connected misses the message.
**How to avoid:** On WS connect (`afterConnectionEstablished`), each instance calls `broadcastSnapshot()` locally as part of the existing connection flow — this is already in `PresenceWebSocketHandler`. New clients always get the current snapshot directly. The `presence-events` channel is only needed to push updates to already-connected clients. Boot timing gap is acceptable: a newly started instance's first clients get the snapshot directly on connect.
**Warning signs:** Users who connect immediately after `backend-2` starts see a stale/empty presence list. Fixed by the existing `broadcastSnapshot()` call in `afterConnectionEstablished`. [ASSUMED]

### Pitfall 2: `RedisMessageListenerContainer` uses a blocking listener thread
**What goes wrong:** `RoutingMessageListener.onMessage` does IO-heavy work (e.g., slow WS write) while blocking the container's listener thread. Other messages on the same container queue up.
**Why it happens:** By default, `RedisMessageListenerContainer` delivers messages on a single executor thread.
**How to avoid:** WS writes via `session.sendMessage` are synchronous but fast (in-process). The `synchronized (session)` in `LocalMessageRouter` is already the bottleneck pattern — it's acceptable. If needed, inject a `TaskExecutor` into the container: `container.setTaskExecutor(Executors.newVirtualThreadPerTaskExecutor())` (Java 21 virtual threads). But for demo scale, the default single thread is fine.
**Warning signs:** High latency on cross-instance messages. [ASSUMED]

### Pitfall 3: nginx default `proxy_read_timeout 60s` kills idle WS connections
**What goes wrong:** A WebSocket connection that goes idle for >60s (no heartbeat, no messages) is closed by nginx. The 25s heartbeat prevents this in normal operation, but if the heartbeat is delayed or skipped (e.g., tab backgrounded), nginx may close the connection.
**Why it happens:** nginx `proxy_read_timeout` default is 60s — it measures time between data reads on the upstream connection.
**How to avoid:** Set `proxy_read_timeout 3600s` in the nginx WS location block. The heartbeat's 25s interval is well within any reasonable timeout.
**Warning signs:** Clients see WebSocket close events with code 1006 (abnormal closure) after ~60s of inactivity.

### Pitfall 4: `@Primary` bean ambiguity between Local and Redis impls
**What goes wrong:** Both `LocalPresenceService` and `RedisPresenceService` are annotated `@Service` and `@Primary`, causing a `NoUniqueBeanDefinitionException` at startup.
**Why it happens:** Only one bean can be `@Primary` for a given type.
**How to avoid:** Mark `RedisPresenceService` and `RedisMessageRouter` as `@Primary`. Remove `@Service` annotation from `LocalPresenceService` and `LocalMessageRouter` — instead, keep them as plain classes or annotate with a `@Profile("local")` that is never active in the main app context. The existing tests that use `WsTestSupport` work fine because they boot the full context (Redis is provided by Testcontainers) and will use the Redis impls.
**Warning signs:** `PresenceSweeper` is injected with `LocalPresenceService` by type — after the swap, inject `PresenceService` (the interface) instead. `WsTestSupport.drainState()` currently calls `presence.snapshot()` on `LocalPresenceService` directly; update to inject `PresenceService` (the interface) or `RedisPresenceService`.

**IMPORTANT:** `WsTestSupport.drainState()` uses `LocalPresenceService` by concrete type:
```java
@Autowired
protected LocalPresenceService presence; // needs to change to PresenceService or RedisPresenceService
```
This field must be updated when `LocalPresenceService` is no longer `@Service`-annotated. The `await(() -> presence.snapshot().isEmpty())` logic stays the same, just via the interface.

### Pitfall 5: PresenceSweeper still wired to LocalPresenceService
**What goes wrong:** `PresenceSweeper` injects `LocalPresenceService` directly (not via the `PresenceService` interface). After the swap, `LocalPresenceService` is no longer a Spring bean, causing a `NoSuchBeanDefinitionException`.
**Why it happens:** `PresenceSweeper` constructor takes `LocalPresenceService presence` — a concrete type.
**How to avoid:** Rewrite `PresenceSweeper` to work with Redis directly (the Redis sweeper logic replaces `evictStaleBefore`). The Phase 6 `PresenceSweeper` no longer needs `LocalPresenceService` — it only needs `StringRedisTemplate` and a `PresencePublisher` to fire `presence-events`.

### Pitfall 6: `sendToUser` for same-instance users double-serializes
**What goes wrong:** `RedisMessageRouter.sendToUser` always PUBLISHes via Redis, even when the target user is on the same instance. This adds a Redis round-trip for local delivery.
**Why it happens:** The naïve implementation routes everything through Redis.
**How to avoid:** Optimization: before PUBLISHing, check `sessionRegistry.get(userId).isPresent()` — if the target session is local, deliver directly (same as `LocalMessageRouter.sendToUser`). Only PUBLISH if the user is NOT local. This avoids unnecessary pub/sub round-trips for same-instance calls. Important: check route map regardless to confirm the user is actually connected (not just in session registry from a stale state).
**Warning signs:** Extra latency for same-instance signaling; Redis pub/sub counter increases for calls between users on the same instance.

### Pitfall 7: `presence-events` PUBLISH triggers `broadcastSnapshot()` on originating instance twice
**What goes wrong:** The originating instance calls `broadcastSnapshot()` inline (in `join/leave`), then receives `presence-events` PUBLISH and calls `broadcastSnapshot()` again.
**Why it happens:** The instance subscribes to `presence-events` and publishes to it. Redis PUBLISH delivers to ALL subscribers, including the publisher itself.
**How to avoid:** Two options:
1. Remove the inline `broadcastSnapshot()` call from `PresenceWebSocketHandler` and let `presence-events` trigger it on all instances including self. Simpler code.
2. Keep the inline call and accept a double push (two snapshots in quick succession) — clients handle duplicates gracefully since they just re-render the list.
**Recommendation:** Option 1 — remove inline `broadcastSnapshot()` from the WebSocket handler and rely entirely on `presence-events` subscription. This makes the code symmetric across all instances. Verify that the first snapshot on connect (before the user appears in the SET on other instances) is still pushed — this is handled by the individual `broadcastSnapshot()` call in `afterConnectionEstablished` which pushes the current snapshot ONLY to the new session's local WS, before publishing `presence-events`. [ASSUMED — requires careful sequencing in implementation]

---

## Code Examples

### Verified Patterns from Codebase

**Existing Lua CAS pattern (Phase 4 — DO NOT REPLICATE for Phase 6, already correct):**
```java
// Source: CallStateMachine.java (codebase — VERIFIED)
RedisScript<Long> script = RedisScript.of(new ClassPathResource("scripts/transition_call.lua"), Long.class);
Long result = redis.execute(script, List.of("call:" + callId, ...), from, to, reason, ...);
```

**Existing `StringRedisTemplate` usage (Phase 4 — reuse in Phase 6):**
```java
// Source: CallStateRepository.java (codebase — VERIFIED)
redis.opsForValue().get("user-call:" + userId);   // plain GET
redis.opsForHash().entries("call:" + callId);      // HGETALL
```

**Phase 6 additions on StringRedisTemplate:**
```java
// Route map
redis.opsForValue().set("route:" + userId, instanceId, Duration.ofSeconds(60));
redis.expire("route:" + userId, Duration.ofSeconds(60));
redis.delete("route:" + userId);

// Presence TTL key
redis.opsForValue().set("presence:" + userId, "", Duration.ofSeconds(60));
redis.expire("presence:" + userId, Duration.ofSeconds(60));

// Online users SET
redis.opsForSet().add("online-users", userId);
redis.opsForSet().remove("online-users", userId);
redis.opsForSet().members("online-users");

// Presence fan-out publish
redis.convertAndSend("presence-events", "changed");   // payload can be anything; receiver re-reads from Redis

// Direct routing publish
redis.convertAndSend("inst:" + targetInstanceId, envelopeJson);

// IN_CALL check (D-04 — already in CallStateRepository, reuse the key)
redis.hasKey("user-call:" + userId);
```

**RedisMessageListenerContainer — minimal wiring:**
```java
// Source: Spring Data Redis docs (docs.spring.io/spring-data-redis/reference/redis/pubsub.html)
@Bean
RedisMessageListenerContainer container(RedisConnectionFactory cf,
        RoutingMessageListener router, PresenceEventListener presenceListener,
        @Value("${app.instance-id}") String instanceId) {
    var c = new RedisMessageListenerContainer();
    c.setConnectionFactory(cf);
    c.addMessageListener(router, new ChannelTopic("inst:" + instanceId));
    c.addMessageListener(presenceListener, new ChannelTopic("presence-events"));
    return c;
}
```

**PUBLISH via StringRedisTemplate:**
```java
// Source: Spring Data Redis docs + existing StringRedisTemplate usage in codebase
redis.convertAndSend(channel, message);   // StringRedisTemplate.convertAndSend
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ip_hash` sticky sessions for WS LB | Redis routing map (no sticky) | This phase | Enables true horizontal scaling; correct demo value |
| Local `ConcurrentHashMap` presence | Redis TTL keys + SET | This phase | Cross-instance consistent presence |
| Local `MessageRouter` | Redis pub/sub per-instance channel | This phase | Cross-instance signaling |
| `KEYS pattern:*` for presence enumeration | `SET online-users` + sweeper reconciliation | This phase | Avoids blocking KEYS scan |

**Note on WATCH/MULTI:** WATCH/MULTI/EXEC (optimistic locking) is available in Spring Data Redis via `SessionCallback` and `execute(SessionCallback)`. However, Lettuce's async/reactive nature requires care with WATCH on the same connection — Spring Data Redis executes WATCH/MULTI/EXEC in a single `execute(connection -> ...)` block. For this project, Lua scripts (Phase 4 pattern) are the better choice for any CAS need because they avoid the retry-on-conflict logic that WATCH/MULTI requires. [ASSUMED — Lettuce WATCH/MULTI works but is more complex]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SET online-users + sweeper reconciliation is safe under concurrent SADD/SREM from multiple instances | Pattern 7 / Pitfall description | Brief inconsistency (~15s until sweeper reconciles). Acceptable at demo scale. |
| A2 | `RedisMessageListenerContainer` default single-thread executor is sufficient for demo scale | Pitfall 2 | Message delivery latency under load. Mitigated by Java 21 virtual thread option. |
| A3 | Removing inline `broadcastSnapshot()` and relying on `presence-events` subscription (including self) is the cleanest approach | Pitfall 7 / Pattern 6 | Double-push if both approaches kept simultaneously. If option 1 (remove inline call) is chosen, ensure `afterConnectionEstablished` still pushes snapshot to the NEW session only, before publishing. |
| A4 | `@ConditionalOnMissingBean` or `@Profile` to deactivate Local impls is cleaner than `@Primary` + keeping `@Service` on both | Pitfall 4 | Spring bean conflict if both are `@Service`. Planner must choose deactivation strategy. |
| A5 | For the multi-context integration test, both contexts need Postgres + Rabbit containers | Pattern 9 | Test fails to start if Postgres/Rabbit not available. Alternative: test-specific autoconfigure exclusion for non-Redis dependencies. |
| A6 | Two contexts sharing a Testcontainers Redis via property injection (not `@ServiceConnection`) works with Boot 4.0.7 | Pattern 9 | Boot 4 may have changed `SpringApplicationBuilder` behavior. Fallback: use `@ServiceConnection` in a shared `@TestConfiguration` for each context. |

---

## Open Questions (RESOLVED)

1. **`WsTestSupport.drainState()` after Local-to-Redis swap** — **(RESOLVED)**
   - What we know: `WsTestSupport` autowires `LocalPresenceService presence` and calls `await(() -> presence.snapshot().isEmpty())`.
   - What's unclear: After `LocalPresenceService` loses its `@Service` annotation, this field cannot be autowired. The `RedisPresenceService.snapshot()` reads from Redis — but the sweeper hasn't run yet after test teardown, so `online-users` SET may not be empty immediately after WS close.
   - Recommendation: Change `WsTestSupport` to autowire `PresenceService` (the interface); in `drainState`, call `presence.leave(userId)` explicitly for each connected user, OR use a `flushAll()` via `StringRedisTemplate` before/after each test (same as `CallLifecycleTest.flushRedis()`). The `flushAll` approach is simplest.
   - **Resolution (Plan 06-01):** `WsTestSupport` field changed to `protected PresenceService presence` (interface type). Per-test teardown in `CrossInstanceCallTest` uses `flushAll()` via `StringRedisTemplate`. Existing single-context tests now receive `RedisPresenceService` as `@Primary`; `drainState()` compiles correctly because `RedisPresenceService.snapshot()` reads the same `online-users` SET that `leave()` clears.

2. **Single-session policy (PRES-03) across instances** — **(RESOLVED)**
   - What we know: `PresenceWebSocketHandler.afterConnectionEstablished` currently checks `sessionRegistry.register(username, session)` for a non-null old session and kicks it. But `sessionRegistry` is instance-local.
   - What's unclear: If Alice connects to `backend-1`, then reconnects to `backend-2`, `backend-2` has no old session in its local `SessionRegistry`. The old session on `backend-1` is NOT kicked.
   - Recommendation: On WS connect, before registering locally, check `route:{userId}` in Redis. If it points to a DIFFERENT instance, PUBLISH a `session-superseded` message to `inst:{old-instance-id}` with the userId. The receiving instance then kicks the old session from its `SessionRegistry`. This is a new cross-instance message type for session management. Document this as a required task in the plan.
   - **Resolution (Plan 06-02 Task 2):** `PresenceWebSocketHandler.afterConnectionEstablished` reads `route:{userId}` from Redis; if it points to a different instance, serializes `RoutedEnvelope(username, mapper.writeValueAsString(new SessionSuperseded(...)))` and calls `redis.convertAndSend("inst:" + existingInstance, envelopeJson)`. Reuses existing `SessionSuperseded.java` (Phase 2, `com.vdt.webrtc.ws.message`).

3. **`presencePublisher` vs inline `redis.convertAndSend` in `PresenceWebSocketHandler`** — **(RESOLVED)**
   - What we know: `PresenceWebSocketHandler` currently calls `broadcastSnapshot()` inline. After the swap, it should PUBLISH to `presence-events` instead.
   - What's unclear: Should `PresenceWebSocketHandler` get a direct `StringRedisTemplate` dependency, or should this be encapsulated in a `PresencePublisher` helper?
   - Recommendation: Inject `StringRedisTemplate` into `PresenceWebSocketHandler` directly (it already knows about Redis-adjacent concepts). Alternatively, add a `publishPresenceChanged()` method to `RedisPresenceService` and call it after `join/leave`. The latter is cleaner (keeps Redis operations in the service layer).
   - **Resolution (Plan 06-02 Task 2):** `PresenceWebSocketHandler` receives `StringRedisTemplate` via constructor injection and calls `redis.convertAndSend("presence-events", "changed")` inline in `afterConnectionEstablished` and `afterConnectionClosed`. Direct injection chosen — no `PresencePublisher` helper.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis (docker-compose service) | All Phase 6 features | ✓ | 7-alpine (in compose) | — |
| `spring-boot-starter-data-redis` | RedisMessageListenerContainer | ✓ | via Boot 4.0.7 BOM | — |
| Lettuce | pub/sub | ✓ | via spring-boot-starter-data-redis | — |
| nginx 1.27-alpine | D-07 LB | Not yet in compose | — | Add in this phase |
| Java 21 | Virtual thread option for container executor | ✓ | 21 (pom.xml) | N/A |
| Testcontainers GenericContainer | D-06 Redis in test | ✓ | Already used in TestcontainersConfiguration | — |

**Missing dependencies with no fallback:**
- nginx not yet in docker-compose (must be added in this phase).
- `backend-2` service not yet in docker-compose (must be added).

**Missing dependencies with fallback:**
- None.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | JUnit 5 (Jupiter) via `spring-boot-starter-test` |
| Config file | none — Spring Boot auto-detects |
| Quick run command | `./mvnw test -pl backend -Dtest="CrossInstanceCallTest" -DfailIfNoTests=false` |
| Full suite command | `./mvnw verify -pl backend` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAL-01 | Call connects when caller and callee on different instances | Integration (cross-context) | `./mvnw test -Dtest="CrossInstanceCallTest#crossInstance_callInvite_reachesCallee"` | ❌ Wave 0 |
| SCAL-01 | nginx round-robin distributes WS connections to both backends | Manual smoke test | N/A — verify in compose demo | N/A (manual) |
| SCAL-02 | Presence snapshot is consistent across instances (user online on inst1 appears to inst2 clients) | Integration (cross-context) | `./mvnw test -Dtest="CrossInstanceCallTest#crossInstance_presence_isConsistent"` | ❌ Wave 0 |
| SCAL-02 | Busy status (IN_CALL) derived from `user-call:{userId}` Redis key, visible cross-instance | Integration (cross-context) | `./mvnw test -Dtest="CrossInstanceCallTest#crossInstance_inCallStatus_isVisible"` | ❌ Wave 0 |
| SCAL-02 | Route map expiry on crashed instance | Integration | `./mvnw test -Dtest="CrossInstanceCallTest#routeMap_expiresAfterTTL"` | ❌ Wave 0 |
| Regression | Existing single-instance call lifecycle tests still pass | Unit/Integration | `./mvnw test -Dtest="CallLifecycleTest,CallRecoveryTest"` | ✅ Exists |

### Cross-Instance Test as Keystone

The cross-instance call test (`CrossInstanceCallTest`) is the SCAL-01 success criterion #3. It must:
1. Boot two `ApplicationContext`s with distinct `INSTANCE_ID`.
2. Connect two `StandardWebSocketClient`s to different contexts.
3. Assert a `call-state-changed{ringing}` message crosses the Redis pub/sub boundary.
4. Run in `mvn verify` (CI-compatible, no external docker-compose needed).

This test replaces the need for a live `docker compose up` check in CI for the cross-instance proof.

### Sampling Rate
- **Per task commit:** `./mvnw test -pl backend -Dtest="CrossInstanceCallTest" -DfailIfNoTests=false`
- **Per wave merge:** `./mvnw verify -pl backend`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/test/java/com/vdt/webrtc/ws/CrossInstanceCallTest.java` — covers SCAL-01, SCAL-02
- [ ] Extract `CollectingHandler` from `WsTestSupport` to a shared class (needed by `CrossInstanceCallTest` which cannot extend `WsTestSupport`)
- [ ] Update `WsTestSupport.drainState()` to use `PresenceService` interface or `flushAll()` after Local impl loses `@Service`

---

## Security Domain

`security_enforcement` is enabled (config.json confirms). Phase 6 adds pub/sub channels and a new nginx entry point.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No new auth surfaces | Existing JWT HandshakeInterceptor unchanged |
| V3 Session Management | Partial — single-session cross-instance (Open Q #2) | Cross-instance `session-superseded` kick (new task) |
| V4 Access Control | No change | Route map keyed by authenticated userId from JWT principal |
| V5 Input Validation | Partial — `RoutedEnvelope` deserialization | Use `tools.jackson.databind.ObjectMapper` with same trusted-input assumption (pub/sub is internal only) |
| V6 Cryptography | No | pub/sub is internal Redis network, not external |

### Known Threat Patterns for Redis pub/sub

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Route map poisoning (attacker forges `route:{userId}` key) | Tampering | Redis is not exposed externally in compose; `opsForValue().set` is only called from authenticated WS handler with server-extracted username |
| pub/sub channel enumeration | Information Disclosure | All pub/sub is internal (Redis not exposed on host port in prod compose; compose network only) |
| Message replay on `inst:{instanceId}` channel | Tampering | Internal Redis network; no external access. JWT validation at WS handshake is the auth boundary |
| nginx as new external entry point | Elevation of Privilege | nginx exposes only `/ws` and `/api`; backend ports not exposed to host in prod compose config |

**Note:** The `route:{userId}` key should only be writable by the backend. Since Redis is not externally exposed (no host port mapping in the production compose config — current compose maps 6379 for dev only), this threat is mitigated by network isolation. The dev compose can keep the port mapping for `redis-cli` access; prod should remove it.

---

## Sources

### Primary (HIGH confidence)
- Spring Data Redis official docs — `RedisMessageListenerContainer`, `ChannelTopic`, `MessageListener.onMessage`, `convertAndSend` [CITED: docs.spring.io/spring-data-redis/reference/redis/pubsub.html]
- nginx official docs — WebSocket proxying, `map $http_upgrade`, `proxy_http_version 1.1`, `proxy_set_header Upgrade/Connection`, `proxy_read_timeout` [CITED: nginx.org/en/docs/http/websocket.html]
- Codebase (verified by Read tool): `LocalMessageRouter.java`, `LocalPresenceService.java`, `PresenceSweeper.java`, `CallStateMachine.java`, `CallStateRepository.java`, `PresenceWebSocketHandler.java`, `SessionRegistry.java`, `WsTestSupport.java`, `TestcontainersConfiguration.java`, `pom.xml`, `docker-compose.yml`, `application.yaml`, Lua scripts `create_call.lua` / `transition_call.lua`

### Secondary (MEDIUM confidence)
- Two-context Testcontainers pattern: `SpringApplicationBuilder` with manual container property injection [CITED: testcontainers.com/guides + github.com/testcontainers/testcontainers-java/issues/2290]
- `PresenceSweeper` SET reconciliation and multi-instance SADD/SREM safety [ASSUMED based on Redis SET operation semantics]

### Tertiary (LOW confidence)
- Lettuce WATCH/MULTI complexity vs Lua for CAS in reactive context [ASSUMED based on training knowledge]

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new packages; all verified in pom.xml + Spring Data Redis docs
- Architecture / pub/sub wiring: HIGH — patterns verified against Spring Data Redis official docs + existing codebase patterns
- Pitfalls: MEDIUM — pub/sub at-most-once behavior and multi-instance sweeper safety are [ASSUMED] based on Redis semantics; demo-scale implications are well-understood
- Cross-instance test pattern: MEDIUM — `SpringApplicationBuilder` multi-context approach is established but Boot 4.0.7-specific behavior not verified against release notes

**Research date:** 2026-06-29
**Valid until:** 2026-07-30 (stable APIs; Spring Data Redis and nginx config are long-stable)
