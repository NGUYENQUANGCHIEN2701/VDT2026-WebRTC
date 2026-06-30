---
phase: 07-group-mesh-calls
plan: 02
status: complete
completed: 2026-06-30
type: execute
wave: 2
---

# 07-02 Summary: Backend Room State And Signaling

## What Changed

- Added room WebSocket message contracts:
  - Client messages: `group-invite`, `join-room`, `leave-room`, `decline-room-invite`.
  - Server messages: `room-invite`, `room-joined`, `participant-joined`, `participant-left`, `room-full`.
- Added Redis-backed room state:
  - `join_room.lua` atomically enforces the 4-member cap and writes `user-room:{username}`.
  - `leave_room.lua` removes participants and deletes empty `room:{roomId}` keys.
  - `RoomRepository` wraps Redis keys, Lua execution, room members, and reverse lookup.
- Added `RoomService`:
  - Creates rooms for multi-invite.
  - Returns existing member lists to joiners.
  - Fans out participant join/leave events through `MessageRouter.sendToUser`.
  - Cleans up room membership on disconnect.
- Wired `PresenceWebSocketHandler` to dispatch room messages without changing the existing 1-1 call branches.
- Stabilized `RoomMeshTest` by awaiting `room-joined` frames before dependent joins/leaves.

## Verification

- `.\mvnw.cmd -Dtest="RoomStateMachineTest,RoomMeshTest" test`
  - PASS: 11 tests, 0 failures.
- `.\mvnw.cmd -Dtest=CrossInstanceRoomTest test`
  - PASS: 3 tests, 0 failures.
- `.\mvnw.cmd -Dtest="CallLifecycleTest,CrossInstanceCallTest" test`
  - PASS, per user-reported run.

## Mentor Notes

- `RoomRepository` is a custom Redis repository, not a JPA repository. It owns key naming and Lua result mapping.
- `RoomService` is the business layer: it decides who receives `RoomInvite`, `RoomJoined`, `ParticipantJoined`, `ParticipantLeft`, and `RoomFull`.
- `PresenceWebSocketHandler` remains the WebSocket entry point. It now routes room messages to `RoomService`, while the 1-1 `CallService` path stays separate.
- Cross-instance delivery works because room fanout uses `MessageRouter.sendToUser`, reusing the Phase 6 Redis route map.

## Next

Execute `07-03-PLAN.md`: implement frontend mesh core (`PeerManager` seam, `MeshManager`, `roomStore`, `roomActions`, and room message dispatch).
