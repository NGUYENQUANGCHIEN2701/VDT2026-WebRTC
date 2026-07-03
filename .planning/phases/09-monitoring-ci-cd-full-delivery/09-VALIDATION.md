---
phase: 9
slug: monitoring-ci-cd-full-delivery
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-01
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Backend: JUnit 5 + Spring Boot Test + Testcontainers (already in place). Frontend unit: Vitest 4.x (already in place). Frontend E2E: Playwright `@playwright/test` 1.61.1 (NEW). |
| **Config file** | Backend: `backend/pom.xml` (Surefire/Failsafe defaults). Frontend unit: none yet (Vitest runs with defaults). E2E: new `frontend/e2e/playwright.config.ts`. |
| **Quick run command** | Backend: `./mvnw -B test` (unit only). Frontend: `npx vitest run`. |
| **Full suite command** | `./mvnw -B verify` (backend, incl. Testcontainers) + `npx vitest run` (frontend) + `npx playwright test` (E2E) |
| **Estimated runtime** | ~2-4 min backend verify, ~10-20s frontend vitest, ~30-60s Playwright E2E |

---

## Sampling Rate

- **After every task commit:** `./mvnw -B test` (backend, fast subset) or `npx vitest run` (frontend) for any metrics-code/config changes. `npx playwright test` only once the E2E harness itself is stood up (slow relative to unit tests).
- **After every plan wave:** `./mvnw -B verify` (full backend incl. Testcontainers) + `npx vitest run` + a manual `docker compose up` smoke check.
- **Before `/gsd-verify-work`:** Full suite green (`mvn verify`, `vitest run`, `playwright test`) plus a manual `docker compose up` walkthrough confirming all services report healthy and the Grafana dashboard renders non-empty panels.
- **Max feedback latency:** ~4 minutes (backend `mvn verify` is the slowest automated step).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-03/T2 | 09-03 | W1 | INFR-05 | V14 | CI-only dummy secrets, never `.env` | automated | `.github/workflows/ci.yml` runs on push/PR | ✅ | ✅ green |
| 09-01+09-02/T3 | 09-01, 09-02 | W1 | INFR-04 | V4 | `/actuator/prometheus` not externally exposed via nginx | manual + automated query | `curl http://localhost:9090/api/v1/query?query=up{job="vdt-backend"}` (assert 2 series, value 1) | ✅ | ✅ green |
| 09-02/T1-T2 | 09-02 | W1 | INFR-02 | — | All services report healthy | manual / smoke | `docker compose config -q && docker compose up -d && docker compose ps` (assert all `healthy`) | ✅ | ✅ green |
| 09-04/T2-T3 | 09-04 | W2 | INFR-06 | V2 (reuses existing JWT flow, no new surface) | Real 1-1 call completes, remote video receives frames | e2e | `npx playwright test e2e/one-to-one-call.spec.ts` | ✅ | ✅ green |

*Task IDs/Plan/Wave assigned per 09-05-PLAN.md Task 3, once Plans 09-01 through 09-05 executed and the Task 2b manual checkpoint was approved; this table's Req/Test-Type/Command mapping carries over unchanged from 09-RESEARCH.md's "Phase Requirements → Test Map".*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `.github/workflows/ci.yml` — the entire CI pipeline (covers INFR-05).
- [x] `frontend/e2e/playwright.config.ts` + `frontend/e2e/one-to-one-call.spec.ts` — covers INFR-06.
- [x] `frontend/package.json` — add `@playwright/test` devDependency and an `e2e` script (`playwright test`).
- [x] `prometheus/prometheus.yml` — new file, covers INFR-04's scrape side.
- [x] `grafana/provisioning/datasources/datasource.yml`, `grafana/provisioning/dashboards/dashboard.yml`, `grafana/dashboards/vdt-webrtc-overview.json` — new files, covers INFR-04's dashboard side.
- [x] `backend/src/main/java/com/vdt/webrtc/metrics/MetricsConfig.java` (or equivalent) — new file wiring the `instance` common tag; also replaces the existing hand-rolled `AtomicLong`-based `CallMetrics.java` with tagged Micrometer `Counter`/`Gauge` beans (Prometheus can't observe `AtomicLong`s, and the existing cron-reset actively fights Prometheus counter semantics).
- [x] A `data-testid` (or equivalent stable selector) on `CallPage.tsx`'s remote/self `<video>` elements — needed for a robust (non-locale-dependent) Playwright assertion; small frontend change, not a new file.
- [x] No existing smoke-test script for "all compose services report healthy" — covered manually via Task 2b's `docker compose ps` checkpoint instead of a dedicated script.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `docker compose up` starts entire system with all healthchecks passing | INFR-02 | Full stack (10 services incl. coturn) is impractical to assert purely via CI given coturn/TURN and cross-device demo intent | Run `docker compose up --build`, wait for all containers to report `healthy` via `docker compose ps`, confirm frontend loads at `http://localhost:8080` |
| Grafana dashboard renders real per-instance data during a scale demo | INFR-04 | Visual confirmation that panels are non-empty and split by instance is a human judgment call, not a scriptable assertion | Open Grafana at `http://localhost:3000` (or configured port), confirm "VDT WebRTC Overview" dashboard shows separate series for `backend-1`/`backend-2` while placing test calls |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < ~4 minutes
- [x] `nyquist_compliant: true` set in frontmatter (set by planner once PLAN.md tasks are finalized and this table's Task IDs are filled in)

**Approval:** approved 2026-07-03 — Task 2b's 5-step manual checkpoint (compose stack fully healthy, 1-1 call regression-free, Prometheus targets UP, Grafana dashboard live per-instance data, CI 4 jobs green) confirmed by the user.
