---
phase: 08-screen-share-recording-device-control
plan: 02
status: complete
completed: 2026-07-01
type: implementation
wave: 2
---

# 08-02 Summary: Foundation Implementation

## What Changed

### Frontend WebRTC Foundation

- Added `PeerManager.replaceVideoTrack()` and `replaceAudioTrack()` sender helpers.
- Added `MeshManager.replaceVideoTrack()` and `replaceAudioTrack()` fan-out helpers.
- Added `frontend/src/webrtc/mediaDevices.ts` for device enumeration, camera/mic track acquisition, stream track replacement, and safe track cleanup.

### Frontend Realtime Actions

- Added 1-1 screen share and device switching exports in `callActions.ts`:
  - `startScreenShare()`
  - `stopScreenShare()`
  - `switchCamera(deviceId)`
  - `switchMicrophone(deviceId)`
- Added group-call equivalents in `roomActions.ts`:
  - `startRoomScreenShare()`
  - `stopRoomScreenShare()`
  - `switchRoomCamera(deviceId)`
  - `switchRoomMicrophone(deviceId)`
  - `setRoomSinkId(deviceId)`
- Existing 1-1 call lifecycle and group room lifecycle exports were preserved.

### Frontend Serializable State

- Extended `callStore.ts` with Phase 8 state for screen sharing, selected devices, recording flags, remote recording indicator, and local stream rebinding.
- Extended `roomStore.ts` with group screen share and selected device state.
- No `MediaStream`, `MediaStreamTrack`, `MediaRecorder`, `Blob`, `AudioContext`, or object URL is stored in Zustand.

### Recording Signaling

- Added frontend `recording-state` and `recording-state-relay` message types.
- Added backend `RecordingState` and `RecordingStateRelay` records.
- Registered the new records in `ClientMessage` and `ServerMessage`.
- Added `CallService.areActiveCallPeers(callId, actorId, peerId)`.
- Wired `PresenceWebSocketHandler` to relay recording state only when both users are different participants in the same active call.

## Verification

### Automated Gates

- `cd frontend && npx vitest run src/webrtc/PeerManager.test.ts src/webrtc/MeshManager.test.ts`
  - PASS: 2 files, 18 tests.
- `cd frontend && npx tsc --noEmit`
  - PASS.
- `cd backend && ./mvnw -pl . -Dtest="RecordingSignalingTest" test`
  - PASS: 6 tests.
- `cd backend && ./mvnw -pl . test`
  - First full-suite run: 76 tests, 1 failure in `CrossInstanceRoomTest.crossInstance_competingFifthJoinStillHasSingleRoomFullLoser`.
  - Targeted rerun of that failing test: PASS.
  - Assessment: residual Phase 7 cross-instance room timing flake, not a Wave 2 recording regression.

### Expected RED

- `frontend/src/webrtc/recording.test.ts` remains RED because `RecordingController` and `recording.ts` are Wave 3 scope.

## Success Criteria Check

- [x] `PeerManager.replaceVideoTrack()` and `replaceAudioTrack()` exist and pass Wave 1 tests.
- [x] `MeshManager.replaceVideoTrack()` and `replaceAudioTrack()` exist and pass Wave 1 tests.
- [x] `mediaDevices.ts` exports pure media helpers with no Zustand imports.
- [x] `callStore.ts` and `roomStore.ts` keep Phase 8 media-control state serializable.
- [x] `callActions.ts` exports 1-1 screen share and device switching functions.
- [x] `roomActions.ts` exports group screen share, device switching, and sink selection functions.
- [x] Frontend message unions include recording state messages.
- [x] Backend recording relay validates active call peers before routing.
- [x] `RecordingSignalingTest` is GREEN.

## Notes

- Screen share and device switching logic are implemented but not yet wired into UI controls.
- Recording controller, More panel, CallPage wiring, and GroupCallPage wiring are deferred to Wave 3.
- The Phase 7 cross-instance room cap test should be hardened with an explicit precondition wait if it flakes again in full-suite runs.

## Next

Execute Wave 3: `08-03-PLAN.md` for RecordingController, MorePanel, and UI wiring.
