# 08-01 Summary — RED Test Scaffolding

**Phase:** 8 — Screen Share, Recording & Device Control
**Plan:** 08-01 (Wave 1 — RED Tests)
**Status:** ✅ COMPLETE
**Completed:** 2026-06-30

---

## What Was Done

### Task 1 — `PeerManager.test.ts` ✅
Extended with `describe('sender replacement helpers', ...)` block containing **4 RED test cases**:
- `replaceVideoTrack()` finds the video sender and calls `sender.replaceTrack(newTrack)`
- `replaceVideoTrack()` resolves without error when there is no video sender
- `replaceAudioTrack()` finds the audio sender and calls `sender.replaceTrack(newTrack)`
- `replaceAudioTrack()` resolves when there is no audio sender

The `MockRTCPeerConnection` senders type was extended to include `replaceTrack` spy.
All 4 new tests fail RED: `TypeError: pm.replaceVideoTrack is not a function`.
All 7 pre-existing PeerManager tests still pass ✅

### Task 2 — `MeshManager.test.ts` ✅
Extended with `describe('track replacement fan-out', ...)` block containing **5 RED test cases**:
- `replaceVideoTrack(track)` fans out to every peer in the mesh
- `replaceVideoTrack(track)` calls `setSendersMaxBitrate(activeMaxBitrate)` on every peer after replacement
- `replaceVideoTrack(track)` works when the peer map is empty
- `replaceAudioTrack(track)` fans out to every peer in the mesh
- `replaceAudioTrack(track)` does NOT call `setSendersMaxBitrate`

All 5 new tests fail RED: `TypeError: mesh.replaceVideoTrack is not a function`.
All 3 pre-existing MeshManager tests still pass ✅

### Task 3 — `recording.test.ts` ✅ (created)
Created `frontend/src/webrtc/recording.test.ts` with **8 RED test cases** in 2 describe blocks:

**MIME fallback ladder (4 tests):**
- Returns first supported MIME from ordered candidate list
- Prefers vp9 over vp8 when both supported
- Returns first match when multiple types supported  
- Falls back to `''` when no specific MIME is supported

**Cleanup on stop (4 tests):**
- `stop()` sets `isRecording` to `false`
- `stop()` calls `MediaRecorder.stop()`
- `stop()` cancels the `requestAnimationFrame` draw loop
- `stop()` closes the `AudioContext`

All 8 tests fail RED: `Failed to resolve import "./recording"`.
Browser APIs fully stubbed with vi.fn().

### Task 4 — `RecordingSignalingTest.java` ✅ (pre-existing, verified)
6 RED integration test methods covering:
1. activeCaller → callee relay (happy path)
2. activeCallee → caller relay (symmetric)
3. recording=false still relays
4. Outsider cannot inject recording indicator
5. Valid participant, wrong `to` rejected
6. Ringing call does not relay (requires active)

Backend compile: `./mvnw test-compile` exit **0** ✅

---

## Verification Results

| Gate | Result |
|------|--------|
| Frontend RED: PeerManager.test.ts | ✅ 4 new RED, 7 existing pass |
| Frontend RED: MeshManager.test.ts | ✅ 5 new RED, 3 existing pass |
| Frontend RED: recording.test.ts | ✅ 8 RED (missing module) |
| Regression: `npx vitest run src/webrtc/` | ✅ 18 pass / 9 fail (all new RED only) |
| Backend compile: `./mvnw test-compile` | ✅ exit 0 |
| Backend RED: RecordingSignalingTest | ✅ 6 errors (missing handler, requires Docker in CI) |

---

## Success Criteria Check

- [x] PeerManager.test.ts has ≥4 RED cases; all existing cases pass
- [x] MeshManager.test.ts has ≥5 RED cases; all existing cases pass
- [x] recording.test.ts exists with ≥8 RED cases for MIME fallback and cleanup
- [x] RecordingSignalingTest.java exists with ≥5 RED cases (6 test methods)
- [x] No production files modified in this wave

---

## Notes for Wave 2

- `PeerManager.ts` needs `replaceVideoTrack(track)` and `replaceAudioTrack(track)` using `pc.getSenders().find(s => s.track?.kind === kind)` + `sender.replaceTrack(track)`.
- `MeshManager.ts` needs `replaceVideoTrack(track)` (fan-out + reapply bitrate) and `replaceAudioTrack(track)` (fan-out only).
- `recording.ts` needs `RecordingController` class + `selectMimeType()` export.
- Backend needs `RecordingState.java`, `RecordingStateRelay.java`, `areActiveCallPeers()` in `CallService`, and dispatch in `PresenceWebSocketHandler`.
