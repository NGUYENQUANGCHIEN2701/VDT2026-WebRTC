---
phase: quick-260702-3sd
plan: 01
subsystem: presence
tags: [redis, pub-sub, websocket, call-service, presence]

requires:
  - phase: 06-horizontal-scaling
    provides: RedisPresenceService (join/leave publish to presence-events channel), PresenceWebSocketHandler broadcast
provides:
  - "PresenceService.publishChanged() — publish a presence-events change without mutating join/leave state"
  - "CallService publishes presence-events on every ended-call transition (missed, rejected, cancelled, completed, dropped)"
affects: [presence, call, ws]

tech-stack:
  added: []
  patterns:
    - "CallService now depends on PresenceService to notify observers of derived presence-status changes (IN_CALL -> ONLINE) that are not caused by join/leave"

key-files:
  created: []
  modified:
    - backend/src/main/java/com/vdt/webrtc/presence/PresenceService.java
    - backend/src/main/java/com/vdt/webrtc/presence/RedisPresenceService.java
    - backend/src/main/java/com/vdt/webrtc/presence/LocalPresenceService.java
    - backend/src/main/java/com/vdt/webrtc/call/CallService.java
    - backend/src/test/java/com/vdt/webrtc/call/CallServicePublishTest.java
    - backend/src/test/java/com/vdt/webrtc/ws/CallLifecycleTest.java

key-decisions:
  - "publishChanged() added to CallService's five ended-transition branches (onRingTimeout, handleReject, handleCancel, handleHangUp, onGraceExpired), not to handleAccept — active-state transitions were already out of scope for this bug per plan diagnosis"
  - "RoomService/group-call audit confirmed non-issue: RedisPresenceService.snapshot() only reads user-call:{userId} keys (1-1 namespace); RoomRepository's user-room:{username} keys never affect presence snapshot, so no RoomService change was needed"

requirements-completed: []

coverage:
  - id: D1
    description: "PresenceService.publishChanged() exists and is implemented by RedisPresenceService (real Redis PUBLISH) and LocalPresenceService (no-op)"
    verification:
      - kind: unit
        ref: "backend/src/test/java/com/vdt/webrtc/call/CallServicePublishTest.java#endedTransition_publishesPresenceChange_forHangUp"
        status: pass
      - kind: unit
        ref: "backend/src/test/java/com/vdt/webrtc/call/CallServicePublishTest.java#failedTransition_doesNotPublishPresenceChange"
        status: pass
      - kind: unit
        ref: "backend/src/test/java/com/vdt/webrtc/call/CallServicePublishTest.java#missedTimeout_publishesPresenceChange"
        status: pass
    human_judgment: false
  - id: D2
    description: "Non-participant WS observer receives a corrected PresenceSnapshot (both call parties back ONLINE) after a 1-1 call ends, without reconnecting"
    verification:
      - kind: integration
        ref: "backend/src/test/java/com/vdt/webrtc/ws/CallLifecycleTest.java#hangup_notifiesThirdPartyObserverPresenceWithoutReconnect"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-01
status: complete
---

# Quick Task 260702-3sd: Fix presence status not updating in real-time Summary

**`CallService` giờ publish sự kiện `presence-events` qua Redis pub/sub sau mọi transition kết thúc cuộc gọi (missed/rejected/cancelled/completed/dropped), khắc phục việc observer không phải bên tham gia cuộc gọi bị "kẹt" thấy trạng thái IN_CALL cũ tới khi reload trang.**

## Performance

- **Duration:** ~25 phút
- **Started:** 2026-07-01T19:32:00Z
- **Completed:** 2026-07-01T19:57:00Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments

- Thêm `PresenceService.publishChanged()` — method publish presence-events mà không mutate state join/leave, dùng khi có sự kiện ngoài (call kết thúc) làm thay đổi trạng thái IN_CALL/ONLINE suy ra từ dữ liệu khác.
- `RedisPresenceService` implement thật (Redis PUBLISH kênh `presence-events`), tái cấu trúc để `join()`/`leave()`/`publishChanged()` cùng dùng chung 1 helper private, tránh lặp literal tên kênh.
- `LocalPresenceService` implement no-op (khớp hành vi hiện tại của `join()`/`leave()` — instance đơn không có pub/sub cross-instance).
- `CallService` nhận thêm dependency `PresenceService` và gọi `presence.publishChanged()` bên trong mọi nhánh `if (ok)` dẫn tới state "ended" — 5 code path: `onRingTimeout` (missed), `handleReject`, `handleCancel`, `handleHangUp`, `onGraceExpired` (dropped).
- Test tích hợp mới `hangup_notifiesThirdPartyObserverPresenceWithoutReconnect` chứng minh: carol (không tham gia cuộc gọi, không reconnect) nhận được `PresenceSnapshot` đúng (alice + bob = ONLINE, không còn IN_CALL) ngay sau khi alice cúp máy.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add PresenceService.publishChanged() and wire it into every CallService ended-transition** - `0617b12` (fix)
2. **Task 2: Integration test — observer converges on presence without reconnecting after call ends** - `2f4b33e` (test)

_Note: Task 1 was written TDD-style (tests added alongside the interface/wiring changes and verified together) rather than as separate RED/GREEN commits, matching this quick task's existing `CallServicePublishTest` structure._

## Files Created/Modified

- `backend/src/main/java/com/vdt/webrtc/presence/PresenceService.java` - Thêm method `publishChanged()` vào interface
- `backend/src/main/java/com/vdt/webrtc/presence/RedisPresenceService.java` - Implement `publishChanged()`, extract helper `publishChangedEvent()` dùng chung cho join/leave/publishChanged
- `backend/src/main/java/com/vdt/webrtc/presence/LocalPresenceService.java` - Implement `publishChanged()` no-op
- `backend/src/main/java/com/vdt/webrtc/call/CallService.java` - Thêm field/constructor param `PresenceService presence`; gọi `presence.publishChanged()` trong 5 nhánh ended-transition
- `backend/src/test/java/com/vdt/webrtc/call/CallServicePublishTest.java` - Cập nhật constructor call; thêm 3 test case (publish khi thành công, không publish khi CAS fail, publish trên nhánh reject)
- `backend/src/test/java/com/vdt/webrtc/ws/CallLifecycleTest.java` - Thêm test tích hợp `hangup_notifiesThirdPartyObserverPresenceWithoutReconnect`

## Decisions Made

- Không thêm `presence.publishChanged()` vào `handleAccept` (state -> "active") vì nằm ngoài phạm vi bug được chẩn đoán trong plan — việc active-call chưa có observer-facing IN_CALL announcement là hành vi đã tồn tại từ trước, không phải regression của bug này.
- Xác nhận RoomService (group-call) không bị ảnh hưởng: `RedisPresenceService.snapshot()` chỉ đọc key `user-call:{userId}` (namespace CallStateMachine 1-1); `RoomRepository` dùng key riêng `user-room:{username}` mà snapshot không bao giờ đọc — nên group-call leave/disconnect chưa từng có khả năng để lại stale IN_CALL presence data. Không cần sửa RoomService.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `CallStateRepository.find()` trả về `CallSnapshot` (record với 6 field: callId, state, reason, callerId, calleeId, startedAt) — plan không nêu rõ tên type record này, nhưng đã đọc `CallStateRepository.java` trước khi viết test nên constructor test khớp ngay lần đầu.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Fix đã sẵn sàng, không có blocker. Manual smoke test (3 tab trình duyệt: alice/bob/carol observer) là optional theo `<verification>` của plan — chưa thực hiện, để dành cho người dùng nếu muốn xác nhận trực quan trước khi merge.

---
*Quick task: 260702-3sd-fix-presence-status-not-updating-in-real*
*Completed: 2026-07-01*

## Self-Check: PASSED

All modified files confirmed present on disk; both task commits (`0617b12`, `2f4b33e`) confirmed in git log.
