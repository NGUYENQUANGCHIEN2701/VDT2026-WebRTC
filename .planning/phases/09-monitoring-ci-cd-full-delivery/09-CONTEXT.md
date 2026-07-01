# Phase 9: Monitoring, CI/CD & Full Delivery - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

The entire system becomes observable, continuously tested with a real E2E call, and starts with
one command for the demo. Phase 9 extends the existing `docker-compose.yml` (which currently has
`postgres`, `backend-1`, `backend-2`, `nginx` as LB-only, `redis`, `rabbitmq`, `coturn`) to add: the
frontend (built and served), Prometheus + Grafana, and GitHub Actions CI (build, test, package
Docker images, and run a Playwright E2E call test).

Covers INFR-02, INFR-04, INFR-05, INFR-06.

**Not in this phase:**
- Changing the 1-1/group call semantics, signaling, or Redis routing themselves (Phases 3-7).
- HTTPS/WSS for the docker-compose demo itself — that stays on the existing mkcert `npm run dev`
  flow (Phase 3 already proved cross-device HTTPS/TURN works that way).
- Publishing Docker images to a registry (GHCR) — CI verifies images build, it does not publish them.
- Redesigning nginx as two separate services — the existing nginx LB gains a static-file location,
  it does not get replaced.

</domain>

<decisions>
## Implementation Decisions

### Frontend containerization & HTTPS (INFR-02)
- **D-01:** **HTTP-only in the docker-compose demo.** nginx continues to serve plain HTTP on
  `:8080` as it does today. No cert (mkcert or self-signed) is mounted into the compose nginx. Real
  cross-device HTTPS/WSS verification stays on the existing `npm run dev` + mkcert flow (Phase 3
  D-04) — that flow already proves getUserMedia works over a secure context on a second device.
- **D-02:** **One shared nginx service, not two.** Add a multi-stage frontend build (per CLAUDE.md:
  `node:22-alpine` build → copy `dist/` into the existing `nginx:1.27-alpine` image/service) so the
  same nginx that load-balances `backend-1`/`backend-2` also serves the static frontend build via a
  new `location /` block, alongside the existing `/api` and `/ws` locations in
  `nginx/conf.d/vdt.conf`. Port `8080` remains the single external entry point.
  - This requires no change to the frontend's default build-time env vars: `frontend/.env` already
    has `VITE_API_URL=http://localhost:8080` and `VITE_WS_URL=ws://localhost:8080/ws`, which already
    point at the nginx port — bake these defaults into the frontend Docker image.

### Metrics scope (INFR-04)
- **D-03:** **Active-calls / call-success-rate metrics count both 1-1 and group (mesh) calls.**
  Tag/label these metrics with `call_type` (`1-1` | `group`) so the Grafana dashboard can show the
  combined total but still be filtered per call type if needed. Do not build two disjoint metric
  families for 1-1 vs group.
- **D-04:** **Call success rate = completed / total calls initiated.** Denominator includes every
  end-reason from the Phase 4 taxonomy (completed/rejected/cancelled/missed/busy/dropped), not just
  completed vs dropped. This reflects the true % of call attempts that reach a successful connection,
  not just technical connection stability after connect.
- **D-05:** **Prometheus scrapes `backend-1` and `backend-2` directly, bypassing the nginx LB.**
  `prometheus.yml` declares two targets (`backend-1:8080`, `backend-2:8080`) hitting
  `/actuator/prometheus` over the internal compose network. This is required to get genuinely
  per-instance metrics (scraping through the round-robin LB would blend/alias the two instances).
  `/actuator` is NOT exposed externally through nginx.
- **D-06:** **One consolidated Grafana dashboard** ("VDT WebRTC Overview") rather than multiple
  topic dashboards. Panels: WS sessions per instance, online users, active calls (with call_type
  breakdown), call success rate. Single dashboard is enough for this project's scale and keeps
  provisioning-as-code to one JSON file.

### CI/CD pipeline shape (INFR-05, INFR-06)
- **D-07:** **CI builds Docker images but does not push to a registry.** No GHCR (or other
  registry) publishing step. The project's deliverable is source code + docker-compose, not a
  published image — `docker build` in CI is only there to catch broken Dockerfiles.
- **D-08:** **CI triggers on push to `main` and on pull requests targeting `main`.**
- **D-09:** **Separate parallel jobs, not one sequential job.** At minimum: a backend job
  (`mvn verify`, which already exercises Testcontainers-based integration tests including the Phase
  6 cross-instance Redis test), a frontend job (lint + `vitest run` + build), and a docker-build job
  (build backend + frontend images to verify they build). Playwright E2E job placement/design is
  Claude's discretion (see below) but should fit this parallel-jobs shape (e.g., depends on the
  backend/frontend jobs or runs independently against a compose-based stack).

### Claude's Discretion
- **Playwright E2E test design is fully open** — the user chose not to deep-dive this area. Research
  and planning should decide: whether the E2E test runs against a full `docker compose up` stack in
  CI or a lighter direct backend+frontend run, where `frontend/e2e/` (or similar) lives, and the exact
  assertions — but it MUST satisfy INFR-06: place a real 1-1 call between two Chromium browser
  contexts using `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` and assert the
  remote `<video>` renders frames. STATE.md already flags "Playwright E2E with fake media in CI
  requires careful Docker networking setup" as a known risk to research.
- Exact Micrometer metric names, classes touched (`PresenceWebSocketHandler`, `CallStateRepository`,
  `CallService`), and how `call_type`/`instance` tags get wired into Micrometer `Tag`s.
- Exact Grafana panel layout, PromQL queries/thresholds, and Prometheus scrape interval.
- Healthcheck definitions for the new/changed services (nginx+frontend, Prometheus, Grafana) needed
  to satisfy success criterion #1 ("healthchecks on every service").
- coturn Docker networking approach — already decided in Phase 3; Phase 9 only needs to make sure it
  keeps working in the fuller compose file, not redesign it.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` section "Phase 9: Monitoring, CI/CD & Full Delivery" — goal, 4 success
  criteria, requirement IDs.
- `.planning/REQUIREMENTS.md` — INFR-02 (one `docker compose up` with healthchecks), INFR-04
  (Prometheus/Grafana per-instance dashboards), INFR-05 (GitHub Actions CI), INFR-06 (Playwright E2E
  call in CI).
- `.planning/STATE.md` §Blockers/Concerns — "Playwright E2E with fake media in CI requires careful
  Docker networking setup", "coturn relay range must be mappable in Docker Compose", "Grafana
  provisioning as code needs validation".

### Stack and locked infra choices
- `CLAUDE.md` section "Infrastructure (Docker Compose services)" — Frontend multi-stage
  `node:22-alpine` → `nginx:1.27-alpine`; "Load balancer: Same nginx (or separate)" (D-02 picks
  "same"); Prometheus `prom/prometheus` 3.x; Grafana `grafana/grafana` 11.x/12.x with provisioning
  as code under `/etc/grafana/provisioning`.
- `CLAUDE.md` section "Monitoring" — Micrometer + `micrometer-registry-prometheus`,
  `management.endpoints.web.exposure.include=health,info,prometheus`, custom metrics list (Gauge WS
  sessions/instance, Gauge online users, Counter calls started/completed/missed, Timer signaling
  handling), tag by instance.
- `CLAUDE.md` section "CI/CD (GitHub Actions)" — `actions/setup-java` (Temurin 21) → `mvn verify`;
  `actions/setup-node` (22) → `npm ci && npm run lint && npx vitest run && npm run build`;
  `docker/build-push-action` mentioned there is NOT used per D-07 (build-only, no push).
- `CLAUDE.md` section "Testing" — Testcontainers 1.21+ runs natively on GitHub Actions
  `ubuntu-latest`; Playwright 1.5x latest with
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` for E2E call testing.

### Cross-phase dependencies
- `.planning/phases/06-horizontal-scaling/06-CONTEXT.md` D-07 — "Compose adds nginx LB + a second
  backend only. Frontend service + Prometheus/Grafana stay out (Phase 9, INFR-02)" — this is the
  gap Phase 9 fills. Also documents the current `nginx/conf.d/vdt.conf` upstream/WS-upgrade setup
  that D-02 extends rather than replaces.
- `.planning/phases/03-1-1-p2p-call-core-nat-traversal/03-CONTEXT.md` D-04 — mkcert HTTPS/WSS flow
  for real cross-device demo; Phase 9's D-01 explicitly keeps this as the HTTPS verification path
  rather than duplicating it in compose.
- `.planning/phases/04-call-lifecycle-in-call-experience/04-CONTEXT.md` — end-reason taxonomy
  (completed/rejected/cancelled/missed/busy/dropped) that D-04's success-rate formula is built on.
- `.planning/phases/07-group-mesh-calls/07-CONTEXT.md` — group/mesh call model that D-03's
  `call_type` label must account for.

### Existing code integration points
- `docker-compose.yml` — current services (`postgres`, `backend-1`, `backend-2`, `nginx`, `redis`,
  `rabbitmq`, `coturn`); the file this phase adds `frontend` (folded into `nginx`), `prometheus`,
  `grafana` services to.
- `nginx/conf.d/vdt.conf` — current LB-only config (`map $http_upgrade`, `upstream backend`, `/ws`
  and `/api` locations); D-02 adds a `location /` for the static frontend build.
- `frontend/vite.config.ts` — mkcert-conditional HTTPS for the dev server only; not used by the
  compose frontend build (D-01).
- `frontend/.env` / `frontend/.env.example` — `VITE_API_URL=http://localhost:8080`,
  `VITE_WS_URL=ws://localhost:8080/ws`, already correct for the shared-nginx approach (D-02).
- `frontend/src/api/axios.ts`, `frontend/src/realtime/wsClient.ts` — read `VITE_API_URL` /
  `VITE_WS_URL` at build time.
- `backend/src/main/resources/application.yaml` — `management.endpoints.web.exposure.include:
  health` currently; needs `prometheus` added. `app.instance-id: ${INSTANCE_ID:${HOSTNAME:unknown}}`
  already exists and is the natural per-instance tag source.
- `backend/pom.xml` — has `spring-boot-starter-actuator` + `spring-boot-starter-actuator-test`;
  missing `micrometer-registry-prometheus`.
- `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java` — WS session
  connect/disconnect hooks; candidate site for the WS-sessions-per-instance gauge.
- `backend/src/main/java/com/vdt/webrtc/call/CallStateRepository.java` and the Phase 4 call state
  machine / `CallService` — candidate site for calls-started/completed/missed counters and the
  success-rate denominator, extended to also record `call_type` per D-03.
- `frontend/package.json` — has `vitest`/`test:run` scripts; no Playwright dependency yet.
- No `.github/` directory exists yet — the CI workflow is entirely new.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app.instance-id` config value already flows through to Spring context — reuse directly as the
  Micrometer `instance` tag rather than re-deriving from `HOSTNAME`.
- `nginx/conf.d/vdt.conf`'s existing `map $http_upgrade $connection_upgrade` and `upstream backend`
  blocks are untouched by D-02; only a new `location /` block for static files is added.
- Actuator is already on the classpath and exposing `health`; adding `prometheus` to
  `management.endpoints.web.exposure.include` plus the Micrometer Prometheus registry dependency is
  additive, not a rework.
- Phase 4's end-reason taxonomy (completed/rejected/cancelled/missed/busy/dropped) is the direct
  input to D-04's success-rate PromQL query — no new taxonomy needed.

### Established Patterns
- Redis/Testcontainers integration-test pattern (two Spring contexts + Testcontainers Redis, from
  Phase 6) is the established way to test cross-instance behavior in CI; the same
  Testcontainers-on-`ubuntu-latest` approach applies to the backend CI job.
- Non-serializable objects (WebRTC/media) stay out of Zustand — relevant if Playwright E2E ends up
  needing any frontend test hooks.

### Integration Points
- docker-compose: `frontend` build stage → copied into the existing `nginx` service image/volume →
  served at `/` alongside `/api` and `/ws` proxy locations.
- `prometheus.yml` → scrapes `backend-1:8080` and `backend-2:8080` `/actuator/prometheus` directly
  (bypassing nginx) → Grafana datasource → `VDT WebRTC Overview` dashboard provisioned as code.
- GitHub Actions: parallel jobs (backend `mvn verify`, frontend lint+vitest+build, docker build) on
  push/PR to `main`; Playwright E2E job design deferred to research/planning.

</code_context>

<specifics>
## Specific Ideas

- Keep the compose demo simple (HTTP-only, single nginx) — don't duplicate the HTTPS story that
  Phase 3 already solved for real cross-device verification.
- The Grafana dashboard should visibly tell the "scale-out" story: per-instance WS session counts
  and per-instance activity are the headline panels, since that's the whole point of the Phase 6/9
  scaling demo.
- CI's Docker step is a build-correctness check, not a delivery/publishing step — no registry
  credentials or package visibility to manage.

</specifics>

<deferred>
## Deferred Ideas

- Playwright E2E test design (exact scenario wiring, CI networking approach) — intentionally left
  fully open for research/planning rather than decided here; not a scope-creep item, just deferred
  discussion depth.

None else — discussion stayed within phase scope; no new-capability requests came up.

</deferred>

---

*Phase: 9-monitoring-ci-cd-full-delivery*
*Context gathered: 2026-07-01*
