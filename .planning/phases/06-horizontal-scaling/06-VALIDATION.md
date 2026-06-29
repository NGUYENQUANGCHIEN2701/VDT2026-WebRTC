---
phase: 6
slug: horizontal-scaling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-29
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | JUnit 5 (Jupiter) + Mockito/AssertJ + Spring Test + Testcontainers (Redis) |
| **Config file** | backend/pom.xml (spring-boot-starter-test, testcontainers already present) |
| **Quick run command** | `cd backend && ./mvnw -q -Dtest=<ClassName> test` |
| **Full suite command** | `cd backend && ./mvnw verify` |
| **Estimated runtime** | ~minutes (Testcontainers Redis spin-up dominates) |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched test class
- **After every plan wave:** Run `./mvnw verify`
- **Before `/gsd-verify-work`:** Full suite must be green, including the cross-instance integration test (D-06)
- **Max feedback latency:** ~120 seconds (unit/slice tests); the cross-instance test is the keystone gate

---

## Per-Task Verification Map

> Filled by the planner against the generated PLAN.md task IDs. The keystone row is the
> cross-instance signaling test (SCAL-01 success criterion #3).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | SCAL-01 | — | Cross-instance call connects via Redis pub/sub routing | integration | `./mvnw -Dtest=*CrossInstance* test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SCAL-02 | — | Presence + busy consistent regardless of instance | integration | `./mvnw -Dtest=*Presence*Redis* test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Cross-instance integration test scaffold — two Spring contexts + shared Testcontainers Redis (D-06); requires extracting `CollectingHandler` to a shared test class (per RESEARCH).
- [ ] Update `WsTestSupport.drainState()` so cleanup works against the Redis-backed `PresenceService` (per RESEARCH open question).

*Existing infrastructure (JUnit 5 + Testcontainers) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two browsers landing on different instances (nginx round-robin) complete a call | SCAL-01 | End-to-end browser + media path not automatable in unit/integration scope | `docker compose up` (nginx + backend-1/backend-2 + redis), open two browsers, confirm both hit different instances and a call connects |

*Automated coverage is the cross-instance integration test; the browser demo is the visual proof.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s (excluding keystone integration test)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
