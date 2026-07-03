---
phase: quick-260703-ejk
plan: 01
subsystem: infra
tags: [spring-boot, virtual-threads, hikaricp, tomcat, postgresql, performance]

# Dependency graph
requires:
  - phase: spike-002
    provides: k6 WS capacity ramp finding a platform-thread ceiling (8808 peak threads)
  - phase: spike-002b
    provides: virtual-threads ramp proving the fix and exposing the next bottleneck (HikariCP pool exhaustion)
provides:
  - "spring.threads.virtual.enabled: true in application.yaml"
  - "spring.datasource.hikari.maximum-pool-size: ${DB_HIKARI_MAX_POOL_SIZE:20} in application.yaml"
affects: [phase-09-monitoring-ci-cd, future-load-testing]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Spike-validated config changes documented with an inline comment citing the spike and its measured numbers"]

key-files:
  created: []
  modified:
    - backend/src/main/resources/application.yaml

key-decisions:
  - "Virtual threads enabled unconditionally (hardcoded true, no env-var wrapper) — matches existing hardcoded booleans (flyway.enabled, show-sql) since this is an engineering decision, not a per-deployment tunable"
  - "HikariCP max-pool-size set to 20 via env-var placeholder (DB_HIKARI_MAX_POOL_SIZE), doubling Boot's undocumented default of 10, staying under Postgres max_connections=100 with both backend-1/backend-2 replicas (2x20=40)"

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "spring.threads.virtual.enabled: true added to application.yaml, applying to all Spring profiles"
    verification:
      - kind: other
        ref: "grep -A2 virtual: application.yaml | grep -c 'enabled: true' -> 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "spring.datasource.hikari.maximum-pool-size: ${DB_HIKARI_MAX_POOL_SIZE:20} added to application.yaml"
    verification:
      - kind: other
        ref: "grep -c DB_HIKARI_MAX_POOL_SIZE:20 application.yaml -> 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "Backend test suite (./mvnw test) shows no NEW regression from the two config changes; all failures traced to pre-existing, unrelated conditions"
    verification:
      - kind: integration
        ref: "./mvnw test (99 tests: 91 pass, 5 fail, 3 error — all 8 pre-existing/unrelated per root-cause analysis below)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-03
status: complete
---

# Phase quick-260703-ejk: Enable Virtual Threads and Raise HikariCP Pool Size Summary

**Enabled Spring Boot 4 virtual-threads mode and doubled HikariCP's max pool size (10 -> 20) in `application.yaml`, turning two spike-validated benchmark findings (spikes 002 / 002b) into shipped config with zero code changes.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-03T03:47:00Z
- **Completed:** 2026-07-03T03:59:00Z
- **Tasks:** 3 (2 config edits + 1 verification run)
- **Files modified:** 1 (`backend/src/main/resources/application.yaml`)

## Accomplishments
- `spring.threads.virtual.enabled: true` added under `spring:` (siblings of `application:`/`data:`), with an inline comment citing spike 002b's measured improvement (ws_connecting <400ms to 4000 connections vs 30-50s on platform threads).
- `spring.datasource.hikari.maximum-pool-size: ${DB_HIKARI_MAX_POOL_SIZE:20}` added under `spring.datasource:`, with an inline comment citing spike 002b's `HikariPool-1 ... timed out after 30353ms` finding at the old default of 10.
- Ran the full backend test suite (`./mvnw test`, 99 tests) to confirm no regression from the two changes; root-caused all 8 failing/erroring tests to pre-existing, unrelated conditions (see below) — zero failures traceable to virtual threads or the Hikari pool change.

## Task Commits

1. **Task 1 + Task 2: Enable virtual threads + raise HikariCP pool size** - `d2ada5b` (perf) — both edits landed in a single commit since they touch the same file and were reviewed together per the plan's commit-message constraint.
3. **Task 3: Run backend test suite** - verification only, no commit (as specified).

**Plan metadata:** pending (orchestrator commits SUMMARY/STATE/ROADMAP separately)

## Files Created/Modified
- `backend/src/main/resources/application.yaml` - Added `spring.threads.virtual.enabled: true` and `spring.datasource.hikari.maximum-pool-size: ${DB_HIKARI_MAX_POOL_SIZE:20}`; no other line changed (confirmed via `git diff`, 5 insertions, 0 deletions).

## Decisions Made
- Virtual threads: hardcoded `true`, not env-var wrapped — an unconditional engineering decision, consistent with other hardcoded booleans already in the file.
- HikariCP pool size: env-var wrapped (`DB_HIKARI_MAX_POOL_SIZE:20`) — a per-deployment tunable, consistent with the file's existing convention (`CALL_RING_TIMEOUT_SECONDS`, `RATE_LIMIT_OTP_MAX_REQUESTS`, etc.).
- Only `maximum-pool-size` was added to the `hikari:` block — no `minimum-idle` or `connection-timeout` override, per the plan's explicit scope limit.

## Deviations from Plan

None - plan executed exactly as written. Both config keys were added exactly as specified (key names, placement, env-var convention, inline comments), and no other file was touched.

## Issues Encountered

**`./mvnw test` produced 5 failures + 3 errors (8/99 tests) — all root-caused to pre-existing, unrelated conditions, NOT this plan's config change:**

1. **7 of 8 (AdminLockTest x4, CallHistoryApiTest x3) — caused by the pre-existing, already-uncommitted deletion of `backend/src/test/resources/application-test.yaml` and `application.properties`.** Root cause traced by reading source: `AuthController.register()` calls `rateLimitService.enforce("register", clientIp)` (backend/src/main/java/com/vdt/webrtc/auth/AuthController.java:48), and `RateLimitService` reads `app.rate-limit.otp-max-requests` (`@Value` default `5`) / `otp-window-seconds` (default `900`) (backend/src/main/java/com/vdt/webrtc/auth/RateLimitService.java:21-22). The now-deleted test-profile files previously relaxed these to `10000`/`1` (see `git show d1d5c63`, commit message: "test(auth): relax rate limits in test profile ... so the full test suite can call register/resend-otp/forgot-password freely without hitting the fixed-window Redis counter"). With those files gone, the whole `./mvnw test` run shares one client IP against the production default of 5 register calls per 900s window across the entire Surefire JVM run — once that cap is hit, later `/api/auth/register` calls in `AdminLockTest`/`CallHistoryApiTest` are silently rate-limited, so the test users are never created, cascading into `login` returning 401 (user not found) and `adminToken()`'s `orElseThrow()` throwing `NoSuchElementException`. This is exactly the scenario flagged in the plan's `<constraints_critical>` as out-of-scope and pre-existing.
2. **1 of 8 (`CrossInstanceRoomTest.crossInstance_competingFifthJoinStillHasSingleRoomFullLoser`) — documented pre-existing flake.** Already tracked in `.planning/STATE.md` Blockers/Concerns: "CrossInstanceRoomTest (Phase 7) flakes intermittently in full-suite runs — pre-existing timing-sensitive dual-WS-port race, not caused by 09-01; passes reliably in isolation."
3. **Zero new failures attributable to this plan's changes.** Grepped the full test-run log for Hikari/pool/thread-related symptoms (`HikariPool`, `timed out`, `connection is not available`, `virtual thread`, `carrier`) — the only Hikari log lines are normal pool start/shutdown lifecycle messages across the various `@SpringBootTest` contexts; no exhaustion, no timeouts, no pinning symptoms. This matches the plan's expectation (spike 002b's own ramp exercised up to 4000 concurrent connections through the same code path with no pinning issues beyond the now-mitigated pool-exhaustion finding).

**Test run summary:** `Tests run: 99, Failures: 5, Errors: 3` (BUILD FAILURE) — 91 tests passed; all 8 non-passing tests traced to the two pre-existing, out-of-scope conditions above, none to `spring.threads.virtual.enabled` or `spring.datasource.hikari.maximum-pool-size`.

## User Setup Required

None - no external service configuration required. The new `DB_HIKARI_MAX_POOL_SIZE` env var is optional (defaults to 20); no `.env`/deployment change is required to pick up either new key.

## Next Phase Readiness

- Both spike-validated config changes are live in `application.yaml` for all profiles (default/dev/docker) — no profile file overrides either new key.
- The pre-existing rate-limit test-profile file deletions (unrelated to this plan) remain in the working tree exactly as found; they are a separate, already-known cleanup item, not resolved by this plan and not committed here.
- No action required before resuming Phase 09 (monitoring-ci-cd-full-delivery), which was paused at 09-05's checkpoint independently of this quick task.

## Self-Check: PASSED

- FOUND: backend/src/main/resources/application.yaml
- FOUND: .planning/quick/260703-ejk-enable-virtual-threads-and-increase-hika/260703-ejk-SUMMARY.md
- FOUND commit: d2ada5b

---
*Phase: quick-260703-ejk*
*Completed: 2026-07-03*
