---
phase: 09-monitoring-ci-cd-full-delivery
plan: 05
subsystem: infra
tags: [testing, eslint, react-hooks, vitest, playwright, docker-compose, docs]

# Dependency graph
requires:
  - phase: 09-monitoring-ci-cd-full-delivery (plans 01-04)
    provides: Micrometer metrics, full-stack compose + Prometheus/Grafana, GitHub Actions CI, Playwright E2E spec + CI job
provides:
  - Full backend (mvn verify, 91/91) + frontend (lint/test/build) + Playwright E2E suites all green as a single gate
  - docs/setup.md updated to describe the complete 9-service docker compose stack, Prometheus/Grafana URLs, GRAFANA_ADMIN_PASSWORD
affects: [09-VALIDATION.md closure, ROADMAP.md Phase 9 completion — pending Task 2b human checkpoint + Task 3]

# Tech tracking
tech-stack:
  added: []
  patterns: ["setState-in-effect moved into the event handler that triggers the state change, per React's react-hooks/set-state-in-effect rule", "Date.now() lazy useState initializer (() => Date.now()) instead of calling impure functions during render", "Vitest exclude: e2e/** so Playwright specs never enter the Vitest test runner"]

key-files:
  created:
    - .planning/phases/09-monitoring-ci-cd-full-delivery/09-05-SUMMARY.md
  modified:
    - frontend/src/hooks/useCallDuration.ts
    - frontend/src/pages/AdminPage.tsx
    - frontend/src/pages/CallPage.tsx
    - frontend/src/pages/GroupCallPage.tsx
    - frontend/src/realtime/callActions.ts
    - frontend/src/realtime/roomActions.ts
    - frontend/src/store/roomStore.ts
    - frontend/src/webrtc/PeerManager.test.ts
    - frontend/vitest.config.ts
    - frontend/.gitignore
    - frontend/src/components/call/MorePanel.tsx
    - docs/setup.md

key-decisions:
  - "Fixed all 22 pre-existing frontend lint errors as part of Task 1's full-suite gate (per this plan's explicit objective instruction), rather than deferring — the frontend CI job (Plan 09-03) hard-fails on `npm run lint`, so leaving them unfixed would permanently red the CI gate this phase exists to close out"
  - "AdminPage's filter-change pagination reset moved from a useEffect+setState pattern to React's recommended render-time state adjustment (compare current vs previous filter key during render, call setState conditionally in the render body) to satisfy react-hooks/set-state-in-effect without changing user-visible behavior"
  - "CallPage/GroupCallPage debug-panel stats reset (previously `setStats(null)` inside a useEffect keyed on debugOpen) moved into the Settings/MoreVertical icon's onClick handler itself, since DebugPanel only ever renders when debugOpen is true — functionally identical, removes the synchronous setState-in-effect"
  - "GroupCallPage's `selfVideoVersion` ref (always 0, never mutated, only read during render in 3 ParticipantTile streamVersion props) was dead code — removed rather than refactored, since react-hooks/refs correctly flagged reading a ref during render and the ref contributed nothing"
  - "vitest.config.ts gained `exclude: [...configDefaults.exclude, 'e2e/**']` — Plan 09-04 added frontend/e2e/one-to-one-call.spec.ts using @playwright/test's test(), which Vitest was incorrectly picking up and failing on ('Playwright Test did not expect test() to be called here') since no exclude existed for the e2e/ directory"
  - "Playwright E2E suite run against a rebuilt full `docker compose up --build` stack (backend-1/backend-2/nginx rebuilt with current code) rather than a bare local backend+vite-preview, since the full compose stack was already running healthy in this environment and sidesteps needing to read .env secrets directly — E2E_BASE_URL=http://localhost:8080 (nginx-fronted) satisfies the plan's 'locally-started backend+frontend' requirement"
  - "npm audit's 1 high-severity undici advisory (transitive via jsdom devDependency) is accepted as a documented risk, not fixed — dev-only test tooling, never shipped in the production build, and `npm audit fix` risked destabilizing the jsdom/vitest version pin without any production benefit"

requirements-completed: [INFR-02, INFR-04, INFR-05, INFR-06]

coverage:
  - id: D1
    description: "Backend full suite (`./mvnw -B verify`, incl. Testcontainers Redis cross-instance test) passes: 91/91 tests, BUILD SUCCESS"
    requirement: "INFR-05"
    verification:
      - kind: other
        ref: "cd backend && ./mvnw -B verify => Tests run: 91, Failures: 0, Errors: 0, Skipped: 0; BUILD SUCCESS"
        status: pass
    human_judgment: false
  - id: D2
    description: "Frontend lint/test/build suite passes: 0 eslint errors (down from 22 pre-existing), 61/61 Vitest tests, tsc+vite build succeeds"
    requirement: "INFR-05"
    verification:
      - kind: other
        ref: "cd frontend && npm run lint (0 output, exit 0) && npm run test:run (Test Files 7 passed, Tests 61 passed) && npm run build (BUILD SUCCESS, dist/ produced)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Playwright E2E 1-1 call test passes against a live backend+frontend stack, proving real remote-video frame delivery"
    requirement: "INFR-06"
    verification:
      - kind: e2e
        ref: "cd frontend && E2E_BASE_URL=http://localhost:8080 E2E_BASE_URL_API=http://localhost:8080 npm run e2e => 1 passed (2.8s), run against a freshly rebuilt `docker compose up --build` stack (backend-1/backend-2/nginx)"
        status: pass
    human_judgment: false
  - id: D4
    description: "docs/setup.md updated to describe the full 9-service docker compose stack (frontend/nginx, Prometheus localhost:9090, Grafana localhost:3000, GRAFANA_ADMIN_PASSWORD env var), stale 'Frontend chưa nằm trong Compose' note removed"
    requirement: "INFR-02"
    verification:
      - kind: other
        ref: "test \"$(grep -c 'Frontend chưa nằm trong Compose' docs/setup.md)\" -eq 0 && grep -q 'localhost:9090' docs/setup.md && grep -q 'localhost:3000' docs/setup.md && grep -q GRAFANA_ADMIN_PASSWORD docs/setup.md => all pass"
        status: pass
    human_judgment: false
  - id: D5
    description: "Manual docker compose + Grafana + CI checkpoint (5 steps: compose healthy, 1-1 call regression check, Prometheus targets UP, Grafana live dashboard, CI 4 jobs green) — Task 2b"
    requirement: "INFR-02, INFR-04, INFR-06"
    verification: []
    human_judgment: true
    rationale: "Explicitly a blocking human-verify checkpoint per the plan (gate=\"blocking\") — requires a human to open Grafana/Prometheus/the app in a browser and place a real call, and to push/observe a real GitHub Actions run. Approved 2026-07-03 by the user; all 5 steps confirmed passing."

# Metrics
duration: (spans multiple sessions — paused at Task 2b, resumed and closed 2026-07-03)
completed: 2026-07-03
status: complete
---

# Phase 09 Plan 05: Full suite gate + docs closure Summary

**Fixed all 22 pre-existing frontend lint errors blocking the CI gate, got backend (91/91) + frontend (lint/test/build) + Playwright E2E all green, closed out docs/setup.md for the full 9-service stack, and — after the user approved the Task 2b manual checkpoint — closed 09-VALIDATION.md and marked Phase 9 complete in ROADMAP.md.**

## Performance

- **Tasks completed:** 3 of 3 (Task 1: full suite gate, Task 2: docs/setup.md update, Task 3: 09-VALIDATION.md + ROADMAP.md closure)
- **Task 2b:** BLOCKING human-verify checkpoint — approved 2026-07-03 by the user (all 5 steps passing)
- **Task 3:** Complete — 09-VALIDATION.md's 4 TBD rows filled with real Plan/Wave/Task IDs (all ✅ green), frontmatter set to `status: verified`/`nyquist_compliant: true`; ROADMAP.md Phase 9 marked `[x]` complete, 5/5 plans, Progress table updated

## Accomplishments
- Fixed all 22 pre-existing `npm run lint` errors flagged as a known issue in Plan 09-04's SUMMARY — mostly `react-hooks/purity` (impure `Date.now()` calls during render), `react-hooks/set-state-in-effect` (synchronous `setState` inside effect bodies), `react-hooks/refs` (reading a ref's `.current` during render), and `@typescript-eslint/no-unused-vars` findings
- Added `exclude: ['e2e/**']` to `frontend/vitest.config.ts` — Vitest was picking up `frontend/e2e/one-to-one-call.spec.ts` (a Playwright spec) and failing with "Playwright Test did not expect test() to be called here"
- Ran the full backend suite: `./mvnw -B verify` → **91/91 tests, BUILD SUCCESS** (confirmed the `CrossInstanceRoomTest` failure seen on one run was the documented pre-existing Phase 7 flake — failed once, passed on immediate isolated retry, passed again on a full-suite re-run)
- Ran the full frontend suite: `npm run lint` (clean, 0 errors) + `npm run test:run` (61/61 passed, 7 test files) + `npm run build` (tsc + vite build succeeded)
- Ran the Playwright E2E suite (`npm run e2e`) against a freshly rebuilt `docker compose up --build` stack (backend-1/backend-2/nginx rebuilt with current working-tree code) — **1/1 passed**, confirming real remote-video frame delivery through nginx-fronted signaling
- `docs/setup.md` was already correctly updated for the full 9-service stack in a prior session (commit `00111b8`) — re-verified all 3 acceptance-criteria greps pass

## Task Commits

1. **Task 1: Full automated suite gate** — `43ff8c3` (fix, prior session: E2E test stabilization — selector fix, context-close robustness, axios baseURL undefined guard) + `1dffa89` (fix, this session: resolve all 22 pre-existing lint errors + Vitest e2e/ exclude)
2. **Task 2: Update docs/setup.md for the full 9-service stack** — `00111b8` (docs, prior session)
3. **Task 2b: Manual checkpoint** — reached, not yet approved (this SUMMARY captures state at the pause point)

_Note: Task 1's work spans two commits because a prior session (before an interruption/restart) had already run the E2E suite against a live stack and fixed real bugs found there (incoming-call button selector, context-close timeout, axios baseURL). This session picked up from that point, verified those fixes were correct, then completed the remaining lint-error portion of Task 1's gate and re-ran all three suites clean._

## Files Created/Modified
- `frontend/src/hooks/useCallDuration.ts` — lazy `useState(() => Date.now())`; removed synchronous `setNow()` call from the connectedAt effect, compensated with an `effectiveNow = Math.max(now, connectedAt)` clamp so duration still displays immediately on connect
- `frontend/src/pages/AdminPage.tsx` — pagination filter-reset moved from `useEffect` to render-time state adjustment (track `prevFilterKey`, compare during render); mount-time `reload()` deferred via `Promise.resolve().then(reload)` so `setLoading(true)` isn't called synchronously inside the effect body
- `frontend/src/pages/CallPage.tsx` — lazy `Date.now()` initializers; debug-panel stats reset moved into the Settings icon's `onClick`; recording download filename computed once in `stopRecording()` (event handler) instead of at render time
- `frontend/src/pages/GroupCallPage.tsx` — same `Date.now()`/debug-panel/download-name fixes as CallPage; removed the dead `selfVideoVersion` ref (always 0, never mutated) that was triggering `react-hooks/refs` at 3 render sites
- `frontend/src/realtime/callActions.ts`, `frontend/src/realtime/roomActions.ts` — removed unused `catch (err)` bindings (bare `catch {}`)
- `frontend/src/store/roomStore.ts` — `removeMember` rewritten without an unused destructured binding
- `frontend/src/webrtc/PeerManager.test.ts` — removed unused mock constructor parameter
- `frontend/src/components/call/MorePanel.tsx` — replaced `(window as any).webkitAudioContext` with a typed cast
- `frontend/vitest.config.ts` — added `exclude: [...configDefaults.exclude, 'e2e/**']`
- `frontend/.gitignore` — added `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache` (Playwright runtime artifacts)
- `docs/setup.md` — verified already correct (prior session's `00111b8`): 9-service list, Prometheus/Grafana URLs, `GRAFANA_ADMIN_PASSWORD` env var table row, stale frontend-not-in-compose note removed

## Decisions Made
See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vitest was executing the Playwright e2e spec and failing**
- **Found during:** Task 1, first `npm run test:run` attempt
- **Issue:** `frontend/e2e/one-to-one-call.spec.ts` (added in Plan 09-04) uses `@playwright/test`'s `test()` global; without a Vitest `exclude` for `e2e/**`, Vitest's own test discovery picked up the file and crashed with "Playwright Test did not expect test() to be called here"
- **Fix:** Added `exclude: [...configDefaults.exclude, 'e2e/**']` to `frontend/vitest.config.ts`
- **Files modified:** `frontend/vitest.config.ts`
- **Verification:** `npm run test:run` now shows 7 test files (not 8), 61/61 passing, no e2e spec picked up
- **Committed in:** `1dffa89`

**2. [Rule 1 - Bug] 22 pre-existing frontend lint errors, explicitly in-scope per this plan's objective**
- **Found during:** Task 1, `npm run lint`
- **Issue:** As flagged in advance in this plan's objective (carried over from Plan 09-04's SUMMARY "Issues Encountered"), 22 `react-hooks/purity`, `react-hooks/set-state-in-effect`, `react-hooks/refs`, and `@typescript-eslint/no-unused-vars` errors existed across 8 files unrelated to Phase 9's own feature work, but block the frontend CI job's lint step
- **Fix:** See Files Created/Modified above — each error fixed with a behavior-preserving pattern (lazy state initializers, moving setState calls into the event handlers that trigger them, removing genuinely dead code, removing unused bindings)
- **Files modified:** 8 files listed above
- **Verification:** `npm run lint` → 0 errors, 0 warnings, exit 0
- **Committed in:** `1dffa89`

**3. [Rule 1 - Bug] Playwright test-results/ directory left untracked after running the E2E suite**
- **Found during:** Task 1, post-E2E-run `git status`
- **Issue:** Running `npm run e2e` generates `frontend/test-results/.last-run.json`, previously not gitignored
- **Fix:** Added `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache` to `frontend/.gitignore`
- **Files modified:** `frontend/.gitignore`
- **Verification:** `git status --porcelain -- frontend/test-results/` now shows nothing
- **Committed in:** `1dffa89`

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs/config gaps blocking the full-suite gate this plan exists to run)
**Impact on plan:** All three were necessary preconditions for Task 1's own acceptance criteria ("all 3 suites green") to hold. No scope creep beyond making the existing suites actually pass.

## Issues Encountered

- `CrossInstanceRoomTest.crossInstance_competingFifthJoinStillHasSingleRoomFullLoser` failed on one `mvn verify` run, then passed both on an immediate isolated re-run (`-Dtest=CrossInstanceRoomTest`) and on a full-suite re-run. This matches the pre-existing Phase 7 flake already documented in `09-01-SUMMARY.md` and `STATE.md`'s Blockers/Concerns ("timing-sensitive dual-WS-port race, not caused by 09-01; passes reliably in isolation") — not a regression introduced by this plan. The final `mvn verify` run used for this SUMMARY's D1 evidence was clean (91/91).
- `npm audit` reports 1 high-severity `undici` advisory, transitive via the `jsdom` devDependency (test environment only, never shipped in the production build). Per this plan's explicit objective guidance, this is documented here as an accepted risk rather than fixed — `npm audit fix` was not run, since it risks an unplanned `jsdom`/Vitest version bump with no production-code benefit.
- The working tree during this session contained ~30 unrelated modified/untracked files belonging to the user's own separate in-progress feature (Google Sign-In + forgot/reset password: `GoogleIdentity.java`, `GoogleTokenVerifier.java`, `PasswordResetToken*.java`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `V4__password_reset_and_google_login.sql`, and modifications to `AuthController`/`AuthService`/`User`/`LoginPage`/`RegisterPage`/`App.tsx`/`docker-compose.yml`/`docs/setup.md`/`.env.example`). These were deliberately left untouched, unstaged, and uncommitted by this plan's commits — they landed on `main` as the user's own separate commit (`58f56ee feat(auth): add forgot/reset password flow and Google Sign-In`) shortly after this plan's `1dffa89` commit, confirming they were never part of this plan's scope.

## User Setup Required

None. Task 2b's human-verify checkpoint was approved 2026-07-03.

## Next Phase Readiness

Phase 9 is CLOSED. Next up: Phase 10 (Email Verification & Real Password-Reset Delivery) — feature code already exists in the codebase (`EmailVerificationService`, `EmailVerificationToken`, OTP-gated login, forgot-password email flow), confirmed present ahead of any formal GSD plan/summary trail for that phase; see STATE.md for how that phase's retroactive closure was handled.

---
*Phase: 09-monitoring-ci-cd-full-delivery*
*Status: CLOSED — Task 3 complete 2026-07-03*
