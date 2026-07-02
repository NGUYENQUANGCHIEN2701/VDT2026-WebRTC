---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 09
current_phase_name: monitoring-ci-cd-full-delivery
status: executing
stopped_at: Paused at 09-05 Task 2b checkpoint (docker compose + Grafana + CI manual verification) — Tasks 1-2 complete and committed, awaiting human approval
last_updated: "2026-07-02T08:17:18.500Z"
last_activity: 2026-07-02
last_activity_desc: Completed 09-04-PLAN.md (Playwright E2E 1-1 call + CI e2e job)
progress:
  total_phases: 9
  completed_phases: 3
  total_plans: 42
  completed_plans: 16
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-11)

**Core value:** Two users can make a stable realtime 1-1 peer-to-peer WebRTC video call. If everything else breaks, the 1-1 call must still work.
**Current focus:** Phase 09 — monitoring-ci-cd-full-delivery

## Current Position

Phase: 09 (monitoring-ci-cd-full-delivery) — EXECUTING
Status: Executing Phase 09
Next: Continue Phase 9 (Plan 09-05)
Last activity: 2026-07-02 — Completed 09-04-PLAN.md (Playwright E2E 1-1 call + CI e2e job)

Progress: [###░░░░░░░] 36% (15/42 plans; Phase 9 in progress — 4 plans done)

## Performance Metrics

**Velocity:**

- Total plans completed: 37
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Status |
|-------|-------|--------|
| 1. Foundation -- Auth, Roles & Project Skeleton | 4/4 | Complete |
| 2. Realtime Presence & WebSocket Layer | 3/3 | Complete |
| 3. 1-1 P2P Call Core & NAT Traversal | 5/5 | Complete |
| 4. Call Lifecycle & In-Call Experience | 7/7 | Complete |
| 5. Call History & Admin | 4/4 | Complete |
| 6. Horizontal Scaling | 4/4 | Complete |
| 7. Group Mesh Calls | 5/5 | Complete |
| 8. Screen Share, Recording & Device Control | 5/5 | Complete ✅ |
| 9. Monitoring, CI/CD & Full Delivery | 4/TBD | In progress |

**Recent Trend:**

- Last completed plan: 09-04 -- Playwright E2E 1-1 call + CI e2e job
- Next plan: 09-05

| Phase 09 P01 | 26min | 3 tasks | 9 files |
| Phase 09 P09-02 | 5min | 3 tasks | 8 files |
| Phase 09 P03 | 6min | 2 tasks | 2 files |
| Phase 09 P04 | 18min | 3 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: coturn + HTTPS/WSS merged into Phase 3 (call core); forced-relay test mode is part of phase success.
- [Roadmap]: `MessageRouter`/`PresenceService` abstractions built in Phase 2; Phase 6 swaps in Redis pub/sub.
- [Roadmap]: Server-authoritative call state machine in Redis (Phase 4) precedes history (5), scaling (6), and mesh (7).
- [Roadmap]: Phase 7 uses a separate room path so 1-1 CallService behavior remains intact.
- [Roadmap]: Phase 7 plans are complete: 5 waves covering RED tests, backend room state/signaling, frontend mesh core, UX, and full verification.
- [Roadmap]: Phase 8 plans are complete: 5 waves covering RED tests, foundation, recording engine, polish, and full verification.
- [Phase ?]: Boot 4 moved MeterRegistryCustomizer to org.springframework.boot.micrometer.metrics.autoconfigure (not the Boot 3 actuate.autoconfigure.metrics path)
- [Phase 09]: RoomService increments group-call metric once in handleLeave, not twice (handleDisconnect delegates to handleLeave) to avoid double-counting
- [Phase 09]: Dashboard todayStarted/Completed/Missed now derived live from MeterRegistry sums instead of removed AtomicLong counters — semantics shift from since-midnight to since-instance-start
- [Phase 09]: /actuator/prometheus added to SecurityConfig permitAll (Prometheus cannot present a JWT; internal-network-only per threat model T-09-01/T-09-02)
- [Phase 09]: CI docker-build job builds frontend image from repo-root context (-f frontend/Dockerfile .) since the Dockerfile COPYs nginx/conf.d/vdt.conf from outside frontend/
- [Phase ?]: Phase 09: E2E CI job seeds two fresh users per run via /api/auth/register HTTP calls (no pre-seeded fixtures) to avoid username collisions across repeated CI runs
- [Phase ?]: Phase 09: e2e CI job has no needs: dependency on backend/frontend/docker-build, runs fully independently for fast feedback
- [Phase ?]: Phase 09: 09-05 Task 1 fixed all 22 pre-existing frontend lint errors (react-hooks/purity, set-state-in-effect, refs, unused-vars) as in-scope work for the full-suite CI gate
- [Phase ?]: Phase 09: vitest.config.ts excludes e2e/** so Vitest never picks up the Playwright spec added in Plan 09-04
- [Phase ?]: Phase 09: 09-05 Playwright E2E run against a freshly rebuilt docker compose up --build stack (backend-1/backend-2/nginx) instead of bare local backend+vite-preview

### Pending Todos

- Phase 8 Wave 5 (08-05) COMPLETE. Plan and execute Phase 9 next.

### Blockers/Concerns

- Phase 9: Playwright E2E with fake media in CI requires careful Docker networking setup.
- Phase 9: coturn relay range must be mappable in Docker Compose (limit relay port range).
- Phase 9: Grafana provisioning as code (datasource + dashboards) needs validation.
- CrossInstanceRoomTest (Phase 7) flakes intermittently in full-suite runs — pre-existing timing-sensitive dual-WS-port race, not caused by 09-01; passes reliably in isolation

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260613-khs | Backend config (pom deps, application.yaml + docker profile, Flyway V1/V2) | 2026-06-13 | c7796ea | [260613-khs-backend-config](./quick/260613-khs-backend-config/) |
| 260613-kxw | Externalize DB/JWT credentials via env vars (.env.example, root .gitignore) | 2026-06-13 | 9678bda | [260613-kxw-env-config-credentials](./quick/260613-kxw-env-config-credentials/) |
| 260613-laz | Docker Compose (postgres + backend) + backend Dockerfile | 2026-06-13 | dd77b42 | [260613-laz-docker-compose-backend](./quick/260613-laz-docker-compose-backend/) |
| 260701-tkz | Fix group-call recording to mirror the on-screen layout instead of a fixed square grid | 2026-07-01 | 64912e8 | [260701-tkz-fix-group-call-recording-to-mirror-the-o](./quick/260701-tkz-fix-group-call-recording-to-mirror-the-o/) |
| 260701-u3j | Sync screen-share focus across all group-call participants (server-authoritative single-sharer lock + recording alignment) | 2026-07-01 | 1a33cbc | [260701-u3j-sync-screen-share-focus-across-all-group](./quick/260701-u3j-sync-screen-share-focus-across-all-group/) |
| 260702-3sd | Fix presence status not updating in realtime after a call ends (transition_call.lua/CallService missing presence-events publish) | 2026-07-01 | 2f4b33e | [260702-3sd-fix-presence-status-not-updating-in-real](./quick/260702-3sd-fix-presence-status-not-updating-in-real/) |
| 260702-677 | 1-1 call presentation-mode layout sync (remoteIsScreenSharing in callStore, symmetric sharer/viewer layout, recording sharer wiring) | 2026-07-01 | fee9e66 | [260702-677-add-presentation-mode-layout-sync-for-1-](./quick/260702-677-add-presentation-mode-layout-sync-for-1-/) |
| 260702-r84 | UX for getUserMedia permission-denied: retry button, delayed callee reject, audio-only continue | 2026-07-02 | 99616d6 | [260702-r84-toi-uu-ux-loi-getusermedia-bi-tu-choi-qu](./quick/260702-r84-toi-uu-ux-loi-getusermedia-bi-tu-choi-qu/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-02T08:17:18.492Z
Stopped at: Paused at 09-05 Task 2b checkpoint (docker compose + Grafana + CI manual verification) — Tasks 1-2 complete and committed, awaiting human approval
Resume file: .planning/phases/09-monitoring-ci-cd-full-delivery/09-05-PLAN.md
