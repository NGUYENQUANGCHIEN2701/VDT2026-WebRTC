# Phase 6: Horizontal Scaling - Pattern Map

**Mapped:** 2026-06-29
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/.../config/RedisConfig.java` | config | event-driven | `backend/.../config/RabbitMqConfig.java` | role-match (both are `@Configuration` wiring message infrastructure) |
| `backend/.../ws/RedisMessageRouter.java` | service | pub-sub | `backend/.../ws/LocalMessageRouter.java` | exact (same `MessageRouter` interface, same Jackson 3 serialization + `synchronized(session)` write) |
| `backend/.../presence/RedisPresenceService.java` | service | CRUD | `backend/.../presence/LocalPresenceService.java` | exact (same `PresenceService` interface, same 4 methods) |
| `backend/.../ws/PresenceWebSocketHandler.java` (MODIFIED) | component | event-driven | itself (existing file to modify) | self-analog |
| `backend/.../presence/PresenceSweeper.java` (MODIFIED) | component | batch | itself + `CallLifecycleTest.java`'s `flushRedis()` for `StringRedisTemplate` usage | self-analog + partial |
| `backend/.../ws/SessionRegistry.java` (no change — confirmed instance-local) | component | request-response | itself | n/a — no change |
| `backend/src/test/.../ws/CrossInstanceCallTest.java` | test | request-response | `backend/.../ws/CallLifecycleTest.java` + `WsTestSupport.CollectingHandler` | role-match (same `StandardWebSocketClient` + `CollectingHandler` + `flushRedis` pattern, extended to two contexts) |
| `docker-compose.yml` (MODIFIED) | config | — | itself (existing single-backend compose) | self-analog |
| `nginx/conf.d/vdt.conf` | config | request-response | — | no analog (first nginx config in project) |
| `backend/src/main/resources/application.yaml` (MODIFIED — add `app.instance-id`) | config | — | itself (existing `app.allowed-origins`, `call.ring-timeout-seconds` bindings) | self-analog |

---

## Pattern Assignments

### `backend/.../config/RedisConfig.java` (config, event-driven)

**Analog:** `backend/src/main/java/com/vdt/webrtc/config/RabbitMqConfig.java`

**Imports pattern** (RabbitMqConfig.java lines 1-12):
```java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;
// → for RedisConfig, replace with:
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
```

**Core `@Configuration` + `@Bean` declaration pattern** (RabbitMqConfig.java lines 13-66):
```java
@Configuration
public class RabbitMqConfig {
    // All infrastructure wiring as @Bean methods
    // No @Autowired fields — constructor injection or @Value for scalars
    @Bean
    DirectExchange callHistoryExchange() { ... }  // pattern: named @Bean returning infra type

    @Bean
    JacksonJsonMessageConverter jsonMessageConverter(JsonMapper jsonMapper) {
        return new JacksonJsonMessageConverter(jsonMapper);
    }
    // pattern: inject collaborators as bean method parameters (not fields)
}
```

**RedisConfig core pattern to copy:**
```java
@Configuration
public class RedisConfig {

    @Value("${app.instance-id:${HOSTNAME:unknown}}")
    private String instanceId;

    @Bean
    public String instanceId() { return instanceId; }

    @Bean
    public ChannelTopic instanceChannel() {
        return new ChannelTopic("inst:" + instanceId);
    }

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
        container.addMessageListener(routingListener, instanceChannel());
        container.addMessageListener(presenceListener, presenceChannel());
        return container;
    }
}
```

**Key constraint from RESEARCH.md:** `RedisMessageListenerContainer` uses a SEPARATE dedicated Lettuce connection for SUBSCRIBE automatically — do NOT try to share with `StringRedisTemplate`.

---

### `backend/.../ws/RedisMessageRouter.java` (service, pub-sub)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/LocalMessageRouter.java`

**Imports pattern** (LocalMessageRouter.java lines 1-16):
```java
package com.vdt.webrtc.ws;

import java.io.IOException;
import java.util.Collection;

import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import com.vdt.webrtc.ws.message.ServerMessage;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;
```

**Jackson 3 serialization pattern** (LocalMessageRouter.java lines 30-37 and 53-60):
```java
// ALWAYS use tools.jackson (Boot 4 / Jackson 3) — never com.fasterxml
String json;
try {
    json = mapper.writeValueAsString(message);
} catch (JacksonException e) {
    log.error("Không serialize được message", e);
    return;
}
```

**Thread-safe local WS write pattern** (LocalMessageRouter.java lines 39-49 and 64-75):
```java
// synchronized(session) is mandatory — sendMessage is not thread-safe
synchronized (session) {
    if (session.isOpen()) {
        session.sendMessage(textMessage);
    }
}
// Paired error handling:
catch (IOException e) {
    log.warn("Gửi thất bại tới user {}", userId, e);
}
```

**`@Service` + constructor injection pattern** (LocalMessageRouter.java lines 17-27):
```java
@Slf4j
@Service   // ← LocalMessageRouter has @Service; RedisMessageRouter uses @Primary @Service
public class LocalMessageRouter implements MessageRouter {
    private final ObjectMapper mapper;
    private final SessionRegistry sessionRegistry;
    public LocalMessageRouter(ObjectMapper mapper, SessionRegistry sessionRegistry) {
        this.mapper = mapper;
        this.sessionRegistry = sessionRegistry;
    }
```

**RedisMessageRouter additions over LocalMessageRouter:**
```java
// Additional fields needed:
private final StringRedisTemplate redis;       // from org.springframework.data.redis.core
private final String instanceId;               // injected from @Bean String instanceId()

// sendToUser — replace local lookup with Redis route-map + PUBLISH:
@Override
public void sendToUser(String userId, ServerMessage message) {
    // Optimization: check local session first (avoid Redis round-trip for same-instance calls)
    if (sessionRegistry.get(userId).isPresent()) {
        // deliver locally using same pattern as LocalMessageRouter lines 63-75
    } else {
        String targetInstance = redis.opsForValue().get("route:" + userId);
        if (targetInstance == null) {
            log.warn("No route for user {} — offline or TTL expired", userId);
            return;
        }
        // serialize envelope and PUBLISH
        // redis.convertAndSend("inst:" + targetInstance, envelopeJson);
    }
}

// broadcast — UNCHANGED from LocalMessageRouter (local-only; presence fan-out is separate via presence-events)
@Override
public void broadcast(ServerMessage message, Collection<WebSocketSession> localSessions) {
    // copy lines 29-50 from LocalMessageRouter verbatim
}
```

**`@Primary` annotation placement:** Add `@Primary` to `RedisMessageRouter`. Remove `@Service` from `LocalMessageRouter` (keep as plain class or `@Profile("local")`).

**RoutedEnvelope record** (new type, same package as RedisMessageRouter):
```java
// payload = already-serialized JSON string (serialize once in RedisMessageRouter)
public record RoutedEnvelope(String userId, String payload) {}
```

---

### `backend/.../presence/RedisPresenceService.java` (service, CRUD)

**Analog:** `backend/src/main/java/com/vdt/webrtc/presence/LocalPresenceService.java`

**Interface contract to implement** (PresenceService.java lines 1-14):
```java
public interface PresenceService {
    void join(String userId);
    void heartbeat(String userId);
    void leave(String userId);
    List<OnlineUser> snapshot();
}
```

**LocalPresenceService method bodies** (lines 17-46) — the behavior to reproduce via Redis:
```java
// join: lastSeen.put(userId, currentTimeMillis)  →  Redis: SET presence:{userId} "" EX 60 + SADD online-users userId
// heartbeat: lastSeen.put(userId, currentTimeMillis)  →  Redis: EXPIRE presence:{userId} 60
// leave: lastSeen.remove(userId)  →  Redis: DEL presence:{userId} + SREM online-users userId
// snapshot: lastSeen.keySet() → statuses  →  Redis: SMEMBERS online-users → for each, HGET/hasKey user-call:{userId}
```

**`StringRedisTemplate` operations pattern** (CallStateRepository.java lines 11-46 — the existing Redis usage in the project):
```java
// Constructor injection (copy this pattern):
private final StringRedisTemplate redis;
public CallStateRepository(StringRedisTemplate redis) {
    this.redis = redis;
}

// Existing key patterns to reference:
redis.opsForValue().get("user-call:" + userId);    // GET (line 40)
redis.opsForHash().entries("call:" + callId);       // HGETALL (line 20)

// New operations for Phase 6 (same StringRedisTemplate, new key patterns):
redis.opsForValue().set("presence:" + userId, "", Duration.ofSeconds(60));
redis.expire("presence:" + userId, Duration.ofSeconds(60));
redis.delete("presence:" + userId);
redis.opsForSet().add("online-users", userId);
redis.opsForSet().remove("online-users", userId);
redis.opsForSet().members("online-users");          // returns Set<String>
redis.hasKey("user-call:" + userId);                // D-04: IN_CALL check (reuses Phase 4 key)
redis.convertAndSend("presence-events", "changed"); // presence fan-out PUBLISH
```

**`@Primary` + `@Service` + constructor injection:**
```java
@Primary
@Service
public class RedisPresenceService implements PresenceService {
    private static final int PRESENCE_TTL_SECONDS = 60;
    private final StringRedisTemplate redis;

    public RedisPresenceService(StringRedisTemplate redis) {
        this.redis = redis;
    }
    // ...
}
```

**`snapshot()` method — derive IN_CALL from Phase 4 call state (D-04):**
```java
@Override
public List<OnlineUser> snapshot() {
    Set<String> online = redis.opsForSet().members("online-users");
    if (online == null) return List.of();
    return online.stream().map(userId -> {
        boolean inCall = Boolean.TRUE.equals(redis.hasKey("user-call:" + userId));
        PresenceStatus status = inCall ? PresenceStatus.IN_CALL : PresenceStatus.ONLINE;
        return new OnlineUser(userId, status);
    }).toList();
}
```

---

### `backend/.../ws/PresenceWebSocketHandler.java` (MODIFIED — component, event-driven)

**Self-analog:** `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java`

**Hook insertion points** (lines 52-115):

`afterConnectionEstablished` (lines 52-62) — **after** `presence.join(username)`, **before** `callService.handleReconnect`:
```java
// ADD: write route map entry
redis.opsForValue().set("route:" + username, instanceId, Duration.ofSeconds(ROUTE_TTL_SECONDS));
// ADD: trigger cross-instance presence fan-out (replaces inline broadcastSnapshot() for the global push)
redis.convertAndSend("presence-events", "changed");
// KEEP: broadcastSnapshot() call stays but scoped to push current snapshot only to THIS new session
// (see RESEARCH Pitfall 7 + Assumption A3 — planner decides Option 1 vs Option 2)
```

`handleTextMessage` for `Ping` (lines 67-70) — **after** `presence.heartbeat(username)`:
```java
} else if (clientMessage instanceof Ping) {
    presence.heartbeat(username);
    // ADD: refresh route TTL on heartbeat (D-02)
    redis.expire("route:" + username, Duration.ofSeconds(ROUTE_TTL_SECONDS));
    router.broadcast(new Pong(), List.of(session));
}
```

`afterConnectionClosed` (lines 98-105) — **after** `presence.leave(username)`:
```java
if (sessionRegistry.deregister(username, session)) {
    callService.handleDisconnect(username);
    presence.leave(username);
    // ADD: delete route map entry + fan-out
    redis.delete("route:" + username);
    redis.convertAndSend("presence-events", "changed");
    // Remove inline broadcastSnapshot() here if choosing Option 1 (Pitfall 7)
}
```

**New field injection** (add to constructor + field list):
```java
private final StringRedisTemplate redis;
private final String instanceId;   // from @Bean String instanceId() in RedisConfig
```

**Cross-instance session-superseded kick (Open Q #2 from RESEARCH):**
Before the existing `sessionRegistry.register(username, session)` call on connect, check Redis route map:
```java
// If route:username points to a DIFFERENT instance, PUBLISH session-superseded to that instance
String existingInstance = redis.opsForValue().get("route:" + username);
if (existingInstance != null && !existingInstance.equals(instanceId)) {
    // PUBLISH to inst:{existingInstance} a session-superseded envelope for this userId
    // (same RoutedEnvelope pattern as RedisMessageRouter, with a SessionSuperseded payload)
}
// Then register locally and proceed with existing afterConnectionEstablished logic
```

---

### `backend/.../presence/PresenceSweeper.java` (MODIFIED — component, batch)

**Self-analog:** `backend/src/main/java/com/vdt/webrtc/presence/PresenceSweeper.java`

**Existing `@Scheduled` pattern** (PresenceSweeper.java lines 25-34):
```java
@Scheduled(fixedDelay = 15_000)
public void sweep() {
    long cutoff = System.currentTimeMillis() - TTL_MS;
    List<String> evicted = presence.evictStaleBefore(cutoff);
    if (!evicted.isEmpty()) {
        log.info("Đã quét offline: {}", evicted);
        handler.broadcastSnapshot();
    }
}
```

**Constructor to change** (PresenceSweeper.java lines 17-23):
```java
// BEFORE (Phase 2):
private final LocalPresenceService presence;  // concrete type — must change
public PresenceSweeper(LocalPresenceService presence, PresenceWebSocketHandler handler)

// AFTER (Phase 6): inject StringRedisTemplate ONLY; remove LocalPresenceService AND
// PresenceWebSocketHandler dependencies — sweep() publishes to presence-events via
// redis.convertAndSend, so no handler reference is needed.
// (evictStaleBefore is replaced by Redis SET reconciliation)
private final StringRedisTemplate redis;
public PresenceSweeper(StringRedisTemplate redis)
```

**New `sweep()` body — Redis SET reconciliation pattern:**
```java
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
        redis.convertAndSend("presence-events", "changed");
    }
}
```

**`flushRedis()` pattern** (CallLifecycleTest.java lines 24-26 + CallRecoveryTest.java lines 27-29):
```java
// Reference for how tests reset Redis state — needed in CrossInstanceCallTest too:
@BeforeEach
void flushRedis() {
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
}
```

---

### `backend/src/test/.../ws/CrossInstanceCallTest.java` (test, request-response)

**Analog:** `backend/src/test/java/com/vdt/webrtc/ws/CallLifecycleTest.java` + `WsTestSupport.java`

**`CollectingHandler` to extract/copy** (WsTestSupport.java lines 85-126):
```java
// Extract this inner class to a shared test utility, or duplicate in CrossInstanceCallTest
// since CrossInstanceCallTest cannot extend WsTestSupport (@SpringBootTest-bound)
protected static class CollectingHandler extends TextWebSocketHandler {
    final BlockingQueue<String> messages = new LinkedBlockingQueue<>();

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        messages.add(message.getPayload());
    }

    public String awaitMessage(long timeoutMs) throws InterruptedException {
        return messages.poll(timeoutMs, TimeUnit.MILLISECONDS);
    }

    public String awaitMatching(Predicate<String> predicate, long timeoutMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        String frame;
        while ((frame = messages.poll(Math.max(0, deadline - System.currentTimeMillis()),
                TimeUnit.MILLISECONDS)) != null) {
            if (predicate.test(frame)) return frame;
        }
        return null;
    }
}
```

**`StandardWebSocketClient` connect pattern** (WsTestSupport.java lines 55-58):
```java
StandardWebSocketClient wsClient = new StandardWebSocketClient();
WebSocketSession session = wsClient.execute(handler, "ws://localhost:" + port + "/ws?token=" + token)
        .get(5, TimeUnit.SECONDS);
```

**Two-context bootstrap pattern** (replaces `@SpringBootTest` — use `SpringApplicationBuilder`):
```java
// TestcontainersConfiguration pattern (TestcontainersConfiguration.java lines 13-30)
// shows @ServiceConnection — for multi-context, start containers manually instead:
static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");
static RabbitMQContainer rabbitmq = new RabbitMQContainer("rabbitmq:4.1-management");

@BeforeAll
static void startContexts() throws Exception {
    redis.start(); postgres.start(); rabbitmq.start();

    ctx1 = new SpringApplicationBuilder(VdtWebrtcApplication.class)
        .properties(
            "spring.data.redis.host=" + redis.getHost(),
            "spring.data.redis.port=" + redis.getMappedPort(6379),
            "spring.datasource.url=" + postgres.getJdbcUrl(),
            // ... other DB/Rabbit props
            "app.instance-id=inst1",
            "server.port=0",
            "call.ring-timeout-seconds=5"
        ).run();

    ctx2 = new SpringApplicationBuilder(VdtWebrtcApplication.class)
        .properties(
            // same Redis/Postgres/Rabbit coordinates
            "app.instance-id=inst2",
            "server.port=0",
            "call.ring-timeout-seconds=5"
        ).run();
}
```

**JWT minting pattern** (WsTestSupport.java lines 45-46 — use `ctx1.getBean(JwtService.class)`):
```java
JwtService jwtService = ctx1.getBean(JwtService.class);
String tokenAlice = jwtService.generateToken("alice", "USER");
```

**Assert pattern** (CallLifecycleTest.java lines 43-49):
```java
// Cross-instance assert mirrors the single-instance pattern exactly:
String bobFrame = hBob.awaitMatching(
    f -> f.contains("call-state-changed") && f.contains("\"state\":\"ringing\""), 5000);
assertThat(bobFrame).as("Bob must receive ringing via cross-instance routing").isNotNull();
assertThat(bobFrame).contains("\"callerId\":\"alice\"");
```

**`flushRedis` teardown in cross-instance test** (CallLifecycleTest.java lines 24-26):
```java
// Both contexts share the same Redis container — one flushAll() clears state for both
@BeforeEach
void flushRedis() {
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
}
// Note: get StringRedisTemplate from ctx1.getBean(StringRedisTemplate.class)
```

**`WsTestSupport.drainState()` fix required** (WsTestSupport.java line 37):
```java
// BEFORE:
@Autowired
protected LocalPresenceService presence;  // breaks when LocalPresenceService loses @Service

// AFTER (change to interface or use flushAll approach):
@Autowired
protected PresenceService presence;  // OR use StringRedisTemplate + flushAll() per CallLifecycleTest
```

---

### `docker-compose.yml` (MODIFIED — config)

**Self-analog:** existing `docker-compose.yml` single-backend service block (lines 23-51).

**Backend service pattern to replicate as `backend-1` and `backend-2`** (docker-compose.yml lines 23-51):
```yaml
backend:              # → rename to backend-1, duplicate as backend-2
  build:
    context: ./backend
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
    rabbitmq:
      condition: service_healthy
  environment:
    DB_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB}
    DB_USERNAME: ${POSTGRES_USER}
    DB_PASSWORD: ${POSTGRES_PASSWORD}
    REDIS_HOST: redis
    RABBITMQ_HOST: rabbitmq
    JWT_SECRET: ${JWT_SECRET}
    TURN_SECRET: ${TURN_SECRET}
    TURN_SERVER: ${TURN_SERVER}
    INSTANCE_ID: backend-1    # ADD — unique per replica; backend-2 gets "backend-2"
  # ports: remove host mapping (nginx is the entry point now, not raw backend)
  # Keep healthcheck as-is
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:8080/actuator/health"]
    interval: 10s
    timeout: 5s
    retries: 10
    start_period: 40s
```

**New nginx service to add:**
```yaml
nginx:
  image: nginx:1.27-alpine
  depends_on:
    backend-1:
      condition: service_healthy
    backend-2:
      condition: service_healthy
  ports:
    - "8080:80"   # nginx is the only externally exposed backend port
  volumes:
    - ./nginx/conf.d:/etc/nginx/conf.d:ro
```

---

### `nginx/conf.d/vdt.conf` (NEW — config)

**No analog in codebase** — first nginx config in project. Pattern from RESEARCH.md Pattern 10.

**Key directives required (no analog to copy; use RESEARCH pattern directly):**
```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream backend {
    server backend-1:8080;
    server backend-2:8080;
    keepalive 32;
}

server {
    listen 80;

    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**Critical:** `proxy_read_timeout 3600s` prevents nginx from closing idle WS connections (default 60s would cut connections that miss a heartbeat cycle).

---

### `backend/src/main/resources/application.yaml` (MODIFIED — config)

**Self-analog:** existing application.yaml `app:` and `call:` blocks (lines 50-59).

**Existing env-var-with-default pattern** (application.yaml lines 50-58):
```yaml
app:
  cookie:
    secure: ${COOKIE_SECURE:false}    # pattern: ${ENV_VAR:default}
call:
  ring-timeout-seconds: ${CALL_RING_TIMEOUT_SECONDS:30}
  grace-period-seconds: ${CALL_GRACE_PERIOD_SECONDS:15}
```

**New property to add** (follows same pattern, under `app:` block):
```yaml
app:
  cookie:
    secure: ${COOKIE_SECURE:false}
  instance-id: ${INSTANCE_ID:${HOSTNAME:unknown}}  # D-02: injected by compose; falls back to container hostname
  allowed-origins: ${ALLOWED_ORIGINS:http://localhost:5173,https://localhost:5173}  # add nginx origin for demo
```

**`@Value` binding pattern** (WebSocketConfig.java lines 21-23 — existing example):
```java
@Value("${app.allowed-origins:http://localhost:5173,https://localhost:5173}")
private String[] allowedOrigins;
// → RedisConfig copies this exact pattern for instance-id:
@Value("${app.instance-id:${HOSTNAME:unknown}}")
private String instanceId;
```

---

## Shared Patterns

### Jackson 3 ObjectMapper (Boot 4)
**Source:** `backend/src/main/java/com/vdt/webrtc/ws/LocalMessageRouter.java` lines 1-16
**Apply to:** `RedisMessageRouter.java`, `RoutingMessageListener.java` (new component inside RedisConfig or standalone)

```java
// ALWAYS import from tools.jackson (Jackson 3), NOT com.fasterxml:
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

// Standard serialize pattern:
try {
    String json = mapper.writeValueAsString(message);
} catch (JacksonException e) {
    log.error("Không serialize được message", e);
    return;
}

// Standard deserialize pattern (for RoutingMessageListener.onMessage):
try {
    RoutedEnvelope envelope = mapper.readValue(message.getBody(), RoutedEnvelope.class);
} catch (JacksonException e) {
    log.error("Cannot deserialize routed envelope", e);
}
```

### StringRedisTemplate Usage
**Source:** `backend/src/main/java/com/vdt/webrtc/call/CallStateRepository.java` lines 11-46
**Apply to:** `RedisPresenceService.java`, `RedisMessageRouter.java`, `PresenceSweeper.java` (modified), `PresenceWebSocketHandler.java` (modified)

```java
// Constructor injection (lines 13-15):
private final StringRedisTemplate redis;
public CallStateRepository(StringRedisTemplate redis) {
    this.redis = redis;
}

// GET a key (line 40):
redis.opsForValue().get("user-call:" + userId);

// Phase 6 additions (same template, new operations):
redis.opsForValue().set(key, value, Duration.ofSeconds(ttl));  // SET EX
redis.expire(key, Duration.ofSeconds(ttl));                     // EXPIRE
redis.delete(key);                                              // DEL
redis.hasKey(key);                                              // EXISTS
redis.opsForSet().add("online-users", userId);                  // SADD
redis.opsForSet().remove("online-users", userId);               // SREM
redis.opsForSet().members("online-users");                      // SMEMBERS → Set<String>
redis.convertAndSend(channel, payload);                         // PUBLISH
```

### `@Primary` + `@Service` Bean Selection
**Source:** none yet (first use in project)
**Apply to:** `RedisMessageRouter.java` and `RedisPresenceService.java`
**Pattern:**
```java
// On Redis impls:
@Primary
@Service
public class RedisMessageRouter implements MessageRouter { ... }

// On Local impls — remove @Service to prevent dual-bean conflict:
// LocalMessageRouter.java line 19: remove @Service annotation
// LocalPresenceService.java line 13: remove @Service annotation
// Both remain as plain classes (instantiable in test @Configuration if needed for isolation)
```

### Scheduled Sweeper Pattern
**Source:** `backend/src/main/java/com/vdt/webrtc/presence/PresenceSweeper.java` lines 25-34
**Apply to:** `PresenceSweeper.java` (modified)

```java
@Scheduled(fixedDelay = 15_000)  // keep same interval
public void sweep() {
    // replace evictStaleBefore() call with Redis SET reconciliation (see PresenceSweeper section)
}
```

### `@Configuration` Infrastructure Bean Pattern
**Source:** `backend/src/main/java/com/vdt/webrtc/config/RabbitMqConfig.java` lines 13-66
**Apply to:** `RedisConfig.java`

```java
@Configuration
public class RabbitMqConfig {
    // No @Autowired — all collaborators injected as bean method params
    @Bean
    JacksonJsonMessageConverter jsonMessageConverter(JsonMapper jsonMapper) {
        return new JacksonJsonMessageConverter(jsonMapper);
    }
}
```

### Integration Test Teardown (flushRedis)
**Source:** `backend/src/test/java/com/vdt/webrtc/ws/CallLifecycleTest.java` lines 24-26
**Apply to:** `CrossInstanceCallTest.java` — call between `@BeforeEach` or `@AfterEach`

```java
@BeforeEach
void flushRedis() {
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
}
// In CrossInstanceCallTest: get redis template from ctx1.getBean(StringRedisTemplate.class)
// One flushAll clears state for both contexts since they share the same Redis container
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `nginx/conf.d/vdt.conf` | config | request-response | No nginx config exists in the project; first LB config. Use RESEARCH.md Pattern 10 directly. |

---

## Key Constraints Summary (for Planner)

1. **Jackson 3 only:** `tools.jackson.databind.ObjectMapper` — never `com.fasterxml`. Verified in `LocalMessageRouter.java` and `RabbitMqConfig.java`.
2. **`LocalPresenceService` and `LocalMessageRouter` must lose `@Service`:** Both currently annotated. After Phase 6, only Redis impls are Spring beans. Existing tests that extend `WsTestSupport` work because they get a real Testcontainers Redis and the Redis impls work fine single-instance.
3. **`WsTestSupport.drainState()` must change `LocalPresenceService presence` → `PresenceService presence` or use `flushAll()`** — this is the highest-risk existing-test regression.
4. **`PresenceSweeper` constructor must change:** Currently takes `LocalPresenceService` (concrete) — will fail at startup once `LocalPresenceService` is not a bean. Must be rewritten to use `StringRedisTemplate` directly.
5. **`synchronized(session)` is mandatory for all WS writes** — copy from `LocalMessageRouter` lines 41-49 into any new code path that writes to `WebSocketSession`.
6. **`SessionRegistry` stays instance-local — confirmed** — holds non-serializable `WebSocketSession` objects; only routing/presence/call state is shared in Redis.

---

## Metadata

**Analog search scope:** `backend/src/main/java/com/vdt/webrtc/` (all packages), `backend/src/test/java/com/vdt/webrtc/` (test utilities), `backend/src/main/resources/`, `docker-compose.yml`
**Files scanned:** 22 source files + 3 resource files + docker-compose.yml
**Pattern extraction date:** 2026-06-29
