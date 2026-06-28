# Phase 5: Call History & Admin — Pattern Map

**Mapped:** 2026-06-28
**Files analyzed:** 27 (14 backend new/modified + 7 frontend new/modified + 4 config/infra + 2 test infra)
**Analogs found:** 25 / 27

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `backend/.../config/RabbitMqConfig.java` | config | event-driven | `backend/.../config/SchedulerConfig.java` (bean-wiring @Configuration) | role-match |
| `backend/.../history/CallHistoryEvent.java` | model (record) | event-driven | `backend/.../call/CallSnapshot.java` (record) | exact |
| `backend/.../history/CallHistoryPublisher.java` | service | event-driven | `backend/.../call/CallService.java` (fire-and-forget broadcast) | data-flow-match |
| `backend/.../history/CallHistoryConsumer.java` | service | event-driven | `backend/.../presence/PresenceSweeper.java` (@Scheduled/@Component handler) | partial-match |
| `backend/.../history/CallHistory.java` | model (@Entity) | CRUD | `backend/.../user/User.java` (@Entity with Lombok) | exact |
| `backend/.../history/CallHistoryRepository.java` | repository | CRUD | `backend/.../user/UserRepository.java` (JpaRepository + custom queries) | exact |
| `backend/.../history/dto/HistoryRow.java` | model (DTO record) | request-response | `backend/.../admin/dto/UserSummary.java` (record DTO) | exact |
| `backend/.../history/dto/AdminHistoryRow.java` | model (DTO record) | request-response | `backend/.../admin/dto/UserSummary.java` (record DTO) | exact |
| `backend/.../metrics/CallMetrics.java` | service | event-driven | `backend/.../presence/PresenceSweeper.java` (@Scheduled + @Component) | role-match |
| `backend/.../admin/AdminController.java` (extend) | controller | request-response | itself (add PATCH + GET endpoints to existing file) | exact |
| `backend/.../admin/AdminService.java` (extend) | service | CRUD + event-driven | itself (add lockUser, dashboard, history query) | exact |
| `backend/.../call/CallService.java` (modify) | service | event-driven | itself (add publisher.publish() after each broadcast) | exact |
| `backend/.../call/CallStateRepository.java` (modify) | repository | CRUD | itself (add startedAt read/write to Redis hash) | exact |
| `backend/src/main/resources/db/migration/V3__call_history.sql` | migration | CRUD | `V1__create_tables.sql` (Flyway SQL style) | exact |
| `backend/src/main/resources/application.yaml` (modify) | config | — | itself (add `spring.rabbitmq.*` section) | exact |
| `docker-compose.yml` (modify) | config | — | existing `redis:` service block | exact |
| `backend/pom.xml` (modify) | config | — | existing Redis starter block | exact |
| `backend/.../TestcontainersConfiguration.java` (modify) | test | event-driven | itself (add `RabbitMQContainer` bean alongside PostgreSQLContainer) | exact |
| `frontend/src/pages/HistoryPage.tsx` | component/page | request-response | `frontend/src/pages/AdminPage.tsx` (page layout + loading/error states) | role-match |
| `frontend/src/pages/AdminPage.tsx` (extend) | component/page | request-response | itself (add tabs, lock/unlock buttons, role dropdown) | exact |
| `frontend/src/components/history/CallHistoryRow.tsx` | component | request-response | `frontend/src/components/presence/OnlineUserRow.tsx` (flex row + badge + inline styles) | exact |
| `frontend/src/components/history/DayGroup.tsx` | component | request-response | `frontend/src/components/presence/OnlineUsersList.tsx` (grouped list) | role-match |
| `frontend/src/components/admin/ConfirmModal.tsx` | component | request-response | `frontend/src/components/call/CallSummaryScreen.tsx` (modal shell + CSS vars) | exact |
| `frontend/src/components/admin/DashboardCards.tsx` | component | request-response | `frontend/src/components/presence/StatusBadge.tsx` (status color + inline styles) | partial-match |
| `frontend/src/components/admin/SystemHistoryTable.tsx` | component | request-response | `frontend/src/pages/AdminPage.tsx` (table layout) | exact |
| `frontend/src/api/history.ts` | utility (API client) | request-response | `frontend/src/api/turn.ts` (api.get + typed response) | exact |
| `frontend/src/api/admin.ts` (extend) | utility (API client) | request-response | `frontend/src/api/turn.ts` (api.get + typed response) | role-match |

---

## Pattern Assignments

### `backend/.../config/RabbitMqConfig.java` (config, event-driven)

**Analog:** `backend/src/main/java/com/vdt/webrtc/config/SchedulerConfig.java`

**Imports pattern** (`SchedulerConfig.java` lines 1-6):
```java
package com.vdt.webrtc.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
```

**Core @Configuration + @Bean pattern** (`SchedulerConfig.java` lines 8-17):
```java
@Configuration
public class SchedulerConfig {

    @Bean
    ThreadPoolTaskScheduler callTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(4);
        scheduler.setThreadNamePrefix("call-timer-");
        return scheduler;
    }
}
```

**Critical RabbitMQ adaptation (from RESEARCH.md):** Use `JacksonJsonMessageConverter` (NOT `Jackson2JsonMessageConverter`). Inject `tools.jackson.databind.ObjectMapper` — the Boot 4 auto-configured bean. Do NOT create a new ObjectMapper:
```java
// tools.jackson namespace — NOT com.fasterxml — Boot 4 auto-configures this bean
@Bean
JacksonJsonMessageConverter jsonMessageConverter(tools.jackson.databind.ObjectMapper objectMapper) {
    return new JacksonJsonMessageConverter(objectMapper);
}
```

**Queue/exchange wiring pattern (from RESEARCH.md Pattern 1, lines 265-307):**
- Constants as `public static final String` on the config class
- `QueueBuilder.durable(...).withArgument("x-dead-letter-exchange", CALL_HISTORY_DLX).build()` for main queue
- `BindingBuilder.bind(queue).to(exchange).with(ROUTING_KEY)` for both main and DLQ bindings

---

### `backend/.../history/CallHistoryEvent.java` (model/record, event-driven)

**Analog:** `backend/src/main/java/com/vdt/webrtc/call/CallSnapshot.java`

**Record pattern** (`CallSnapshot.java` lines 1-9):
```java
package com.vdt.webrtc.call;

public record CallSnapshot(
        String callId,
        String state,
        String reason,
        String callerId,
        String calleeId) {
}
```

**Adaptation:** Use `java.time.Instant` for temporal fields (`startedAt`, `endedAt`). `startedAt` is nullable (calls that never became active — missed/rejected/cancelled — have no start time):
```java
public record CallHistoryEvent(
    String callId,
    String callerId,
    String calleeId,
    String endReason,      // completed | missed | rejected | cancelled | dropped
    Instant startedAt,     // null if call never became active
    Instant endedAt
) {}
```

---

### `backend/.../history/CallHistoryPublisher.java` (service, event-driven)

**Analog:** `backend/src/main/java/com/vdt/webrtc/call/CallService.java` — specifically the `broadcast()` helper (lines 34-38) and the fire-and-forget pattern.

**Inject pattern** (`CallService.java` lines 21-31 — constructor injection, no @Autowired):
```java
public CallService(CallStateMachine stateMachine, CallTimerService timers,
        CallStateRepository repo, MessageRouter router,
        @Value("${call.ring-timeout-seconds}") long ringSeconds,
        @Value("${call.grace-period-seconds}") long graceSeconds) {
    this.stateMachine = stateMachine;
    ...
}
```

**Fire-and-forget + error isolation pattern:** The publish call must be wrapped in try/catch to prevent AmqpException from propagating into the WS broadcast path. This is the #1 constraint (RESEARCH.md Pitfall 2):
```java
// Called AFTER broadcast(...) — fire and forget, NEVER block the realtime path
public void publish(CallHistoryEvent event) {
    try {
        amqpTemplate.convertAndSend(
            RabbitMqConfig.CALL_HISTORY_EXCHANGE,
            RabbitMqConfig.ROUTING_KEY,
            event);
    } catch (Exception e) {
        // Swallow — realtime path must never fail because of AMQP
        log.error("Failed to publish call history event for callId={}: {}", event.callId(), e.getMessage());
    }
}
```

**Where to call it in `CallService.java`** (5 terminal transitions, each has `if (ok) { broadcast(...); }`):

| Method | Lines | Transition | Add publish after broadcast |
|--------|-------|------------|--------------------------|
| `onRingTimeout` | 63-66 | → `missed` | YES |
| `handleReject` | 87-91 | → `rejected` | YES |
| `handleCancel` | 100-104 | → `cancelled` | YES |
| `handleHangUp` | 113-118 | → `completed` | YES |
| `onGraceExpired` | 138-142 | → `dropped` | YES |
| `handleInvite` BUSY branch | 48-49 | — | NO (D-05) |

---

### `backend/.../history/CallHistoryConsumer.java` (service, event-driven)

**Analog:** `backend/src/main/java/com/vdt/webrtc/presence/PresenceSweeper.java` (@Component with scheduling/triggering pattern)

**Component + logger pattern** (`PresenceSweeper.java` lines 1-14):
```java
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class PresenceSweeper {
    private final LocalPresenceService presence;
    private final PresenceWebSocketHandler handler;

    public PresenceSweeper(LocalPresenceService presence, PresenceWebSocketHandler handler) {
        this.presence = presence;
        this.handler = handler;
    }
```

**Two-row idempotent save pattern (from RESEARCH.md Pattern 3 + Schema §):**
```java
@RabbitListener(queues = RabbitMqConfig.CALL_HISTORY_QUEUE)
public void consume(CallHistoryEvent event) {
    try {
        // Two rows: one per participant (per-side perspective, D-06)
        repo.saveAll(List.of(
            buildRow(event, event.callerId(), event.calleeId(), callerDirection(event.endReason())),
            buildRow(event, event.calleeId(), event.callerId(), calleeDirection(event.endReason()))
        ));
    } catch (DataIntegrityViolationException e) {
        // Duplicate delivery — idempotent: ack, don't DLQ
        log.info("Duplicate event callId={} — acked without reprocessing", event.callId());
    }
    // Unchecked exception → nack → retry → DLQ (Spring AMQP handles this automatically)
}
```

**Direction mapping constants (per RESEARCH.md §Pattern 4):**

| `endReason` | Caller (`viewerId = callerId`) | Callee (`viewerId = calleeId`) |
|-------------|-------------------------------|-------------------------------|
| `completed` | `OUTGOING` | `INCOMING` |
| `missed` | `OUTGOING` | `MISSED` |
| `rejected` | `OUTGOING` | `INCOMING` |
| `cancelled` | `OUTGOING` (CANCELLED) | `INCOMING` |
| `dropped` | `OUTGOING` | `INCOMING` |

---

### `backend/.../history/CallHistory.java` (model/@Entity, CRUD)

**Analog:** `backend/src/main/java/com/vdt/webrtc/user/User.java`

**JPA entity pattern** (`User.java` lines 1-47 — full file):
```java
import jakarta.persistence.*;
import lombok.*;

@Entity
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String username;

    @Enumerated(EnumType.STRING)
    private Role role;

    @Column(nullable = false)
    private boolean locked = false;
}
```

**Adaptation for `CallHistory`:** Replace `@Table(name = "users")` with `@Table(name = "call_history")`. Use `@Column(nullable = false)` where schema has `NOT NULL`. Use `Instant` for `startedAt`/`endedAt` (JPA maps to `TIMESTAMPTZ` via Hibernate). No `@Setter` needed (insert-only entity); keep `@Builder` + `@NoArgsConstructor` + `@AllArgsConstructor`. Do NOT use `@Getter` — use records or expose fields via getter; actually keep `@Getter` since repo needs access for serialization.

---

### `backend/.../history/CallHistoryRepository.java` (repository, CRUD)

**Analog:** `backend/src/main/java/com/vdt/webrtc/user/UserRepository.java`

**JpaRepository pattern** (`UserRepository.java` lines 1-15):
```java
package com.vdt.webrtc.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CallHistoryRepository extends JpaRepository<CallHistory, Long> {
    // Derived query by example
    Optional<User> findByUsername(String username);
}
```

**Custom JPQL query (for HIST-02 cursor pagination — from RESEARCH.md §Consumer):**
```java
@Query("""
    SELECT h FROM CallHistory h
    WHERE h.viewerId = :viewerId
      AND (:before IS NULL OR h.endedAt < :before)
    ORDER BY h.endedAt DESC
    """)
Page<CallHistory> findByViewer(
    @Param("viewerId") String viewerId,
    @Param("before") Instant before,
    Pageable pageable);
```

**Admin system-wide query (ADMN-02):**
```java
@Query("""
    SELECT h FROM CallHistory h
    WHERE (:username IS NULL OR h.viewerId = :username OR h.peerId = :username)
    ORDER BY h.endedAt DESC
    """)
Page<CallHistory> findAllCalls(
    @Param("username") String username,
    Pageable pageable);
```

---

### `backend/.../history/dto/HistoryRow.java` + `AdminHistoryRow.java` (model/DTO records, request-response)

**Analog:** `backend/src/main/java/com/vdt/webrtc/admin/dto/UserSummary.java`

**Record DTO pattern** (`UserSummary.java` lines 1-10):
```java
package com.vdt.webrtc.admin.dto;

public record UserSummary(
        Long id,
        String username,
        String email,
        String role,
        boolean locked) {
}
```

**Adaptation:** `HistoryRow` carries per-side view fields: `callId`, `peerId`, `direction`, `endReason`, `durationMs` (nullable Long), `startedAt` (Instant nullable), `endedAt` (Instant). `AdminHistoryRow` adds `callerId` and `calleeId` (both parties shown, D-12).

---

### `backend/.../metrics/CallMetrics.java` (service, event-driven)

**Analog:** `backend/src/main/java/com/vdt/webrtc/presence/PresenceSweeper.java`

**@Scheduled pattern** (`PresenceSweeper.java` lines 25-35):
```java
@Slf4j
@Component
public class PresenceSweeper {

    @Scheduled(fixedDelay = 15_000)
    public void sweep() {
        ...
    }
}
```

**Cron midnight reset (from RESEARCH.md Pattern 7):**
```java
@Scheduled(cron = "0 0 0 * * *")  // midnight server-local time (D-14)
public void resetDaily() {
    startedToday.set(0);
    completedToday.set(0);
    missedToday.set(0);
}
```

**@Scheduled prerequisite:** `@EnableScheduling` is already wired via `SchedulerConfig.java` (the `ThreadPoolTaskScheduler` bean registers the scheduler). Verify `@EnableScheduling` annotation is present; if not, add it to `SchedulerConfig.java`.

**AtomicLong counter pattern (NOT Micrometer Counter — RESEARCH.md §Pitfall §Pattern 7):**
```java
private final AtomicLong startedToday   = new AtomicLong(0);
private final AtomicLong completedToday = new AtomicLong(0);
private final AtomicLong missedToday    = new AtomicLong(0);
```

---

### `backend/.../admin/AdminController.java` (extend — controller, request-response)

**Analog:** itself (lines 1-25) — add endpoints to the existing file.

**Existing controller structure** (`AdminController.java` lines 1-25):
```java
package com.vdt.webrtc.admin;

import org.springframework.web.bind.annotation.*;
import com.vdt.webrtc.admin.dto.UserSummary;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/users")
    public List<UserSummary> listUsers(){
        return adminService.listUsers();
    }
}
```

**Pattern for new PATCH + GET endpoints (copy from `AuthController.java` lines 35-45):**
```java
@PatchMapping("/users/{id}/lock")
public ResponseEntity<Void> lockUser(
        @PathVariable Long id,
        Authentication auth) {
    adminService.lockUser(auth.getName(), id);
    return ResponseEntity.noContent().build();
}
```

**Security:** `/api/admin/**` already locked to `ADMIN` role in `SecurityConfig.java` line 38. No additional guard needed on individual endpoints.

**Self-protection (D-10):** Pass authenticated username from `Authentication auth` parameter to service — the service enforces the check, not the controller.

---

### `backend/.../admin/AdminService.java` (extend — service, CRUD + event-driven)

**Analog:** itself (lines 1-29) — extend with `lockUser`, `unlockUser`, `changeRole`, `getSystemHistory`, `getDashboard`.

**Existing service structure** (`AdminService.java` lines 1-29):
```java
@Service
public class AdminService {
    private final UserRepository userRepository;

    public AdminService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public List<UserSummary> listUsers() {
        return userRepository.findAll().stream()
                .map(user -> new UserSummary(...))
                .toList();
    }
}
```

**Force-disconnect pattern (from SessionRegistry.java lines 29-31 — `get()` returns Optional):**
```java
sessionRegistry.get(targetUsername).ifPresent(session -> {
    try {
        session.close(new CloseStatus(4003, "account-locked"));
    } catch (IOException e) {
        log.warn("Could not close session for locked user {}: {}", targetUsername, e.getMessage());
    }
});
```

**Self-protection check (D-10 — enforced in service, not controller):**
```java
if (adminUsername.equals(targetUsername)) {
    throw new IllegalArgumentException("Admin cannot lock/modify own account");
}
```

**Dashboard aggregate pattern (from RESEARCH.md Pattern 7):**
```java
// active_calls: Redis KEYS scan (acceptable for Phase 5 demo scale — TODO Phase 6: replace with counter)
int activeCalls = Optional.ofNullable(redis.keys("user-call:*"))
    .map(keys -> keys.size() / 2)
    .orElse(0);
```

---

### `backend/.../call/CallService.java` (modify — add publish calls)

**Analog:** itself — insert `callHistoryPublisher.publish(event)` after each of the 5 `if (ok) { broadcast(...); }` blocks.

**The 5 insert points** (from CallService.java, identified lines):
- Line 64: after `broadcast(callId, "ended", "missed", ...)` in `onRingTimeout`
- Line 90: after `broadcast(callId, "ended", "rejected", ...)` in `handleReject`
- Line 103: after `broadcast(callId, "ended", "cancelled", ...)` in `handleCancel`
- Line 117: after `broadcast(callId, "ended", "completed", ...)` in `handleHangUp`
- Line 141: after `broadcast(callId, "ended", "dropped", ...)` in `onGraceExpired`

**Pattern — all 5 follow this shape:**
```java
if (ok) {
    broadcast(callId, "ended", "missed", call.callerId(), call.calleeId());
    // ADD after broadcast — fire-and-forget history event
    Instant startedAt = repo.findStartedAt(callId).orElse(null);
    callHistoryPublisher.publish(new CallHistoryEvent(
        callId, call.callerId(), call.calleeId(), "missed", startedAt, Instant.now()));
}
```

**startedAt requires a small `CallStateRepository` change** — add `findStartedAt(callId)` that reads `call:{id}` hash field `startedAt`. Store it in `handleAccept` (after transition to active):
```java
// Add to handleAccept, after ok==true:
repo.recordStartedAt(callId, Instant.now());
```

---

### `backend/src/main/resources/db/migration/V3__call_history.sql` (migration, CRUD)

**Analog:** `V1__create_tables.sql` (lines 1-24) — same SQL style, comment header, `TIMESTAMPTZ`, `BIGSERIAL`, `BOOLEAN`, `VARCHAR`.

**Style conventions from V1** (`V1__create_tables.sql` lines 1-24):
```sql
-- V1: Core auth schema (users + refresh_tokens)

CREATE TABLE users (
    id            BIGSERIAL    PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    role          VARCHAR(20)  NOT NULL DEFAULT 'USER',
    locked        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
```

**Pattern to follow:**
- Comment header: `-- V3: call_history table`
- Column alignment with spaces to match V1 style
- `TIMESTAMPTZ` for all timestamps
- `BIGSERIAL PRIMARY KEY` for surrogate key
- `CREATE UNIQUE INDEX` for idempotency constraint
- `CREATE INDEX` for query performance indexes
- Migration version: `V3__call_history.sql` (V2 is the seed admin — confirmed no V3 exists yet)

---

### `backend/src/main/resources/application.yaml` (modify)

**Analog:** existing `spring.data.redis` section (lines 5-7):
```yaml
spring:
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
```

**RabbitMQ section to add** (parallel structure, from RESEARCH.md §Pattern 1):
```yaml
spring:
  rabbitmq:
    host: ${RABBITMQ_HOST:localhost}
    port: ${RABBITMQ_PORT:5672}
    username: ${RABBITMQ_USER:guest}
    password: ${RABBITMQ_PASSWORD:guest}
    listener:
      simple:
        retry:
          enabled: true
          initial-interval: 1s
          multiplier: 2.0
          max-attempts: 3
          max-interval: 10s
        acknowledge-mode: auto
    publisher-confirm-type: correlated
    publisher-returns: true
```

---

### `docker-compose.yml` (modify — add `rabbitmq:` service)

**Analog:** existing `redis:` service block (`docker-compose.yml` lines 68-80):
```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 5s
    retries: 10
```

**RabbitMQ service to add** (parallel structure):
```yaml
rabbitmq:
  image: rabbitmq:4.1-management
  ports:
    - "5672:5672"
    - "15672:15672"   # management UI — demo-visible
  healthcheck:
    test: ["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]
    interval: 10s
    timeout: 5s
    retries: 10
```

**Also add to `backend:` service `depends_on`** (parallel to `redis: condition: service_healthy`):
```yaml
rabbitmq:
  condition: service_healthy
```

---

### `backend/pom.xml` (modify — add AMQP dependency)

**Analog:** existing Redis starter block (`pom.xml` lines 92-96):
```xml
<!-- Redis -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

**AMQP + Testcontainers RabbitMQ to add:**
```xml
<!-- AMQP / RabbitMQ -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-amqp</artifactId>
</dependency>

<!-- Testcontainers RabbitMQ module (test scope) -->
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>rabbitmq</artifactId>
    <scope>test</scope>
    <!-- version managed by spring-boot-testcontainers BOM -->
</dependency>
```

---

### `backend/.../TestcontainersConfiguration.java` (modify)

**Analog:** itself (lines 1-23) — add `RabbitMQContainer` alongside existing `PostgreSQLContainer` and `GenericContainer` (Redis).

**Existing pattern** (`TestcontainersConfiguration.java` lines 9-23):
```java
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

**Bean to add (note: `RabbitMQContainer` uses `@ServiceConnection` directly, no `name` needed):**
```java
@Bean
@ServiceConnection
RabbitMQContainer rabbitMqContainer() {
    return new RabbitMQContainer("rabbitmq:4.1-management");
}
```

**Import:** `org.testcontainers.containers.rabbitmq.RabbitMQContainer` (from the `testcontainers:rabbitmq` module added to pom.xml).

---

### `frontend/src/pages/HistoryPage.tsx` (component/page, request-response)

**Analog:** `frontend/src/pages/AdminPage.tsx` (lines 1-63)

**Page structure pattern** (`AdminPage.tsx` lines 12-59):
```tsx
export default function AdminPage() {
    const [users, setUsers] = useState<UserRow[]>([])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.get('/api/admin/users')
            .then(res => setUsers(res.data))
            .catch(() => setError('Không thể tải danh sách người dùng'))
            .finally(() => setLoading(false))
    }, [])

    return (
        <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'sans-serif' }}>
            <h1>Quản trị — Danh sách người dùng</h1>
            {loading && <p>Đang tải…</p>}
            {error && <p style={{ color: 'red' }}>{error}</p>}
            ...
        </div>
    )
}
```

**Key deviation:** `HistoryPage.tsx` uses TanStack Query `useInfiniteQuery` instead of `useState` + `useEffect`. Replace the data-fetching entirely with the `useInfiniteQuery` v5 pattern (RESEARCH.md Pattern 8). The page container style (`maxWidth: 800, margin: '40px auto'`) is kept identical.

**IntersectionObserver sentinel (from RESEARCH.md Pattern 8):**
```tsx
const sentinelRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  if (!sentinelRef.current) return
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  })
  observer.observe(sentinelRef.current)
  return () => observer.disconnect()
}, [hasNextPage, isFetchingNextPage, fetchNextPage])
```

---

### `frontend/src/pages/AdminPage.tsx` (extend — add lock/unlock, role, tabs)

**Analog:** itself (lines 1-63) — extend existing component.

**Existing inline style constants** (`AdminPage.tsx` lines 61-62):
```tsx
const th: React.CSSProperties = { padding: 8, borderBottom: '2px solid #d1d5db' }
const td: React.CSSProperties = { padding: 8, borderBottom: '1px solid #e5e7eb' }
```

**TanStack Query migration:** Replace `useState` + `useEffect` with `useQuery` from `@tanstack/react-query`. Use `queryClient.invalidateQueries(['admin-users'])` after lock/unlock/role actions instead of page reload.

**Confirmation modal integration:** Import and render `ConfirmModal` conditionally when `confirmTarget` state is set. Follow the existing conditional render pattern: `{loading && ...}` `{error && ...}` `{!loading && !error && ...}`.

**Self-protection pattern for own row (D-10):** Compare `user.username === currentUser?.username` to determine disabled state:
```tsx
const isOwnRow = user.username === currentUser?.username
<button disabled={isOwnRow} style={{ opacity: isOwnRow ? 0.4 : 1, cursor: isOwnRow ? 'not-allowed' : 'pointer' }}>
    Khóa
</button>
```

---

### `frontend/src/components/history/CallHistoryRow.tsx` (component, request-response)

**Analog:** `frontend/src/components/presence/OnlineUserRow.tsx` (lines 1-32)

**Flex row + inline styles pattern** (`OnlineUserRow.tsx` lines 15-31):
```tsx
return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                 borderBottom: '1px solid var(--border)', listStyle: 'none' }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[user.status] }} />
        <span style={{ flex: 1, fontSize: 16, color: 'var(--text-h)', textAlign: 'left' }}>{user.username}</span>
        <StatusBadge status={user.status} />
        ...
    </li>
)
```

**Direction glyph pattern (from UI-SPEC §Component Inventory):** Unicode arrows, `aria-hidden="true"`. Glyph color: incoming/outgoing neutral `var(--text)`, missed glyph `#dc2626`:
```tsx
const GLYPH: Record<string, string> = { OUTGOING: '↗', INCOMING: '↙', MISSED: '↘' }
const GLYPH_COLOR: Record<string, string> = { OUTGOING: 'var(--text)', INCOMING: 'var(--text)', MISSED: '#dc2626' }
```

**Per-side label colors (from UI-SPEC §Color §Outcome-label):**
```tsx
const LABEL_COLOR: Record<string, string> = {
    MISSED: '#dc2626',    // red
    DROPPED: '#d97706',   // amber warning
}
// All others: 'var(--text)' neutral
```

**Row layout (from UI-SPEC §Surface 1):** `padding: '12px 16px'`, columns: `[glyph] [peer username flex:1] [outcome label 14px] [duration 16px tabular-nums] [timestamp 14px muted]`.

---

### `frontend/src/components/history/DayGroup.tsx` (component, request-response)

**Analog:** `frontend/src/components/presence/OnlineUsersList.tsx`

**Grouped list pattern** (`OnlineUsersList.tsx` — list wrapper component). `DayGroup` is simpler: a sticky header `<div>` plus a list of `<CallHistoryRow>` children.

**Sticky header style (from UI-SPEC §Typography + §Surface 1):**
```tsx
<div style={{
    fontSize: 14, fontWeight: 600, color: 'var(--text)',
    borderBottom: '1px solid var(--border)',
    padding: '8px 16px', position: 'sticky', top: 0,
    background: 'var(--bg)',   // prevent overlap with rows when scrolling
}}>
    {label}  {/* "Hôm nay" | "Hôm qua" | "DD/MM/YYYY" */}
</div>
```

---

### `frontend/src/components/admin/ConfirmModal.tsx` (component, request-response)

**Analog:** `frontend/src/components/call/CallSummaryScreen.tsx` (lines 1-56) — reuse the modal shell **exactly**.

**Modal shell pattern** (`CallSummaryScreen.tsx` lines 29-55):
```tsx
<div
    role="dialog"
    aria-modal="true"
    aria-labelledby="call-summary-heading"
    style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)',
    }}
>
    <div style={{
        background: 'var(--code-bg)', borderRadius: 12, padding: 24,
        maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)', textAlign: 'center'
    }}>
        <h2 id="call-summary-heading" style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
            {title}
        </h2>
        <button
            onClick={onClose}
            style={{ marginTop: 24, padding: '10px 24px', fontSize: 15, fontWeight: 600,
                     borderRadius: 8, border: 'none', cursor: 'pointer',
                     background: 'var(--accent, #2563eb)', color: '#fff' }}
        >
            Về ngay
        </button>
    </div>
</div>
```

**ConfirmModal adaptation:**
- Title: varies by action (lock / unlock / role change per UI-SPEC §Copywriting)
- Two buttons: primary (Confirm action) right, secondary (Hủy) left
- Lock confirm button: destructive style (`background: '#dc2626'`, white text) per UI-SPEC
- Unlock / role change confirm: accent fill (`var(--accent)`)
- Focus confirm button on open; Esc / overlay click calls `onCancel`
- `aria-labelledby` pointing to modal title id

---

### `frontend/src/components/admin/DashboardCards.tsx` (component, request-response)

**Analog:** `frontend/src/components/presence/StatusBadge.tsx` (inline styles + semantic color palette)

**Color palette pattern** (`StatusBadge.tsx` lines 4-7):
```tsx
const STYLES: Record<PresenceStatus, { color: string; bg: string; label: string }> = {
    ONLINE:  { color: '#166534', bg: '#dcfce7', label: 'Trực tuyến' },
    IN_CALL: { color: '#92400e', bg: '#fef3c7', label: 'Đang gọi' },
}
```

**Stat card pattern (from UI-SPEC §Surface 3):**
```tsx
// Each stat card: var(--code-bg) surface, radius 12, padding 24, var(--shadow), gap 16
<div style={{
    background: 'var(--code-bg)', borderRadius: 12, padding: 24,
    boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 8,
}}>
    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase' }}>
        {label}
    </span>
    <span style={{ fontSize: 44, fontWeight: 600, color: 'var(--text-h)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
    </span>
</div>
```

**TanStack Query `refetchInterval` (D-15 — from RESEARCH.md Pattern 8 context):**
```tsx
const { data } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get('/api/admin/dashboard').then(r => r.data),
    refetchInterval: 5000,                 // poll every 5s (D-15)
    placeholderData: previousData => previousData,  // keep prior values on error (UI-SPEC §Error)
})
```

---

### `frontend/src/components/admin/SystemHistoryTable.tsx` (component, request-response)

**Analog:** `frontend/src/pages/AdminPage.tsx` (lines 31-55) — table + thead/tbody pattern.

**Table pattern** (`AdminPage.tsx` lines 31-55):
```tsx
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead>
        <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
            <th style={th}>ID</th>
            ...
        </tr>
    </thead>
    <tbody>
        {items.map(item => (
            <tr key={item.id}>
                <td style={td}>{item.value}</td>
            </tr>
        ))}
    </tbody>
</table>
```

**Username filter input (from UI-SPEC §Surface 3):**
```tsx
<input
    type="text"
    placeholder="Lọc theo tên người dùng…"
    value={usernameFilter}
    onChange={e => setUsernameFilter(e.target.value)}
    style={{
        border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px',
        fontSize: 14, marginBottom: 16, width: 200,
        outline: 'none',  /* focus style via :focus CSS or inline onFocus */
    }}
/>
```

**Note:** Use `useQuery` (not `useInfiniteQuery`) for admin history — it's offset-paginated with `page`/`size` params, not cursor-based. Pagination controls use prev/next buttons.

---

### `frontend/src/api/history.ts` (utility/API client, request-response)

**Analog:** `frontend/src/api/turn.ts` (lines 1-28)

**API function pattern** (`turn.ts` lines 1-28):
```typescript
import api from './axios'

interface TurnCredentialsResponse { ... }

export async function fetchIceConfig(forceRelay = false): Promise<IceConfig> {
    const { data } = await api.get<TurnCredentialsResponse>('/api/turn-credentials')
    ...
    return { iceServers }
}
```

**History API client (cursor-paginated):**
```typescript
import api from './axios'

export interface HistoryPage {
    items: HistoryRow[]
    nextCursor: string | null   // ISO timestamp of the oldest item, or null if no more
}

export async function fetchHistory(before?: string | null, size = 20): Promise<HistoryPage> {
    const { data } = await api.get<HistoryPage>('/api/history', {
        params: { before, size }
    })
    return data
}
```

**For `useInfiniteQuery` v5 integration:** the `queryFn` receives `{ pageParam }` — pass `pageParam` as `before`.

---

### `frontend/src/api/admin.ts` (extend — utility/API client, request-response)

**Analog:** `frontend/src/api/turn.ts` — add alongside existing pattern. Currently `admin` API calls are inlined in `AdminPage.tsx` (`api.get('/api/admin/users')`). Extract and extend:

```typescript
import api from './axios'

export async function fetchAdminUsers() {
    const { data } = await api.get('/api/admin/users')
    return data
}

export async function lockUser(userId: number) {
    await api.patch(`/api/admin/users/${userId}/lock`)
}

export async function unlockUser(userId: number) {
    await api.patch(`/api/admin/users/${userId}/unlock`)
}

export async function changeRole(userId: number, role: string) {
    await api.patch(`/api/admin/users/${userId}/role`, { role })
}

export async function fetchDashboard() {
    const { data } = await api.get('/api/admin/dashboard')
    return data
}

export async function fetchAdminHistory(page = 0, size = 20, username?: string) {
    const { data } = await api.get('/api/admin/history', { params: { page, size, username } })
    return data
}
```

---

## Shared Patterns

### Authentication / Authorization
**Source:** `backend/src/main/java/com/vdt/webrtc/config/SecurityConfig.java` (lines 38-39)
**Apply to:** All new admin endpoints, history endpoint
```java
.requestMatchers("/api/admin/**").hasRole("ADMIN")
.anyRequest().authenticated()
```
The history endpoint (`/api/history`) falls under `anyRequest().authenticated()` — no change to SecurityConfig needed. Admin endpoints are already covered by the existing `/api/admin/**` rule.

### Error Handling (Backend)
**Source:** `backend/src/main/java/com/vdt/webrtc/common/GlobalExceptionHandler.java` (lines 1-73)
**Apply to:** All new service methods — throw `UserNotFoundException` for missing users; `IllegalArgumentException` for self-protection (D-10) which maps to 400 via catch-all or add a dedicated handler.

**Pattern:**
```java
@ExceptionHandler(IllegalArgumentException.class)
public ResponseEntity<ApiError> handleIllegalArgument(IllegalArgumentException ex, HttpServletRequest request) {
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(build(HttpStatus.BAD_REQUEST, ex.getMessage(), null, request));
}
```

### Inline Styles (Frontend)
**Source:** `frontend/src/pages/AdminPage.tsx` (lines 61-62); `frontend/src/components/presence/OnlineUserRow.tsx`
**Apply to:** All new frontend components
```tsx
// Define CSS constants at module scope (outside component) to avoid recreation on render:
const th: React.CSSProperties = { padding: 8, borderBottom: '2px solid #d1d5db' }
const td: React.CSSProperties = { padding: 8, borderBottom: '1px solid #e5e7eb' }
```
**No Tailwind, no shadcn.** Use CSS variables (`var(--bg)`, `var(--text)`, `var(--code-bg)`, `var(--border)`, `var(--accent)`, `var(--shadow)`, `var(--text-h)`) for theming — never hardcode surface hexes.

### Constructor Injection (Backend)
**Source:** All existing services and controllers (`AdminService.java` lines 14-16, `CallService.java` lines 21-31)
**Apply to:** All new beans
```java
// No @Autowired annotation — constructor injection only
public AdminService(UserRepository userRepository) {
    this.userRepository = userRepository;
}
```

### Lombok on Entities
**Source:** `backend/src/main/java/com/vdt/webrtc/user/User.java` (lines 13-17)
**Apply to:** `CallHistory.java` entity
```java
@Getter @Setter @AllArgsConstructor @NoArgsConstructor @Builder
```

### Logger Pattern
**Source:** `PresenceSweeper.java` line 1 (`@Slf4j`); `GlobalExceptionHandler.java` line 16
**Apply to:** `CallHistoryPublisher.java`, `CallHistoryConsumer.java`, `AdminService.java`
```java
// Option 1 (Lombok @Slf4j on class) — if Lombok is available:
@Slf4j
// Then use: log.error(...), log.info(...), log.warn(...)

// Option 2 (manual):
private static final Logger log = LoggerFactory.getLogger(ClassName.class);
```

### AuthStore for Current User (Frontend)
**Source:** `frontend/src/components/presence/OnlineUserRow.tsx` (line 11)
**Apply to:** `AdminPage.tsx` (self-protection check), `HistoryPage.tsx` (viewer identity)
```tsx
const me = useAuthStore((s) => s.user?.username)
```

### TanStack Query + api.get (Frontend)
**Source:** `frontend/src/api/turn.ts` (axios api client); `AdminPage.tsx` (direct api.get calls to be migrated)
**Apply to:** All new frontend data-fetching functions
- Always use the pre-configured `api` instance from `frontend/src/api/axios.ts` — it handles JWT attach and 401 refresh automatically
- Wrap raw API calls in typed async functions in `api/*.ts` files
- Consume in components via `useQuery` / `useInfiniteQuery` from `@tanstack/react-query`

---

## No Analog Found

All files have analogs in the codebase. No new files require falling back to RESEARCH.md patterns exclusively — all have at least a role-match or partial-match in the existing code.

| File | Note |
|------|------|
| `CallHistoryConsumer.java` | Closest is `PresenceSweeper.java` (scheduled component). The `@RabbitListener` annotation itself has no codebase analog — follow RESEARCH.md §Pattern 3 for the listener syntax. |
| `RabbitMqConfig.java` | `SchedulerConfig.java` provides the @Configuration/@Bean shell pattern, but RabbitMQ-specific APIs (QueueBuilder, BindingBuilder, DirectExchange) have no codebase analog — follow RESEARCH.md §Pattern 1. |
| `DashboardCards.tsx` | No stat-card component exists — `StatusBadge.tsx` provides the inline style + color constant approach; follow UI-SPEC §Surface 3 for the card layout. |

---

## Metadata

**Analog search scope:** `backend/src/main/java/com/vdt/webrtc/**`, `frontend/src/**`, `backend/src/main/resources/db/migration/`, `docker-compose.yml`, `backend/pom.xml`, `backend/src/test/**`
**Files scanned:** 27 analog candidates read; 14 backend + 7 frontend + 4 config/infra + 2 test infra
**Pattern extraction date:** 2026-06-28
