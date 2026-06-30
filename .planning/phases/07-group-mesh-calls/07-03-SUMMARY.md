---
phase: 07-group-mesh-calls
plan: 03
status: complete
completed: 2026-06-30
type: execute
wave: 3
---

# 07-03 Summary: Frontend Mesh Core

## What Changed

- Extended `PeerManager` with an optional per-peer connection-state callback while preserving the legacy 1-1 `callStore` fallback.
- Added `setSendersMaxBitrate(maxBitrate)` to update video senders through `RTCRtpSender.setParameters`.
- Added `MeshManager` to own `Map<username, PeerManager>` outside Zustand, create one peer per remote member, apply deterministic politeness, tear down only departed peers, and apply/remove the 350 kbps mesh cap.
- Added `roomStore` for serializable room roster, invite, stream-version, connection-state, and active bitrate-cap state.
- Extended frontend realtime contracts and `wsClient` with additive room dispatch while preserving the existing 1-1 call handler.
- Added `roomActions` for room invite/join/leave, media acquisition, mesh setup, SDP/ICE relay by `roomId`, and room-full feedback.
- Imported `roomActions` during app startup so room message registration is active.

## Verification

- `npx vitest run src/webrtc/PeerManager.test.ts src/webrtc/MeshManager.test.ts`
  - PASS: 9 tests, 0 failures.
- `npx vitest run src/webrtc/PeerManager.test.ts src/webrtc/MeshManager.test.ts src/realtime/wsClient.test.ts src/webrtc/media.test.ts`
  - PASS: 19 tests, 0 failures.
- `npm run build`
  - PASS: TypeScript build and Vite production bundle succeeded.

## Mentor Notes

- `MeshManager` remains non-React orchestration; Zustand only receives serializable derived state.
- Room SDP/ICE reuses existing `sdp` / `ice-candidate` messages with `callId` carrying the `roomId`.
- `wsClient` dispatches SDP/ICE to both call and room handlers. The room handler ignores signals whose `callId` does not match the active room.
- The room-full toast copy is intentionally minimal in this core wave; Wave 4 owns approved Vietnamese UI copy and presentation polish.

## Next

Execute `07-04-PLAN.md`: implement the user-facing group-call UX, invite surfaces, `/group-call` route, participant tiles, and DebugPanel mesh visibility.
