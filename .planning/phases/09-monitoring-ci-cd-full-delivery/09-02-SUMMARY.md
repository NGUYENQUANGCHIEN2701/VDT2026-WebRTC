---
phase: 09-monitoring-ci-cd-full-delivery
plan: 02
subsystem: infra
tags: [docker, nginx, prometheus, grafana, vite, spa]

requires:
  - phase: 09-monitoring-ci-cd-full-delivery
    provides: "vdt_calls_ended_total/vdt_calls_active/vdt_ws_sessions_active metric names (Plan 09-01)"
provides:
  - "frontend served from the same nginx that load-balances backend-1/backend-2"
  - "Prometheus scraping both backend instances directly, bypassing nginx"
  - "Grafana auto-provisioned with a 4-panel VDT WebRTC Overview dashboard"
affects: [09-05, aws-deploy]

tech-stack:
  added: [prom/prometheus, grafana/grafana]
  patterns: ["nginx service built from frontend/Dockerfile (repo-root build context) instead of a bare image", "Prometheus/Grafana provisioning-as-code (no manual UI clicks)"]

key-files:
  created:
    - frontend/Dockerfile
    - prometheus/prometheus.yml
    - grafana/provisioning/datasources/datasource.yml
    - grafana/provisioning/dashboards/dashboard.yml
    - grafana/dashboards/vdt-webrtc-overview.json
  modified:
    - nginx/conf.d/vdt.conf
    - docker-compose.yml
    - .env.example

key-decisions:
  - "D-02: frontend folded into the existing nginx service (build: not image:) rather than a separate frontend container"
  - "D-01: compose stack stays HTTP-only, no TLS cert mounted — cross-device HTTPS/WSS verification stays on the existing mkcert dev flow from Phase 3"
  - "D-05: Prometheus scrapes backend-1:8080/backend-2:8080 directly, never through nginx"

patterns-established:
  - "Pattern: nginx service build context = repo root, dockerfile = frontend/Dockerfile, so the frontend build stage can COPY nginx/conf.d/vdt.conf into the final image"

requirements-completed: [INFR-02, INFR-04]

coverage:
  - id: D1
    description: "docker compose up --build serves the built React frontend from nginx on the same origin as /api and /ws"
    requirement: INFR-02
    verification:
      - kind: other
        ref: "docker compose config -q"
        status: pass
    human_judgment: true
    rationale: "Requires a live docker compose up --build + browser check to confirm the SPA actually renders at http://localhost:8080 — not exercised in this session, config validity only."
  - id: D2
    description: "Prometheus scrapes backend-1/backend-2 directly and Grafana auto-loads the VDT WebRTC Overview dashboard with 4 panels"
    requirement: INFR-04
    verification:
      - kind: other
        ref: "grafana/dashboards/vdt-webrtc-overview.json (4 panels, uid vdt-webrtc-overview)"
        status: pass
    human_judgment: true
    rationale: "Dashboard JSON and provisioning files are structurally correct; live Grafana rendering with real scraped data not exercised in this session."

duration: 5min
completed: 2026-07-01
status: complete
---

# Phase 09 Plan 02: Full-stack compose + observability infra Summary

**Frontend folded into the nginx service (multi-stage Dockerfile), plus Prometheus + Grafana added as provisioned-as-code compose services with a 4-panel VDT WebRTC Overview dashboard**

## Performance

- **Duration:** ~5 min of executor work (session interrupted by provider usage limit before final tracking step; commits for all 3 tasks completed cleanly beforehand)
- **Tasks:** 3/3 committed
- **Files modified:** 8 (3 new dirs' worth of provisioning files + nginx/compose/env changes)

## Accomplishments
- `frontend/Dockerfile`: multi-stage `node:22-alpine` build → `nginx:1.27-alpine` serve, repo-root build context (so the final stage can `COPY nginx/conf.d/vdt.conf`)
- `nginx/conf.d/vdt.conf` gained a `location /` SPA fallback (`try_files $uri $uri/ /index.html;`) positioned after the existing `/api`/`/ws` blocks — no route precedence changes
- `docker-compose.yml` `nginx` service converted from `image: nginx:1.27-alpine` to `build: { context: ., dockerfile: frontend/Dockerfile }`, with a healthcheck added
- `prometheus/prometheus.yml` scrapes `backend-1:8080` and `backend-2:8080` directly (never via nginx, per D-05)
- `grafana/provisioning/` datasource + dashboard-provider YAML, `grafana/dashboards/vdt-webrtc-overview.json` with 4 panels (WS sessions/instance, online users proxy, active calls by call_type, call success rate)
- `.env.example` documents `GRAFANA_ADMIN_PASSWORD`

## Task Commits

Each task was committed atomically:

1. **Task 1: Frontend Dockerfile + nginx SPA location, folded into the existing nginx service** - `0830d5d` (feat)
2. **Task 2: Prometheus + Grafana compose services with provisioning-as-code** - `c86eb8a` (feat)
3. **Task 3: "VDT WebRTC Overview" dashboard JSON (D-06 panels)** - `7e2dee6` (feat)

_No separate RED/GREEN split — all 3 tasks are `tdd="false"` per the plan._

## Files Created/Modified
- `frontend/Dockerfile` - multi-stage build producing the nginx image that now serves the SPA
- `nginx/conf.d/vdt.conf` - added SPA fallback location
- `docker-compose.yml` - nginx service now builds from `frontend/Dockerfile`; new `prometheus`/`grafana` services
- `prometheus/prometheus.yml` - scrape config targeting both backend instances directly
- `grafana/provisioning/datasources/datasource.yml` - Prometheus datasource, `http://prometheus:9090`
- `grafana/provisioning/dashboards/dashboard.yml` - file-provider pointing at `/var/lib/grafana/dashboards`
- `grafana/dashboards/vdt-webrtc-overview.json` - 4-panel dashboard, fixed `uid: vdt-webrtc-overview`
- `.env.example` - `GRAFANA_ADMIN_PASSWORD` documented

## Decisions Made
None beyond what the plan already specified (D-01, D-02, D-05, D-06 were pre-decided in 09-CONTEXT.md/09-RESEARCH.md and followed as written).

## Deviations from Plan

None observed in the 3 task commits — diffs match the plan's action/acceptance-criteria shape (nginx `build:` conversion, direct-scrape Prometheus config, 4-panel dashboard JSON).

## Issues Encountered

The executor agent hit a provider session usage limit after the 3rd task commit (`7e2dee6`), before it could run its own verification/tracking steps (`docker compose up --build` smoke test, SUMMARY.md, STATE.md/ROADMAP.md updates). This SUMMARY.md and the associated tracking updates were completed by the orchestrator directly from the committed diffs and a `docker compose config -q` check (passed) to avoid re-dispatching a full executor agent while the usage limit is in effect. **Not yet verified in this session:** a live `docker compose up --build` confirming all 9 services report healthy, `http://localhost:8080` actually renders the React app, and Grafana shows live data during a real call — deferred to Plan 09-05's full verification gate.

## User Setup Required

None - no external service configuration required. (`GRAFANA_ADMIN_PASSWORD` has a documented `admin` fallback for local dev; must be set for anything beyond local dev.)

## Next Phase Readiness

- 09-03 (GitHub Actions CI) has no file overlap with this plan and remains ready to execute.
- 09-05's full verification gate must include the live `docker compose up --build` walkthrough that this session deferred.
- For AWS deployment: this plan intentionally keeps the compose stack HTTP-only (D-01) — TLS termination for a public server is out of this phase's scope and needs to be added separately (e.g. Let's Encrypt via the EC2 public DNS name) before exposing this stack to the internet.

---
*Phase: 09-monitoring-ci-cd-full-delivery*
*Completed: 2026-07-01*
