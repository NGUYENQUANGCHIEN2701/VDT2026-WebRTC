---
phase: 05-call-history-admin
reviewed: 2026-06-28T00:00:00Z
depth: standard
files_reviewed: 44
files_reviewed_list:
  - backend/pom.xml
  - backend/src/main/java/com/vdt/webrtc/admin/AdminController.java
  - backend/src/main/java/com/vdt/webrtc/admin/AdminService.java
  - backend/src/main/java/com/vdt/webrtc/admin/dto/DashboardDto.java
  - backend/src/main/java/com/vdt/webrtc/call/CallService.java
  - backend/src/main/java/com/vdt/webrtc/call/CallSnapshot.java
  - backend/src/main/java/com/vdt/webrtc/call/CallStateRepository.java
  - backend/src/main/java/com/vdt/webrtc/common/GlobalExceptionHandler.java
  - backend/src/main/java/com/vdt/webrtc/config/CorsConfig.java
  - backend/src/main/java/com/vdt/webrtc/config/RabbitMqConfig.java
  - backend/src/main/java/com/vdt/webrtc/history/CallHistory.java
  - backend/src/main/java/com/vdt/webrtc/history/CallHistoryConsumer.java
  - backend/src/main/java/com/vdt/webrtc/history/CallHistoryEvent.java
  - backend/src/main/java/com/vdt/webrtc/history/CallHistoryPublisher.java
  - backend/src/main/java/com/vdt/webrtc/history/CallHistoryRepository.java
  - backend/src/main/java/com/vdt/webrtc/history/CallHistoryService.java
  - backend/src/main/java/com/vdt/webrtc/history/HistoryController.java
  - backend/src/main/java/com/vdt/webrtc/history/dto/AdminHistoryRow.java
  - backend/src/main/java/com/vdt/webrtc/history/dto/HistoryPageResponse.java
  - backend/src/main/java/com/vdt/webrtc/history/dto/HistoryRow.java
  - backend/src/main/java/com/vdt/webrtc/metrics/CallMetrics.java
  - backend/src/main/resources/application.yaml
  - backend/src/main/resources/db/migration/V3__call_history.sql
  - backend/src/test/java/com/vdt/webrtc/TestcontainersConfiguration.java
  - backend/src/test/java/com/vdt/webrtc/admin/AdminDashboardApiTest.java
  - backend/src/test/java/com/vdt/webrtc/admin/AdminHistoryApiTest.java
  - backend/src/test/java/com/vdt/webrtc/admin/AdminLockTest.java
  - backend/src/test/java/com/vdt/webrtc/admin/AdminServiceTest.java
  - backend/src/test/java/com/vdt/webrtc/call/CallServicePublishTest.java
  - backend/src/test/java/com/vdt/webrtc/history/CallHistoryApiTest.java
  - backend/src/test/java/com/vdt/webrtc/history/CallHistoryConsumerTest.java
  - backend/src/test/java/com/vdt/webrtc/history/CallHistoryPublisherTest.java
  - docker-compose.yml
  - frontend/src/App.tsx
  - frontend/src/api/admin.ts
  - frontend/src/api/history.ts
  - frontend/src/components/admin/ConfirmModal.tsx
  - frontend/src/components/admin/DashboardCards.tsx
  - frontend/src/components/admin/SystemHistoryTable.tsx
  - frontend/src/components/history/CallHistoryRow.tsx
  - frontend/src/components/history/DayGroup.tsx
  - frontend/src/pages/AdminPage.tsx
  - frontend/src/pages/HistoryPage.tsx
  - frontend/src/pages/HomePage.tsx
  - frontend/src/pages/LoginPage.tsx
findings:
  critical: 1
  warning: 7
  info: 5
  total: 13
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-06-28
**Depth:** standard
**Files Reviewed:** 44
**Status:** issues_found

## Summary

Reviewed the Phase 5 call-history + admin slice: RabbitMQ async pipeline (publisher → consumer → DB), the per-user `/history` page, admin lock/unlock/role with self-protection, and the live dashboard + system-wide history.

The core architecture is sound and several historically risky areas are handled correctly:

- **Idempotency works.** `saveAll` of both rows runs in one transaction against `UNIQUE(call_id, viewer_id)`; a duplicate redelivery fails the batch atomically and is swallowed as `DataIntegrityViolationException`, so duplicates never inflate to 4 rows and never poison the DLQ. The integration test (`duplicateDelivery_keepsExactlyTwoRows_idempotent`) confirms this.
- **History access scoping is correct.** `/api/history` resolves the viewer from `auth.getName()` (never a client param), and the test proves cross-user leakage is blocked.
- **Admin self-protection** (no self-lock, no self-demote) is enforced server-side and mirrored in the UI; `/api/admin/**` is gated by `hasRole("ADMIN")`.
- **Admin dedup** (`direction = 'OUTGOING'` → one row per call) is correct for both the unfiltered and username-filtered queries.

The findings below are concentrated in three areas: a committed personal-looking DB credential (Critical), several unvalidated user inputs that surface as HTTP 500 instead of 4xx, and the dashboard daily-metrics being per-instance in-memory — which is incorrect under the project's own documented 2-instance scale demo.

## Critical Issues

### CR-01: Real-looking personal DB password committed as default in `application.yaml`

**File:** `backend/src/main/resources/application.yaml:12`
**Issue:** The datasource password default is a hardcoded literal `27012005` (a date-shaped value, almost certainly a personal password), not a labeled throwaway:
```yaml
password: ${DB_PASSWORD:27012005}
```
Unlike the JWT secret on line 48 (explicitly `dev-only-secret-not-for-prod-change-me-...`) and the TURN secret (`dev-turn-secret`), this value carries no "dev only" marker and looks like a credential the author actually reuses. Any developer running without `DB_PASSWORD` set silently authenticates with it, and it is now permanently in git history. If this password is reused elsewhere, the leak extends beyond this repo.
**Fix:** Replace with a clearly non-secret placeholder and rotate the real value if it was ever reused:
```yaml
password: ${DB_PASSWORD:dev-only-postgres-password-change-me}
```
Confirm `.env`/secrets are the only source of the real password in any deployed environment, and scrub or rotate the committed value.

## Warnings

### WR-01: Dashboard daily metrics are per-instance in-memory — wrong under the documented 2-instance scale demo

**File:** `backend/src/main/java/com/vdt/webrtc/metrics/CallMetrics.java:13-15`, `backend/src/main/java/com/vdt/webrtc/admin/AdminService.java:101-102`
**Issue:** `startedToday/completedToday/missedToday` are `AtomicLong` fields local to one JVM. CLAUDE.md mandates a `backend-1`/`backend-2` scale-out demo, and the LB is round-robin. A call handled by `backend-1` increments only `backend-1`'s counters; a dashboard request routed to `backend-2` returns `backend-2`'s counters. The "today" totals shown therefore depend on which instance served the request and systematically undercount. The `@Scheduled` reset also fires independently per instance. This is a correctness defect for the deliverable's own scale story, not just a performance note.
**Fix:** Back the counters with Redis (e.g. `INCR metrics:started:{yyyymmdd}` with a TTL, read via `redisTemplate`), consistent with how `activeCalls` already derives from Redis. That makes the dashboard instance-independent and survives a single-instance restart.

### WR-02: Malformed `before` cursor returns HTTP 500 instead of 400

**File:** `backend/src/main/java/com/vdt/webrtc/history/CallHistoryService.java:22`
**Issue:** `Instant.parse(before)` runs directly on a user-controlled query param. Any non-ISO string (e.g. `?before=garbage`) throws `DateTimeParseException`, which is not handled in `GlobalExceptionHandler` and falls through to the catch-all 500. Bad client input should be a 400.
**Fix:** Wrap the parse and translate to a 400:
```java
try {
    beforeTs = (before == null || before.isBlank()) ? null : Instant.parse(before);
} catch (DateTimeParseException e) {
    throw new IllegalArgumentException("Invalid 'before' cursor: " + before);
}
```
(`IllegalArgumentException` is already mapped to 400.)

### WR-03: `changeRole` NPEs to a 500 on null/invalid role payload

**File:** `backend/src/main/java/com/vdt/webrtc/admin/AdminService.java:91`, `backend/src/main/java/com/vdt/webrtc/admin/AdminController.java:51`
**Issue:** The controller reads `body.get("role")` from a free-form `Map<String,String>` and passes it to `Role.valueOf(roleName)`. If the request body omits `role` (or sends `null`), `Role.valueOf(null)` throws `NullPointerException` → caught only by the generic handler → HTTP 500. An invalid-but-non-null string throws `IllegalArgumentException` → 400 (acceptable), but the null path is an unhandled 500 on attacker/buggy-client input. There is also no DTO/validation on this endpoint.
**Fix:** Validate before converting:
```java
if (roleName == null || (!"USER".equals(roleName) && !"ADMIN".equals(roleName)))
    throw new IllegalArgumentException("Role không hợp lệ: " + roleName);
user.setRole(Role.valueOf(roleName));
```
Prefer a typed request record with `@NotBlank` over a raw `Map`.

### WR-04: Cursor pagination can silently drop rows that share a boundary timestamp

**File:** `backend/src/main/java/com/vdt/webrtc/history/CallHistoryService.java:26-27`, `backend/src/main/java/com/vdt/webrtc/history/CallHistoryRepository.java:21-22`
**Issue:** The cursor is `endedAt.toString()` and the next page uses `EndedAtLessThan` (strict `<`). `ended_at` is not unique — two calls ending in the same millisecond (common in seeded/imported data, and possible in bursts) straddle a page boundary. If the last row of page N and another row share that exact `endedAt`, the second row is `< cursor`-false and is skipped entirely on page N+1: permanent data loss from the user's view, not just reordering.
**Fix:** Use a compound cursor (`ended_at`, `id`) with a tuple comparison, e.g. `WHERE ended_at < :ts OR (ended_at = :ts AND id < :id)`, and emit both components in `nextCursor`. At minimum document the single-key limitation if same-ms collisions are deemed out of scope.

### WR-05: `activeCalls` uses integer division and truncates on an odd key count

**File:** `backend/src/main/java/com/vdt/webrtc/admin/AdminService.java:99-100`
**Issue:** `keys("user-call:*").size() / 2L` assumes every active call always has exactly two `user-call:*` keys. During setup/teardown races, a crashed peer, or an orphaned key (the glare branch in `CallService.handleInvite` notably leaves call state without cleaning user-call keys), the count can be odd; integer division then silently under-reports (3 keys → 1 call) or, with one orphan, shows a wrong number indefinitely. The `KEYS` scan itself is already flagged as a Phase 6 TODO, but the truncation is a present correctness smell.
**Fix:** Track an explicit Redis counter incremented/decremented on call start/end (the same fix recommended in WR-01 of the TODO), or at least round and surface anomalies (`Math.round(k.size() / 2.0)`), rather than floor-dividing.

### WR-06: `LoginPage` ignores the dedicated lockout signal and renders a generic auth error

**File:** `frontend/src/pages/LoginPage.tsx:22-23`
**Issue:** On a locked account the backend returns 403 with body message "Tài khoản đã bị khóa" (`GlobalExceptionHandler.handleLocked`). The client reads `err.response?.data?.message` but does not distinguish 403-locked from 401-bad-credentials, so a locked user can be shown the same message as a wrong password depending on whether the server populated `message`. Phase 5 introduces lock-on-admin-action; the login surface should clearly tell a locked user why they cannot log in. (Note: commit `f927994` claims this was fixed, but the code path still has no status-specific handling.)
**Fix:** Branch on status: when `err.response?.status === 403`, force the locked-account copy regardless of body; otherwise fall back to the credentials message.

### WR-07: `publisher-confirm-type: correlated` is configured but no confirm callback exists — lost events fail silently

**File:** `backend/src/main/resources/application.yaml:18-19`, `backend/src/main/java/com/vdt/webrtc/history/CallHistoryPublisher.java:19-30`
**Issue:** Publisher confirms and returns are enabled, but `CallHistoryPublisher` only catches synchronous exceptions from `convertAndSend`. A broker that NACKs a message, or a return for an unroutable message, is delivered asynchronously to a `ConfirmCallback`/`ReturnsCallback` that is never registered — so a dropped history event produces no log and no DLQ entry. The pipeline is "fire and forget" by design, but the configured confirm machinery gives a false sense of durability it does not actually provide.
**Fix:** Either register a `RabbitTemplate.ConfirmCallback`/`ReturnsCallback` that logs NACKs and returns, or drop the `publisher-confirm-type`/`publisher-returns` config to avoid implying delivery guarantees that aren't wired up.

## Info

### IN-01: Self-protection relies on username equality, not user id

**File:** `backend/src/main/java/com/vdt/webrtc/admin/AdminService.java:64,88`
**Issue:** `user.getUsername().equals(adminUsername)` compares the JWT subject string against the target's username. This is correct given usernames are unique and immutable, but an id-based check (`targetId.equals(currentUser.getId())`) is more robust against any future username-change feature and avoids a string-equality footgun.
**Fix:** Resolve the acting admin's id once and compare ids.

### IN-02: `findByCallId` repository method appears used only by tests

**File:** `backend/src/main/java/com/vdt/webrtc/history/CallHistoryRepository.java:15`
**Issue:** `List<CallHistory> findByCallId(String)` is referenced only from the consumer integration tests, not production code. If intentional (test-only), fine; otherwise it is dead surface area.
**Fix:** Keep if used as a test seam; otherwise remove to keep the repository minimal.

### IN-03: `AdminHistoryRow` field naming leans on an invariant that isn't asserted in code

**File:** `backend/src/main/java/com/vdt/webrtc/admin/AdminService.java:110-112`
**Issue:** The mapping `viewerId → callerId`, `peerId → calleeId` is only correct because the query is hard-filtered to `direction = 'OUTGOING'`. The coupling between the query filter and the field names is implicit; a future change to the query (e.g. including INCOMING rows) would silently mislabel caller/callee.
**Fix:** Add a brief comment at the mapping site noting it depends on the OUTGOING-only filter, or derive caller/callee from `direction` explicitly.

### IN-04: `redisTemplate` field in `AdminService` is broad for its single use

**File:** `backend/src/main/java/com/vdt/webrtc/admin/AdminService.java:35,99`
**Issue:** `StringRedisTemplate` is injected solely to run one `keys("user-call:*")` scan. Combined with the acknowledged Phase 6 TODO, consider extracting active-call counting behind a small presence/call-count abstraction so `AdminService` doesn't reach into Redis key layout directly.
**Fix:** Move the active-call count into a dedicated service/method; non-blocking for this phase.

### IN-05: `CallHistory` entity is fully mutable via Lombok but treated as write-once

**File:** `backend/src/main/java/com/vdt/webrtc/history/CallHistory.java:18-21`
**Issue:** `@Builder @NoArgsConstructor @AllArgsConstructor @Getter` with no setters is fine, but rows are immutable after persist by intent; nothing enforces it. Low risk given JPA requirements.
**Fix:** None required; noted for awareness.

---

_Reviewed: 2026-06-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
