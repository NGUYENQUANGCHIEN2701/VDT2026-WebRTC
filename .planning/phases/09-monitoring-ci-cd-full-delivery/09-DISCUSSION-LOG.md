# Phase 9: Monitoring, CI/CD & Full Delivery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 9-monitoring-ci-cd-full-delivery
**Areas discussed:** Frontend containerization & HTTPS in compose, Metrics scope, CI/CD pipeline shape

---

## Frontend containerization & HTTPS in compose

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP-only in compose | Compose demo stays HTTP:8080; HTTPS/WSS verification stays on the existing mkcert `npm run dev` flow | ✓ |
| HTTPS in compose too | Mount mkcert/self-signed cert into nginx so the compose demo is HTTPS end-to-end | |

**User's choice:** HTTP-only in compose.

| Option | Description | Selected |
|--------|-------------|----------|
| One shared nginx (multi-stage frontend build copied into existing nginx image, same :8080 entry point) | Matches CLAUDE.md "Same nginx", no VITE_API_URL/VITE_WS_URL changes needed | ✓ |
| Separate frontend nginx container | Dedicated static-file nginx + separate LB nginx | |

**User's choice:** One shared nginx service.
**Notes:** Confirmed `frontend/.env` defaults (`VITE_API_URL=http://localhost:8080`,
`VITE_WS_URL=ws://localhost:8080/ws`) already match the shared-nginx port, so no env rework needed.

---

## Metrics scope

| Option | Description | Selected |
|--------|-------------|----------|
| Count both 1-1 and group calls (with `call_type` label) | Fuller picture for admin/demo dashboard, still filterable | ✓ |
| Count 1-1 calls only | Stays tightly scoped to core value | |

**User's choice:** Count both 1-1 and group, with a `call_type` label.

| Option | Description | Selected |
|--------|-------------|----------|
| Prometheus scrapes backend-1/backend-2 directly, bypassing nginx LB | Genuine per-instance metrics; `/actuator` not exposed externally | ✓ |
| Other / Claude decides | Defer scrape strategy to planning | |

**User's choice:** Direct scrape of backend-1/backend-2.

| Option | Description | Selected |
|--------|-------------|----------|
| One consolidated "VDT WebRTC Overview" dashboard | Simple, single provisioning file, enough for this project's scale | ✓ |
| Multiple topic dashboards (e.g. Scaling vs Call health) | Clearer separation, more provisioning overhead | |

**User's choice:** One consolidated dashboard.

| Option | Description | Selected |
|--------|-------------|----------|
| completed / total calls initiated (all end-reasons in denominator) | Reflects true % of call attempts that connect successfully | ✓ |
| completed / (completed + dropped) | Measures pure technical stability only | |

**User's choice:** completed / total calls initiated.

---

## CI/CD pipeline shape

| Option | Description | Selected |
|--------|-------------|----------|
| Build only, no registry push | CI verifies Dockerfiles build; no GHCR push, simpler, no secrets/visibility mgmt | ✓ |
| Build and push to GHCR | Adds `docker/build-push-action` + `docker/metadata-action`, more production-like but unnecessary here | |

**User's choice:** Build only, no push.

| Option | Description | Selected |
|--------|-------------|----------|
| Push + PR into main | Standard practice, catches issues before merge | ✓ |
| Push to main only | Simpler if no PR-based workflow | |

**User's choice:** Push + PR into main.

| Option | Description | Selected |
|--------|-------------|----------|
| Separate parallel jobs (backend, frontend, docker build) | Faster, clearer failure isolation, standard GitHub Actions practice | ✓ |
| One sequential job | Simpler to read, slower, harder to isolate failures | |

**User's choice:** Separate parallel jobs.

---

## Claude's Discretion

- Playwright E2E test design (area intentionally not deep-dived by the user): where it runs (full
  `docker compose up` stack vs lighter direct run), exact CI job wiring, exact scenario assertions.
  Must satisfy INFR-06 (real 1-1 call between two browser contexts, fake media devices, asserts
  remote video renders frames).
- Exact Micrometer metric names/classes and `call_type`/`instance` tag wiring.
- Exact Grafana panel layout, PromQL queries, scrape interval.
- Healthcheck definitions for new/changed services (nginx+frontend, Prometheus, Grafana).
- coturn Docker networking in the fuller compose file (already decided in Phase 3; just needs to keep working).

## Deferred Ideas

None — discussion stayed within phase scope. No new-capability requests came up.
