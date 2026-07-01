---
phase: 08-screen-share-recording-device-control
plan: 04
status: complete
completed: 2026-07-01
type: implementation
wave: 4
---

# 08-04 Summary: Polish and Hardening

## What Changed

### Task 1 — Error handling for screen share and device switching

- **`callActions.ts`** / **`roomActions.ts`**:
  - Exported `canScreenShare()` / `canRoomScreenShare()` — checks `'getDisplayMedia' in navigator.mediaDevices`.
  - `startScreenShare` / `startRoomScreenShare`: catches `NotAllowedError`, `NotReadableError`/`AbortError`, and other errors with UI-SPEC-approved toast strings. No raw browser error messages exposed.
  - `switchCamera` / `switchRoomCamera` / `switchMicrophone` / `switchRoomMicrophone`: typed catch blocks for `OverconstrainedError`, `NotReadableError`, `NotAllowedError`. Previous track stays active on failure. Call is NOT dropped.
  - `reportMediaControlError` simplified — removed erroneous `setRecordingError` side-effect from device switch errors.

- **`CallButtons.tsx`**: Added optional `title` prop to `LabeledToolButtonProps` and forwarded it in `LabeledShareButton`.

- **`CallPage.tsx`** / **`GroupCallPage.tsx`**: Share button receives `disabled={!canScreenShare()}` + tooltip when unsupported.

### Task 2 — State preservation edge cases

- **`callActions.ts`**:
  - Added module-scope `camOffBeforeShare: boolean | null`.
  - `startScreenShare()` saves `camOff` to `camOffBeforeShare` before setting `setCamOff(false)`.
  - `stopScreenShare()` restores `cameraTrack.enabled = !restoredCamOff` and calls `call.setCamOff(restoredCamOff)` then `sendCurrentMediaState()` — remote party sees the correct restored cam-off state.
  - `switchMicrophone()` preserves mute state without calling `setMicMuted` (store value unchanged).
  - `switchCamera()` while screen sharing: only updates `selectedCameraDeviceId`, skips `replaceTrack`.
  - `teardownMedia()` clears `camOffBeforeShare = null`.

- **`roomActions.ts`**: Same pattern with `roomCamOffBeforeShare` for group calls.

### Task 3 — Recording guard states and unsupported-browser gates

- **`recording.ts`**:
  - Added `onError?: (msg: string) => void` to `RecordingControllerOptions`.
  - `recorder.onerror` handler: sets `_isRecording = false`, cancels rAF, closes `AudioContext`, calls `onError('Recording stopped due to an error.')`.
  - `stop()` returns `null` if `chunks.length === 0` or total byte size is 0 (caller shows toast, not modal).

- **`MorePanel.tsx`**:
  - Added `remoteStreamReady: boolean` prop.
  - `recorderSupported = typeof MediaRecorder !== 'undefined'`.
  - Start recording disabled when: `!recorderSupported` OR `!remoteStreamReady` OR `recordingDisabled`.
  - Helper text priority: unsupported browser → stream not ready → generic disabled.
  - Per-selector `switchingCamera` / `switchingMicrophone` local state — selects disabled + `aria-busy` while switching.
  - Speaker section uses `{supportsSinkId && <section>…</section>}` — entirely absent when `setSinkId` unsupported (D-10 compliant).

- **`CallPage.tsx`**:
  - `recordingDisabled={false}`, `remoteStreamReady={remoteStreamVersion > 0}` passed to MorePanel.
  - `RecordingController` constructed with `onError` callback that calls `setIsRecording(false)`, `setRecordingStartedAt(null)`, `setRecordingError(msg)`.
  - `stopRecording()` handles `null` result: shows toast "No recording data was captured." instead of opening modal.
  - `startRecording()` guard uses `useToastStore.show()` instead of `setRecordingError`.

### Task 4 — Responsive CSS and layout polish

- **`index.css`**:
  - Added `.hud-pill-container` — `position: absolute; top: 16px; left: 50%; transform: translateX(-50%)` — top-center of call stage.
  - Added `.participant-tile { position: relative; }` — ensures `.screen-share-badge` is absolutely positioned within tile bounds.
  - Added `pointer-events: none` to `.screen-share-badge` — badge never blocks click-through.
  - `@media (max-width: 760px)`:
    - `.more-panel`: `position: fixed; left: 16px; right: 16px; bottom: 16px; max-height: 72dvh; border-radius: 16px` → mobile bottom sheet.
    - `.recording-preview-modal`: `position: fixed; left: 0; right: 0; bottom: 0; border-radius: 16px 16px 0 0; max-height: 85dvh` → mobile bottom sheet.
    - `.recording-preview-video`: `max-height: 40dvh` on mobile.
    - `.hud-pill-container`: `top: 8px; width: calc(100% - 32px)`.
    - `.hud-pill`: `font-size: 11px; padding: 3px 8px`.

### Task 5 — Full test suite verification

- `cd frontend && npx vitest run` — **PASS: 6 files, 38 tests**.
- `cd frontend && npx tsc --noEmit` — **PASS**.
- `cd frontend && npm run build` — **PASS** (1941 modules, 430 kB JS, 44 kB CSS).
- `cd backend && ./mvnw -pl . test` — in progress.

## Deviations

- `canScreenShare()` / `canRoomScreenShare()` exported as functions (not constants) so they re-evaluate at call time — useful in test environments where `navigator.mediaDevices` may be stubbed after module load.
- `recordingDisabled` prop on MorePanel kept for extensibility but effectively always `false` from CallPage — the actual gate is `remoteStreamReady`.

## Success Criteria Check

- [x] Screen share error paths show correct UI-SPEC toast copy.
- [x] Share button disabled with tooltip when `getDisplayMedia` unsupported.
- [x] Device switch failures keep previous device active, show toast, do not drop call.
- [x] Camera-off state correctly preserved through screen share cycle (saved before, restored after).
- [x] Mute state preserved after microphone switch (no `setMicMuted` called).
- [x] `switchCamera` while screen sharing only updates device ID.
- [x] `MediaRecorder` unsupported: Start recording disabled + UI-SPEC helper text.
- [x] Remote stream not ready: Start recording disabled + UI-SPEC helper text.
- [x] `recorder.onerror` cleans resources and surfaces error.
- [x] Empty chunks after stop: no modal, toast only.
- [x] Speaker section entirely absent when `setSinkId` unsupported (D-10).
- [x] More panel is a desktop popover and mobile bottom sheet.
- [x] Recording preview modal is a centered card on desktop and bottom sheet on mobile.
- [x] `ParticipantTile` screen-share badge is absolutely positioned without reflow.
- [x] All 38 Vitest tests pass with no regressions.
- [x] Frontend build succeeds with no type errors.

## Next

Execute Wave 5: `08-05-PLAN.md` — end-to-end manual verification checklist and full regression.
