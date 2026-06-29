---
phase: 6
slug: horizontal-scaling
status: draft
nyquist_compliant: true
wave_0_complete: true
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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01 Task 1: PresenceSweeper + WsTestSupport refactor | 06-01 | 1 | SCAL-01, SCAL-02 | T-06-SC | No LocalPresenceService autowiring; compiler verifies contract | compile | `cd backend && ./mvnw -pl . compile -q 2>&1 \| tail -5` | Creates PresenceSweeper.java, modifies WsTestSupport.java | ⬜ pending |
| 06-01 Task 2: CrossInstanceCallTest RED scaffold | 06-01 | 1 | SCAL-01, SCAL-02 | T-06-01 | Tokens minted server-side; cross-instance test compiles and fails RED | integration (RED) | `cd backend && ./mvnw -pl . -Dtest=CrossInstanceCallTest test -DfailIfNoTests=false 2>&1 \| grep -E "(BUILD\|FAIL\|ERROR\|Tests run:[[:space:]]*[1-9])" \| tail -10` | Creates CrossInstanceCallTest.java | ⬜ pending |
| 06-02 Task 1: Redis impl beans (RedisConfig, RedisMessageRouter, etc.) | 06-02 | 2 | SCAL-01, SCAL-02 | T-06-02, T-06-03, T-06-04, T-06-SC | Redis channels internal; no package installs; ObjectMapper is tools.jackson | compile | `cd backend && ./mvnw -pl . compile -q 2>&1 \| tail -5` | Creates 6 new files; modifies 3 | ⬜ pending |
| 06-02 Task 2: PresenceWebSocketHandler route-map wiring + CrossInstanceCallTest GREEN | 06-02 | 2 | SCAL-01, SCAL-02 | T-06-02, T-06-05, T-06-06 | Route map key written from server-extracted JWT username; cross-instance kick reuses existing SessionSuperseded | integration (GREEN) | `cd backend && ./mvnw -pl . -Dtest=CrossInstanceCallTest test -DfailIfNoTests=false 2>&1 \| grep -E "(BUILD\|Tests run\|FAIL\|ERROR)" \| tail -10` | Modifies PresenceWebSocketHandler.java | ⬜ pending |
| 06-03 Task 1: nginx/conf.d/vdt.conf | 06-03 | 3 | SCAL-01 | T-06-07, T-06-08, T-06-09 | Upstream round-robin; no ip_hash; WS upgrade headers present | config grep | `grep -c "proxy_set_header Upgrade" D:/VDTWebRTC/VDT2026-WebRTC/nginx/conf.d/vdt.conf` | Creates nginx/conf.d/vdt.conf | ⬜ pending |
| 06-03 Task 2: docker-compose.yml backend-1/backend-2 + nginx | 06-03 | 3 | SCAL-01 | T-06-07, T-06-10 | Both backends internal (no host port); INSTANCE_ID set per instance | config grep | `grep -c "INSTANCE_ID:" D:/VDTWebRTC/VDT2026-WebRTC/docker-compose.yml` | Modifies docker-compose.yml | ⬜ pending |
| 06-04 Task 1: Full test suite green gate | 06-04 | 4 | SCAL-01, SCAL-02 | — | All prior automated tests must pass before human checkpoint | full suite | `cd backend && ./mvnw verify 2>&1 \| grep -E "(BUILD SUCCESS\|BUILD FAILURE\|Tests run)" \| tail -5` | No file changes | ⬜ pending |
| 06-04 Task 2: Manual browser demo (human verify) | 06-04 | 4 | SCAL-01 | T-06-11 | Two browsers on different instances complete a 1-1 call | manual | Human checkpoint — see `<how-to-verify>` in 06-04-PLAN.md | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Cross-instance integration test scaffold — two Spring contexts + shared Testcontainers Redis (D-06); `CollectingHandler` copied as static inner class in `CrossInstanceCallTest` (per RESEARCH Pattern 9). Created in Plan 06-01 Task 2.
- [x] Update `WsTestSupport.drainState()` so cleanup works against the Redis-backed `PresenceService` (RESEARCH Open Q #1). Resolved in Plan 06-01 Task 1: field changed to `protected PresenceService presence` (interface).

*Existing infrastructure (JUnit 5 + Testcontainers) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two browsers landing on different instances (nginx round-robin) complete a call | SCAL-01 | End-to-end browser + media path not automatable in unit/integration scope | `docker compose up` (nginx + backend-1/backend-2 + redis), open two browsers, confirm both hit different instances and a call connects |

*Automated coverage is the cross-instance integration test; the browser demo is the visual proof.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s (excluding keystone integration test)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
