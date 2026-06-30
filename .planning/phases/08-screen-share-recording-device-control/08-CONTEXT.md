# Phase 8: Screen Share, Recording & Device Control - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 gives users polished control over what they share and which devices they use during active calls.
It covers screen sharing, camera/microphone/speaker selection, and client-side 1-1 recording.

Screen share and device switching are in scope for both the existing 1-1 call flow and the Phase 7 group
mesh flow. Recording remains 1-1 only in this phase: it produces a polished composited local file, but it
does not attempt group-call recording/compositing.

Covers ADV-01, ADV-02, MEDIA-03, and MEDIA-04.

**Not in this phase:**
- Server-side recording or upload. Media must remain peer-to-peer; recordings stay local to the browser.
- Group-call recording/compositing (ADV-05). That is a separate future capability.
- A second screen-share video transceiver beside camera. Screen share replaces the camera video track.
- Recording metadata in call history. Phase 8 creates/downloads files locally only.
- Refactoring the 1-1 call state machine or group room state. This phase adds media controls around the
  existing call/room flows.

</domain>

<decisions>
## Implementation Decisions

### Recording scope and UX (ADV-02)
- **D-01:** **1-1 recording is a composited single file.** The recording should represent the call, not
  just one raw stream. Use a canvas composition with the remote video as the main surface and local
  self-view as a small overlay; mix local and remote audio via Web Audio / `AudioContext`; feed the
  composed `MediaStream` into native `MediaRecorder`.
- **D-02:** **Recording remains 1-1 only in Phase 8.** Group-call recording/compositing is explicitly
  deferred to ADV-05. Screen share and device switching should be polished for group calls, but recording
  does not expand to group in this phase.
- **D-03:** **Remote recording indicator is required.** When a user records, the remote party sees an
  in-call "recording" indicator. Implement this with a signaling message/relay analogous to `media-state`
  (e.g. `recording-state` and `recording-state-relay`), with backend validation that sender and recipient
  are peers in the active call.
- **D-04:** **Stop recording shows preview + Download.** When recording stops, create a local `.webm`
  Blob and show a lightweight preview/player with a Download action. Do not auto-upload and do not add
  call-history metadata. Filename can follow a predictable pattern such as
  `call-{callId}-{timestamp}.webm`.
- **D-05:** **Use native `MediaRecorder` with a codec fallback ladder.** Planner/researcher chooses the
  concrete browser-compatible MIME order, but the implementation must gracefully fall back rather than
  assuming a single codec works everywhere.

### Screen sharing (ADV-01)
- **D-06:** **Screen share replaces the camera video track.** Use `navigator.mediaDevices.getDisplayMedia`
  and `RTCRtpSender.replaceTrack()` for the outgoing video sender. Do not add a second video transceiver
  or extra remote video tile for screen share in this phase.
- **D-07:** **Browser-bar stop automatically reverts to camera.** Attach `track.onended` to the screen
  track. If the user stops sharing from the browser UI, replace the screen track with the current camera
  track automatically and update local UI state.
- **D-08:** **Screen share is in scope for both 1-1 and group calls.** For 1-1, replace the active
  `PeerManager` video sender. For group mesh, replace the video sender across every peer managed by
  `MeshManager` / `roomActions`, so every participant receives the screen share.

### Device control UX (MEDIA-03, MEDIA-04)
- **D-09:** **Device controls live in the "More" panel.** The existing bottom control bar stays clean.
  The `More` panel contains Camera, Microphone, and Speaker selectors for both 1-1 and group-call pages.
- **D-10:** **Speaker selector is capability-gated.** Show audio output selection only when
  `HTMLMediaElement.setSinkId` is supported. Hide the control on unsupported browsers.
- **D-11:** **Device switching works before and during calls where applicable.** During an active call,
  switching camera or microphone uses `replaceTrack()` without dropping the connection. Existing pre-call
  preview/media acquisition patterns should be reused for the pre-call side.
- **D-12:** **Switching devices preserves mute/camera-off state.** If the user is muted, the new audio
  track remains `enabled = false`. If camera is off, the new video track remains `enabled = false`.
  Then replace the sender track and relay media state if needed. This avoids surprising the user by
  turning media back on.
- **D-13:** **Device switching is in scope for both 1-1 and group calls.** For 1-1, replace the sender on
  the active `PeerManager`. For group calls, replace the relevant sender on every peer in the mesh.

### the agent's Discretion
- Exact module split for recording composition (e.g. `recording.ts`, `RecordingController`, React hook,
  or service object), as long as non-serializable media objects stay outside Zustand.
- Exact codec fallback order and MIME strings for `MediaRecorder`.
- Exact preview modal/panel styling, provided it follows the existing in-call UI language.
- Exact message names for recording state, provided they follow the existing sealed-interface records and
  frontend union patterns.
- Whether recording indicator also shows a toast; the required behavior is the persistent in-call
  indicator while the remote party records.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` section "Phase 8: Screen Share, Recording & Device Control" - goal, four
  success criteria, and phase boundary.
- `.planning/REQUIREMENTS.md` - ADV-01, ADV-02, MEDIA-03, MEDIA-04. Also read ADV-05 as explicitly
  deferred group-call recording.
- `.planning/STATE.md` - notes that recording scope needed a Phase 8 decision; this context resolves it.

### Stack and locked WebRTC choices
- `CLAUDE.md` section "Frontend Core" / WebRTC table - screen share uses `getDisplayMedia` +
  `RTCRtpSender.replaceTrack()`, recording uses native `MediaRecorder`, group mesh uses one
  `RTCPeerConnection` per remote peer outside React state.
- `CLAUDE.md` section "Alternatives Considered / What NOT to Use" - server-side recording is rejected
  because media must not touch the server; RecordRTC/simple-peer/PeerJS are rejected.

### Cross-phase dependencies
- `.planning/phases/07-group-mesh-calls/07-CONTEXT.md` - group is a separate additive flow using
  `MeshManager` and one `PeerManager` per remote participant; screen share within group was deferred
  from Phase 7 and is now in scope for Phase 8.
- `.planning/phases/04-call-lifecycle-in-call-experience/04-CONTEXT.md` - 1-1 call lifecycle and media
  state patterns; Phase 8 must not destabilize the core 1-1 call.
- `.planning/phases/03-1-1-p2p-call-core-nat-traversal/03-UI-SPEC.md` - self-view and call-page media
  principles; non-serializable media objects stay outside Zustand.

### Existing code integration points
- `frontend/src/webrtc/PeerManager.ts` - owns `RTCPeerConnection`, senders, remote stream, stats, and
  current bitrate sender updates. Add track replacement helpers here or around it.
- `frontend/src/webrtc/MeshManager.ts` - owns per-peer `PeerManager` instances for group calls; screen
  share and device switching must fan out track replacement across the mesh.
- `frontend/src/realtime/callActions.ts` - owns 1-1 local stream, active peer, and active call lifecycle.
- `frontend/src/realtime/roomActions.ts` - owns group local stream and mesh lifecycle.
- `frontend/src/realtime/mediaControls.ts` - existing mic/camera toggle pattern and `media-state` relay.
- `frontend/src/realtime/messages.ts` - add recording-state client/server message types.
- `frontend/src/store/callStore.ts` and `frontend/src/store/roomStore.ts` - store only serializable
  derived state, not `MediaStream`, `MediaRecorder`, `AudioContext`, or `RTCPeerConnection`.
- `frontend/src/pages/CallPage.tsx`, `frontend/src/pages/GroupCallPage.tsx`, and
  `frontend/src/components/call/CallButtons.tsx` - current call controls and placeholder
  share/more buttons.
- `backend/src/main/java/com/vdt/webrtc/ws/message/MediaState.java` and
  `backend/src/main/java/com/vdt/webrtc/ws/message/MediaStateRelay.java` - model for recording-state
  signaling records.
- `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java` - signaling dispatch point;
  recording relay should validate live call relationship like media relay should.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PeerManager.ts` already exposes `getStats()` and `setSendersMaxBitrate()` by iterating
  `pc.getSenders()`. This is the natural place to add video/audio sender replacement helpers.
- `callActions.ts` already keeps the 1-1 `localStream` and active `PeerManager` in module scope, which
  fits screen share, recording composition, and device switching without putting media objects in Zustand.
- `roomActions.ts` and `MeshManager.ts` already hold group local media and per-peer managers outside
  React state. Device/screen replacement should follow this ownership model.
- `mediaControls.ts` already toggles `track.enabled` and relays `media-state`; preserve this state when
  swapping devices.
- `CallPage.tsx` and `GroupCallPage.tsx` already render `LabeledShareButton` / `LabeledMoreButton`
  placeholders, so the Phase 8 UI can attach real behavior without redesigning the call surface.
- Backend signaling already has sealed message records for media state relay; recording indicator can
  follow that path.

### Established Patterns
- WebRTC objects and streams stay in plain TypeScript modules/classes, not Zustand.
- Server relays signaling, but media stays peer-to-peer. Recording must be local client-side.
- Existing `media-state` makes remote UI indicators explicit instead of inferring from media frames; the
  recording indicator should be similarly explicit.
- Group call is additive and separate from 1-1; reuse `PeerManager`, but do not refactor 1-1 into rooms.

### Integration Points
- Screen share: button -> `getDisplayMedia` -> replace local video sender(s) -> update local preview ->
  `screenTrack.onended` -> restore current camera track.
- Device switch: More panel selector -> `enumerateDevices` / `getUserMedia({ deviceId })` -> preserve
  `enabled` state -> replace sender(s) -> stop old track when safe -> update preview and store labels.
- Speaker switch: selector -> call/video element `.setSinkId(deviceId)` when supported; hide otherwise.
- Recording: active 1-1 streams -> canvas compositor + audio mixer -> `MediaRecorder` -> preview modal
  and Download action.
- Recording indicator: local recording state -> signaling relay -> remote call store derived flag -> UI badge.

</code_context>

<specifics>
## Specific Ideas

- Prioritize a polished demo experience over the fastest minimal implementation.
- The recording preview should feel intentional: user stops recording, sees a playable preview, then
  downloads the `.webm`.
- Group-call screen share and device switching should feel first-class, not half-hidden, but group-call
  recording remains out of scope.

</specifics>

<deferred>
## Deferred Ideas

- Group-call recording/compositing (ADV-05) - future phase; likely requires multi-tile canvas composition
  and more complicated audio mixing.
- Recording uploads, cloud storage, permissions, and retention policy - future product capability.
- Recording metadata in call history - future history/admin extension.
- Second-video-stream screen share with camera still visible as a separate remote track - future richer UX.

</deferred>

---

*Phase: 8-screen-share-recording-device-control*
*Context gathered: 2026-06-30*
