---
phase: 4
slug: call-lifecycle-in-call-experience
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 04-RESEARCH.md "Validation Architecture". Planner populates the Per-Task
> Verification Map; executor flips Status as tasks complete.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Backend framework** | JUnit 5 + Mockito + AssertJ (spring-boot-starter-test); Testcontainers Redis for state-machine integration |
| **Frontend framework** | Vitest 3.x + React Testing Library (jsdom) |
| **Config file** | backend: `backend/pom.xml` · frontend: `frontend/vitest.config.ts` (exists from Phase 3) |
| **Quick run command** | backend: `cd backend && ./mvnw -q test -Dtest=Call*` · frontend: `cd frontend && npx vitest run src/store src/webrtc` |
| **Full suite command** | backend: `cd backend && ./mvnw verify` · frontend: `cd frontend && npx vitest run` |
| **Estimated runtime** | ~90s backend (Testcontainers Redis spin-up) · ~15s frontend |

---

## Sampling Rate

- **After every task commit:** Run the quick run command for the touched side (backend or frontend)
- **After every plan wave:** Run the full suite command for the touched side
- **Before `/gsd-verify-work`:** Both full suites green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

> Planner fills one row per task. Key concurrency behaviors (glare, busy, missed-timeout,
> grace-drop) MUST have automated 2-client integration coverage per RESEARCH Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-XX-XX | XX | N | CALL-0X | T-04-XX / — | {expected behavior} | unit/integration | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Testcontainers Redis fixture (`@ServiceConnection`) for CallStateMachine integration tests
- [ ] CAS Lua-script unit harness (create_call / transition_call atomicity)
- [ ] 2-client `StandardWebSocketClient` test scaffold for glare/busy/missed/grace flows
- [ ] Frontend: callStore/PeerManager test stubs for new state transitions + ICE-restart

*Refined by planner against the final task list.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real 2-device call across LAN over WSS | MEDIA-06, STAB-02 | Needs real cameras + real network blip | Two devices on LAN via mkcert HTTPS; place call, toggle Wi-Fi off ~10s, confirm reconnect overlay then recovery |
| ICE restart recovers media on real NAT | STAB-02 | Real network failure hard to simulate in CI | Force `disconnected` (toggle network), observe restartIce reconnect within grace |
| Ringtone audio playback | CALL-02 | Audio output not assertable in jsdom | Manual: incoming call plays ringtone, stops on accept/reject/timeout |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
