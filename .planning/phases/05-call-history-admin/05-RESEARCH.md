# Phase 5: Call History & Admin — Research

**Researched:** 2026-06-28
**Domain:** Async messaging (RabbitMQ/Spring AMQP), idempotent persistence, admin RBAC, live dashboard
**Confidence:** HIGH (stack is locked, codebase is inspected, Spring AMQP docs verified for Jackson 3)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Each call history row shows: peer (đối phương), direction icon (↙/↗/↘), duration, timestamp, outcome label.
- **D-02:** Group by day (Hôm nay / Hôm qua / DD/MM/YYYY), newest→oldest within each group.
- **D-03:** Infinite scroll (no cap). TanStack Query `useInfiniteQuery`.
- **D-04:** Read-only — no delete/clear endpoints this phase.
- **D-05:** Log end-reasons: completed, missed, rejected, cancelled, dropped. `busy` is NEVER logged.
- **D-06:** Per-side labelling — each party sees their own perspective (outgoing/incoming/missed/etc).
- **D-07:** Any call that reached `active` counts as `completed` with real duration; no minimum-duration threshold.
- **D-08:** Lock/unlock + role change are inline in AdminPage users table. Extends existing table.
- **D-09:** Confirmation prompt required before sensitive actions (lock, change role).
- **D-10:** Self-protection: admin cannot lock/demote own account — enforced backend AND hidden FE.
- **D-11:** Locking a user mid-call force-disconnects their WS; surviving peer experiences grace→dropped flow from Phase 4.
- **D-12:** System-wide history is a table of ALL calls (both parties shown), filter by username, newest→oldest, paginated.
- **D-13:** Dashboard metrics: online users, active calls, daily stats (calls started / completed / missed).
- **D-14:** Daily stats per server-local calendar day, reset at 00:00 (not rolling 24h).
- **D-15:** Dashboard updates via REST polling (~5s `refetchInterval`) — NOT a dedicated WS channel.
- **D-16:** Dashboard displayed as stat cards (large numbers). No charts this phase.

### Claude's Discretion
- RabbitMQ topology (exchange/queue/routing keys), DLQ config, publisher confirms, retry/backoff.
- Idempotency mechanism (keyed by callId + event type).
- `call_history` table schema, JPA entity, Flyway migration version number.
- Exact event trigger points in `CallService`.
- Where dashboard counts come from (Redis vs DB aggregate).

### Deferred Ideas (OUT OF SCOPE)
- Delete/clear call history.
- WS-pushed realtime dashboard.
- Dashboard charts/trend visualization.
- Logging `busy` events.
- Phase 4 carry-over polish (CR-02a, CR-04, WR-01/02/09).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIST-01 | Call lifecycle events published to RabbitMQ on state transitions, persisted asynchronously — realtime path never waits on DB | §RabbitMQ Topology, §Fire-and-Forget Publish Pattern |
| HIST-02 | User can view their own call history (incoming/outgoing/missed, duration, timestamps) | §call_history Schema, §Per-side History Query, §TanStack Query useInfiniteQuery |
| HIST-03 | History writes idempotent (keyed by callId + event type) with DLQ for failed messages | §Idempotent Consumer, §DLQ Configuration |
| ADMN-01 | Admin can view, lock/unlock users and change roles; locked users force-disconnected immediately | §Admin Force-Disconnect, §UserDetailsServiceImpl accountLocked |
| ADMN-02 | Admin can view system-wide call history | §Per-side History Query (admin variant), §Admin History Endpoint |
| ADMN-03 | Admin sees live dashboard: online users, active calls, daily stats | §Dashboard Counts Architecture |
</phase_requirements>

---

## Summary

Phase 5 introduces RabbitMQ as an async pipeline between the Phase 4 call state machine and the `call_history` table — the most structurally new piece in this phase. The realtime path (CallService broadcast) must never block on AMQP or DB; it fires a message and moves on. The consumer runs independently, persists idempotently via a unique DB constraint on `(call_id, end_reason)`, and dead-letters failures rather than crashing the consumer loop.

The admin management and live dashboard surfaces are extensions of existing code: `AdminController` + `AdminService` + `AdminPage.tsx` already have the table, user entity with `locked`, and RBAC filter chain wired. Admin force-disconnect uses the existing `SessionRegistry.get(userId).get().close(...)` call — the same mechanism used for the superseded-session kick in Phase 2. The dashboard reads online-user count from `LocalPresenceService` (in-memory, single instance for now), active-call count from Redis `user-call:*` keyspace scan, and daily stats from Micrometer counters (calls.started / calls.completed / calls.missed) with a `@Scheduled` midnight reset.

**Primary recommendation:** Wire `spring-boot-starter-amqp` (managed by Boot 4 BOM at 4.0.7 or later) with a `JacksonJsonMessageConverter` bean (NOT the deprecated `Jackson2JsonMessageConverter`) using the project's `tools.jackson.databind.ObjectMapper`. Use a direct exchange with a single queue + DLQ via `x-dead-letter-exchange`. Fire-and-forget publish from the five terminal transitions in `CallService`. Consumer persists with a `UNIQUE (call_id, end_reason)` constraint and catches `DataIntegrityViolationException` for idempotency.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Async history pipeline | API / Backend (CallService → AMQP → consumer) | Database / Storage | Fire-and-forget from control plane; consumer is BE-only |
| call_history persistence | Database / Storage | API / Backend (JPA consumer) | Flyway owns schema; JPA entity + repo owns CRUD |
| Per-user history view (HIST-02) | API / Backend (REST pagination) | Browser / Client (useInfiniteQuery) | Query + pagination owned by server; client renders pages |
| Admin user management (ADMN-01) | API / Backend (AdminController) | Browser / Client (AdminPage) | Lock/role enforced server-side; FE is presentation only |
| Admin force-disconnect | API / Backend (SessionRegistry.close) | — | WS sessions are server-side objects; no client involvement |
| Live dashboard counts (ADMN-03) | API / Backend (dashboard REST endpoint) | Browser / Client (5s poll) | Aggregates Redis + Micrometer; client polls |
| Daily stats counters | API / Backend (Micrometer + @Scheduled reset) | — | In-process counters; reset at server midnight |
| Direction label / per-side view | API / Backend (query adds perspective) | Browser / Client (renders label) | Server knows callerId/calleeId; client supplies viewer identity via JWT |

---

## Standard Stack

### Core Additions (new to pom.xml in this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spring-boot-starter-amqp` | 4.0.7 (managed by Boot BOM) | RabbitMQ producer + consumer | Boot BOM manages version; CLAUDE.md locked choice [VERIFIED: central.sonatype.com] |
| `testcontainers:rabbitmq` | 1.21.x (Boot manages via boot-testcontainers) | Integration tests with real broker | Same testcontainers version line already used for PostgreSQL+Redis [VERIFIED: java.testcontainers.org] |

### Already Present (reused unchanged)

| Library | Version | Purpose |
|---------|---------|---------|
| `spring-boot-starter-data-jpa` | Boot BOM | call_history JPA entity + repo |
| `spring-boot-starter-data-redis` | Boot BOM | active-calls count for dashboard |
| Flyway | Boot BOM | V3__call_history.sql migration |
| Micrometer | Boot BOM | calls.started/completed/missed counters |
| `@tanstack/react-query` | 5.101.0 | useInfiniteQuery (history) + refetchInterval (dashboard) |
| Zustand | 5.0.14 | No change — call state only |

### Key Deprecation Warning

`Jackson2JsonMessageConverter` is **deprecated for removal** in Spring AMQP 4.0. [VERIFIED: docs.spring.io/spring-amqp/reference/amqp/message-converters.html]

This project uses `tools.jackson.databind.ObjectMapper` (Jackson 3, Spring Boot 4). Use `JacksonJsonMessageConverter` from `org.springframework.amqp.support.converter`.

**Installation (pom.xml additions):**
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

**docker-compose.yml addition:**
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

---

## Package Legitimacy Audit

> These are Maven/JVM artifacts, not npm packages. slopcheck operates on npm; it was not run. All packages below are verified through official Maven Central + Spring project registries.

| Package | Registry | Age | Source Repo | Disposition |
|---------|----------|-----|-------------|-------------|
| `org.springframework.boot:spring-boot-starter-amqp` | Maven Central | ~14 yrs | github.com/spring-projects/spring-boot | Approved [VERIFIED: central.sonatype.com] |
| `org.testcontainers:rabbitmq` | Maven Central | ~8 yrs | github.com/testcontainers/testcontainers-java | Approved [VERIFIED: java.testcontainers.org] |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Note: slopcheck targets npm registry; Maven artifacts are vetted via Maven Central + official Spring/Testcontainers repos directly.*

---

## Architecture Patterns

### System Architecture Diagram

```
CallService.handle*(...)
  ├─ stateMachine.transition(...)   [Redis CAS — already Phase 4]
  ├─ broadcast(callId, "ended", reason, ...)  [WS — realtime, non-blocking]
  └─ callHistoryPublisher.publish(event)  ──► [fire-and-forget, async]
                                                    │
                                            RabbitMQ Exchange
                                           (direct, call.history)
                                                    │
                                            Queue: call-history-q
                                           (x-dead-letter-exchange: call-history-dlx)
                                                    │
                                    CallHistoryConsumer @RabbitListener
                                                    │
                                     ┌──────────────┴──────────────┐
                                     │     callHistoryRepository    │
                                     │  .saveIfAbsent(event)        │
                                     │  UNIQUE(call_id, end_reason) │
                                     │  ON CONFLICT → ignore        │
                                     └──────────────────────────────┘
                                                    │
                                         PostgreSQL call_history table

Admin REST (AdminController):
  GET /api/admin/users                    ← existing
  PATCH /api/admin/users/{id}/lock        ← new
  PATCH /api/admin/users/{id}/unlock      ← new
  PATCH /api/admin/users/{id}/role        ← new
  GET  /api/admin/history?page=&size=&username=  ← new (system-wide)
  GET  /api/admin/dashboard               ← new (poll target)

User REST:
  GET  /api/history?page=&size=&before=   ← new (cursor paginated)

Dashboard endpoint aggregates:
  online_users  ← LocalPresenceService.snapshot().size()
  active_calls  ← Redis KEYS user-call:* count (or scan)
  today_started ← Micrometer counter calls.started (in-process)
  today_completed ← Micrometer counter calls.completed
  today_missed  ← Micrometer counter calls.missed
  (all counters reset at midnight via @Scheduled)
```

### Recommended Project Structure (new files only)

```
backend/src/main/java/com/vdt/webrtc/
├── history/
│   ├── CallHistoryEvent.java         # record: callId, callerId, calleeId, endReason, startedAt, endedAt
│   ├── CallHistoryPublisher.java      # AmqpTemplate.convertAndSend(...)
│   ├── CallHistory.java              # @Entity for call_history table
│   ├── CallHistoryRepository.java    # JpaRepository + pagination queries
│   ├── CallHistoryConsumer.java      # @RabbitListener, idempotent save
│   └── dto/
│       ├── HistoryRow.java           # per-side DTO for user endpoint
│       └── AdminHistoryRow.java      # both parties, for admin endpoint
├── config/
│   └── RabbitMqConfig.java           # exchange, queue, DLQ, JacksonJsonMessageConverter bean
├── admin/
│   ├── AdminController.java          # EXTENDS: lock/unlock, role, /history, /dashboard
│   └── AdminService.java             # EXTENDS: lockUser (+ force-close WS), dashboard aggregate
└── metrics/
    └── CallMetrics.java              # Micrometer Counter wrappers + @Scheduled midnight reset

backend/src/main/resources/db/migration/
└── V3__call_history.sql

frontend/src/
├── pages/
│   ├── HistoryPage.tsx               # /history route — infinite scroll call log
│   └── AdminPage.tsx                 # EXTEND: lock/unlock, role dropdown, tabs → Dashboard/History
├── components/history/
│   ├── CallHistoryRow.tsx            # single row with direction glyph + per-side label
│   └── DayGroup.tsx                  # sticky day header + rows
├── components/admin/
│   ├── ConfirmModal.tsx              # reusable confirmation dialog (reuses CallSummaryScreen shell)
│   ├── DashboardCards.tsx            # 5 stat cards
│   └── SystemHistoryTable.tsx        # admin all-calls table with username filter
└── api/
    ├── history.ts                    # GET /api/history + /api/admin/history
    └── admin.ts                      # EXTEND: lock/unlock/role/dashboard API calls
```

### Pattern 1: RabbitMQ Config with JacksonJsonMessageConverter

**What:** Wire exchange, queue, DLQ, and message converter. Boot 4 auto-configures `RabbitTemplate` and `SimpleRabbitListenerContainerFactory` if a `ConnectionFactory` bean exists (it does via auto-config from `spring.rabbitmq.*` properties).

**Critical:** Use `JacksonJsonMessageConverter` (Spring AMQP 4.x Jackson 3 class), NOT the deprecated `Jackson2JsonMessageConverter`. The project's `tools.jackson.databind.ObjectMapper` bean (auto-configured by Boot 4) must be injected — do NOT create a new `ObjectMapper`.

```java
// Source: docs.spring.io/spring-amqp/reference/amqp/message-converters.html
// + project MEMORY: Jackson 3 / Boot 4 uses tools.jackson namespace
@Configuration
public class RabbitMqConfig {

    public static final String CALL_HISTORY_EXCHANGE = "call.history";
    public static final String CALL_HISTORY_QUEUE    = "call-history-q";
    public static final String CALL_HISTORY_DLX      = "call-history-dlx";
    public static final String CALL_HISTORY_DLQ      = "call-history-dlq";
    public static final String ROUTING_KEY           = "call.ended";

    @Bean
    DirectExchange callHistoryExchange() {
        return new DirectExchange(CALL_HISTORY_EXCHANGE);
    }

    @Bean
    DirectExchange callHistoryDlx() {
        return new DirectExchange(CALL_HISTORY_DLX);
    }

    @Bean
    Queue callHistoryQueue() {
        return QueueBuilder.durable(CALL_HISTORY_QUEUE)
            .withArgument("x-dead-letter-exchange", CALL_HISTORY_DLX)
            .build();
    }

    @Bean
    Queue callHistoryDlq() {
        return QueueBuilder.durable(CALL_HISTORY_DLQ).build();
    }

    @Bean
    Binding callHistoryBinding() {
        return BindingBuilder.bind(callHistoryQueue())
            .to(callHistoryExchange()).with(ROUTING_KEY);
    }

    @Bean
    Binding callHistoryDlqBinding() {
        return BindingBuilder.bind(callHistoryDlq())
            .to(callHistoryDlx()).with(ROUTING_KEY);
    }

    // CRITICAL: Use JacksonJsonMessageConverter (Jackson 3), not deprecated Jackson2JsonMessageConverter
    // Inject tools.jackson ObjectMapper — the Boot 4 auto-configured bean
    @Bean
    JacksonJsonMessageConverter jsonMessageConverter(tools.jackson.databind.ObjectMapper objectMapper) {
        return new JacksonJsonMessageConverter(objectMapper);
    }

    // Auto-wires the converter into RabbitTemplate (Boot auto-config picks it up by type)
}
```

**application.yaml additions:**
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
        acknowledge-mode: auto   # nack on exception → DLQ after retries
    publisher-confirm-type: correlated
    publisher-returns: true
```

### Pattern 2: Fire-and-Forget Publish from CallService Terminal Transitions

**What:** Publish a `CallHistoryEvent` record to RabbitMQ at every terminal transition. Never await a response; never let AMQP failure propagate into the broadcast path.

**Terminal transitions in CallService to hook (from inspected source):**

| Method | Condition | Publish? | Reason |
|--------|-----------|----------|--------|
| `onRingTimeout` | `stateMachine.transition(...)` returns `true` | YES | `missed` |
| `handleReject` | transition returns `true` | YES | `rejected` |
| `handleCancel` | transition returns `true` | YES | `cancelled` |
| `handleHangUp` | transition returns `true` (active→completed) | YES | `completed` |
| `onGraceExpired` | transition returns `true` (active→dropped) | YES | `dropped` |
| `handleInvite` (BUSY branch) | | NO | D-05: busy never logged |
| `handleAccept` | ringing→active | NO | Not a terminal transition |

**Start time is unavailable in CallService** — the `CallSnapshot` only stores `callerId`, `calleeId`, `state`, `reason`. For `duration`, the `call:{id}` Redis hash must be extended in Phase 4 carryover OR we store `startedAt` separately. **Recommended:** add `startedAt` field to the `call:{id}` hash when `transition(... "active" ...)` runs (in `handleAccept`), and read it back when publishing the terminal event. Store as epoch milliseconds string. This is a small CallStateRepository change.

```java
// Source: inspected CallService.java, CallStateRepository.java
@Service
public class CallHistoryPublisher {
    private final AmqpTemplate amqpTemplate;
    private static final Logger log = LoggerFactory.getLogger(CallHistoryPublisher.class);

    public CallHistoryPublisher(AmqpTemplate amqpTemplate) {
        this.amqpTemplate = amqpTemplate;
    }

    // Called AFTER broadcast(...) in each terminal transition — fire and forget
    public void publish(CallHistoryEvent event) {
        try {
            amqpTemplate.convertAndSend(
                RabbitMqConfig.CALL_HISTORY_EXCHANGE,
                RabbitMqConfig.ROUTING_KEY,
                event);
        } catch (Exception e) {
            // Do NOT rethrow — realtime path must never fail because of AMQP
            log.error("Failed to publish call history event for callId={}: {}", event.callId(), e.getMessage());
        }
    }
}
```

### Pattern 3: Idempotent Consumer with DB Unique Constraint

**What:** The consumer saves a `CallHistory` row. If the same event arrives twice (at-least-once delivery), the unique constraint on `(call_id, end_reason)` rejects the duplicate. The consumer catches `DataIntegrityViolationException` and acks normally (idempotent = duplicate delivery is OK, not an error).

**Why unique (call_id, end_reason) not just call_id:** A single call_id cannot have two terminal events (by the CAS state machine design), so `(call_id, end_reason)` is effectively the same as `call_id`. However, the compound key documents intent more clearly and matches the "keyed by callId + event type" language in HIST-03.

```java
// Source: Spring AMQP at-least-once + DB unique constraint pattern
// [CITED: docs.spring.io/spring-amqp/reference]
@Component
public class CallHistoryConsumer {
    private final CallHistoryRepository repo;
    private static final Logger log = LoggerFactory.getLogger(CallHistoryConsumer.class);

    @RabbitListener(queues = RabbitMqConfig.CALL_HISTORY_QUEUE)
    public void consume(CallHistoryEvent event) {
        try {
            CallHistory row = CallHistory.builder()
                .callId(event.callId())
                .callerId(event.callerId())
                .calleeId(event.calleeId())
                .endReason(event.endReason())
                .startedAt(event.startedAt())
                .endedAt(event.endedAt())
                .build();
            repo.save(row);
        } catch (DataIntegrityViolationException e) {
            // Duplicate delivery — idempotent: ack, don't DLQ
            log.info("Duplicate call history event for callId={}, reason={} — ignored",
                event.callId(), event.endReason());
        }
        // Unchecked exception here → nack → retry → DLQ after max-attempts
    }
}
```

### Pattern 4: call_history Schema (Flyway V3)

**Design choice: two rows per call vs one row.** The context locks per-side perspective (D-06). Two design options:

| Approach | Rows per call | Schema | Query complexity | Recommended |
|----------|---------------|--------|-----------------|-------------|
| **Two rows** | 2 (one per participant) | `viewer_id` column, `direction` enum | Simple `WHERE viewer_id = ?` | YES — simplest for HIST-02 |
| One row | 1 | `caller_id`+`callee_id`; FE or BE computes direction | Requires deriving direction in query | NO — adds logic in API/FE |

**Two-row approach:** When the consumer saves a call, it inserts TWO rows — one for the caller (direction=OUTGOING/CANCELLED/etc) and one for the callee (direction=INCOMING/MISSED/etc) — in the same transaction. The `call_id + viewer_id` pair is unique. The UNIQUE constraint for idempotency becomes `(call_id, viewer_id)`.

```sql
-- Source: Claude's recommendation based on D-06, D-05
-- V3__call_history.sql
CREATE TABLE call_history (
    id          BIGSERIAL       PRIMARY KEY,
    call_id     VARCHAR(36)     NOT NULL,            -- UUID from CallService
    viewer_id   VARCHAR(50)     NOT NULL,            -- username of the viewer (caller or callee)
    peer_id     VARCHAR(50)     NOT NULL,            -- the other party's username
    direction   VARCHAR(20)     NOT NULL,            -- OUTGOING | INCOMING | MISSED | CANCELLED | REJECTED | DROPPED
    end_reason  VARCHAR(20)     NOT NULL,            -- completed | missed | rejected | cancelled | dropped
    duration_ms BIGINT,                             -- null for non-completed calls; ms from active→ended
    started_at  TIMESTAMPTZ,                        -- when call became active (null for unanswered calls)
    ended_at    TIMESTAMPTZ     NOT NULL,            -- when call ended
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Idempotency constraint: each party gets exactly one row per call
CREATE UNIQUE INDEX uq_call_history_call_viewer ON call_history(call_id, viewer_id);

-- Query index: user's history, newest first
CREATE INDEX idx_call_history_viewer_ended ON call_history(viewer_id, ended_at DESC);

-- Admin system-wide query with optional username filter
CREATE INDEX idx_call_history_ended ON call_history(ended_at DESC);
CREATE INDEX idx_call_history_caller ON call_history(peer_id);  -- for filter by username (either party)
```

**Direction mapping per end_reason per perspective:**

| end_reason | Caller direction | Callee direction |
|------------|-----------------|-----------------|
| `completed` | OUTGOING | INCOMING |
| `missed` | OUTGOING | MISSED |
| `rejected` | OUTGOING | INCOMING |
| `cancelled` | OUTGOING | INCOMING |
| `dropped` | OUTGOING | INCOMING |

**UI label mapping (from UI-SPEC):**

| direction | UI label |
|-----------|----------|
| OUTGOING + completed | `Gọi đi` |
| INCOMING + completed | `Cuộc gọi đến` |
| MISSED | `Cuộc gọi nhỡ` |
| OUTGOING + missed | `Gọi đi không trả lời` |
| OUTGOING + rejected | `Bị từ chối` |
| OUTGOING + cancelled | `Đã hủy` |
| OUTGOING + dropped / INCOMING + dropped | `Mất kết nối` |

### Pattern 5: startedAt Tracking (Redis extension)

The `CallStateRepository` needs a way to record when a call became `active` so the consumer can compute `duration_ms` and `started_at`.

**Recommended:** Add a `HSET call:{id} startedAt {epochMillis}` inside `handleAccept` (after the transition succeeds), then read it back in `CallStateRepository.find()` to populate `CallSnapshot`. Alternatively, the consumer calculates duration as `endedAt - startedAt` if both are in the event.

**Simplest approach:** Add `startedAt` to `CallHistoryEvent` record. The publisher reads `call:{id}` `startedAt` field before publishing the terminal event. If missing (call never became active — missed/rejected/cancelled), `startedAt` is null.

### Pattern 6: Admin Force-Disconnect on Lock (D-11)

**What:** `AdminService.lockUser(targetUsername)` — persist `locked=true`, close WS session, prevent future login.

**Existing `UserDetailsServiceImpl` already sets `accountLocked(user.isLocked())`** — Spring Security reads this and returns 401 on next login attempt. No new code needed for the login-block path.

**Force-disconnect:** Use `SessionRegistry` (injected into `AdminService`) to get and close the WS session.

```java
// Source: inspected SessionRegistry.java + PresenceWebSocketHandler.java (superseded-session pattern)
public void lockUser(String adminUsername, String targetUsername) {
    if (adminUsername.equals(targetUsername)) {
        throw new IllegalArgumentException("Admin cannot lock own account"); // D-10
    }
    User target = userRepository.findByUsername(targetUsername)
        .orElseThrow(() -> new UserNotFoundException(targetUsername));
    target.setLocked(true);
    userRepository.save(target);

    // Force-disconnect if currently connected (D-11)
    sessionRegistry.get(targetUsername).ifPresent(session -> {
        try {
            session.close(new CloseStatus(4003, "account-locked"));
            // The afterConnectionClosed handler fires → callService.handleDisconnect
            // → grace timer → dropped for the surviving peer (Phase 4 flow, D-11)
        } catch (IOException e) {
            log.warn("Could not close session for locked user {}: {}", targetUsername, e.getMessage());
        }
    });
}
```

**Self-protection (D-10):** Check `adminUsername.equals(targetUsername)` in the service. SecurityConfig already prevents admin demotion via role endpoint if you also gate `PATCH /api/admin/users/{id}/role` to not allow target == authenticated user.

### Pattern 7: Dashboard Counts

| Metric | Source | Notes |
|--------|--------|-------|
| `online_users` | `LocalPresenceService.snapshot().size()` | In-memory, single-instance — accurate for Phase 5 (multi-instance in Phase 6) |
| `active_calls` | Count Redis keys matching `user-call:*` via `StringRedisTemplate.keys("user-call:*").size() / 2` | Each active call creates 2 user-call pointers. Divide by 2. In Phase 6, Redis becomes authoritative anyway. |
| `today_started` | Micrometer `Counter` `calls.started` | Incremented in `handleInvite` on `OK` result. Reset via `@Scheduled` at midnight. |
| `today_completed` | Micrometer `Counter` `calls.completed` | Incremented when `completed` is broadcast. |
| `today_missed` | Micrometer `Counter` `calls.missed` | Incremented when `missed` is broadcast. |

**Daily reset pattern:** [ASSUMED] Micrometer Counters are monotonically increasing and have no built-in daily-reset. For D-14 (calendar-day reset), maintain a `LongAdder` or `AtomicLong` inside a `CallMetrics` bean and schedule a reset:

```java
// [ASSUMED] — Micrometer does not support daily counter reset natively
@Component
public class CallMetrics {
    private final AtomicLong startedToday  = new AtomicLong(0);
    private final AtomicLong completedToday = new AtomicLong(0);
    private final AtomicLong missedToday    = new AtomicLong(0);

    public void incrementStarted()   { startedToday.incrementAndGet(); }
    public void incrementCompleted() { completedToday.incrementAndGet(); }
    public void incrementMissed()    { missedToday.incrementAndGet(); }

    public long getStarted()   { return startedToday.get(); }
    public long getCompleted() { return completedToday.get(); }
    public long getMissed()    { return missedToday.get(); }

    @Scheduled(cron = "0 0 0 * * *")  // midnight server-local time (D-14)
    public void resetDaily() {
        startedToday.set(0);
        completedToday.set(0);
        missedToday.set(0);
    }
}
```

Note: these counters reset on service restart — that's acceptable for an MVP demo dashboard.

### Pattern 8: TanStack Query useInfiniteQuery v5

**API signature (v5 — VERIFIED via official docs and CONTEXT):** [CITED: tanstack.com/query/latest/docs/framework/react/guides/infinite-queries]

```typescript
// Source: TanStack Query v5 official docs
const {
  data,           // { pages: T[][], pageParams: unknown[] }
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  status,
} = useInfiniteQuery({
  queryKey: ['call-history'],
  queryFn: async ({ pageParam }) => {
    const res = await api.get('/api/history', {
      params: { before: pageParam, size: 20 }
    })
    return res.data  // { items: HistoryRow[], nextCursor: string | null }
  },
  initialPageParam: null,          // null = "no cursor" = first page
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  // undefined from getNextPageParam → hasNextPage = false
})

// Flatten all pages into one array for rendering:
const rows = data?.pages.flatMap(page => page.items) ?? []
```

**Cursor pagination endpoint:** Use `ended_at` as the cursor (ISO timestamp). Query `WHERE ended_at < :before ORDER BY ended_at DESC LIMIT :size`. This is stable even as new calls are added.

**IntersectionObserver sentinel:**
```typescript
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

### Anti-Patterns to Avoid

- **Blocking broadcast on AMQP:** `callHistoryPublisher.publish(event)` must be called AFTER `broadcast(...)` and in a `try/catch` that swallows exceptions. Never let `AmqpException` reach the caller.
- **Using Jackson2JsonMessageConverter:** Deprecated in Spring AMQP 4.0, will be removed. Use `JacksonJsonMessageConverter` with the injected `tools.jackson` ObjectMapper.
- **Creating a new ObjectMapper inside RabbitMqConfig:** Bypasses Boot 4's auto-configured mapper. Always inject the existing bean.
- **Redis `KEYS` in production:** `StringRedisTemplate.keys("user-call:*")` blocks Redis. For Phase 5 (single instance, demo scale), it is acceptable. For Phase 6 scaling, switch to a Micrometer Gauge reading from a dedicated Redis counter.
- **Putting startedAt in CallStateChanged broadcast:** That message is for the realtime path and FE rendering — keep it lean. startedAt belongs in the AMQP event only.
- **One history row per call for per-side views:** Requires FE/API to compute direction from caller/callee; two-row approach is simpler and more queryable.
- **Micrometer Counter for daily-reset metrics:** Micrometer Counters are monotonically increasing with no built-in reset. Use `AtomicLong` + `@Scheduled`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON serialization to/from RabbitMQ | Custom serializer | `JacksonJsonMessageConverter` bean (Jackson 3 variant) | Handles content-type headers, type metadata, all edge cases |
| Retry + DLQ on consumer failure | Custom retry loop | Spring AMQP `listener.simple.retry.*` + `x-dead-letter-exchange` queue arg | Boot auto-config wires RetryTemplate; DLQ handled by RabbitMQ itself |
| Publisher confirm reliability | Manual correlation tracking | `publisher-confirm-type: correlated` + RabbitTemplate ConfirmCallback | Spring AMQP manages correlation IDs |
| Idempotency dedup table | Separate processed_messages table | DB `UNIQUE (call_id, viewer_id)` + catch `DataIntegrityViolationException` | Zero extra infra; constraint is authoritative and transactional |
| Infinite scroll implementation | Custom scroll event + debounce | `IntersectionObserver` sentinel + `useInfiniteQuery.fetchNextPage()` | Browser-native; performance-optimal; TanStack handles state |
| Admin table row state update | Page reload on action | Invalidate TanStack Query cache via `queryClient.invalidateQueries(['admin-users'])` | Re-fetches fresh data; avoids stale state without reload |

**Key insight:** Spring AMQP's retry + DLQ + publisher confirms solve the "at-least-once with durable failure path" requirement entirely through configuration. The only application code needed is the consumer (with idempotent save) and the publisher (fire-and-forget).

---

## Common Pitfalls

### Pitfall 1: Jackson2JsonMessageConverter vs JacksonJsonMessageConverter
**What goes wrong:** Using `Jackson2JsonMessageConverter` compiles and runs but produces a deprecation warning and uses the com.fasterxml namespace, conflicting with Boot 4's tools.jackson namespace.
**Why it happens:** Most tutorials and Stack Overflow answers predate Spring AMQP 4.0 / Boot 4 / Jackson 3 — they all use `Jackson2JsonMessageConverter`.
**How to avoid:** Always inject `JacksonJsonMessageConverter` from `org.springframework.amqp.support.converter`. Inject `tools.jackson.databind.ObjectMapper` (not `com.fasterxml`).
**Warning signs:** Import auto-complete suggests `com.fasterxml.jackson.databind.ObjectMapper` — reject it.

### Pitfall 2: AmqpException Propagating into Broadcast Path
**What goes wrong:** `callHistoryPublisher.publish(event)` throws `AmqpException` (e.g., RabbitMQ not yet started in dev/test), which propagates through `handleHangUp(...)`, causing the WS `CallStateChanged` broadcast to also fail. Users don't see their call end.
**Why it happens:** AMQP publish is synchronous by default even though it's "fire-and-forget" semantically.
**How to avoid:** Wrap `amqpTemplate.convertAndSend(...)` in `try/catch(Exception e)` — log and swallow. The DLQ handles at-broker level; in-process exceptions should never kill the call flow.

### Pitfall 3: Missing startedAt for Duration Calculation
**What goes wrong:** The `CallHistoryEvent` has null `startedAt` for completed calls because the Redis hash never stored it, so `duration_ms` is null for all calls.
**Why it happens:** Phase 4's `CallSnapshot` only stores `state`, `reason`, `callerId`, `calleeId`. `startedAt` was never needed before.
**How to avoid:** Add a `HSET call:{id} startedAt {epochMillis}` in `handleAccept` (when the transition to `active` succeeds), and include it in `CallSnapshot`. `CallStateRepository.find()` must read it.

### Pitfall 4: Redis `KEYS` Blocking Under Load
**What goes wrong:** `StringRedisTemplate.keys("user-call:*")` blocks the Redis event loop. Under load or in Phase 6, this causes slowdowns.
**Why it happens:** `KEYS` is O(N) and single-threaded in Redis.
**How to avoid:** For Phase 5 (demo scale, single instance), it is acceptable. Add a comment marking it for Phase 6 replacement with a Micrometer Gauge that tracks the count directly.

### Pitfall 5: Daily Counter Lost on Service Restart
**What goes wrong:** Dashboard shows 0 calls started today after a backend restart during the day.
**Why it happens:** `AtomicLong` counters are in-process memory; restart clears them.
**How to avoid:** For an MVP demo dashboard, this is acceptable (state the limitation in docs). If truly needed, back the counter with a single-row daily stats table queried at startup.

### Pitfall 6: Testcontainers RabbitMQ Not Wired via @ServiceConnection
**What goes wrong:** Integration tests try to connect to `localhost:5672` (not running) instead of the Testcontainers port.
**Why it happens:** `RabbitMQContainer` supports `@ServiceConnection` in Spring Boot 3.1+ — but you need the `testcontainers:rabbitmq` module (not just `boot-testcontainers`).
**How to avoid:** Add `org.testcontainers:rabbitmq` to pom.xml test scope. Then in `TestcontainersConfiguration.java`:
```java
@Bean
@ServiceConnection
RabbitMQContainer rabbitContainer() {
    return new RabbitMQContainer("rabbitmq:4.1-management");
}
```

### Pitfall 7: Admin Self-Protection Only on Frontend
**What goes wrong:** Admin can lock/demote themselves via API call (e.g., curl), losing admin access to the system.
**Why it happens:** FE hides the button but doesn't prevent direct API calls.
**How to avoid:** Enforce D-10 in `AdminService.lockUser(adminUsername, targetUsername)` — throw `IllegalArgumentException` (→ 400) if `adminUsername.equals(targetUsername)`. SecurityConfig role check (`hasRole("ADMIN")`) is the primary gate; self-protection is a secondary domain check.

### Pitfall 8: `useInfiniteQuery` v5 Requires `initialPageParam`
**What goes wrong:** TypeScript error or undefined pageParam on first fetch because `initialPageParam` was omitted (was optional in v4).
**Why it happens:** v5 made `initialPageParam` required.
**How to avoid:** Always provide `initialPageParam: null` (or 0 for offset-based).

---

## Code Examples

### RabbitMQ Config (complete, Boot 4 / Jackson 3)
```java
// Source: docs.spring.io/spring-amqp/reference/amqp/message-converters.html
// [VERIFIED: Spring AMQP 4.x uses JacksonJsonMessageConverter for Jackson 3]
@Configuration
public class RabbitMqConfig {
    public static final String CALL_HISTORY_EXCHANGE = "call.history";
    public static final String CALL_HISTORY_QUEUE    = "call-history-q";
    public static final String CALL_HISTORY_DLX      = "call-history-dlx";
    public static final String CALL_HISTORY_DLQ      = "call-history-dlq";
    public static final String ROUTING_KEY           = "call.ended";

    @Bean DirectExchange callHistoryExchange() { return new DirectExchange(CALL_HISTORY_EXCHANGE); }
    @Bean DirectExchange callHistoryDlx()      { return new DirectExchange(CALL_HISTORY_DLX); }

    @Bean
    Queue callHistoryQueue() {
        return QueueBuilder.durable(CALL_HISTORY_QUEUE)
            .withArgument("x-dead-letter-exchange", CALL_HISTORY_DLX)
            .build();
    }

    @Bean Queue callHistoryDlq() { return QueueBuilder.durable(CALL_HISTORY_DLQ).build(); }

    @Bean Binding callHistoryBinding(DirectExchange callHistoryExchange, Queue callHistoryQueue) {
        return BindingBuilder.bind(callHistoryQueue).to(callHistoryExchange).with(ROUTING_KEY);
    }
    @Bean Binding callHistoryDlqBinding(DirectExchange callHistoryDlx, Queue callHistoryDlq) {
        return BindingBuilder.bind(callHistoryDlq).to(callHistoryDlx).with(ROUTING_KEY);
    }

    // tools.jackson namespace — NOT com.fasterxml — Boot 4 injects this automatically
    @Bean
    JacksonJsonMessageConverter jsonMessageConverter(tools.jackson.databind.ObjectMapper objectMapper) {
        return new JacksonJsonMessageConverter(objectMapper);
    }
}
```

### CallHistoryEvent record
```java
// Source: Claude's design based on D-05/D-06/D-07
public record CallHistoryEvent(
    String callId,
    String callerId,
    String calleeId,
    String endReason,      // completed | missed | rejected | cancelled | dropped
    Instant startedAt,     // null if call never became active
    Instant endedAt
) {}
```

### Consumer (idempotent)
```java
@Component
public class CallHistoryConsumer {
    private final CallHistoryRepository repo;

    @RabbitListener(queues = RabbitMqConfig.CALL_HISTORY_QUEUE)
    public void consume(CallHistoryEvent event) {
        try {
            // Two rows: one per participant
            repo.saveAll(List.of(
                buildRow(event, event.callerId(), event.calleeId(), callerDirection(event.endReason())),
                buildRow(event, event.calleeId(), event.callerId(), calleeDirection(event.endReason()))
            ));
        } catch (DataIntegrityViolationException e) {
            log.info("Duplicate event callId={} — acked without reprocessing", event.callId());
        }
        // Other runtime exceptions → nack → retry → DLQ
    }
}
```

### User History Query (HIST-02, cursor paginated)
```java
// Source: JPA Specification + Spring Data Pageable
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

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Jackson2JsonMessageConverter` | `JacksonJsonMessageConverter` (Jackson 3) | Spring AMQP 4.0 (Nov 2025) | Must use new class; old one deprecated for removal |
| `useInfiniteQuery` required no `initialPageParam` | `initialPageParam` required | TanStack Query v5 | Breaking change from v4; always provide `initialPageParam` |
| `KEYS pattern` for Redis scans | `SCAN` cursor for production | Always was best practice | For Phase 5 demo, `keys(...)` is acceptable |

**Deprecated/outdated:**
- `Jackson2JsonMessageConverter`: deprecated Spring AMQP 4.0; do not use in Boot 4 projects.
- `webrtc-adapter` shim: unnecessary in 2026 (modern browsers are spec-compliant).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Daily stats via `AtomicLong` + `@Scheduled` cron reset — Micrometer Counters have no built-in daily reset | Dashboard Counts, Pattern 7 | Low: if Micrometer adds reset support, refactor is minor; AtomicLong works correctly |
| A2 | `StringRedisTemplate.keys("user-call:*")` gives correct active-call count (2 keys per call) | Dashboard Counts | Medium: assumes Phase 4 `user-call:{userId}` keys are still set and expired only on call end. Verify from Phase 4 code/Lua scripts |
| A3 | `RabbitMQContainer` supports `@ServiceConnection` with the `testcontainers:rabbitmq` module under Boot 4 | Pitfall 6, Validation Architecture | Low: Spring Boot TestContainers docs confirm @ServiceConnection for RabbitMQContainer since Boot 3.1 |
| A4 | Boot 4.0.7 BOM manages `testcontainers:rabbitmq` version via `spring-boot-testcontainers` | Standard Stack | Low: Spring Boot manages Testcontainers BOM; version alignment is Boot's responsibility |
| A5 | `startedAt` can be stored in Redis `call:{id}` hash in `handleAccept` without breaking Phase 4 behaviour | Pattern 5 | Low: `HSET` of new field is additive; `CallSnapshot` only needs to add `startedAt` field |

---

## Open Questions (RESOLVED)

1. **startedAt field in CallSnapshot/Redis hash**
   - What we know: `CallStateRepository.find()` currently reads `state`, `reason`, `callerId`, `calleeId`.
   - What's unclear: Phase 4's `create_call.lua` and `transition_call.lua` don't store `startedAt`.
   - Recommendation: Add `startedAt` storage in `handleAccept` (Java code, not Lua) via `redis.opsForHash().put("call:" + callId, "startedAt", String.valueOf(Instant.now().toEpochMilli()))`. Read it back in `CallStateRepository.find()`. Safe additive change.
   - RESOLVED: Implemented as additive HSET in handleAccept — no Lua script changes needed; safe. Plan 05-02 Task 2 implements this.

2. **Redis SCAN vs KEYS for active-call count**
   - What we know: `user-call:*` keys exist in Redis (Phase 4 confirmed via `CallStateRepository`).
   - What's unclear: KEYS blocks Redis on large datasets.
   - Recommendation: For Phase 5 single-instance demo scale, `keys("user-call:*").size() / 2` is acceptable. Add a TODO comment for Phase 6 to replace with a dedicated `calls:active:count` Redis counter.
   - RESOLVED: Using StringRedisTemplate.keys("user-call:*").size() / 2 for Phase 5 demo scale; TODO comment added in AdminService for Phase 6 replacement. Tracked as T-05-14 (accepted risk).

3. **Flyway migration version number**
   - What we know: V1 = core schema, V2 = seed admin. Next is V3.
   - What's unclear: Confirm no other migration was added in Phases 2-4.
   - Recommendation: Check `backend/src/main/resources/db/migration/` — no V3 file found in inspection. Use `V3__call_history.sql`.
   - RESOLVED: Inspected `backend/src/main/resources/db/migration/` — existing files are V1__create_tables.sql and V2__seed_admin.sql only. No V3 was added in Phases 2-4. Next free version is V3. All plans correctly reference V3__call_history.sql.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| RabbitMQ | HIST-01/03, async pipeline | Not in compose yet | 4.1-management (to be added) | None — required for Phase 5 |
| Redis | Active-call dashboard count | In compose | 7-alpine | — |
| PostgreSQL | call_history table | In compose | 17-alpine | — |
| Testcontainers rabbitmq module | Integration tests | Not in pom.xml yet | 1.21.x (via Boot BOM) | None — required for tests |

**Missing dependencies with no fallback:**
- RabbitMQ service: must be added to docker-compose.yml + pom.xml
- `testcontainers:rabbitmq` test dependency: must be added to pom.xml

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

> `nyquist_validation: true` — section required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | JUnit 5 (via spring-boot-starter-test) + Testcontainers |
| Config file | `TestcontainersConfiguration.java` (extended with RabbitMQContainer) |
| Quick run command | `./mvnw test -pl backend -Dtest=CallHistoryConsumerTest -DfailIfNoTests=false` |
| Full suite command | `./mvnw verify -pl backend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIST-01 | Publish event after terminal transition, broadcast is NOT blocked | Integration | `./mvnw test -Dtest=CallHistoryPublishTest` | ❌ Wave 0 |
| HIST-01 | `busy` outcome does NOT publish any event | Unit | `./mvnw test -Dtest=CallHistoryPublisherTest` | ❌ Wave 0 |
| HIST-02 | User retrieves own history in newest-first order with correct per-side direction | Integration | `./mvnw test -Dtest=CallHistoryApiTest` | ❌ Wave 0 |
| HIST-02 | Cursor pagination returns correct page with hasNextPage | Integration | `./mvnw test -Dtest=CallHistoryApiTest` | ❌ Wave 0 |
| HIST-03 | Duplicate delivery of same event results in single DB row (idempotent) | Integration | `./mvnw test -Dtest=CallHistoryConsumerTest` | ❌ Wave 0 |
| HIST-03 | Consumer failure after N retries routes to DLQ, not lost | Integration | `./mvnw test -Dtest=CallHistoryConsumerTest` | ❌ Wave 0 |
| ADMN-01 | Lock endpoint sets locked=true, future login returns 401/403 | Integration | `./mvnw test -Dtest=AdminLockTest` | ❌ Wave 0 |
| ADMN-01 | Lock endpoint on connected user closes WS session | Integration | `./mvnw test -Dtest=AdminLockWsTest` | ❌ Wave 0 |
| ADMN-01 | Admin cannot lock own account — 400 returned | Unit | `./mvnw test -Dtest=AdminServiceTest` | ❌ Wave 0 |
| ADMN-02 | System-wide history endpoint returns all calls (both parties shown) | Integration | `./mvnw test -Dtest=AdminHistoryApiTest` | ❌ Wave 0 |
| ADMN-03 | Dashboard endpoint returns correct counts from Redis + Micrometer | Integration | `./mvnw test -Dtest=AdminDashboardApiTest` | ❌ Wave 0 |

### Key Integration Test Patterns

**Async pipeline assertion (HIST-01/03 — the most important test in Phase 5):**
```java
// Source: Phase 4 pattern (WsTestSupport + Awaitility) adapted for async pipeline
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)  // includes RabbitMQContainer
class CallHistoryConsumerTest {

    @Autowired CallHistoryRepository repo;
    @Autowired CallHistoryPublisher publisher;

    @Test
    void publishedEvent_persistedWithinTimeout() {
        CallHistoryEvent event = new CallHistoryEvent(
            "call-123", "alice", "bob", "completed",
            Instant.now().minusSeconds(60), Instant.now());

        publisher.publish(event);

        // Awaitility: assert consumer persisted within 5 seconds
        await().atMost(Duration.ofSeconds(5))
            .untilAsserted(() ->
                assertThat(repo.findByCallId("call-123")).hasSize(2));  // 2 rows (one per party)
    }

    @Test
    void duplicateDelivery_producesOnlyOneRow() {
        var event = new CallHistoryEvent("call-dup", "alice", "bob", "missed", null, Instant.now());
        publisher.publish(event);
        publisher.publish(event);  // duplicate

        await().atMost(Duration.ofSeconds(5))
            .untilAsserted(() ->
                assertThat(repo.findByCallId("call-dup")).hasSize(2));  // still 2, not 4
    }
}
```

**TestcontainersConfiguration update (add RabbitMQ):**
```java
// Add to existing TestcontainersConfiguration.java
@Bean
@ServiceConnection
RabbitMQContainer rabbitMqContainer() {
    return new RabbitMQContainer("rabbitmq:4.1-management");
}
```

### Sampling Rate
- **Per task commit:** `./mvnw test -pl backend -Dtest=CallHistoryConsumerTest,AdminServiceTest -DfailIfNoTests=false`
- **Per wave merge:** `./mvnw verify -pl backend`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/.../history/CallHistoryConsumerTest.java` — covers HIST-01/03 async pipeline + idempotency
- [ ] `backend/.../history/CallHistoryPublisherTest.java` — covers HIST-01 fire-and-forget, busy NOT published
- [ ] `backend/.../history/CallHistoryApiTest.java` — covers HIST-02 user endpoint + pagination
- [ ] `backend/.../admin/AdminLockTest.java` — covers ADMN-01 lock/unlock REST + login block
- [ ] `backend/.../admin/AdminLockWsTest.java` — covers ADMN-01 WS force-close on lock
- [ ] `backend/.../admin/AdminServiceTest.java` — covers ADMN-01 self-protection (unit)
- [ ] `backend/.../admin/AdminHistoryApiTest.java` — covers ADMN-02 system-wide history
- [ ] `backend/.../admin/AdminDashboardApiTest.java` — covers ADMN-03 dashboard counts
- [ ] `TestcontainersConfiguration.java` (update) — add `RabbitMQContainer` bean with `@ServiceConnection`
- [ ] pom.xml — add `org.testcontainers:rabbitmq` test scope dependency

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | YES — locked users must be rejected at login | Spring Security `accountLocked()` in `UserDetailsServiceImpl` (already wired) |
| V3 Session Management | YES — locked user's WS session must be closed | `SessionRegistry.get(userId).close(CloseStatus(4003))` |
| V4 Access Control | YES — admin-only endpoints, self-protection | `SecurityConfig.hasRole("ADMIN")` + `AdminService` self-protection check (D-10) |
| V5 Input Validation | YES — username filter in admin history | Spring `@RequestParam` + `@NotBlank`, SQL injection prevented by JPA parameterized queries |
| V6 Cryptography | NO — no new crypto in this phase | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Admin locks own account (accidental DoS) | Denial of Service | Self-protection check in `AdminService` (D-10); enforced server-side |
| Regular user calls `/api/admin/**` | Elevation of Privilege | `SecurityConfig.authorizeHttpRequests(...).requestMatchers("/api/admin/**").hasRole("ADMIN")` — already in place |
| SQL injection in username filter | Tampering | JPA `@Query` with `@Param` — parameterized; never string-concatenate SQL |
| Replay of expired history query (no auth) | Information Disclosure | All `/api/**` protected by `JwtAuthFilter`; history endpoint verifies viewer == authenticated user |
| Force-close WS of another user (privilege escalation) | Elevation of Privilege | `lockUser` endpoint is `ADMIN`-only; `AdminService` validates; `SessionRegistry` is server-side only |

---

## Sources

### Primary (HIGH confidence)
- `docs.spring.io/spring-amqp/reference/amqp/message-converters.html` — confirmed `JacksonJsonMessageConverter` for Jackson 3, `Jackson2JsonMessageConverter` deprecated in Spring AMQP 4.0
- `docs.spring.io/spring-boot/reference/messaging/amqp.html` — Boot 4 AMQP auto-configuration, `RabbitProperties`, publisher confirms config keys
- Inspected codebase: `CallService.java`, `SessionRegistry.java`, `UserDetailsServiceImpl.java`, `TestcontainersConfiguration.java`, `pom.xml`, `docker-compose.yml`, `V1__create_tables.sql`, `application.yaml`
- `java.testcontainers.org/modules/rabbitmq/` — `RabbitMQContainer`, `@ServiceConnection` support

### Secondary (MEDIUM confidence)
- `central.sonatype.com/artifact/org.springframework.boot/spring-boot-starter-amqp` — version 4.1.0 latest; 4.0.7 (current project Boot version) in BOM
- `tanstack.com/query/latest/docs/framework/react/guides/infinite-queries` — v5 `useInfiniteQuery` API, `initialPageParam` required, `getNextPageParam`

### Tertiary (LOW confidence)
- Micrometer daily-counter reset pattern via `AtomicLong` + `@Scheduled` — no official Micrometer docs show this; inferred from Micrometer's monotonic Counter design and Spring Scheduling

---

## Metadata

**Confidence breakdown:**
- Standard stack (AMQP, JPA, Flyway): HIGH — Boot BOM manages versions; Jackson 3 class name verified
- Architecture (fire-and-forget, idempotency, per-side rows): HIGH — directly derived from inspected CallService code and D-05/D-06 constraints
- Pitfalls: HIGH — Jackson 3 class name and startedAt gap found via direct code inspection
- Dashboard counts: MEDIUM — AtomicLong pattern is assumed (A1); Redis KEYS assumption (A2) needs Phase 4 verification

**Research date:** 2026-06-28
**Valid until:** 2026-07-28 (stable Spring AMQP + Boot 4 stack)
