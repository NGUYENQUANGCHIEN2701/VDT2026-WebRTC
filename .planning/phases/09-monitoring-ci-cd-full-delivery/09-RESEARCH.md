# Phase 9: Monitoring, CI/CD & Full Delivery - Research

**Researched:** 2026-07-01
**Domain:** Observability (Micrometer/Prometheus/Grafana), Docker Compose full-stack delivery, GitHub Actions CI, Playwright E2E with fake media
**Confidence:** MEDIUM (HIGH on version/config facts verified via registry/official docs this session; MEDIUM on Playwright-in-CI networking design, which is genuinely open per CONTEXT.md and has no single canonical pattern)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Frontend containerization & HTTPS (INFR-02)**
- **D-01:** HTTP-only in the docker-compose demo. nginx continues to serve plain HTTP on `:8080`. No cert (mkcert or self-signed) is mounted into the compose nginx. Real cross-device HTTPS/WSS verification stays on the existing `npm run dev` + mkcert flow (Phase 3 D-04).
- **D-02:** One shared nginx service, not two. Add a multi-stage frontend build (`node:22-alpine` build → copy `dist/` into the existing `nginx:1.27-alpine` image/service) so the same nginx that load-balances `backend-1`/`backend-2` also serves the static frontend build via a new `location /` block, alongside the existing `/api` and `/ws` locations in `nginx/conf.d/vdt.conf`. Port `8080` remains the single external entry point. `frontend/.env` already has `VITE_API_URL=http://localhost:8080` and `VITE_WS_URL=ws://localhost:8080/ws` — bake these defaults into the frontend Docker image.

**Metrics scope (INFR-04)**
- **D-03:** Active-calls / call-success-rate metrics count both 1-1 and group (mesh) calls. Tag with `call_type` (`1-1` | `group`). Do not build two disjoint metric families.
- **D-04:** Call success rate = completed / total calls initiated. Denominator includes every end-reason from the Phase 4 taxonomy (completed/rejected/cancelled/missed/busy/dropped).
- **D-05:** Prometheus scrapes `backend-1` and `backend-2` directly, bypassing the nginx LB. `prometheus.yml` declares two targets (`backend-1:8080`, `backend-2:8080`) hitting `/actuator/prometheus` over the internal compose network. `/actuator` is NOT exposed externally through nginx.
- **D-06:** One consolidated Grafana dashboard ("VDT WebRTC Overview"). Panels: WS sessions per instance, online users, active calls (with call_type breakdown), call success rate. Provisioning-as-code, single JSON file.

**CI/CD pipeline shape (INFR-05, INFR-06)**
- **D-07:** CI builds Docker images but does not push to a registry. No GHCR. `docker build` in CI is only a build-correctness check.
- **D-08:** CI triggers on push to `main` and on pull requests targeting `main`.
- **D-09:** Separate parallel jobs, not one sequential job. At minimum: backend (`mvn verify`), frontend (lint + `vitest run` + build), docker-build (build backend + frontend images). Playwright E2E job placement/design is Claude's discretion but should fit this parallel-jobs shape.

### Claude's Discretion
- Playwright E2E test design is fully open: whether the E2E test runs against a full `docker compose up` stack in CI or a lighter direct backend+frontend run, where `frontend/e2e/` (or similar) lives, and the exact assertions — but it MUST satisfy INFR-06: place a real 1-1 call between two Chromium browser contexts using `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` and assert the remote `<video>` renders frames.
- Exact Micrometer metric names, classes touched (`PresenceWebSocketHandler`, `CallStateRepository`, `CallService`), and how `call_type`/`instance` tags get wired into Micrometer `Tag`s.
- Exact Grafana panel layout, PromQL queries/thresholds, and Prometheus scrape interval.
- Healthcheck definitions for the new/changed services (nginx+frontend, Prometheus, Grafana) needed to satisfy success criterion #1.
- coturn Docker networking approach — already decided in Phase 3; Phase 9 only needs to make sure it keeps working, not redesign it.

### Deferred Ideas (OUT OF SCOPE)
- Playwright E2E test design (exact scenario wiring, CI networking approach) — intentionally left fully open for research/planning rather than decided in discuss-phase; not scope creep, just deferred discussion depth.
- Changing 1-1/group call semantics, signaling, or Redis routing (Phases 3-7) — not touched.
- HTTPS/WSS for the docker-compose demo itself.
- Publishing Docker images to a registry (GHCR).
- Redesigning nginx as two separate services.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFR-02 | Entire system starts with one `docker compose up` (backend x2, frontend, nginx, PostgreSQL, Redis, RabbitMQ, coturn, Prometheus, Grafana) with healthchecks | See "Docker Compose Additions" (frontend Dockerfile + nginx `location /`, Prometheus/Grafana services + healthchecks) |
| INFR-04 | Prometheus + Grafana dashboards show per-instance metrics (WS sessions, active calls, call success rate) | See "Micrometer + Prometheus Wiring", "Prometheus Scrape Config", "Grafana Provisioning-as-Code" |
| INFR-05 | GitHub Actions CI builds, tests (backend + frontend), and packages Docker images | See "GitHub Actions Workflow Structure" |
| INFR-06 | E2E test places a real call between two browser contexts (Playwright, fake media devices) in CI | See "Playwright E2E With Fake Media" |

</phase_requirements>

## Summary

Phase 9 is pure "wire together what already exists" work — no new business logic, no new call semantics. The backend already has `spring-boot-starter-actuator` on the classpath and an `app.instance-id` property ready to use as a Micrometer tag; it only needs the `micrometer-registry-prometheus` dependency (latest `1.15.0` on Maven Central, version managed transitively by the Spring Boot 4 BOM — do not pin explicitly) and one config line (`management.endpoints.web.exposure.include: health,prometheus`). A `CallMetrics` component already exists (`backend/src/main/java/com/vdt/webrtc/metrics/CallMetrics.java`) using hand-rolled `AtomicLong` counters reset on a cron schedule — this phase should replace/extend it with real Micrometer `Counter`/`Gauge`/`Timer` beans (tagged `instance` and `call_type`) so Prometheus can scrape them, rather than keeping an in-memory-only daily counter that Prometheus can't see.

For infrastructure, Prometheus and Grafana are both new compose services provisioned entirely as code: `prometheus.yml` with two static targets (`backend-1:8080`, `backend-2:8080`) scraping `/actuator/prometheus` directly (bypassing the nginx LB, per D-05), and Grafana with two provisioning directories (`datasources/` and `dashboards/`) mounted read-only so the "VDT WebRTC Overview" dashboard exists automatically with no manual clicking. The frontend gets a standard multi-stage `node:22-alpine` → `nginx:1.27-alpine` build, but per D-02 it is folded into the *existing* nginx service (not a second container) via a new `location /` block with SPA `try_files` fallback, added to `nginx/conf.d/vdt.conf` alongside the existing `/api` and `/ws` locations.

GitHub Actions is new from scratch (no `.github/` directory exists yet): three fast, independent jobs (backend `mvn verify` — Testcontainers works out of the box on `ubuntu-latest`, no Docker-in-Docker setup needed; frontend lint+vitest+build; docker-build for both images) triggered on push/PR to `main`. The single genuinely open design question is the Playwright E2E job: this research recommends running Playwright directly against `mvn spring-boot:run`-style backend + `vite preview`-style frontend processes started in the same GitHub Actions job (not a full `docker compose up`), because the docker-compose stack's dependencies (Postgres/Redis/RabbitMQ startup time, coturn's UDP relay range, and healthcheck chains) make the full-stack path slow and flaky for a job whose only requirement is a 1-1 signaling call between two fake-media Chromium contexts on localhost — TURN/coturn is not needed for two browser contexts on the same machine (they resolve to host/srflx candidates on a loopback-reachable network).

**Primary recommendation:** Wire Micrometer directly into the existing Actuator setup with `instance` and `call_type` tags on new `Counter`/`Gauge`/`Timer` beans (replacing the ad hoc `CallMetrics` `AtomicLong`s); provision Prometheus/Grafana entirely as code with two-target static scrape config; fold the frontend into the existing nginx service via `location /` + `try_files`; run three fast parallel CI jobs plus a fourth Playwright job that starts backend-jar + `vite preview` directly in the runner (no full compose stack) against Testcontainers-backed Postgres/Redis/RabbitMQ for the backend process.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Metrics instrumentation (Counter/Gauge/Timer) | API/Backend | — | Metrics originate where the domain events happen (`CallService`, `PresenceWebSocketHandler`); Micrometer registers them in the Spring `MeterRegistry` |
| Metrics exposition (`/actuator/prometheus`) | API/Backend | — | Actuator endpoint served per-instance; must NOT be proxied through the LB tier (D-05) |
| Metrics scraping (Prometheus) | Infra/Monitoring | — | Pull-based scraper is its own compose service, not part of app code |
| Dashboarding (Grafana) | Infra/Monitoring | — | Reads from Prometheus datasource; provisioned as code, no runtime app dependency |
| Static frontend serving | CDN/Static (via nginx) | — | `dist/` build output served directly by nginx `location /`; no Node runtime in prod |
| API/WS reverse proxy + LB | Frontend Server / Edge (nginx) | API/Backend | nginx terminates client connections and round-robins to backend instances; existing `/api`+`/ws` locations untouched |
| CI test execution (backend) | API/Backend (build-time) | — | `mvn verify` runs Testcontainers-backed integration tests; no runtime service coupling |
| CI test execution (frontend) | Browser/Client (build-time) | — | `vitest`/`eslint`/`vite build` are Node-tooling steps producing a static artifact |
| E2E call test (Playwright) | Browser/Client driving API+WS | API/Backend | Playwright drives two real Chromium contexts against a real backend process + real frontend build; this crosses tiers by design (that's what E2E means) |
| Docker image build verification | Build/CI | — | `docker build` only, no publish (D-07) — purely a Dockerfile-correctness gate |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@playwright/test` | npm | ~5.9 yrs (created 2020-09-24) [VERIFIED: npm registry] | 40.8M/wk [VERIFIED: npm registry] | github.com/microsoft/playwright [VERIFIED: npm registry] | Seam reported `SUS` ("too-new") — **false positive**: the flag fires on latest-patch publish date (2026-06-23), not package age. Manually confirmed via `npm view --time.created` this is a 5.9-year-old package with 40M weekly downloads and Microsoft's official repo. | Approved (verdict override documented below) |
| `io.micrometer:micrometer-registry-prometheus` | Maven Central | mature, part of core Micrometer project [VERIFIED: search.maven.org] | N/A (Maven Central doesn't report download counts) | github.com/micrometer-metrics/micrometer | Not checked by npm-only seam; verified directly via `search.maven.org` — latest `1.15.0`, actively maintained, version is BOM-managed by Spring Boot 4 (do not hand-pin) | Approved |
| `prom/prometheus` (Docker image) | Docker Hub | mature (project since 2012) [ASSUMED — not re-verified via registry API beyond tag listing] | N/A | github.com/prometheus/prometheus | Official image, current stable tag `v3.13.0` confirmed via Docker Hub tags API [VERIFIED: Docker Hub API] | Approved |
| `grafana/grafana` (Docker image) | Docker Hub | mature (project since 2014) [ASSUMED] | N/A | github.com/grafana/grafana | Official image, current stable tag `13.0.3` confirmed via Docker Hub tags API [VERIFIED: Docker Hub API] | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@playwright/test` was flagged `SUS` by the automated seam but manually verified as a false positive (see table). No `checkpoint:human-verify` is required for this package given the direct verification performed in this research session, but the planner MAY still add one if a stricter posture is desired — this is a judgment call, not a hard requirement, because the manual verification already exceeds the bar the checkpoint exists to enforce.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `io.micrometer:micrometer-registry-prometheus` | Managed by Spring Boot 4 BOM (latest standalone `1.15.0`) [VERIFIED: search.maven.org] | Exposes Micrometer meters in Prometheus text format at `/actuator/prometheus` | Official Spring Boot-blessed Prometheus integration; CLAUDE.md locks this choice |
| `prom/prometheus` | `v3.13.0` [VERIFIED: Docker Hub API, 2026-07-01] | Metrics scraping/storage | Official image; CLAUDE.md specifies "3.x" — v3.13.0 satisfies that |
| `grafana/grafana` | `13.0.3` [VERIFIED: Docker Hub API, 2026-07-01] | Dashboarding | Official image; CLAUDE.md specifies "11.x/12.x" as of its writing — 13.0.3 is the current stable major as of this research date; confirm no breaking provisioning-format changes at setup time (provisioning YAML format itself — `apiVersion: 1` — has been stable across 9.x-13.x) |
| `@playwright/test` | `1.61.1` (latest stable) [VERIFIED: npm registry, 2026-07-01] | E2E browser automation | CLAUDE.md locks Playwright "1.5x latest"; 1.61.1 is the current stable release |
| `node:22-alpine` | pinned major per CLAUDE.md | Frontend Docker build stage | Matches CLAUDE.md-locked Node 22 LTS toolchain |
| `nginx:1.27-alpine` | pinned per CLAUDE.md, already used for LB | Static file serving + LB (unchanged image, reused) | D-02 reuses the existing image/service — no new nginx version decision needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `docker/build-push-action` | N/A — **NOT used** | Registry push | Explicitly excluded per D-07; use plain `docker build` steps instead |
| `actions/setup-java` | `v4` (current major) [ASSUMED — not re-verified this session, matches CLAUDE.md] | Java 21 toolchain in CI | Backend CI job |
| `actions/setup-node` | `v4` (current major) [ASSUMED] | Node 22 toolchain in CI | Frontend CI job |
| `actions/cache` (built into `setup-java`/`setup-node` via `cache: maven` / `cache: npm`) | bundled | Dependency caching | Speeds up repeated CI runs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prometheus scraping backend-1/backend-2 directly | Scrape through nginx `/actuator` proxy | Rejected by D-05 — blends per-instance metrics behind round-robin, defeats the scaling demo |
| Two nginx containers (LB + static) | Single shared nginx (chosen, D-02) | Two containers is more "correct" separation of concerns but adds a service and a second port/proxy hop for no benefit at this project's scale |
| Playwright E2E against full `docker compose up` stack | Playwright against directly-started backend jar + `vite preview`/served build (recommended below) | Full compose is closer to "production" but drags in Postgres/Redis/RabbitMQ/coturn startup + healthcheck chains, making the CI job slow and a bigger flakiness surface for a test that only needs WS signaling + 2 fake-media peers |
| Testcontainers Cloud for backend CI | Plain Testcontainers against ubuntu-latest's built-in Docker daemon (recommended) | Testcontainers Cloud requires a paid token/secret setup; ubuntu-latest already ships a working Docker daemon, confirmed by official Docker blog guidance — no extra setup needed for a project this size |

**Installation:**
```bash
# Backend: add to pom.xml <dependencies> (no explicit <version> needed — Boot BOM manages it)
# <dependency>
#   <groupId>io.micrometer</groupId>
#   <artifactId>micrometer-registry-prometheus</artifactId>
# </dependency>

# Frontend: add Playwright as a devDependency
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium
```

**Version verification performed this session:**
- `micrometer-registry-prometheus` latest `1.15.0` — confirmed via `search.maven.org` Solr API.
- `@playwright/test` latest `1.61.1` — confirmed via `npm view @playwright/test version`; package created 2020-09-24, confirmed via `npm view @playwright/test time.created`.
- `prom/prometheus` latest stable tag `v3.13.0` — confirmed via Docker Hub v2 tags API.
- `grafana/grafana` latest stable tag `13.0.3` — confirmed via Docker Hub v2 tags API.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │              docker compose               │
                         │                                           │
  Browser (2 fake-media  │   ┌────────┐     ┌──────────────────┐     │
  Chromium contexts,     │   │  nginx │────▶│  static dist/     │    │
  Playwright-driven)     │   │  :8080 │     │  (location /)     │    │
        │                │   │        │     └──────────────────┘     │
        │ HTTP/WS         │   │        │────▶ /api ──┐                │
        └───────────────▶│   │        │             │                │
                         │   │        │────▶ /ws ───┼──▶ upstream    │
                         │   └────────┘             │    backend     │
                         │                            │   (round-      │
                         │                            │    robin)      │
                         │                            ▼                │
                         │              ┌─────────────────────────┐    │
                         │              │  backend-1   backend-2  │    │
                         │              │  :8080       :8080      │    │
                         │              │  /actuator/prometheus   │    │
                         │              └──────────┬──────────────┘    │
                         │                          │ scrape (direct,   │
                         │                          │ bypass nginx,     │
                         │                          │ per D-05)         │
                         │                          ▼                  │
                         │                 ┌───────────────┐           │
                         │                 │  Prometheus    │           │
                         │                 └───────┬────────┘           │
                         │                          │ datasource        │
                         │                          ▼                  │
                         │                 ┌───────────────┐           │
                         │                 │  Grafana       │           │
                         │                 │  "VDT WebRTC   │           │
                         │                 │   Overview"    │           │
                         │                 │  (provisioned  │           │
                         │                 │   as code)     │           │
                         │                 └───────────────┘           │
                         │                                             │
                         │  backend-1/2 ──▶ Postgres, Redis, RabbitMQ  │
                         │                   (unchanged from Phase 6)  │
                         └─────────────────────────────────────────────┘

  GitHub Actions (separate from the diagram above — CI environment):
  push/PR to main
       │
       ├─▶ [backend job]      mvn verify (Testcontainers: Postgres/Redis/RabbitMQ, real Docker daemon on ubuntu-latest)
       ├─▶ [frontend job]     npm ci && lint && vitest run && build
       ├─▶ [docker-build job] docker build ./backend, docker build ./frontend (no push)
       └─▶ [e2e job]          start backend jar (Testcontainers-backed) + `vite preview` in-runner
                              → Playwright: 2 Chromium contexts, fake media, real 1-1 call
                              → assert remote <video> receives frames
```

### Recommended Project Structure
```
backend/
├── src/main/java/com/vdt/webrtc/metrics/
│   ├── CallMetrics.java          # REPLACE AtomicLong counters with Micrometer Counter/Gauge/Timer beans
│   └── MetricsConfig.java        # NEW: MeterRegistryCustomizer adding "instance" common tag from app.instance-id
prometheus/
└── prometheus.yml                # NEW: scrape_configs targeting backend-1:8080, backend-2:8080
grafana/
├── provisioning/
│   ├── datasources/datasource.yml   # NEW: Prometheus datasource pointing at http://prometheus:9090
│   └── dashboards/dashboard.yml     # NEW: file-provider pointing at /var/lib/grafana/dashboards
└── dashboards/
    └── vdt-webrtc-overview.json     # NEW: the single consolidated dashboard, hand-authored or exported JSON
frontend/
├── Dockerfile                    # NEW: node:22-alpine build → static dist/ output stage
└── e2e/
    ├── playwright.config.ts      # NEW
    └── one-to-one-call.spec.ts   # NEW: 2-context fake-media call test
nginx/conf.d/
└── vdt.conf                      # MODIFIED: add `location /` for SPA static + try_files fallback
.github/workflows/
└── ci.yml                        # NEW: 4 parallel jobs (backend, frontend, docker-build, e2e)
docker-compose.yml                 # MODIFIED: add frontend build context into nginx, prometheus, grafana services
```

### Pattern 1: Micrometer `MeterRegistryCustomizer` for common tags
**What:** Register a `MeterRegistryCustomizer<MeterRegistry>` bean that applies `commonTags("instance", instanceId)` so every meter (including auto-configured ones like `http_server_requests`) is tagged per-instance without repeating the tag at every call site.
**When to use:** Always, for cross-cutting tags shared by all metrics from a given instance (as opposed to per-metric tags like `call_type`, which vary per event and belong on the specific `Counter`/`Gauge`).
**Example:**
```java
// Source: Spring Boot / Micrometer common-tags pattern (WebSearch-verified against
// multiple independent sources: Baeldung "Tagging Patterns for Micrometer Metrics",
// Spring Boot reference docs on MeterRegistryCustomizer)
@Configuration
public class MetricsConfig {

    @Value("${app.instance-id:${HOSTNAME:unknown}}")
    private String instanceId;

    @Bean
    MeterRegistryCustomizer<MeterRegistry> commonTags() {
        return registry -> registry.config().commonTags("instance", instanceId);
    }
}
```

### Pattern 2: Tagged `Counter`/`Gauge` for call metrics with `call_type`
**What:** Replace the hand-rolled `AtomicLong` counters in `CallMetrics.java` with Micrometer `Counter.builder(...).tag("call_type", type).register(registry)`, incremented at the same call sites `CallService` already calls `metrics.incrementStarted()` / `incrementCompleted()` / `incrementMissed()`. For active-calls, use a `Gauge` backed by a size-returning supplier (e.g., a count from `CallStateRepository`/`RoomRepository`), not a manually-incremented counter — gauges must reflect current state, not accumulate.
**When to use:** Any metric that Prometheus needs to scrape and Grafana needs to graph — the existing `AtomicLong` fields are invisible to Prometheus because they're never registered with a `MeterRegistry`.
**Example:**
```java
// Source: Micrometer official pattern (Counter.builder / Gauge.builder with tags) —
// cross-checked against Baeldung "Quick Guide to Micrometer" and "Tagging Patterns"
@Component
public class CallMetrics {
    private final Counter callsStarted1v1;
    private final Counter callsStartedGroup;
    private final Counter callsCompleted1v1;
    private final Counter callsCompletedGroup;
    // ... one pair per call_type to avoid runtime tag-value typos; or a helper that
    // takes callType as a parameter and looks up/creates the right Counter.

    public CallMetrics(MeterRegistry registry) {
        this.callsStarted1v1 = Counter.builder("vdt_calls_started_total")
                .tag("call_type", "1-1").register(registry);
        this.callsStartedGroup = Counter.builder("vdt_calls_started_total")
                .tag("call_type", "group").register(registry);
        // completed/missed/rejected/cancelled/dropped/busy follow the same shape,
        // OR: a single "vdt_calls_ended_total" counter tagged by both call_type AND
        // end_reason lets one PromQL query compute success rate as
        // sum(vdt_calls_ended_total{end_reason="completed"}) / sum(vdt_calls_ended_total)
    }
}
```
**Design note:** D-04's success-rate formula (completed / total initiated, all 6 end-reasons in the denominator) is most naturally expressed as ONE counter family `vdt_calls_ended_total{call_type, end_reason}` incremented once per terminal transition (the state machine already has exactly one call site per end-reason: `onRingTimeout`→missed, `handleReject`→rejected, `handleCancel`→cancelled, `handleHangUp`→completed, `onGraceExpired`→dropped, plus BUSY in `handleInvite`) rather than separate started/completed/missed counters — this collapses D-04's formula into a single PromQL expression instead of requiring a join across differently-named metrics.

### Pattern 3: nginx SPA static + existing proxy locations coexisting
**What:** Add a `location /` block using `try_files $uri $uri/ /index.html;` to serve the React build, placed so it does not shadow the existing `/api` and `/ws` prefix locations (nginx matches the most specific prefix location first, so `/api` and `/ws` continue to take precedence over `/`).
**When to use:** Standard pattern for SPA-with-client-side-routing behind the same nginx that also reverse-proxies API/WS traffic.
**Example:**
```nginx
# Source: cross-checked against multiple SPA+nginx guides (Honlsoft "Using nginx to
# Host a Single Page Application"; standard try_files SPA fallback pattern) —
# added to the EXISTING nginx/conf.d/vdt.conf, /ws and /api locations UNCHANGED.
server {
    listen 80;

    root /usr/share/nginx/html;   # frontend dist/ copied here in the image build
    index index.html;

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

    # NEW: static SPA fallback — must come after /api and /ws so it doesn't shadow them.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
**Dockerfile pairing:**
```dockerfile
# Source: standard multi-stage Node build → nginx serve pattern, matches CLAUDE.md
# "Frontend: node:22-alpine build → nginx:1.27-alpine serve"
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
Note: since D-02 folds the frontend into the *same* nginx service that already load-balances, the compose file should build this frontend Dockerfile and mount/copy its output into the existing `nginx` service — the cleanest way is a multi-stage build where the final `nginx` stage IS the compose `nginx` service's image (i.e., `nginx` service's `build.context` becomes the frontend directory, with `nginx/conf.d/vdt.conf` copied in), rather than a `volumes` bind-mount of build output (bind-mounting a `node:22-alpine`-produced `dist/` into an image built from a different context adds a build-order dependency that Compose does not model well). **Recommend:** give the `nginx` service its own multi-stage `Dockerfile` (e.g. `frontend/Dockerfile` used as the build context for the `nginx` service, or a new root-level `Dockerfile.nginx` that COPYs both the frontend build output and `nginx/conf.d/`), replacing the current `image: nginx:1.27-alpine` + bind-mounted conf with a `build:` directive.

### Pattern 4: Prometheus scrape config for two named compose services
**What:** `prometheus.yml` with one job, two static targets, scraping the internal Docker network directly.
**Example:**
```yaml
# Source: Prometheus official docs pattern (static_configs / scrape_configs) —
# cross-checked against prometheus/prometheus repo's example prometheus-docker.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'vdt-backend'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['backend-1:8080', 'backend-2:8080']
        labels:
          group: 'vdt-webrtc'
```
Note: `backend-1`/`backend-2` already resolve on the compose network (used today by nginx's `upstream backend` block) — Prometheus needs no new networking, just to be attached to the same default compose network (all services in a compose file share one network by default unless configured otherwise).

### Pattern 5: Grafana provisioning-as-code (two-directory layout)
**What:** Mount `./grafana/provisioning` read-only into `/etc/grafana/provisioning` and a dashboards directory into whatever path the dashboard *provider* config points at (commonly `/var/lib/grafana/dashboards`).
**Example — `grafana/provisioning/datasources/datasource.yml`:**
```yaml
# Source: Grafana official docs (grafana.com/docs/grafana/latest/administration/provisioning/)
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```
**`grafana/provisioning/dashboards/dashboard.yml`:**
```yaml
# Source: Grafana official docs
apiVersion: 1
providers:
  - name: 'vdt-webrtc'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: false
    options:
      path: /var/lib/grafana/dashboards
```
**Compose service:**
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
```
The dashboard JSON itself (`vdt-webrtc-overview.json`) lives at `./grafana/dashboards/vdt-webrtc-overview.json` on the host, mounted into the `options.path` above — Grafana auto-loads/updates it on startup and polls per `updateIntervalSeconds`, satisfying "no manual clicking."

### Pattern 6: GitHub Actions parallel jobs, no shared `needs`
**What:** Four independent top-level jobs under one workflow, all triggered on the same `on:` block, none blocking the others (per D-09, "separate parallel jobs").
**Example:**
```yaml
# Source: GitHub Actions official docs pattern (independent jobs run in parallel
# by default unless `needs:` is set) + Docker's own Testcontainers-on-GH-Actions
# guidance (docker.com/blog/running-testcontainers-tests-using-github-actions/):
# "GitHub Actions provides a Docker environment by default" — no DinD setup needed.
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
          cache: maven
      - name: mvn verify
        working-directory: backend
        run: ./mvnw -B verify

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - working-directory: frontend
        run: npm ci
      - working-directory: frontend
        run: npm run lint
      - working-directory: frontend
        run: npx vitest run
      - working-directory: frontend
        run: npm run build

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build backend image
        run: docker build -t vdt-backend:ci ./backend
      - name: Build frontend/nginx image
        run: docker build -t vdt-frontend:ci -f frontend/Dockerfile ./frontend
        # No login, no push, no registry — build-correctness check only (D-07).

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '21', cache: maven }
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: npm, cache-dependency-path: frontend/package-lock.json }
      # ... see "Playwright E2E With Fake Media" section for full job body
```

### Anti-Patterns to Avoid
- **Scraping Prometheus through the nginx LB:** Defeats the entire per-instance-metrics point of this phase (D-05 explicitly forbids it) — round-robin would alternate which instance's counters a given scrape sees.
- **Manually creating the Grafana dashboard via UI then exporting once:** Technically produces the same JSON but breaks "provisioned as code, exists on `docker compose up` with no manual clicking" if the export step isn't re-run after every panel edit — author the JSON (or its PromQL) directly, or treat the UI as a scratch pad and always re-export into the committed file.
- **Using `AtomicLong` counters (like the existing `CallMetrics`) as the source of Prometheus data:** They are invisible to Actuator/Prometheus unless registered with a `MeterRegistry` — this phase should replace them, not layer Micrometer on top of them redundantly.
- **Running the full `docker compose up` stack as the Playwright CI target:** Adds Postgres/Redis/RabbitMQ/coturn readiness as a dependency of a test that only needs backend+frontend+WS — see "Playwright E2E" tradeoff discussion below for the recommended lighter alternative.
- **Pinning `micrometer-registry-prometheus` to an explicit version in `pom.xml`:** Spring Boot 4's BOM already manages this; hand-pinning risks a version mismatch with the rest of the Micrometer/Actuator stack.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-instance metric tagging | Manual string concatenation into metric names (e.g. `calls_started_backend_1`) | Micrometer `Tag`/`commonTags()` on a shared metric name | Prometheus/Grafana `sum by (instance)` queries require ONE metric name with an `instance` label, not N differently-named metrics |
| Daily counter reset | Cron-scheduled `AtomicLong.set(0)` (existing `CallMetrics.resetDaily()`) | Prometheus `rate()`/`increase()` over a time window in PromQL | Prometheus counters are meant to be monotonic and never reset by the app; "today's calls" is a query-time concern (`increase(vdt_calls_started_total[24h])`), not an app-level reset — the existing daily-reset logic actively fights how Prometheus counters work and should be retired once Micrometer counters are wired in |
| SPA client-side routing fallback in nginx | Custom Lua/regex per-route rewrite rules | `try_files $uri $uri/ /index.html;` | Standard, well-tested one-liner; React Router already handles the client-side route resolution once `index.html` loads |
| Fake camera/mic for E2E | Custom `MediaStream`/`getUserMedia` monkey-patching in test setup | Chromium's built-in `--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream` launch flags | Battle-tested Chromium feature purpose-built for this; monkey-patching risks diverging from real getUserMedia behavior the app actually exercises |
| Grafana dashboard deployment | Manual screenshot/export-then-commit workflow with no verification | File-provider provisioning (`type: file`, `options.path`) + committed JSON | Guarantees the dashboard exists identically on every `docker compose up`, which is the literal success criterion |

**Key insight:** Nearly everything in this phase already has an official, narrow tool for the exact job (Micrometer for tagging, Prometheus's `rate()`for time-windowed counts, nginx `try_files` for SPA fallback, Chromium's own fake-media flags) — the main risk isn't missing libraries, it's carrying forward the project's own pre-existing ad hoc pattern (`CallMetrics`'s manual `AtomicLong` + cron reset) into the new Micrometer-based approach instead of replacing it cleanly.

## Common Pitfalls

### Pitfall 1: Prometheus scrape config accidentally routed through nginx
**What goes wrong:** `prometheus.yml` targets `nginx:8080` (or the external `localhost:8080`) instead of `backend-1:8080`/`backend-2:8080` directly, silently producing metrics that are indistinguishable per-instance because the LB round-robins which instance answers a given scrape.
**Why it happens:** It's the "obvious" endpoint to reach for since it's already exposed externally; the internal-only `backend-1`/`backend-2` hostnames require knowing they're valid inside the compose network even though nginx is the only *externally* mapped port.
**How to avoid:** Explicitly target `backend-1:8080` and `backend-2:8080` as two static targets in one job (per D-05, already locked); do not expose `/actuator` through nginx at all (also already locked).
**Warning signs:** Grafana panels that show identical or oddly-alternating values between the two "per-instance" series, or a single blended series instead of two.

### Pitfall 2: `location /` shadowing `/api` or `/ws` in nginx
**What goes wrong:** If the new `location /` block is added *before* `/api`/`/ws` in the config, or if nginx's location-matching precedence isn't respected, static-file serving can intercept API/WS requests, breaking signaling.
**Why it happens:** nginx `location` blocks are matched by longest-prefix-match for prefix locations (no `~`/`^~` modifiers used here), so `/api` and `/ws` (more specific prefixes) correctly take precedence over `/` regardless of file order — but this is easy to get wrong if someone later adds a `location ~ \.` regex or a `location = /` exact-match that changes precedence rules.
**How to avoid:** Keep `/api` and `/ws` as plain prefix locations (as they already are) and add `/` as a third plain prefix location — verify with `curl http://localhost:8080/api/auth/login` and `curl http://localhost:8080/some/spa/route` both behave correctly after the change.
**Warning signs:** API calls returning `index.html` content instead of JSON, or 404s on client-side routes that should fall back to `index.html`.

### Pitfall 3: Full `docker compose up` timing out or flaking in the Playwright CI job
**What goes wrong:** If Playwright E2E is pointed at a full `docker compose up` stack, the job must wait for Postgres → Redis/RabbitMQ → backend-1/backend-2 (`start_period: 40s` healthcheck) → nginx healthy chain before the first test can even open a page, and coturn's `network_mode: host`/port-mapping quirks (documented in the compose file's own Windows/Linux comment split) add another source of CI-environment-specific flakiness that has nothing to do with what the E2E test is actually verifying (a 1-1 signaling call).
**Why it happens:** "Just run the whole app the way it runs in production" feels like the most realistic test, but production realism isn't free — every extra service is another dependency the CI job's reliability now includes.
**How to avoid:** Recommended path (see "Playwright E2E With Fake Media" below): run the backend as a plain `mvn spring-boot:run` (or the built jar) against Testcontainers-backed Postgres/Redis/RabbitMQ started by the SAME JVM process (reusing the existing `TestcontainersConfiguration.java` pattern), and serve the frontend via `vite preview` (or a static file server) pointed at that backend's port — no nginx, no coturn, no Docker Compose in the loop at all for this job. TURN/coturn is not required because two Chromium contexts on the same GitHub Actions runner reach each other via host or server-reflexive ICE candidates without needing relay.
**Warning signs:** E2E job taking multiples longer than the backend/frontend unit-test jobs; intermittent failures tied to service startup ordering rather than call logic.

### Pitfall 4: Micrometer `Gauge` registered with a value that gets garbage-collected
**What goes wrong:** Micrometer `Gauge`s hold a *weak* reference to the object supplying the value (by design, to avoid Gauges keeping objects alive). If the gauge is built around a lambda closing over a local/short-lived object rather than a long-lived Spring-managed bean/field, the gauge can silently start reporting `NaN`/stale values once that object is GC'd.
**Why it happens:** Non-obvious Micrometer behavior; easy to miss when using WS-sessions-per-instance or active-calls counts if the supplier closes over something that isn't the actual long-lived registry/repository bean.
**How to avoid:** Build gauges with `Gauge.builder("vdt_ws_sessions_active", sessionRegistry, SessionRegistry::count)` style (registering against the actual long-lived Spring bean instance, e.g. `SessionRegistry` or `CallStateRepository`, and a method reference/lambda that reads live state from it) rather than closing over a transient local variable.
**Warning signs:** Gauge metrics that report a fixed/stale value indefinitely, or `NaN`, after some time in production/long-running compose demos.

### Pitfall 5: Windows dev machine vs Linux CI runner path/networking differences
**What goes wrong:** The docker-compose file already documents a Windows/Mac vs Linux split for coturn (`ports:` mapping vs `network_mode: host`, with the Linux line commented out) — this is a known, already-handled case, but two NEW risks appear in Phase 9 specifically: (1) GitHub Actions runners are Linux (`ubuntu-latest`), so if the Playwright/docker-build jobs assume the Windows-style explicit coturn port mapping works identically to the demo machine, they should be fine since Linux CI is not the machine where the developer's local Windows Docker Desktop quirks apply — but if the planner decides to run the *full* compose stack in CI (not recommended, see Pitfall 3), the `network_mode: host` alternative for coturn would need to be the active one on the Linux runner, requiring a CI-specific compose override; (2) shell-script line-ending/path-separator issues are a real risk only if any new CI or E2E setup script is authored with Windows path separators (`\`) or CRLF line endings, since the developer's local editor is on Windows (per user memory: "Editor Java indent... user's editor reformats") — any new `.sh`/`.yml` files for CI must be saved with LF line endings and forward slashes, or `bash`/`docker build` steps on the `ubuntu-latest` runner will fail to parse them.
**Why it happens:** Cross-platform development where the demo machine (Windows, per env info) differs from the CI runner (Linux).
**How to avoid:** If the full-compose path is ever chosen despite the recommendation above, add a CI-specific override (`docker-compose.ci.yml`) that swaps coturn's networking to the Linux-appropriate block; for all new shell scripts / YAML in this phase, verify LF line endings (most editors/git `autocrlf` settings handle this automatically for `.sh`/`.yml`, but it's worth an explicit check given this is a Windows dev environment authoring Linux-run CI files).
**Warning signs:** `docker build` steps failing with "no such file or directory" on `ubuntu-latest` due to CRLF-corrupted shebang lines, or coturn failing to bind in a hypothetical CI-compose-stack scenario.

## Code Examples

Verified patterns from official/authoritative sources (see individual `Pattern` sections above for full code + sourcing):
- Micrometer `MeterRegistryCustomizer` common-tags pattern — see Pattern 1.
- Micrometer tagged `Counter`/`Gauge` pattern — see Pattern 2.
- nginx SPA `location /` + `try_files` — see Pattern 3.
- Prometheus two-target `scrape_configs` — see Pattern 4.
- Grafana provisioning YAML (datasources + dashboards providers) — see Pattern 5.
- GitHub Actions 4-parallel-job workflow skeleton — see Pattern 6.

### Playwright fake-media project config
```typescript
// Source: Playwright official CI guidance (playwright.dev/docs/ci) + cross-checked
// community pattern for --use-fake-device-for-media-stream /
// --use-fake-ui-for-media-stream (WebSearch, multiple independent sources agree on
// the flag names and launchOptions.args placement)
// frontend/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,      // call test needs deterministic 2-context ordering
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173', // vite preview default port
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-fake-media',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],
});
```

### Playwright E2E With Fake Media — recommended CI job body

**Where it runs:** Directly in the `ubuntu-latest` GitHub Actions runner, NOT inside `docker compose up`. Start the backend as a plain Spring Boot process (jar or `mvn spring-boot:run`) with Testcontainers providing Postgres/Redis/RabbitMQ (reusing the same `TestcontainersConfiguration.java` used by `mvn verify`, run in "app mode" rather than "test mode" — Spring Boot supports launching the main application against a Testcontainers-provided datasource via a `TestPropertySource`/dedicated profile, OR more simply: bring up `postgres`/`redis`/`rabbitmq` as GitHub Actions **service containers** (`jobs.<job>.services`), which is the native GH Actions primitive for exactly this — a lighter-weight alternative to booting Testcontainers from within the app for a non-test run). Then start the frontend via `vite preview` (or serve the `dist/` build with any static server) pointed at that backend.

**Why not full `docker compose up`:** coturn/TURN is not required for two fake-media Chromium contexts running on the same machine — WebRTC ICE will negotiate host or server-reflexive candidates directly since there's no real NAT between two browser contexts on one runner. nginx's LB/proxy role is also unnecessary for a test against a single backend instance. Removing both collapses the E2E job's dependency chain from "8 services with healthchecks" to "3 GH Actions service containers + 2 locally-started processes," which is materially faster and has fewer failure modes unrelated to the actual thing being tested (the 1-1 call).

```yaml
# Source: composed from GitHub Actions official docs (jobs.<job_id>.services primitive)
# + Playwright official CI guidance (playwright.dev/docs/ci: `npx playwright install
# --with-deps` as a separate step) — this exact job body is this research's synthesis,
# not copied verbatim from one source; tag as [CITED] for the sub-patterns, [ASSUMED]
# for the overall job composition since no single authoritative doc combines Spring
# Boot + GH Actions service containers + Playwright fake-media into one worked example.
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_DB: vdt_webrtc
          POSTGRES_USER: vdt
          POSTGRES_PASSWORD: vdt
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U vdt -d vdt_webrtc"
          --health-interval 5s --health-timeout 5s --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping" --health-interval 5s --health-retries 10
      rabbitmq:
        image: rabbitmq:4.1-management
        ports: ['5672:5672']
        options: >-
          --health-cmd "rabbitmq-diagnostics check_port_connectivity"
          --health-interval 10s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '21', cache: maven }
      - name: Build backend jar
        working-directory: backend
        run: ./mvnw -B -DskipTests package
      - name: Start backend
        working-directory: backend
        env:
          DB_URL: jdbc:postgresql://localhost:5432/vdt_webrtc
          DB_USERNAME: vdt
          DB_PASSWORD: vdt
          REDIS_HOST: localhost
          RABBITMQ_HOST: localhost
          JWT_SECRET: ci-only-test-secret-min-32-characters-long
        run: |
          java -jar target/*.jar &
          npx wait-on http://localhost:8080/actuator/health -t 60000
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: npm, cache-dependency-path: frontend/package-lock.json }
      - name: Build frontend
        working-directory: frontend
        env:
          VITE_API_URL: http://localhost:8080
          VITE_WS_URL: ws://localhost:8080/ws
        run: npm ci && npm run build
      - name: Serve frontend build
        working-directory: frontend
        run: npx vite preview --port 4173 &
      - name: Install Playwright browsers
        working-directory: frontend
        run: npx playwright install --with-deps chromium
      - name: Run Playwright E2E
        working-directory: frontend
        env:
          E2E_BASE_URL: http://localhost:4173
        run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: frontend/playwright-report/ }
```

### Two-browser-context 1-1 call test outline
```typescript
// frontend/e2e/one-to-one-call.spec.ts
// Outline only — exact selectors depend on planner's chosen test hooks / data-testid
// attributes added to LoginPage.tsx / OnlineUserRow.tsx / CallPage.tsx.
import { test, expect } from '@playwright/test';

test('two users can complete a 1-1 video call', async ({ browser }) => {
  const callerCtx = await browser.newContext();
  const calleeCtx = await browser.newContext();
  const caller = await callerCtx.newPage();
  const callee = await calleeCtx.newPage();

  // 1. Log in as two pre-seeded users (seed via Flyway test-only migration or
  //    a REST call to /api/auth/register in a beforeAll hook — planner's discretion).
  await caller.goto('/login');
  await caller.fill('input[autocomplete="username"]', 'e2e-alice');
  await caller.fill('input[autocomplete="current-password"]', 'password123');
  await caller.click('button[type="submit"]');
  await expect(caller).toHaveURL('/');

  await callee.goto('/login');
  await callee.fill('input[autocomplete="username"]', 'e2e-bob');
  await callee.fill('input[autocomplete="current-password"]', 'password123');
  await callee.click('button[type="submit"]');
  await expect(callee).toHaveURL('/');

  // 2. Caller sees bob online and calls them (OnlineUserRow "Gọi" button, disabled
  //    unless status === 'ONLINE' — test must wait for presence WS snapshot to land).
  await caller.getByText('e2e-bob').waitFor();
  await caller.getByRole('button', { name: /Gọi/ }).click();

  // 3. Callee sees the incoming-call screen and accepts.
  await callee.getByText(/e2e-alice/).waitFor();
  await callee.getByRole('button', { name: /Chấp nhận|Accept/ }).click();

  // 4. Both sides land on the call page and the remote <video> element receives frames.
  await expect(caller).toHaveURL(/\/call/);
  await expect(callee).toHaveURL(/\/call/);

  const remoteVideoHasFrames = async (page: import('@playwright/test').Page) =>
    page.waitForFunction(() => {
      const video = document.querySelector('video[aria-label^="Camera của"]') as HTMLVideoElement | null;
      return !!video && video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2;
    }, { timeout: 15000 });

  await remoteVideoHasFrames(caller);
  await remoteVideoHasFrames(callee);

  // 5. Cleanup: hang up so the test doesn't leak an active call in Redis state.
  await caller.getByRole('button', { name: /Kết thúc|Hang up/ }).click();
});
```
Note: `CallPage.tsx` already gives the remote video element `aria-label={`Camera của ${remoteUserId ?? ""}`}` (confirmed by direct code read) — this is a reasonable existing selector, though adding a stable `data-testid="remote-video"` would be more robust than matching on the Vietnamese `aria-label` text, which is a UI-copy concern that could change independently of the E2E test's intent. **Recommend the planner add a `data-testid` to the remote/self `<video>` elements as part of this phase's frontend task**, since relying on translatable UI text for E2E selectors is fragile.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Hand-rolled `AtomicLong` counters reset by cron (`CallMetrics.resetDaily()`) | Micrometer `Counter`/`Gauge` registered with `MeterRegistry`, windowed via PromQL `rate()`/`increase()` | N/A — this is this project's own pre-existing code being superseded within this phase, not an industry-wide change | Daily reset logic becomes redundant/actively wrong once Prometheus owns the time-series data; the reset method should be removed, not kept alongside the new metrics |
| `docker/build-push-action` for CI image builds | Plain `docker build` (no push) | N/A — CLAUDE.md's own CI/CD section lists `build-push-action`, but D-07 (locked in this phase's CONTEXT.md) explicitly overrides that for this project's scope | Simpler workflow, no registry credentials/secrets to manage, faster CI |

**Deprecated/outdated:** None identified as deprecated in the broader ecosystem sense — all recommended tools (Micrometer, Prometheus, Grafana provisioning, Playwright fake-media flags, GitHub Actions service containers) are current, actively maintained approaches as of this research date.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `actions/setup-java@v4` and `actions/setup-node@v4` are the current major versions | Standard Stack / Supporting | Low — these actions are widely used and stable; if a newer major exists, CI still works with v4, just misses minor improvements |
| A2 | Grafana 13.0.3's provisioning YAML format (`apiVersion: 1`) is unchanged from the CLAUDE.md-assumed 11.x/12.x | Standard Stack | Low-medium — if Grafana 13 introduced a breaking provisioning schema change, dashboards might not auto-load; verify at implementation time by actually starting the compose stack and checking Grafana's own startup logs for provisioning errors |
| A3 | Two Chromium contexts on the same GitHub Actions runner can complete WebRTC ICE negotiation without TURN/coturn | Playwright E2E section | Medium — if GitHub Actions' network sandboxing blocks the local UDP/TCP paths ICE would use between two contexts on the same host, the call could fail to connect in CI even though it works locally; this is the single highest-uncertainty claim in this research and should be the first thing verified when building the E2E job (fallback: add a lightweight STUN-only config, or run coturn as a GH Actions service container if host-local ICE proves insufficient) |
| A4 | Spring Boot supports starting the full application (not just tests) against GitHub Actions service containers for Postgres/Redis/RabbitMQ without needing Testcontainers inside that specific CI job | Playwright E2E job body | Low-medium — this is standard practice (service containers are a first-class GH Actions feature for exactly this), but the exact env-var wiring shown is illustrative and must be validated against the project's actual `application.yaml` property names at implementation time |
| A5 | The `@playwright/test` `SUS`/"too-new" verdict from the automated legitimacy seam is a false positive rather than a real risk signal | Package Legitimacy Audit | Low — directly cross-verified via `npm view --time.created` (created 2020) and repo/download-count checks; residual risk is negligible but documented per protocol |

**If this table is empty:** N/A — see entries above; A3 is the item most worth planner attention (it directly determines whether the "lighter, no-compose" E2E approach this research recommends is viable as-is, or needs a STUN/TURN fallback added).

## Open Questions

1. **Does GitHub Actions' `ubuntu-latest` network sandboxing allow two same-host Chromium contexts to complete ICE negotiation without any STUN/TURN server at all?**
   - What we know: Two browser contexts on the same OS/network can typically negotiate `host` candidates directly (no NAT traversal needed at all between processes on one machine); this is a very common pattern for local WebRTC E2E tests industry-wide.
   - What's unclear: GitHub Actions runners' specific network namespace/firewall configuration isn't something this research verified directly (would require an actual CI run to confirm).
   - Recommendation: Build the E2E job as designed above; if ICE negotiation fails in the first real CI run, the fallback is trivial — add a public STUN server (e.g. `stun:stun.l.google.com:19302`) to the frontend's ICE server list for the E2E build only (via a `VITE_ICE_SERVERS` env override), which requires no coturn/compose dependency and should be enough to unblock host-network ICE if pure host-candidate negotiation doesn't work in the runner's sandbox.

2. **Should the E2E job depend on (`needs:`) the backend/frontend jobs, or run fully independently as D-09 suggests is acceptable?**
   - What we know: D-09 explicitly says Playwright job placement is Claude's discretion and "should fit this parallel-jobs shape (e.g., depends on the backend/frontend jobs or runs independently)."
   - What's unclear: Whether making it depend on `backend`+`frontend` jobs (saving CI minutes by failing fast if unit tests already broke) is worth the added total pipeline latency (E2E now waits for two other jobs to finish first) versus running fully in parallel and accepting that E2E might fail for the same underlying reason a unit test already caught.
   - Recommendation: Run independently (no `needs:`) for now, given this is a learning-focused project where fast feedback loops during development matter more than saving a few CI minutes on failure — the planner can revisit if CI cost becomes a concern.

3. **Where should E2E test user seeding happen (dedicated Flyway test-data migration, `/api/auth/register` calls in a Playwright `beforeAll`, or a backend `@Profile("e2e")` seeding component)?**
   - What we know: The backend already has Flyway migrations (`V1`, `V2` per earlier repo state) and a working `/api/auth/register` endpoint.
   - What's unclear: Whether reusing the public register endpoint from the Playwright test setup (simplest, no backend changes) is preferred over a dedicated seed mechanism.
   - Recommendation: Use the public `/api/auth/register` REST endpoint from a Playwright global setup script — zero backend changes needed, and it also indirectly exercises AUTH-01 as a side effect, which is a reasonable trade for E2E test simplicity.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker / Docker Compose | INFR-02 full-stack demo | Not verified this session (research ran without executing `docker` commands against the local Windows machine) | — | N/A — this is a hard requirement for the phase; planner should confirm Docker Desktop is running on the dev machine before execution, but this is an execution-time check, not a research-time blocker |
| `npm`/Node 22 | Frontend build + Playwright | ✓ (repo already has working `npm` scripts; `node_modules`/`package-lock.json` present) | — | — |
| Maven wrapper (`mvnw`) | Backend build/tests | Assumed present (referenced by CLAUDE.md and existing `backend/Dockerfile`'s `mvn` usage) — verify `./mvnw` exists at plan time if not already confirmed | — | Fall back to a system `mvn` install if wrapper is missing |
| GitHub Actions `ubuntu-latest` Docker daemon | Backend CI job's Testcontainers | ✓ per Docker's own official guidance (no setup needed) [CITED: docker.com/blog] | — | N/A |

**Missing dependencies with no fallback:** None identified as blocking — all core tools (Docker, Node, Maven, GitHub-hosted Docker daemon) are either already confirmed present in this repo or are standard-guaranteed GitHub Actions runner features.

**Missing dependencies with fallback:** none beyond the Maven-wrapper note above.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend framework | JUnit 5 (Jupiter) + Spring Boot Test + Testcontainers (already in place, confirmed via `backend/pom.xml` and 26 existing test classes under `backend/src/test/java`) |
| Frontend unit framework | Vitest 4.x (already in `package.json`; no `.test.tsx` files currently exist in `frontend/src` — Wave 0 gap, see below) |
| Frontend E2E framework | Playwright `@playwright/test` 1.61.1 — NEW, not yet in `package.json` |
| Backend config file | `backend/pom.xml` (Surefire/Failsafe default config, no custom test config file found) |
| Frontend config file | none yet — `vitest` currently runs with defaults (no `vitest.config.ts` found); Playwright needs a new `frontend/e2e/playwright.config.ts` |
| Quick run command (backend) | `./mvnw -B test` (unit only) or `./mvnw -B verify` (includes Testcontainers integration tests) |
| Quick run command (frontend) | `npx vitest run` |
| Full suite command | `./mvnw -B verify` (backend) + `npx vitest run` (frontend) + `npx playwright test` (E2E) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFR-02 | `docker compose up` starts all services with healthchecks passing | manual / smoke (docker compose config + `docker compose up` + poll healthchecks) | `docker compose config -q && docker compose up -d && docker compose ps` (assert all `healthy`) | ❌ Wave 0 — no compose healthcheck smoke script exists yet |
| INFR-04 | Prometheus scrapes both instances; Grafana dashboard renders panels with real data | manual (visual check in Grafana UI) + optional automated Prometheus query check | `curl http://localhost:9090/api/v1/query?query=up{job="vdt-backend"}` (assert 2 series, value 1) | ❌ Wave 0 — no such check exists |
| INFR-05 | CI builds, tests, packages images on push/PR | automated (the workflow itself is the test) | `.github/workflows/ci.yml` runs on push/PR | ❌ Wave 0 — `.github/` doesn't exist yet |
| INFR-06 | Playwright E2E places and completes a real 1-1 call, remote video receives frames | e2e | `npx playwright test e2e/one-to-one-call.spec.ts` | ❌ Wave 0 — `frontend/e2e/` doesn't exist yet |

### Sampling Rate
- **Per task commit:** `./mvnw -B test` (backend, fast subset) / `npx vitest run` (frontend) for any metrics-code or config changes; `npx playwright test` only once the E2E harness itself is stood up (it's comparatively slow).
- **Per wave merge:** `./mvnw -B verify` (full backend incl. Testcontainers) + `npx vitest run` + a manual `docker compose up` smoke check.
- **Phase gate:** Full suite green (`mvn verify`, `vitest run`, `playwright test`) plus a manual `docker compose up` walkthrough confirming all services report healthy and the Grafana dashboard renders non-empty panels, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `.github/workflows/ci.yml` — the entire CI pipeline, covers INFR-05.
- [ ] `frontend/e2e/playwright.config.ts` + `frontend/e2e/one-to-one-call.spec.ts` — covers INFR-06.
- [ ] `frontend/package.json` — add `@playwright/test` devDependency and an `e2e` script (`playwright test`).
- [ ] `prometheus/prometheus.yml` — new file, covers INFR-04's scrape side.
- [ ] `grafana/provisioning/datasources/datasource.yml`, `grafana/provisioning/dashboards/dashboard.yml`, `grafana/dashboards/vdt-webrtc-overview.json` — new files, covers INFR-04's dashboard side.
- [ ] `backend/src/main/java/com/vdt/webrtc/metrics/MetricsConfig.java` (or equivalent) — new file wiring the `instance` common tag.
- [ ] A `data-testid` (or equivalent stable selector) on `CallPage.tsx`'s remote/self `<video>` elements — needed for a robust (non-locale-dependent) Playwright assertion; small frontend change, not a new file.
- [ ] No existing smoke-test script for "all compose services report healthy" — worth a small script (`scripts/compose-healthcheck.sh` or similar) if the planner wants this automated rather than purely manual for INFR-02's verification.

*(Frontend unit-test infrastructure itself — Vitest + RTL — is already present from earlier phases even though no `.test.tsx` files currently exist; that gap is pre-existing and out of this phase's scope unless the planner chooses to add coverage incidentally.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Indirectly (E2E test logs in real users) | Reuses existing JWT login flow (Phase 1/2) — no new auth surface introduced by this phase |
| V3 Session Management | No | Not touched by this phase |
| V4 Access Control | Yes — `/actuator/prometheus` exposure | Must NOT be reachable externally through nginx (already locked, D-05); only exposed on the internal compose network to the `prometheus` service |
| V5 Input Validation | No new input surface | This phase adds no new user-facing input fields |
| V6 Cryptography | No | Not touched |
| V14 Configuration | Yes | CI must not leak secrets: `JWT_SECRET`/`TURN_SECRET`/DB credentials used in CI service containers must be CI-only dummy values (e.g. `ci-only-test-secret-...`), never real `.env` secrets; Grafana's default admin password (`GF_SECURITY_ADMIN_PASSWORD`) must be set via env var (not left as the well-known `admin`/`admin` default) even in the demo compose file, to avoid modeling a bad security habit even for a local demo |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Actuator endpoint over-exposure (`management.endpoints.web.exposure.include: *`) | Information Disclosure | Only include `health,prometheus` (and optionally `info`) — never wildcard `*`, which would also expose `/actuator/env`, `/actuator/beans`, etc., leaking config/secrets if ever accidentally proxied externally |
| Grafana default credentials shipped in a public-facing demo | Elevation of Privilege | Set `GF_SECURITY_ADMIN_PASSWORD` from an `.env`-sourced variable, consistent with how `POSTGRES_PASSWORD`/`JWT_SECRET`/`TURN_SECRET` are already handled in this compose file |
| CI secrets leakage via test env vars in logs | Information Disclosure | Use clearly-dummy CI-only values for `JWT_SECRET` etc. in the E2E job (as shown in the job body above) — never reference real `.env`/repo secrets in a job that has no legitimate need for them |

## Sources

### Primary (HIGH confidence)
- Maven Central Solr API (`search.maven.org`) — `io.micrometer:micrometer-registry-prometheus` latest version `1.15.0`, checked directly this session.
- npm registry (`npm view @playwright/test`) — version `1.61.1`, `time.created` 2020-09-24, checked directly this session.
- Docker Hub v2 tags API (`hub.docker.com/v2/repositories/...`) — `prom/prometheus` latest stable `v3.13.0`, `grafana/grafana` latest stable `13.0.3`, checked directly this session.
- Direct repository inspection (this session): `docker-compose.yml`, `nginx/conf.d/vdt.conf`, `backend/pom.xml`, `backend/src/main/resources/application.yaml`, `backend/src/main/java/com/vdt/webrtc/metrics/CallMetrics.java`, `backend/src/main/java/com/vdt/webrtc/call/CallService.java`, `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java`, `frontend/package.json`, `frontend/vite.config.ts`, `frontend/src/pages/{LoginPage,HomePage,CallPage}.tsx`, `frontend/src/components/presence/OnlineUserRow.tsx`.

### Secondary (MEDIUM confidence — WebSearch cross-checked against multiple independent sources or official docs)
- Grafana official provisioning docs (`grafana.com/docs/grafana/latest/administration/provisioning/`) — datasource/dashboard YAML format, fetched via WebFetch this session.
- Docker official blog — Testcontainers on GitHub Actions requiring no extra Docker-in-Docker setup (`docker.com/blog/running-testcontainers-tests-using-github-actions/`), fetched via WebFetch this session.
- Playwright official CI docs (`playwright.dev/docs/ci`) — browser install step, webServer/baseURL patterns, fetched via WebFetch this session.
- WebSearch (multiple independent sources agreeing): Micrometer `MeterRegistryCustomizer` common-tags pattern (Baeldung "Tagging Patterns for Micrometer Metrics", Spring Boot reference docs); Prometheus `scrape_configs`/`static_configs` multi-target syntax (Prometheus official example repo, multiple tutorials); nginx SPA `try_files` fallback pattern (Honlsoft, multiple independent guides); Playwright fake-media launch args (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`) via `launchOptions.args`, confirmed across maddevs.io, Medium, and GitHub issue threads on the Playwright repo itself.

### Tertiary (LOW confidence — synthesized by this research, no single authoritative source combines all pieces)
- The specific recommendation to run Playwright E2E against directly-started backend+frontend processes (with GitHub Actions `services:` containers for Postgres/Redis/RabbitMQ) rather than a full `docker compose up` stack is this research's own synthesis of the tradeoffs — no single official doc prescribes this exact combination for a WebRTC signaling + fake-media use case. Flagged in the Assumptions Log (A3, A4) for planner attention and recommended as a first-implementation-day validation point.

## Metadata

**Confidence breakdown:**
- Standard stack (versions/dependencies): HIGH — all package/image versions directly verified against Maven Central, npm registry, and Docker Hub this session.
- Architecture (Micrometer wiring, nginx SPA pattern, Prometheus/Grafana provisioning): MEDIUM — patterns cross-checked against official docs and multiple independent sources, but not executed/tested in this repo this session.
- CI/CD workflow structure: MEDIUM — GitHub Actions parallel-jobs and service-containers patterns are standard/well-documented; the exact YAML in this doc is this research's composition, not copy-pasted from one official example.
- Playwright E2E design (networking approach, ICE-without-TURN assumption): MEDIUM-LOW — this is explicitly the area CONTEXT.md flagged as needing the most research depth; the core technical claim (host-candidate ICE working between two same-machine browser contexts without TURN) is standard WebRTC behavior but was not verified by actually running a CI job this session — see Open Question 1 / Assumption A3.
- Security domain: MEDIUM — ASVS mapping is straightforward for this phase's limited new surface (mainly Actuator exposure control), no deep new auth/crypto surface introduced.

**Research date:** 2026-07-01
**Valid until:** 30 days for the infra/config patterns (Micrometer/Prometheus/Grafana/nginx — stable, slow-moving); 14 days for the exact package versions table (Playwright/Prometheus/Grafana images move fast — re-verify versions at plan/execute time if this research is more than 2 weeks old); the Playwright-in-CI networking recommendation (A3) should be re-validated empirically on the first real CI run regardless of research age.
