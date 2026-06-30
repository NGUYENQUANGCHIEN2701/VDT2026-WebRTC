---
phase: 07-group-mesh-calls
plan: 01
status: complete
completed: 2026-06-30
type: tdd
wave: 1
---

# 07-01 Summary: RED Test Scaffold

## What Changed

- Added backend RED tests for room Redis state:
  - `backend/src/test/java/com/vdt/webrtc/room/RoomStateMachineTest.java`
  - Covers join below cap, 5th-user full rejection, idempotent join, concurrent joins at size 3, leave cleanup, and orphan key checks.
- Added backend RED WebSocket room tests:
  - `backend/src/test/java/com/vdt/webrtc/ws/RoomMeshTest.java`
  - Covers group invite, joiner member-list flow, participant-left fanout, room-full rejection, and 1-1 call invite regression.
- Added backend RED cross-instance room tests:
  - `backend/src/test/java/com/vdt/webrtc/ws/CrossInstanceRoomTest.java`
  - Reuses the Phase 6 two-context/Testcontainers pattern for room join fanout, participant-left fanout, and cross-instance cap enforcement.
- Added frontend RED tests:
  - `frontend/src/webrtc/MeshManager.test.ts`
  - `frontend/src/webrtc/PeerManager.test.ts`
  - Covers one PeerManager per remote participant, participant-left teardown, bitrate cap transitions, optional per-peer connection callback, legacy 1-1 fallback, and video-only sender bitrate updates.

## Verification

- `backend`: `.\mvnw.cmd test-compile`
  - PASS. Backend production and test sources compile.
- `backend`: `.\mvnw.cmd -pl . -Dtest="RoomStateMachineTest,RoomMeshTest,CrossInstanceRoomTest" test`
  - BLOCKED before RED assertions because Testcontainers could not find a valid Docker environment on this machine.
  - The same run reached `testCompile` successfully before failing during container startup.
- `frontend`: `npx vitest run src/webrtc/MeshManager.test.ts src/webrtc/PeerManager.test.ts`
  - RED as expected.
  - Existing PeerManager tests: 4 passed.
  - New Phase 7 tests: 5 failed because `MeshManager`, the per-peer callback seam, and `setSendersMaxBitrate` are not implemented yet.

## Mentor Notes

- Backend is split into three test layers:
  - Redis/Lua state tests explain the room cap and cleanup contract.
  - Single-instance WebSocket tests explain the room message flow.
  - Cross-instance WebSocket tests explain why Phase 6 routing matters for Phase 7.
- Frontend keeps WebRTC objects outside Zustand. `MeshManager` will own a `Map<username, PeerManager>`, while a future room store should keep only serializable roster/UI state.
- `PeerManager` must stay backward-compatible: without mesh callbacks it still writes to the existing 1-1 `callStore`.

## Next

Execute `07-02-PLAN.md`: implement backend room state and signaling until the backend RED tests can go GREEN.
