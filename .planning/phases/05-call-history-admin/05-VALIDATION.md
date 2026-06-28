---
phase: 5
slug: call-history-admin
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-28
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `05-RESEARCH.md` §Validation Architecture. The planner fills the
> Per-Task Verification Map with real task IDs; the Nyquist auditor closes gaps.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | JUnit 5 (via `spring-boot-starter-test`) + Testcontainers (Postgres, Redis, RabbitMQ) + Awaitility |
| **Config file** | `TestcontainersConfiguration.java` (extend with `RabbitMQContainer` `@ServiceConnection`) |
| **Quick run command** | `./mvnw test -pl backend -Dtest=CallHistoryConsumerTest,AdminServiceTest -DfailIfNoTests=false` |
| **Full suite command** | `./mvnw verify -pl backend` |
| **Estimated runtime** | ~120 seconds (Testcontainers spin-up dominates) |

---

## Sampling Rate

- **After every task commit:** Run `./mvnw test -pl backend -Dtest=CallHistoryConsumerTest,AdminServiceTest -DfailIfNoTests=false`
- **After every plan wave:** Run `./mvnw verify -pl backend`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

> Planner populates Task ID / Plan / Wave columns from the generated PLAN.md files.
> Requirement → behavior → command rows are pre-seeded from RESEARCH.md.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | HIST-01 | — | Publish event after terminal transition; broadcast NOT blocked | integration | `./mvnw test -Dtest=CallHistoryPublishTest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HIST-01 | — | `busy` outcome does NOT publish any event | unit | `./mvnw test -Dtest=CallHistoryPublisherTest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HIST-02 | — | User retrieves own history newest-first with correct per-side direction | integration | `./mvnw test -Dtest=CallHistoryApiTest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HIST-02 | — | Cursor pagination returns correct page with hasNextPage | integration | `./mvnw test -Dtest=CallHistoryApiTest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HIST-03 | — | Duplicate delivery of same event → single logical record (idempotent) | integration | `./mvnw test -Dtest=CallHistoryConsumerTest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HIST-03 | — | Consumer failure after N retries routes to DLQ, not lost | integration | `./mvnw test -Dtest=CallHistoryConsumerTest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-01 | — | Lock endpoint sets locked=true; future login returns 401/403 | integration | `./mvnw test -Dtest=AdminLockTest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-01 | — | Lock on connected user closes WS session (force-disconnect) | integration | `./mvnw test -Dtest=AdminLockWsTest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-01 | — | Admin cannot lock/demote own account — rejected | unit | `./mvnw test -Dtest=AdminServiceTest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-02 | — | System-wide history returns all calls (both parties shown), filter by username | integration | `./mvnw test -Dtest=AdminHistoryApiTest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-03 | — | Dashboard returns correct counts from Redis + Micrometer | integration | `./mvnw test -Dtest=AdminDashboardApiTest` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/.../history/CallHistoryConsumerTest.java` — HIST-01/03 async pipeline + idempotency + DLQ
- [ ] `backend/.../history/CallHistoryPublisherTest.java` — HIST-01 fire-and-forget; `busy` NOT published
- [ ] `backend/.../history/CallHistoryApiTest.java` — HIST-02 user endpoint + cursor pagination
- [ ] `backend/.../admin/AdminLockTest.java` — ADMN-01 lock/unlock REST + login block
- [ ] `backend/.../admin/AdminLockWsTest.java` — ADMN-01 WS force-close on lock
- [ ] `backend/.../admin/AdminServiceTest.java` — ADMN-01 self-protection (unit)
- [ ] `backend/.../admin/AdminHistoryApiTest.java` — ADMN-02 system-wide history
- [ ] `backend/.../admin/AdminDashboardApiTest.java` — ADMN-03 dashboard counts
- [ ] `TestcontainersConfiguration.java` (update) — add `RabbitMQContainer` bean with `@ServiceConnection`
- [ ] `pom.xml` — add `org.testcontainers:rabbitmq` test-scope dependency

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Call-history UI renders per-day groups, direction icons, per-side labels | HIST-02 | Visual/UX; depends on real 2-browser call producing rows | Place a real call between two accounts, end it, open History, confirm grouping + direction + outcome label match viewer perspective |
| Locking a mid-call user surfaces as grace→`dropped` on surviving peer | ADMN-01 | Requires live WS + active call across two browsers | Start a call; admin locks one party; confirm the other peer transitions through Phase 4 grace→dropped |
| Dashboard reads clearly during live demo (~5s refresh, big stat cards) | ADMN-03 | Visual polling cadence | Open dashboard, trigger calls, confirm counts update within ~5s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
