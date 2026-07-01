---
phase: 08-screen-share-recording-device-control
plan: 03
status: complete
completed: 2026-07-01
type: implementation
wave: 3
---

# 08-03 Summary: Recording UI and Media Controls

## What Changed

### Recording Engine

- Added `frontend/src/webrtc/recording.ts`.
- Implemented `selectMimeType()` with WebM MIME fallback ordering.
- Implemented `RecordingController` with:
  - canvas composition for remote video plus local PiP,
  - local and remote audio mixing through `AudioContext`,
  - `MediaRecorder` chunk collection,
  - stop/preview URL result,
  - cleanup for animation frame, audio context, canvas stream tracks, and object URL.
- Kept all non-serializable recording objects inside the controller, not Zustand.

### 1-1 Call UI

- Wired `CallPage.tsx` screen-share toggle through `startScreenShare()` and `stopScreenShare()`.
- Added More panel open/close.
- Wired local recording start/stop through `RecordingController`.
- Added recording-state signaling through `sendRecordingState()`.
- Added local and remote recording HUD indicators.
- Added recording preview modal with playback, duration, file type, download, and close.
- Added selected speaker `setSinkId` effect for the remote video element.
- Added local stream rebind on `localStreamVersion`.

### Group Call UI

- Wired `GroupCallPage.tsx` screen-share toggle through room actions.
- Added More panel in group mode with no recording controls.
- Passed selected speaker `sinkId` to remote participant tiles.
- Passed local stream version to self tile.
- Added local screen-share badge support through `ParticipantTile.tsx`.

### Shared Components and Styles

- Extended `CallButtons.tsx` labeled Share/More buttons with active, loading, disabled, `aria-pressed`, and `aria-busy` support.
- Added `MorePanel.tsx` with camera, microphone, speaker, and 1-1-only recording controls.
- Added `RecordingPreviewModal.tsx`.
- Added CSS for More panel, HUD pills, recording preview modal, screen-share badge, and active button state.
- Fixed `Toaster.tsx` type-only import so production build passes with `verbatimModuleSyntax`.
- Adjusted `recording.test.ts` to avoid TypeScript parameter-property syntax blocked by `erasableSyntaxOnly`.

## Verification

### Automated Gates

- `cd frontend && npx vitest run src/webrtc/recording.test.ts`
  - PASS: 1 file, 8 tests.
- `cd frontend && npx vitest run`
  - PASS: 6 files, 38 tests.
- `cd frontend && npx tsc --noEmit`
  - PASS.
- `cd frontend && npm run build`
  - PASS.

### Notes

- Vitest prints jsdom "Not implemented" warnings for `HTMLMediaElement.play()` and canvas `getContext()` in the recording tests. They are warnings from the test environment, not failed assertions.
- Backend was not modified in this wave. The backend recording relay was implemented and verified in Wave 2.

## Success Criteria Check

- [x] `recording.ts` exists with `RecordingController` and `selectMimeType`.
- [x] `recording.test.ts` is GREEN.
- [x] `wsClient.ts` routes `recording-state-relay` to the 1-1 call signal handler.
- [x] `sendRecordingState(recording)` is exported from `callActions.ts`.
- [x] `CallButtons.tsx` supports active/loading/disabled for labeled Share and More buttons.
- [x] `MorePanel.tsx` renders Camera, Microphone, Speaker, and 1-1-only Recording sections.
- [x] `RecordingPreviewModal.tsx` renders preview, metadata, Download, and Close.
- [x] `CallPage.tsx` wires screen share, More panel, speaker output, recording lifecycle, indicators, and preview modal.
- [x] `GroupCallPage.tsx` wires group screen share, group More panel, sink IDs, and self-tile stream refresh.
- [x] `ParticipantTile.tsx` supports `sinkId` and screen-share badge props.
- [x] No third-party UI libraries introduced.

## Deviations

- `MorePanelProps` includes optional recording callbacks and `recordingDisabled` in addition to the base plan props. This keeps `RecordingController` lifecycle owned by `CallPage` instead of the popover.
- `Toaster.tsx` received a small type-only import fix because `npm run build` was blocked by the existing import style.

## Next

Execute Wave 4: `08-04-PLAN.md` for polish, guarded unsupported states, error toasts, state preservation, responsive bottom-sheet behavior, and full regression validation.
