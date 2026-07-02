---
phase: 09-monitoring-ci-cd-full-delivery
plan: 04
subsystem: testing
tags: [playwright, e2e, webrtc, github-actions, ci]

# Dependency graph
requires:
  - phase: 09-monitoring-ci-cd-full-delivery (plan 03)
    provides: .github/workflows/ci.yml with backend/frontend/docker-build parallel jobs
provides:
  - frontend/e2e/playwright.config.ts and one-to-one-call.spec.ts — real 2-context 1-1 P2P call E2E test
  - data-testid="remote-video"/"local-video" on CallPage.tsx for stable, locale-independent test selectors
  - .github/workflows/ci.yml e2e job — 4th independent CI job running the Playwright spec against directly-started backend+frontend (no docker compose, no coturn/nginx)
affects: []

# Tech tracking
tech-stack:
  added: ["@playwright/test ^1.61.1"]
  patterns: ["Two-context Playwright E2E with fake-media Chromium launch flags for real WebRTC media assertions", "E2E CI job started via GitHub Actions service containers instead of docker compose for faster, simpler dependency chain"]

key-files:
  created: [frontend/e2e/playwright.config.ts, frontend/e2e/one-to-one-call.spec.ts]
  modified: [frontend/package.json, frontend/package-lock.json, frontend/src/pages/CallPage.tsx, .github/workflows/ci.yml]

key-decisions:
  - "E2E job seeds two fresh users per run via direct HTTP POST to /api/auth/register (Date.now()+random suffix) rather than relying on pre-seeded fixture data, avoiding username collisions across repeated CI runs against the same Postgres"
  - "E2E job has no needs: dependency on backend/frontend/docker-build — runs fully independently for fast feedback, per 09-RESEARCH.md Open Question 2"
  - "JWT_SECRET in the e2e job is an explicit ci-only dummy string, never sourced from secrets.* or a real .env file"

requirements-completed: [INFR-06]

coverage:
  - id: D1
    description: "Playwright E2E test places a real 1-1 call between two fake-media Chromium contexts and asserts the remote <video> element receives actual decoded frames (videoWidth/videoHeight > 0, readyState >= 2)"
    requirement: "INFR-06"
    verification:
      - kind: other
        ref: "npx playwright test --list -c e2e/playwright.config.ts enumerates exactly 1 test with no config errors (verified: PASS)"
        status: pass
    human_judgment: true
    rationale: "Actually running the test requires a live backend + Postgres/Redis/RabbitMQ stack, which this local execution session did not stand up. Full pass/fail of the call assertion (real frame delivery) can only be confirmed by running the test against a live stack or observing the green e2e job in a real GitHub Actions run."
  - id: D2
    description: "e2e job runs as a 4th independent job in .github/workflows/ci.yml, using GitHub Actions service containers (no docker compose, no coturn/nginx)"
    requirement: "INFR-06"
    verification:
      - kind: other
        ref: "grep -c '^  e2e:' .github/workflows/ci.yml == 1; e2e job has no needs: key; services block defines exactly postgres/redis/rabbitmq (verified: PASS)"
        status: pass
    human_judgment: true
    rationale: "A genuinely green e2e job in GitHub Actions (backend jar boots against real service containers, frontend builds and serves, Playwright installs Chromium and completes the call) can only be confirmed by pushing and observing the Actions run — outside this local sandbox's scope."

# Metrics
duration: 18min
completed: 2026-07-02
status: complete
---

# Phase 09 Plan 04: Playwright E2E 1-1 Call + CI e2e Job Summary

**Playwright E2E test drives two independent fake-media Chromium contexts through a real 1-1 WebRTC call and asserts the remote `<video>` element actually receives decoded frames, wired as a 4th independent CI job that starts the backend jar + vite preview directly against GitHub Actions service containers (no docker compose, no coturn/nginx).**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-02T04:15:00Z
- **Completed:** 2026-07-02T04:33:13Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Added `data-testid="remote-video"`/`"local-video"` to `CallPage.tsx`'s `<video>` elements, additive alongside the existing Vietnamese `aria-label`s, giving Playwright a stable selector independent of UI copy
- Installed `@playwright/test` as a devDependency and added an `"e2e"` npm script; created `frontend/e2e/playwright.config.ts` with a `chromium-fake-media` project using `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`
- Wrote `frontend/e2e/one-to-one-call.spec.ts`: registers two fresh test users via `/api/auth/register`, logs both into independent browser contexts, drives the full caller/callee call flow (start call, incoming-call dialog, accept), and polls each page's remote `<video>` element via `waitForFunction` until `videoWidth > 0 && videoHeight > 0 && readyState >= 2` — the core proof that media flowed peer-to-peer
- Appended a 4th, fully independent `e2e` job to `.github/workflows/ci.yml`: GitHub Actions service containers for Postgres/Redis/RabbitMQ, builds and starts the backend jar directly (`wait-on` against `/actuator/health`), builds and serves the frontend via `vite preview`, installs Playwright's Chromium browser, runs the spec, and uploads the Playwright HTML report as an artifact on failure

## Task Commits

Each task was committed atomically:

1. **Task 1: Add data-testid selectors to CallPage.tsx video elements** - `fbc6337` (feat)
2. **Task 2: Playwright config + two-context 1-1 call E2E spec** - `759c8bb` (feat)
3. **Task 3: Append the e2e job to .github/workflows/ci.yml** - `65f94ef` (feat)

**Plan metadata:** (final commit follows this SUMMARY)

## Files Created/Modified
- `frontend/src/pages/CallPage.tsx` - Added `data-testid="remote-video"`/`"local-video"` attributes (additive, existing `aria-label`s unchanged)
- `frontend/package.json` - New `@playwright/test` devDependency, new `"e2e"` script
- `frontend/package-lock.json` - Lockfile update from `npm install --save-dev @playwright/test`
- `frontend/e2e/playwright.config.ts` - New file; `chromium-fake-media` project with fake-media launch args, `baseURL` from `E2E_BASE_URL`
- `frontend/e2e/one-to-one-call.spec.ts` - New file; 2-context 1-1 call E2E test asserting real remote video frame delivery
- `.github/workflows/ci.yml` - New 4th independent job `e2e` appended after `docker-build` (backend/frontend/docker-build jobs from Plan 09-03 unchanged — confirmed via `git diff` showing a purely additive hunk)

## Decisions Made
- Test users are seeded fresh per run (`Date.now()` + random suffix) via direct HTTP registration rather than relying on any pre-seeded fixture, avoiding username collisions on repeated CI runs against the same Postgres instance
- The `e2e` job intentionally has no `needs:` dependency on `backend`/`frontend`/`docker-build`, running fully in parallel for fast feedback (per 09-RESEARCH.md Open Question 2's recommendation)
- `JWT_SECRET` in the `e2e` job is a clearly-labeled CI-only dummy string (`ci-only-test-secret-min-32-characters-long`), never sourced from `${{ secrets.* }}` or the repo's real `.env`
- Followed `CallButtons.tsx`'s actual accessible names discovered during file reads: `AcceptButton` exposes `aria-label="Nhận cuộc gọi"` (used via `getByRole('button', { name: ... })`), and `LabeledHangUpButton` exposes its accessible name via `title="Kết thúc cuộc gọi / Rời phòng"` (used via `getByTitle(...)`) since `CallPage.tsx` renders the labeled variant, not the plain `HangUpButton`

## Deviations from Plan

None - plan executed exactly as written. All file paths, selectors, and env var names referenced in the plan's `<read_first>` blocks were confirmed present and unchanged during execution (`LoginPage.tsx` input `autocomplete` attributes, `OnlineUserRow.tsx` `button.home-call-btn`/`li.home-user-row`, `IncomingCallCard.tsx` `role="dialog"` `aria-labelledby="incoming-call-heading"`, `CallButtons.tsx` accessible names, `AuthController.java` public `/api/auth/register`, `application.yaml` env var names).

## Issues Encountered

`npm run lint` surfaces 22 pre-existing errors across files this plan did not touch (`MorePanel.tsx`, `useCallDuration.ts`, `AdminPage.tsx`, `GroupCallPage.tsx`, `callActions.ts`, `roomActions.ts`, `roomStore.ts`, and two `*.test.ts` files) — mostly `react-hooks/set-state-in-effect`/`react-hooks/purity`/`react-hooks/refs` findings from a newer eslint-plugin-react-hooks ruleset, plus a few unused-var errors. Confirmed via `git diff` that this plan's only change to a linted file (`CallPage.tsx`) is the two additive `data-testid` lines, and those lines introduce zero new lint findings. Per the scope-boundary rule, these pre-existing findings are out of scope for this plan and were left untouched — logged here rather than fixed. They will make the CI `frontend` job's `npm run lint` step (from Plan 09-03) fail on first real push regardless of this plan; that is a pre-existing condition, not something 09-04 introduced.

`npm audit` reports one high-severity transitive `undici` advisory pulled in via the pre-existing `jsdom` devDependency (`jsdom@29.1.1 -> undici@7.27.2`), confirmed via `npm ls undici` to be unrelated to the newly-added `@playwright/test`. Not auto-fixed — out of scope (pre-existing dependency, not introduced by this plan).

## User Setup Required

None - no external service configuration required for this plan's file changes. Full verification of both coverage deliverables (D1: the call assertion actually passing; D2: a genuinely green `e2e` CI job) requires either a live local Postgres/Redis/RabbitMQ + backend + frontend stack, or a real push/PR to GitHub — both flagged `human_judgment: true` above, consistent with how Plan 09-03's CI verification was also deferred to a real push.

## Next Phase Readiness
- `.github/workflows/ci.yml` now has all 4 jobs planned for Phase 9's CI/CD delivery scope (`backend`, `frontend`, `docker-build`, `e2e`)
- Recommended before the next real push: run `E2E_BASE_URL=http://localhost:4173 npm run e2e` locally against a running backend+Postgres+Redis+RabbitMQ+built frontend to confirm the call assertion passes end-to-end, since this session did not have a live stack available
- Pre-existing `npm run lint` failures (unrelated to this plan) will block the `frontend` CI job on first push — worth a follow-up quick task to clean up before relying on CI as a merge gate
- No blockers introduced by this plan

---
*Phase: 09-monitoring-ci-cd-full-delivery*
*Completed: 2026-07-02*
