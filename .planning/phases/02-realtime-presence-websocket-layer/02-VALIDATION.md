---
phase: 2
slug: realtime-presence-websocket-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-14
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (backend)** | JUnit 5 + `StandardWebSocketClient` (two-client integration) + Awaitility (async sweeper assertions) |
| **Framework (frontend)** | Vitest — **NOT yet installed** (Wave 0 installs) |
| **Config file** | backend: `pom.xml` (add Awaitility); frontend: `vitest.config.ts` (Wave 0) |
| **Quick run command** | `./backend/mvnw -f backend/pom.xml test -Dtest=PresenceWsTest` |
| **Full suite command** | `./backend/mvnw -f backend/pom.xml test` + `cd frontend && npx vitest run` |
| **Estimated runtime** | ~15-25s backend (WS context boot), ~3s frontend |

---

## Sampling Rate

- **After every task commit:** Run the relevant `-Dtest=` quick command
- **After every plan wave:** Run the full backend suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Filled by the planner per task. Each WS behavior must map to a `StandardWebSocketClient`
> integration test or an Awaitility-based async assertion.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-xx-xx | xx | 1 | AUTH-04 | T-02-01 | WS handshake without a valid JWT is rejected (no upgrade) | integration | `mvnw test -Dtest=WsHandshakeAuthTest` | ❌ W0 | ⬜ pending |
| 02-xx-xx | xx | 2 | PRES-01 | — | Online list pushed as snapshot to all sessions on join/leave | integration | `mvnw test -Dtest=PresenceBroadcastTest` | ❌ W0 | ⬜ pending |
| 02-xx-xx | xx | 2 | PRES-02 | — | User marked offline within ~60s after heartbeat stops | integration | `mvnw test -Dtest=PresenceTtlTest` | ❌ W0 | ⬜ pending |
| 02-xx-xx | xx | 2 | PRES-03 | T-02-02 | New session supersedes old: old session gets notice + close | integration | `mvnw test -Dtest=SingleSessionTest` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Add **Awaitility** dependency to `backend/pom.xml` (test scope) — for sweeper/offline async assertions
- [ ] Backend WS integration test scaffolding using `StandardWebSocketClient` (two fake clients against `@SpringBootTest(webEnvironment = RANDOM_PORT)`)
- [ ] Install **Vitest** + config on the frontend (not yet present) — for the WS reconnect-wrapper unit tests
- [ ] No Redis Testcontainer needed this phase (presence is local, D-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Online list visibly updates without page refresh across two browsers | PRES-01 | True realtime UX across separate browser contexts | Open two browsers, log in as two users, confirm each appears in the other's list within ~1s; close one, confirm it disappears within ~60s |
| Kick notice + redirect on second login | PRES-03 | Visual notice + navigation | Log in same user in a 2nd tab; confirm 1st tab shows notice and redirects to /login |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
