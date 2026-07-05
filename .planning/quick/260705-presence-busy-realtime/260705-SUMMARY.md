---
phase: quick-260705-presence-busy-realtime
plan: 01
subsystem: presence
tags: [redis, pub-sub, websocket, call-service, presence]

requires:
  - phase: quick-260702-3sd
    provides: PresenceService.publishChanged(), RedisPresenceService/LocalPresenceService implementations, CallService PresenceService dependency
provides:
  - "CallService.handleInvite() OK branch publishes presence-events on call start, symmetric to the existing ended-transition publishes"
affects: [presence, call, ws]

tech-stack:
  added: []
  patterns:
    - "CallService now publishes presence-events on BOTH ends of the call lifecycle (start via handleInvite OK, and end via the five ended-transition branches) — the full lifecycle is covered"

key-files:
  created: []
  modified:
    - backend/src/main/java/com/vdt/webrtc/call/CallService.java
    - backend/src/test/java/com/vdt/webrtc/call/CallServicePublishTest.java
    - backend/src/test/java/com/vdt/webrtc/ws/CallLifecycleTest.java

key-decisions:
  - "Did not touch handleAccept — the Redis user-call:{userId} key is already set at invite time, so status is already IN_CALL by accept; broadcasting at invite alone closes the gap."
  - "This is the deliberate follow-up to quick task 260702-3sd, which fixed the 'call ends' side and explicitly deferred the 'call starts' side as out of scope."

requirements-completed: []

coverage:
  - id: D1
    description: "handleInvite's OK branch calls presence.publishChanged()"
    verification:
      - kind: unit
        ref: "backend/src/test/java/com/vdt/webrtc/call/CallServicePublishTest.java#okBranch_publishesPresenceChange"
        status: pass
    human_judgment: false
  - id: D2
    description: "Non-participant WS observer receives IN_CALL for both parties immediately after a 1-1 call invite (ringing), without reconnecting"
    verification:
      - kind: integration
        ref: "backend/src/test/java/com/vdt/webrtc/ws/CallLifecycleTest.java#invite_notifiesThirdPartyObserverPresenceGoesInCall"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-07-05
status: complete
---

# Quick Task 260705: Fix presence "busy" status not updating realtime on call start Summary

**`CallService.handleInvite()` giờ publish sự kiện `presence-events` ngay khi cuộc gọi bắt đầu (OK branch → ringing), khắc phục việc observer khác thấy trạng thái "Đang bận" (IN_CALL) chỉ sau khi F5 refresh trang, thay vì ngay lập tức.**

## Root Cause

`CallStateMachine.createCall()` set Redis key `user-call:{userId}` (key này quyết định `IN_CALL` trong `RedisPresenceService.snapshot()`) ngay khi `handleInvite()` tạo cuộc gọi — nhưng `CallService.handleInvite()`'s `OK` branch chưa từng gọi `presence.publishChanged()`. Đây chính là phần bị bỏ ngỏ có chủ đích từ quick task 260702-3sd (đã fix 5 nhánh "kết thúc cuộc gọi" nhưng note rõ "handleAccept/invite nằm ngoài phạm vi bug lúc đó").

## Accomplishments

- Thêm `presence.publishChanged();` vào nhánh `case OK ->` của `handleInvite()`, ngay sau `broadcast(...)` và `timers.scheduleRingTimeout(...)`.
- Unit test mới `okBranch_publishesPresenceChange` trong `CallServicePublishTest.java` — mock `CreateResult.OK`, verify `presence.publishChanged()` được gọi.
- Integration test mới `invite_notifiesThirdPartyObserverPresenceGoesInCall` trong `CallLifecycleTest.java` — carol (observer không tham gia cuộc gọi, không reconnect) nhận được `presence` frame chứa `IN_CALL` cho cả alice và bob ngay sau khi alice invite bob (chỉ cần tới "ringing", chưa cần accept).

## Files Modified

- `backend/src/main/java/com/vdt/webrtc/call/CallService.java` — thêm 1 dòng `presence.publishChanged()` trong `handleInvite()`.
- `backend/src/test/java/com/vdt/webrtc/call/CallServicePublishTest.java` — thêm test `okBranch_publishesPresenceChange`.
- `backend/src/test/java/com/vdt/webrtc/ws/CallLifecycleTest.java` — thêm test `invite_notifiesThirdPartyObserverPresenceGoesInCall`.

## Decisions Made

- Không thêm `presence.publishChanged()` vào `handleAccept()` — key Redis đã được set từ lúc invite, trạng thái đã IN_CALL từ khi ringing; broadcast ở invite là đủ để đóng gap.
- Không đụng tới 5 nhánh ended-transition đã fix ở 260702-3sd.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `./mvnw -q test -Dtest=CallServicePublishTest,CallLifecycleTest` — exit 0, tất cả test pass (bao gồm 2 test mới).
- Full backend suite (`./mvnw -q test`) run để xác nhận không có regression.

## Next Steps

Manual smoke test tùy chọn (3 tab trình duyệt: alice/bob/carol observer) để xác nhận trực quan — chưa thực hiện, để dành cho user nếu muốn kiểm tra trước khi merge.

---
*Quick task: 260705-presence-busy-realtime*
*Completed: 2026-07-05*
