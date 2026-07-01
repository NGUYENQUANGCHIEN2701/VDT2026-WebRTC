# Phase 9: Monitoring, CI/CD & Full Delivery - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 15
**Analogs found:** 10 / 15 (5 are genuinely new infra-as-code with no prior analog in this repo)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `backend/src/main/java/com/vdt/webrtc/metrics/CallMetrics.java` (rewrite) | service (metrics) | event-driven | itself (existing `AtomicLong` version) | exact — same file, rewritten in place |
| `backend/src/main/java/com/vdt/webrtc/metrics/MetricsConfig.java` (new) | config | transform | `backend/src/main/java/com/vdt/webrtc/ws/WebSocketConfig.java` | role-match (Spring `@Configuration` + `@Bean` shape) |
| `backend/pom.xml` (modify — add `micrometer-registry-prometheus`) | config | — | itself | exact |
| `backend/src/main/resources/application.yaml` (modify — actuator exposure) | config | — | itself | exact |
| `prometheus/prometheus.yml` (new) | config | pub-sub (scrape) | none in-repo | no analog — new infra domain |
| `grafana/provisioning/datasources/datasource.yml` (new) | config | — | none in-repo | no analog |
| `grafana/provisioning/dashboards/dashboard.yml` (new) | config | — | none in-repo | no analog |
| `grafana/dashboards/vdt-webrtc-overview.json` (new) | config | — | none in-repo | no analog |
| `frontend/Dockerfile` (new, doubling as nginx image build) | config | file-I/O | `backend/Dockerfile` | exact (same multi-stage build→run shape, different runtimes) |
| `nginx/conf.d/vdt.conf` (modify — add `location /`) | config (routing) | request-response | itself | exact |
| `docker-compose.yml` (modify — add `prometheus`, `grafana`, fold frontend into `nginx`) | config | — | itself | exact |
| `.github/workflows/ci.yml` (new) | config (CI pipeline) | batch/event-driven | none in-repo | no analog — first workflow file |
| `frontend/e2e/playwright.config.ts` (new) | config (test) | — | none in-repo (Vitest has no config file either — defaults) | no analog |
| `frontend/e2e/one-to-one-call.spec.ts` (new) | test | event-driven (WS/WebRTC E2E) | `frontend/src/pages/CallPage.tsx` (drives assertions against it) + Phase 6 Redis integration test pattern (backend) for "two-context" test shape | role-match (test), pattern borrowed cross-tier |
| `frontend/src/pages/CallPage.tsx` (small modify — add `data-testid` to video elements) | component | request-response/streaming | itself | exact |

## Pattern Assignments

### `backend/src/main/java/com/vdt/webrtc/metrics/CallMetrics.java` (service, event-driven)

**Analog:** itself (current `AtomicLong` version) — full read above.

**Current pattern to REPLACE** (`backend/src/main/java/com/vdt/webrtc/metrics/CallMetrics.java` lines 1-48):
```java
@Slf4j
@Component
public class CallMetrics {
    private final AtomicLong startedToday = new AtomicLong();
    private final AtomicLong completedToday = new AtomicLong();
    private final AtomicLong missedToday = new AtomicLong();

    public void incrementStarted() { startedToday.incrementAndGet(); }
    public void incrementCompleted() { completedToday.incrementAndGet(); }
    public void incrementMissed() { missedToday.incrementAndGet(); }

    @Scheduled(cron = "0 0 0 * * *") // 00:00 mỗi ngày (giờ server) — D-14
    public void resetDaily() { ... }
}
```

**Call sites to preserve (do not change signatures unnecessarily)** — `backend/src/main/java/com/vdt/webrtc/call/CallService.java`:
- Line 56: `metrics.incrementStarted();` inside `handleInvite` `case OK ->` branch (has `callerId`/`calleeId` in scope — no `callType` param currently; per RESEARCH Pattern 2, extend method signatures to accept `callType` or infer 1-1 vs group from context, e.g. `metrics.incrementStarted("1-1")`).
- Line 78: `metrics.incrementMissed();` inside `onRingTimeout` (end-reason "missed").
- Line 139: `metrics.incrementCompleted();` inside `handleHangUp` (end-reason "completed").
- Other end-reasons already broadcast/published but NOT currently counted: `handleReject` (line ~105, reason "rejected"), `handleCancel` (line ~120, reason "cancelled") — D-04 requires these in the denominator too, so add `metrics.incrementEnded(...)` calls at these sites as well.
- `handleInvite`'s `case BUSY ->` branch (line 59) — currently no metrics call; needs one for "busy" per D-04.
- Group/mesh call end-reasons live in `backend/src/main/java/com/vdt/webrtc/room/RoomService.java` (not yet read in full this pass — grep for `"completed"|"missed"|"ended"` there when wiring `call_type="group"` counters; `RoomRepository`/`RoomSnapshot` hold room membership state usable as the active-calls gauge source for group calls).

**Target Micrometer pattern** — single tagged counter family (per RESEARCH Pattern 2 design note), incremented from the SAME call sites above:
```java
@Component
public class CallMetrics {
    private final MeterRegistry registry;

    public CallMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    public void incrementEnded(String callType, String endReason) {
        Counter.builder("vdt_calls_ended_total")
                .tag("call_type", callType)
                .tag("end_reason", endReason)
                .register(registry)
                .increment();
    }
}
```
Success-rate PromQL (D-04): `sum(vdt_calls_ended_total{end_reason="completed"}) / sum(vdt_calls_ended_total)`.

**Active-calls gauge** — build against a long-lived Spring bean per RESEARCH Pitfall 4 (NOT a local/transient object):
```java
Gauge.builder("vdt_calls_active", callStateRepository, CallStateRepository::countActive)
        .tag("call_type", "1-1").register(registry);
Gauge.builder("vdt_calls_active", roomRepository, RoomRepository::countActive)
        .tag("call_type", "group").register(registry);
```
(Requires adding a `countActive()`-style method to `CallStateRepository`/`RoomRepository` if none exists — check both classes at implementation time; not confirmed present in this pass.)

**WS-sessions-per-instance gauge** — `backend/src/main/java/com/vdt/webrtc/ws/SessionRegistry.java` (full file read, lines 1-38) already exposes `.all()` returning `Collection<WebSocketSession>`, making it a ready-made gauge source:
```java
Gauge.builder("vdt_ws_sessions_active", sessionRegistry, r -> r.all().size())
        .register(registry);
```
`SessionRegistry` is a `@Component` singleton bean (line 11-12) — safe against the weak-reference GC pitfall since Spring keeps it alive for the app's lifetime.

---

### `backend/src/main/java/com/vdt/webrtc/metrics/MetricsConfig.java` (config, new)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/WebSocketConfig.java` (role-match: `@Configuration` class registering framework beans).

**Imports/shape pattern to follow** (Spring `@Configuration` + `@Value` reading `application.yaml` property, matching the existing `app.instance-id` convention seen in `application.yaml` line 53 `app.instance-id: ${INSTANCE_ID:${HOSTNAME:unknown}}`):
```java
package com.vdt.webrtc.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.config.MeterFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.autoconfigure.metrics.MeterRegistryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MetricsConfig {

    @Value("${app.instance-id}")
    private String instanceId;

    @Bean
    MeterRegistryCustomizer<MeterRegistry> commonTags() {
        return registry -> registry.config().commonTags("instance", instanceId);
    }
}
```
Reuses `app.instance-id` directly (already flows through Spring context per CONTEXT.md "Reusable Assets" — do not re-derive from `HOSTNAME`).

---

### `backend/pom.xml` (config, modify)

**Analog:** itself — existing dependency block shape (lines 33-168), e.g. the `spring-boot-starter-actuator` entry (lines 34-37) is the direct sibling.

**Pattern — add without explicit `<version>`** (Boot 4 BOM manages it, matches how `spring-boot-starter-actuator` and other Boot starters are declared with no version tag):
```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

---

### `backend/src/main/resources/application.yaml` (config, modify)

**Analog:** itself — existing `management.endpoints.web.exposure.include: health` (lines 42-45).

**Change:**
```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,prometheus
```
Do NOT use `include: "*"` — see RESEARCH Security Domain, over-exposure risk.

---

### `frontend/Dockerfile` (new)

**Analog:** `backend/Dockerfile` (full file read, lines 1-26) — same multi-stage build→slim-run shape, non-root user pattern.

**Pattern to mirror** (`backend/Dockerfile` structure: build stage caches deps first, copy src, package; run stage is a slim image, non-root user, `EXPOSE` + `ENTRYPOINT`):
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/conf.d/vdt.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```
Note: per D-02 and RESEARCH Pattern 3, this Dockerfile becomes the `nginx` service's `build:` context in `docker-compose.yml` (replacing `image: nginx:1.27-alpine` + bind-mounted conf), NOT a second `frontend` container. `backend/Dockerfile`'s non-root-user convention (lines 19, 22: `addgroup`/`adduser`/`USER app`) is optional to mirror for nginx (the official `nginx:1.27-alpine` image already drops privileges via its own entrypoint conventions) but should be considered for parity if the project wants consistent non-root containers across services.

---

### `nginx/conf.d/vdt.conf` (modify)

**Analog:** itself (full file read, lines 1-42) — existing `location /ws` and `location /api` blocks are the direct pattern to extend, not replace.

**Existing pattern (lines 18-42, UNCHANGED):**
```nginx
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

**New block to ADD (must come after `/api`/`/ws` per RESEARCH Pitfall 2 — nginx longest-prefix-match already protects order-independence here since no regex/`^~` locations exist, but keep it last by convention for readability):**
```nginx
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
```
Comment style in this file uses Vietnamese explanatory comments above each block (lines 1-3, 5, 15, 21, 28-29) — match that convention for the new block, e.g. `# SPA fallback — route con của React Router load qua index.html`.

---

### `docker-compose.yml` (modify)

**Analog:** itself (full file read, lines 1-139) — `redis`/`rabbitmq` services (lines 113-134) are the closest sibling pattern for adding `prometheus`/`grafana` (new standalone services with healthchecks, no `build:`, just `image:` + `ports:` + `healthcheck:`).

**Existing healthcheck pattern to copy** (`redis` service, lines 113-124):
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

**`backend-1` healthcheck pattern** (lines 48-53) — reuse this shape for the folded `nginx`+frontend service and for a Prometheus/Grafana wget-based healthcheck:
```yaml
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/actuator/health"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 40s
```

**New `prometheus` service** (per RESEARCH Pattern 4/5, following the `redis`/`rabbitmq` no-build-context shape):
```yaml
  prometheus:
    image: prom/prometheus:v3.13.0
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    ports:
      - "9090:9090"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:9090/-/healthy"]
      interval: 10s
      timeout: 5s
      retries: 10
```

**New `grafana` service:**
```yaml
  grafana:
    image: grafana/grafana:13.0.3
    depends_on:
      prometheus:
        condition: service_started
    ports:
      - "3000:3000"
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ./grafana/dashboards:/var/lib/grafana/dashboards:ro
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:-admin}
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 10
```

**`nginx` service modification** — existing (lines 82-94) has `image: nginx:1.27-alpine` + bind-mounted conf; per D-02/Pattern 3, replace with a `build:` directive pointing at the new `frontend/Dockerfile`:
```yaml
  nginx:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    depends_on:
      backend-1:
        condition: service_healthy
      backend-2:
        condition: service_healthy
    ports:
      - "8080:80"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost/"]
      interval: 10s
      timeout: 5s
      retries: 10
```
Note: the `nginx/conf.d/vdt.conf` bind-mount (`volumes: - ./nginx/conf.d:/etc/nginx/conf.d:ro`, line 93-94) is replaced by `COPY nginx/conf.d/vdt.conf /etc/nginx/conf.d/default.conf` baked into the new `frontend/Dockerfile` build (per RESEARCH Pattern 3's Dockerfile pairing) — this means `frontend/Dockerfile`'s build context needs access to `../nginx/conf.d/vdt.conf`, so either set the `nginx` service's `build.context` to the repo root with `dockerfile: frontend/Dockerfile`, or copy/reference the conf path accordingly. Confirm exact context/dockerfile pairing at plan time so the Docker build can `COPY` a file living outside its context directory (`frontend/`) — a repo-root build context is the simplest fix.

---

### `.github/workflows/ci.yml` (new — no analog, first workflow file)

Use RESEARCH Pattern 6 verbatim as the starting skeleton (4 parallel jobs: `backend`, `frontend`, `docker-build`, `e2e`) — see RESEARCH.md lines 393-460 and 557-635 for the full job bodies including the E2E job's GitHub Actions `services:` (Postgres/Redis/RabbitMQ) approach. Key conventions to preserve from `backend/pom.xml`/`frontend/package.json`:
- Backend job command: `./mvnw -B verify` (matches `spring-boot-starter-test` + Testcontainers already in `pom.xml` lines 102-132).
- Frontend job commands: `npm ci && npm run lint && npx vitest run && npm run build` — these are the EXACT scripts already defined in `frontend/package.json` lines 6-13 (`lint`, `test:run`/`vitest run`, `build`).

---

### `frontend/e2e/playwright.config.ts` + `one-to-one-call.spec.ts` (new)

**No in-repo analog** (no `vitest.config.ts` exists either — Vitest currently runs on defaults per `frontend/package.json` `"test": "vitest"`). Use RESEARCH's verified code blocks directly (RESEARCH.md lines 523-689, "Playwright fake-media project config" and "Two-browser-context 1-1 call test outline").

**Cross-tier pattern borrowed:** the "two independent contexts driving the same real backend" test shape mirrors the Phase 6 Redis cross-instance integration test pattern (two Spring contexts + Testcontainers Redis) mentioned in CONTEXT.md "Established Patterns" — same idea of two independent client identities exercising real routing, just at the browser tier instead of the JVM tier.

**Existing selector to use/extend** — `frontend/src/pages/CallPage.tsx` line 254: `aria-label={`Camera của ${remoteUserId ?? ""}`}` already exists as a possible (fragile, locale-dependent) selector. RESEARCH recommends adding a `data-testid="remote-video"` / `data-testid="local-video"` alongside it (near lines 254 and 272) for a robust Playwright selector — this is a small, additive frontend change, not a new file.

---

## Shared Patterns

### Non-root, multi-stage Docker builds
**Source:** `backend/Dockerfile` (full file, lines 1-26)
**Apply to:** `frontend/Dockerfile` (new)
Both should follow: dependency-cache-first build stage → slim run stage → `EXPOSE` + minimal entrypoint. nginx's official image already runs as an unprivileged worker process internally, so exact `addgroup`/`adduser`/`USER` mirroring is optional but should be a conscious choice, not an oversight.

### Compose healthchecks
**Source:** `docker-compose.yml` — `postgres` (lines 17-21), `redis` (120-124), `rabbitmq` (130-134), `backend-1`/`backend-2` (48-53, 75-80)
**Apply to:** `prometheus`, `grafana`, and the folded `nginx`+frontend service — every new/modified service needs a `healthcheck:` block in the same `test`/`interval`/`timeout`/`retries` shape (add `start_period` only where slow startup is expected, as `backend-1`/`backend-2` already do).

### Vietnamese inline comments explaining non-obvious behavior
**Source:** `docker-compose.yml` (e.g. lines 1-2, 22-25, 96, 101, 106, 111), `nginx/conf.d/vdt.conf` (lines 1-3, 5, 15, 21, 28-29), `backend/src/main/java/com/vdt/webrtc/call/CallService.java` (e.g. lines 43, 55, 59, 61-65)
**Apply to:** All new/modified config and code files in this phase — match the existing convention of short Vietnamese comments explaining WHY (not what) for anything non-obvious (e.g. why Prometheus bypasses nginx, why the E2E job skips full compose).

### Micrometer tag propagation (`instance`, `call_type`, `end_reason`)
**Source:** RESEARCH Pattern 1 + Pattern 2; reuses `app.instance-id` already defined in `backend/src/main/resources/application.yaml` line 53.
**Apply to:** `MetricsConfig.java` (commonTags "instance"), `CallMetrics.java` (per-event tags "call_type"/"end_reason").

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `prometheus/prometheus.yml` | config | pub-sub (scrape) | No monitoring infra exists yet in this repo — first Prometheus config; use RESEARCH Pattern 4 verbatim |
| `grafana/provisioning/datasources/datasource.yml` | config | — | No Grafana infra exists yet; use RESEARCH Pattern 5 verbatim |
| `grafana/provisioning/dashboards/dashboard.yml` | config | — | Same as above |
| `grafana/dashboards/vdt-webrtc-overview.json` | config | — | Same as above — hand-author per D-06's panel list (WS sessions/instance, online users, active calls by call_type, call success rate) |
| `.github/workflows/ci.yml` | config (CI) | batch/event-driven | No `.github/` directory exists at all; use RESEARCH Pattern 6 + the E2E job body verbatim as starting point |
| `frontend/e2e/playwright.config.ts` | config (test) | — | No Playwright infra exists; Vitest itself has no config file to mirror (runs on defaults) |

## Metadata

**Analog search scope:** `backend/src/main/java/com/vdt/webrtc/{metrics,call,ws,room}`, `backend/pom.xml`, `backend/src/main/resources/application.yaml`, `backend/Dockerfile`, `docker-compose.yml`, `nginx/conf.d/vdt.conf`, `frontend/package.json`, `frontend/src/pages/CallPage.tsx`
**Files scanned:** ~14 read directly, several more grepped (`CallStateRepository`, `RoomService`, `RoomRepository` — role-referenced but not fully read this pass; flagged above for planner follow-up at implementation time)
**Pattern extraction date:** 2026-07-01
