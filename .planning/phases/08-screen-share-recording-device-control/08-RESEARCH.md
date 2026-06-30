# Phase 08 Research: Screen Share, Recording & Device Control

**Date:** 2026-06-30
**Scope:** Research only. Implementation guidance for Phase 08 planning.
**Phase:** `08-screen-share-recording-device-control`

## Executive Summary

Phase 08 should add three media-control capabilities around the existing call flows without refactoring the core call state machines:

- Screen share for 1-1 and group calls by replacing the outgoing video track with a display-capture track.
- Device controls for camera, microphone, and audio output, with mid-call camera/mic replacement through `RTCRtpSender.replaceTrack()`.
- Client-side 1-1 recording by compositing local and remote video into a canvas, mixing local and remote audio with Web Audio, and recording the resulting stream with native `MediaRecorder`.

The current architecture fits this well:

- `frontend/src/webrtc/PeerManager.ts` owns each `RTCPeerConnection`.
- `frontend/src/webrtc/MeshManager.ts` owns group fan-out across per-peer `PeerManager` instances.
- `frontend/src/realtime/callActions.ts` owns the 1-1 `localStream` and active peer in module scope.
- `frontend/src/realtime/roomActions.ts` owns group `localStream` and active mesh in module scope.
- Zustand stores currently hold only serializable derived state. Keep it that way.

The highest-risk area is not WebRTC renegotiation. The selected approach avoids renegotiation for same-kind track changes. The highest-risk areas are browser capability variance, lifecycle cleanup, remote recording signaling validation, and recording composition edge cases.

## Browser API Guidance

### `getDisplayMedia`

Use `navigator.mediaDevices.getDisplayMedia()` only from a direct user action, such as the share button click. Browsers require transient user activation, and the page must be a secure context.

Recommended request:

```ts
await navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: false,
})
```

Do not rely on display-audio capture for Phase 08. Browser support and source availability vary. The phase decision is screen share replacing camera video, while call recording should mix call audio from the local microphone and remote WebRTC stream. Treat display audio as out of scope unless deliberately added later.

Pitfalls:

- `getDisplayMedia({ video: false })` is invalid and rejects.
- User permission is not persistent; expect a prompt every time.
- Browser-specific options such as `systemAudio`, `surfaceSwitching`, `selfBrowserSurface`, and `monitorTypeSurfaces` are hints and not portable enough for core logic.
- Avoid exact/min constraints in display capture. Screen-capture constraints are more limited than `getUserMedia`.
- Handle `NotAllowedError`, `NotReadableError`, `AbortError`, `InvalidStateError`, and `TypeError` with user-facing toasts.
- Attach `screenTrack.onended` immediately. Browser toolbar stop must restore the camera track and local UI state.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

### `RTCRtpSender.replaceTrack`

Use `replaceTrack()` for all same-kind outgoing camera/screen/mic changes. It is the correct primitive for this phase because it replaces the media source on an existing sender without creating a new transceiver.

Add helpers to `PeerManager.ts`:

- `replaceVideoTrack(track: MediaStreamTrack | null): Promise<void>`
- `replaceAudioTrack(track: MediaStreamTrack | null): Promise<void>`
- Optionally a private `replaceTrack(kind, track)` helper.

Implementation detail:

```ts
const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video')
await sender?.replaceTrack(nextTrack)
```

If the sender has a null track because camera was previously replaced with null in a future path, search by previous transceiver/sender kind is harder. In the current code all peers are created by `addLocalStream(localStream)`, so searching by `sender.track?.kind` is enough if this phase never calls `replaceTrack(null)`. Prefer replacing with a disabled live track rather than null for camera-off, because the existing mute/camera-off behavior already uses `track.enabled`.

Group fan-out belongs in `MeshManager.ts`:

- `replaceVideoTrack(track)` should call every peer's `replaceVideoTrack(track)`.
- `replaceAudioTrack(track)` should call every peer's `replaceAudioTrack(track)`.
- After video replacement, reapply active bitrate limits with `setSendersMaxBitrate(activeMaxBitrate)` because screen-share tracks may alter sender parameters or encodings in browser-specific ways.

Pitfalls:

- `replaceTrack()` can reject if the new track kind differs or the swap would require renegotiation.
- Screen tracks may have much higher resolution than camera tracks. Existing bitrate caps help group calls, but planners should consider a screen-share bitrate policy if quality is too poor.
- Stop the old replaced track only after replacement succeeds, or the user may lose media if replacement fails.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/replaceTrack

### `MediaRecorder`

Use native `MediaRecorder` with an explicit MIME fallback ladder checked by `MediaRecorder.isTypeSupported()`.

Recommended order:

```ts
const candidates = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm',
  '',
]
```

Choose the first non-empty candidate for which `MediaRecorder.isTypeSupported(candidate)` returns true. If none match, instantiate with no `mimeType` only if `MediaRecorder` exists. On Safari, WebM support can vary; test manually on target browsers. If the browser cannot record the composed stream, show a clear unsupported-browser message and leave the call unaffected.

Use chunk collection:

- Create recorder with the composed stream.
- Push non-empty `BlobEvent.data` chunks in `ondataavailable`.
- On stop, create `new Blob(chunks, { type: recorder.mimeType || 'video/webm' })`.
- Create object URL for preview.
- Download as `call-{callId}-{timestamp}.webm`.
- Revoke previous object URLs when replaced or dismissed.

Recommended timeslice: `recorder.start(1000)` so data is flushed periodically instead of only at stop.

Pitfalls:

- `MediaRecorder` is not available or not equally capable in all browsers.
- `MediaRecorder.isTypeSupported()` returning true does not guarantee enough runtime resources.
- Do not put `MediaRecorder`, `Blob`, `AudioContext`, object URLs, or streams in Zustand. Put only flags and preview metadata in state if needed.
- Always stop recorder, canvas tracks, audio nodes, animation frame loops, and object URLs on call end.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static

### Canvas Composition and `captureStream`

For 1-1 recording, create an offscreen `HTMLCanvasElement` in a normal TypeScript service. Recommended default size:

- 1280x720 for predictable output and manageable CPU.
- 30 fps via `canvas.captureStream(30)`.

Draw loop:

- Remote video as the main full-canvas surface.
- Local video as a small overlay, bottom-right, around 22-28% canvas width.
- If a video track is muted/off/missing, draw a neutral placeholder panel with username/label.
- Use `requestAnimationFrame` while recording.

The recorder should not depend on visible DOM videos if avoidable, but it can use hidden video elements assigned to `remoteStream` and `localStream` for `drawImage()`. Ensure each video has `muted`, `playsInline`, and `play()` handling. If `video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA`, draw the placeholder for that frame.

Pitfalls:

- Canvas capture records only what the canvas draws. If the draw loop stops, the recording freezes.
- If the canvas is tainted by cross-origin media, capture can fail. WebRTC local/remote streams are not cross-origin images, so this should not taint.
- Do not mirror the recorded local self-view unless product wants the recording to match local preview. A recording usually should not mirror the camera; the visible self-view can remain mirrored.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream

### AudioContext Mixing

Use `AudioContext` plus `createMediaStreamDestination()`:

```ts
const ctx = new AudioContext()
const dest = ctx.createMediaStreamDestination()
for (const stream of [localStream, remoteStream]) {
  if (stream.getAudioTracks().length === 0) continue
  const source = ctx.createMediaStreamSource(stream)
  const gain = ctx.createGain()
  gain.gain.value = 1
  source.connect(gain).connect(dest)
}
```

Then combine tracks:

```ts
const mixed = new MediaStream([
  ...canvas.captureStream(30).getVideoTracks(),
  ...dest.stream.getAudioTracks(),
])
```

Pitfalls:

- Create/resume the `AudioContext` from a user action if the browser suspends it.
- If remote audio is unavailable at the moment recording starts, either start without it or allow adding a source when the remote stream arrives. The existing 1-1 remote stream is available through `getRemoteStream()`, but the track can arrive after connection state changes.
- Local mic mute currently uses `track.enabled = false`. A muted local track should produce silence in the recording, which is correct.
- Close the `AudioContext` when recording stops.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination

### `enumerateDevices` and `deviceId` Constraints

Use `navigator.mediaDevices.enumerateDevices()` to populate Camera, Microphone, and Speaker selectors. It requires a secure, visible, fully active document. Device labels may be empty until the user has granted camera/mic permission or an active stream exists.

For camera switch:

```ts
await navigator.mediaDevices.getUserMedia({
  video: { deviceId: { exact: selectedDeviceId } },
  audio: false,
})
```

For microphone switch:

```ts
await navigator.mediaDevices.getUserMedia({
  video: false,
  audio: {
    deviceId: { exact: selectedDeviceId },
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
})
```

Implementation guidance:

- Extend `frontend/src/webrtc/media.ts` with reusable constants for audio constraints and helpers for enumerating devices and acquiring a single selected track.
- Store selected device IDs and labels in UI state or serializable store fields only. Never store `MediaDeviceInfo` objects if not needed.
- Listen for `navigator.mediaDevices.ondevicechange` while the More panel is open or call page is mounted, then refresh the list.
- Preserve existing mute/camera-off state: set `newAudioTrack.enabled = !micMuted`; set `newVideoTrack.enabled = !camOff`.
- Replace the sender track, then replace the corresponding track in the module-scope local stream and stop the old track.

Pitfalls:

- `deviceId` may change between sessions and can be privacy-scoped.
- `exact` constraints can throw `OverconstrainedError`; show a toast and keep the previous device active.
- Enumerating before permission may show generic/blank labels.
- `getUserMedia` for switching may prompt or fail mid-call. Do not tear down the call on failure.

References:

- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices
- https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/deviceId

### `setSinkId`

Speaker selection should be capability-gated:

```ts
const supportsOutputSelection = 'setSinkId' in HTMLMediaElement.prototype
```

Apply it to the remote audio/video element that renders received audio:

```ts
await remoteVideo.setSinkId(selectedOutputDeviceId)
```

For 1-1 this is `CallPage.tsx`'s `remoteRef`. For group, apply the selected sink ID to every remote participant tile video element. That likely means passing a `sinkId` prop to `ParticipantTile` and running an effect on its `<video>` element when `sinkId` changes.

Pitfalls:

- Unsupported browsers should hide the speaker selector.
- `setSinkId` requires secure context and can be blocked by permission policy.
- It may reject with `NotAllowedError`, `NotFoundError`, or `AbortError`.
- Do not apply sink ID to the muted local self-view.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId

## Existing Frontend Extension Plan

### `PeerManager.ts`

Add sender replacement helpers here because this class owns `RTCPeerConnection` and already iterates senders for bitrate.

Recommended additions:

- `replaceVideoTrack(track: MediaStreamTrack): Promise<void>`
- `replaceAudioTrack(track: MediaStreamTrack): Promise<void>`
- `getSendersByKind(kind)` private helper if desired.

Behavior:

- Find existing sender by `sender.track?.kind`.
- Call `replaceTrack`.
- For video, call `setSendersMaxBitrate()` after replacement if the caller asks or if `MeshManager` reapplies it.
- Do not mutate local streams in `PeerManager`; stream ownership remains in `callActions.ts` / `roomActions.ts`.

### `MeshManager.ts`

Add mesh fan-out:

- `replaceVideoTrack(track): Promise<void>`
- `replaceAudioTrack(track): Promise<void>`

Behavior:

- Call the matching method on every peer.
- Reapply `activeMaxBitrate` after video replacement.
- If a peer joins after a replacement, `ensurePeer()` already calls `peer.addLocalStream(this.localStream)`, so keeping `this.localStream` updated in `roomActions.ts` is enough for new peers to receive current camera/screen/mic tracks.

One caveat: `localStream` is stored as a readonly reference in `MeshManager`, but the `MediaStream` object itself can be mutated. Replacing tracks inside the same `MediaStream` object is sufficient.

### Shared Local Track Replacement Helper

Create a frontend helper module, for example `frontend/src/realtime/mediaDevices.ts` or `frontend/src/webrtc/deviceControls.ts`, with pure media operations:

- `replaceTrackInStream(stream, oldTrack, newTrack)`
- `getCurrentTrack(stream, kind)`
- `stopTrack(track)`
- `acquireVideoTrack(deviceId?)`
- `acquireAudioTrack(deviceId?)`
- `enumerateMediaDevices()`

Keep call-specific signaling in `mediaControls.ts`, `callActions.ts`, and `roomActions.ts`.

### 1-1 Flow: `callActions.ts` and `mediaControls.ts`

Expose 1-1 functions:

- `startScreenShare()`
- `stopScreenShare()`
- `switchCamera(deviceId: string)`
- `switchMicrophone(deviceId: string)`
- `startRecording()`
- `stopRecording()`
- optionally getters for recording preview state if kept outside React.

Screen share flow:

1. User clicks `LabeledShareButton`.
2. `getDisplayMedia({ video: true, audio: false })`.
3. Take the display video track.
4. Set `screenTrack.enabled = !useCallStore.getState().camOff`. If camera is off, planner must decide whether screen share should force video on. Recommended: screen share is an explicit video-sharing action, so set `camOff = false`, enable the screen track, and relay media-state. This should be called out in UX copy.
5. `await peer.replaceVideoTrack(screenTrack)`.
6. Replace the video track in `localStream` with the screen track, but keep the previous camera track in module scope as `cameraTrackBeforeScreenShare` or reacquire camera on stop.
7. Bump local preview. Current `CallPage.tsx` only reruns local `srcObject` effect on `callState` and remote stream version, so add a serializable `localStreamVersion` / `localPreviewVersion` to `callStore` or local React state.
8. Set `isScreenSharing` in `callStore`.
9. Attach `screenTrack.onended = stopScreenShare`.

Stop/revert flow:

1. Ignore duplicate stops with an `isRestoringCamera` guard.
2. Reuse a saved camera track if live and same selected device, otherwise call `getUserMedia({ video: selectedCameraDeviceId ? { deviceId: { exact } } : true, audio: false })`.
3. Preserve camera-off state if the user turned camera off while sharing: `cameraTrack.enabled = !camOff`.
4. Replace sender video track.
5. Replace track in `localStream`.
6. Stop screen track.
7. Clear `isScreenSharing`, bump local preview.

Device switch flow:

1. Acquire the selected new track.
2. Set `enabled` based on current mute/cam state.
3. Replace sender track.
4. Replace track in `localStream`.
5. Stop old track.
6. Update selected device ID/label and bump local preview.
7. If switching camera while screen sharing, recommended behavior is to update `selectedCameraDeviceId` but keep the screen track active; the new camera applies after screen share stops.

Recording flow:

- Implement as a service or hook outside Zustand, for example `frontend/src/webrtc/recording.ts`.
- Inputs: `callId`, local stream getter, remote stream getter, local/remote labels, callbacks.
- State to expose to UI: `isRecording`, `recordingStartedAt`, `recordingError`, `previewUrl`, `previewMimeType`, `downloadName`.
- When recording starts, send `recording-state` with `recording: true`.
- When recording stops or call ends, send `recording-state` with `recording: false`.
- If the WebSocket is disconnected, local recording can continue, but on reconnect the app should re-send the current recording state if call is still active.

### Group Flow: `roomActions.ts`

Expose group functions:

- `startRoomScreenShare()`
- `stopRoomScreenShare()`
- `switchRoomCamera(deviceId: string)`
- `switchRoomMicrophone(deviceId: string)`
- `setRoomSinkId(deviceId: string)`

Use the same local stream mutation pattern as 1-1, then call `mesh.replaceVideoTrack()` or `mesh.replaceAudioTrack()`.

No group recording in this phase. The UI should not show a recording button on `GroupCallPage.tsx`.

### Stores

Add only serializable fields.

`callStore.ts` candidates:

- `isScreenSharing: boolean`
- `localStreamVersion: number`
- `selectedCameraDeviceId: string | null`
- `selectedMicrophoneDeviceId: string | null`
- `selectedSpeakerDeviceId: string | null`
- `isRecording: boolean`
- `remoteRecording: boolean`
- `recordingStartedAt: number | null`
- `recordingPreviewUrl: string | null` if the team accepts object URLs in state. Safer alternative: keep URL in component state and store only `hasRecordingPreview`.

`roomStore.ts` candidates:

- `isScreenSharing: boolean`
- `localStreamVersion: number`
- `selectedCameraDeviceId: string | null`
- `selectedMicrophoneDeviceId: string | null`
- `selectedSpeakerDeviceId: string | null`

Avoid storing `MediaStream`, `MediaStreamTrack`, `MediaRecorder`, `AudioContext`, `HTMLVideoElement`, or `MediaDeviceInfo`.

### UI Integration

`CallPage.tsx`:

- Wire `LabeledShareButton` to screen share toggle. Show active state and label change if component supports it.
- Wire `LabeledMoreButton` to a More panel with Camera, Microphone, Speaker, and Recording controls.
- Add a persistent remote recording indicator when `remoteRecording` is true.
- Add a local recording indicator/timer while recording.
- Add a recording preview modal/panel after stop with `<video controls src={previewUrl}>` and Download.
- Apply selected sink ID to `remoteRef.current`.
- Rerun local video `srcObject` assignment when `localStreamVersion` changes.

`GroupCallPage.tsx`:

- Wire share button to room screen share toggle.
- Add a More/settings control for Camera, Microphone, and Speaker. Current bottom bar uses `LabeledParticipantsButton`; planners should decide whether to replace the top-right `MoreVertical` with the More panel or add `LabeledMoreButton` while keeping participants reachable.
- Pass `localStreamVersion` to the self `ParticipantTile`; the current `selfVideoVersion` ref never increments.
- Pass selected sink ID to remote participant tiles and call `setSinkId` in `ParticipantTile`.

## Backend Signaling Changes

### Message Records

Add:

- `backend/src/main/java/com/vdt/webrtc/ws/message/RecordingState.java`
- `backend/src/main/java/com/vdt/webrtc/ws/message/RecordingStateRelay.java`

Suggested records:

```java
public record RecordingState(String callId, String to, boolean recording) implements ClientMessage {}
public record RecordingStateRelay(String from, String callId, boolean recording) implements ServerMessage {}
```

Add them to:

- `ClientMessage` `@JsonSubTypes` and `permits`.
- `ServerMessage` `@JsonSubTypes` and `permits`.
- Frontend `ClientMessage` and `CallServerSignal` unions in `frontend/src/realtime/messages.ts`.
- `wsClient.ts` routing. `recording-state-relay` should go only to `callSignalHandler`; group does not need it in this phase.

### Validation

Do not blindly relay `recording-state`. Validate sender and recipient are peers in the active 1-1 call:

- `callId` exists.
- state is `active`.
- `username` is caller or callee.
- `to` is the other participant in that call.

Recommended `CallService` helper:

```java
public boolean areActiveCallPeers(String callId, String actorId, String peerId) {
    return repo.find(callId)
        .filter(call -> "active".equals(call.state()))
        .filter(call -> actorId.equals(call.callerId()) || actorId.equals(call.calleeId()))
        .filter(call -> peerId.equals(call.callerId()) || peerId.equals(call.calleeId()))
        .filter(call -> !actorId.equals(peerId))
        .isPresent();
}
```

Then `PresenceWebSocketHandler` relays:

```java
if (callService.areActiveCallPeers(rs.callId(), username, rs.to())) {
    router.sendToUser(rs.to(), new RecordingStateRelay(username, rs.callId(), rs.recording()));
}
```

Also consider using the same validation for 1-1 `media-state`, `sdp`, and `ice-candidate` in a later hardening slice. For Phase 08, at minimum validate `recording-state` because it is a user-visible trust signal.

### Room/Group Validation

Recording indicator is 1-1 only. Group calls do not need recording-state. Existing group media-state is sent peer-by-peer with `to`, but the backend currently does not validate room membership. If planners include backend hardening in this phase, add a `RoomService.areRoomPeers(actor, peer)` or `RoomRepository.roomOf()` comparison for group `media-state`, `sdp`, and `ice-candidate`.

## Testing and Verification Strategy

### Frontend Unit Tests

Use Vitest/jsdom with mocked browser APIs.

High-value tests:

- `PeerManager.replaceVideoTrack()` chooses the video sender and calls `replaceTrack`.
- `PeerManager.replaceAudioTrack()` chooses the audio sender.
- `MeshManager.replaceVideoTrack()` fans out to every peer and reapplies bitrate.
- Device switch helper preserves `enabled = false` when mic/cam is muted/off.
- Device switch helper stops old track only after successful replacement.
- MIME fallback chooses the first supported candidate and falls back gracefully.
- Recording controller stop cleans up recorder, tracks, animation frame, audio context, and object URLs.
- `CallPage` hides speaker selector when `setSinkId` is unsupported.
- `CallPage` shows remote recording indicator after `recording-state-relay`.

Mocking notes:

- jsdom does not implement real WebRTC, `MediaRecorder`, `AudioContext`, `captureStream`, or `setSinkId`; stub them.
- Use simple fake `MediaStreamTrack` objects with `kind`, `enabled`, `stop`, and `onended`.

### Backend Unit/Integration Tests

Add tests around message validation and dispatch.

High-value tests:

- `RecordingState` deserializes from `{"type":"recording-state",...}`.
- `RecordingStateRelay` serializes as `{"type":"recording-state-relay",...}`.
- Active caller can notify active callee.
- Active callee can notify active caller.
- Non-participant cannot send recording-state for a call.
- Participant cannot send recording-state to a third user.
- Ringing/ended/nonexistent call does not relay recording-state.
- Cross-instance route still delivers recording-state relay through `MessageRouter`.

Existing backend tests are sparse for WebSocket handler dispatch, so planners may add a narrow `PresenceWebSocketHandler` test with mocked `CallService`/`MessageRouter`, plus a `CallService` helper test.

### Manual Browser Checks

Manual checks are required because fake-media E2E does not fully cover screen-picker UI, real device switching, output routing, or native recording codecs.

1-1 Chrome/Edge:

- Start 1-1 call.
- Toggle screen share; remote sees screen without renegotiation/hang.
- Stop sharing from app; camera returns.
- Start screen share again; stop from browser toolbar; camera returns and UI updates.
- Turn camera off while sharing; stop sharing; camera remains off.
- Switch camera mid-call; remote video changes without reconnect.
- Switch microphone mid-call; remote hears new mic, mute state preserved.
- Speaker selector appears if supported; selected output changes or errors cleanly.
- Start recording; remote sees recording indicator.
- Stop recording; local preview plays a composited recording with remote main, local PiP, and mixed audio.
- Hang up while recording; recording stops, remote indicator clears best-effort, resources clean up.

Group Chrome/Edge:

- Start 3-4 person room.
- Screen share from one participant; every remote tile updates.
- Browser toolbar stop restores camera for every peer.
- Camera/mic switch fans out to all peers.
- New participant joining after a screen/camera switch receives the current track.
- Speaker selection applies to all remote tiles.
- No recording control is shown in group call.

Firefox/Safari:

- Verify screen share basic start/stop.
- Verify `MediaRecorder` support and codec fallback. Safari may require fallback behavior.
- Verify speaker selector hidden if `setSinkId` is unavailable.

### Build Verification

Minimum commands after implementation:

- Backend: `./mvnw test`
- Frontend: `npm run test:run`
- Frontend: `npm run build`

If E2E exists by Phase 09, add Playwright smoke coverage for fake camera/mic call survival during replaceTrack, but keep real screen-picker checks manual.

## Risks and Failure Modes

- Screen track ends from browser toolbar and app state remains stuck in "sharing". Mitigation: `track.onended` plus guarded restore.
- Replacement fails after stopping old track. Mitigation: replace first, stop old track after success.
- Camera-off/mute state is lost on device switch. Mitigation: set `newTrack.enabled` before replacement from store state.
- Group new peers receive stale camera/mic if `localStream` is not mutated. Mitigation: mutate the existing module-scope `MediaStream` after replacement.
- Local preview does not refresh after replacing tracks. Mitigation: add serializable local stream version counters.
- `MediaRecorder` unsupported or codec mismatch. Mitigation: MIME fallback ladder and unsupported UI.
- Recording misses remote track if started too early. Mitigation: allow start only when remote stream exists, or draw placeholder until remote video appears and attach audio source when available.
- AudioContext suspended. Mitigation: create/resume during user click and handle failure.
- CPU load from canvas recording plus WebRTC. Mitigation: 720p/30 fps default, stop draw loop on stop, test on demo hardware.
- Object URL leaks. Mitigation: revoke on preview close/new recording/reset.
- Remote recording indicator lies because arbitrary clients can send messages. Mitigation: backend validation against active call participants.
- Speaker selection unsupported. Mitigation: hide control unless `setSinkId` exists.
- Device labels blank before permission. Mitigation: open More panel after call media is active; use "Camera 1" fallback labels.
- Reconnect/resync while recording. Mitigation: keep recording local if streams recover, but clear/re-send remote indicator on call active resync.

## Recommended Plan Slices

### Slice 1: Sender Replacement Foundation

- Add `PeerManager` replace helpers.
- Add `MeshManager` fan-out helpers.
- Add local stream mutation helpers.
- Add tests for replacement and fan-out.

### Slice 2: Screen Share

- Add 1-1 screen share start/stop/revert.
- Add group screen share start/stop/revert.
- Add `isScreenSharing` and local preview version store fields.
- Wire share buttons and active UI state.
- Manual browser toolbar-stop check.

### Slice 3: Device Controls

- Add device enumeration/acquisition helpers.
- Add More panel selectors for camera/mic/speaker.
- Implement 1-1 device switching.
- Implement group device switching.
- Implement `setSinkId` gating and application.
- Preserve mute/camera-off states.

### Slice 4: Recording Core

- Add recording controller/service with canvas compositor, audio mixer, MIME fallback, cleanup.
- Add 1-1 UI start/stop controls and preview/download.
- Add call-end cleanup.
- Unit-test fallback and cleanup.

### Slice 5: Recording Signaling

- Add backend `RecordingState` / `RecordingStateRelay`.
- Add active-call peer validation.
- Add frontend message unions and handler.
- Add local and remote recording indicators.
- Test valid and invalid relays.

### Slice 6: Polish and Verification

- Error toasts for permission/device/recording failures.
- Ensure group UI has More controls without hiding participants.
- Cross-browser manual checks.
- Full build/test pass.

## Source Notes

Primary browser API references consulted:

- MDN `getDisplayMedia`: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
- MDN `replaceTrack`: https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/replaceTrack
- MDN `MediaRecorder.isTypeSupported`: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static
- MDN `canvas.captureStream`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
- MDN `AudioContext.createMediaStreamDestination`: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination
- MDN `enumerateDevices`: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices
- MDN `deviceId` constraints: https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/deviceId
- MDN `setSinkId`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId

