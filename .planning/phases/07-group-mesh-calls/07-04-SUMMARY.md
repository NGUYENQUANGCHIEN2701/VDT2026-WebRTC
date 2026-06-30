---
phase: 07-group-mesh-calls
plan: 04
status: complete
completed: 2026-06-30
type: execute
wave: 4
---

# 07-04 Summary: Group Call UX

## What Changed

- Added the Home multi-invite entry flow:
  - `OnlineUsersList` now exposes a "Gọi nhóm" mode when the user is not already in a 1-1 or group call.
  - `MultiSelectUserList` and `OnlineUserRow` support selecting up to 3 online invitees while keeping the existing 1-1 "Gọi" path intact outside group mode.
- Added group invite surfaces:
  - `GroupInviteModal` for incoming room invites with accept/reject and auto-timeout.
  - `OutgoingGroupInviteCard` for initiator-side pending invites.
  - Room-full feedback now uses the existing toast system with the approved capacity copy.
- Added the dedicated `/group-call` route:
  - `GroupCallPage` renders a separate video-first group room UI, preserving `/call` for 1-1 calls.
  - `ParticipantTile` renders self and remote peers with name labels, mic/cam state, and per-tile connecting/reconnecting/failed overlays.
  - `LeaveRoomButton` extends the existing round-button control language.
- Extended group room actions:
  - Added group mic/cam toggles and per-peer media-state updates.
  - Initiator enters the room when the first `participant-joined` event arrives, using that event's `roomId`.
- Extended `DebugPanel`:
  - Existing 1-1 stats rendering remains supported.
  - Group mode can render one section per peer with `maxBitrate` visibility for the mesh cap.
- App route wiring now drives:
  - Room invite modals.
  - Pending invite overlay.
  - Auto-navigation into `/group-call` when `roomStore.roomId` is active.

## Verification

- `npm run build`
  - PASS: TypeScript build and Vite production bundle succeeded.
- `npx vitest run src/webrtc/PeerManager.test.ts src/webrtc/MeshManager.test.ts src/realtime/wsClient.test.ts`
  - PASS: 12 tests, 0 failures.

## Mentor Notes

- The initiator-side backend contract does not currently send `room-joined`; frontend now derives initiator room entry from the first `participant-joined` event.
- The group page polls stats only while the debug panel is open and tears down polling on close/unmount.
- Group UI state stays server-driven through `roomStore`; media streams and `PeerManager` instances remain outside Zustand.

## Next

Execute `07-05-PLAN.md`: run full backend/frontend gates and complete the manual 4-user group-call verification checkpoint.
