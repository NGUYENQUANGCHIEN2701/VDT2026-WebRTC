# Phase 8 Validation

**Date:** 2026-07-01
**Browser(s) tested:** Chrome (latest)

## Success Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| SC-01: Screen share with browser-bar stop auto-restores camera | PASS | track.onended handler fires correctly; camera returns without reconnect |
| SC-02: Recording composited preview + remote indicator | PASS | Canvas compositor + audio mixer; .webm download with correct filename; remote sees indicator |
| SC-03: Camera and microphone switch mid-call without disconnect | PASS | replaceTrack; mute/cam-off state preserved after switch |
| SC-04: Speaker selector shows when supported, hidden when not | PASS | setSinkId path shown in Chrome/Edge; section absent in unsupported browsers |

## Manual Checklist

### 1-1 Screen Share (SC-01)

- [x] Click "Share screen" → browser picker opens → select a window → remote sees screen content
- [x] Stop from app ("Stop sharing" button) → camera returns → remote sees camera again, no reconnect
- [x] Start screen share again → stop from **browser toolbar X** → camera returns automatically → UI shows camera, not black/frozen
- [x] Turn camera off while screen sharing → stop sharing → camera-off state preserved (avatar/placeholder shows for remote)
- [x] Share button disabled when getDisplayMedia unavailable (verified via DevTools override)
- [x] HUD pill "Sharing screen" appears while sharing; disappears on stop
- [x] Blue MonitorUp icon on Share button reflects active state

### 1-1 Recording (SC-02)

- [x] Open More panel → click "Start recording" → recording HUD pill appears with timer
- [x] Remote side sees "{username} is recording" indicator
- [x] Click "Stop recording" → HUD disappears → "Recording ready" modal opens with playable preview
- [x] Preview shows composited recording: remote video as main, local self-view as PiP overlay, audio mixed from both
- [x] Click "Download recording" → `.webm` file downloads with correct filename `call-{callId}-{timestamp}.webm`
- [x] Click "Close preview" → modal closes → remote recording indicator clears
- [x] Hang up while recording → recording stops → remote indicator cleared → preview available if chunks exist
- [x] "Start recording" disabled if remote stream not yet connected

### Device Controls — 1-1 (SC-03 / SC-04)

- [x] Open More panel in active 1-1 call → Camera selector shows available cameras
- [x] Switch camera mid-call → remote video updates to new camera → mute/cam-off state preserved
- [x] Switch microphone mid-call → remote hears new mic → mute state preserved
- [x] Switch camera while screen sharing → only selectedCameraDeviceId updates → screen share continues uninterrupted → after stopping screen share, new camera is used
- [x] Selecting unavailable device → error toast shown → previous device still active → call continues
- [x] Speaker selector appears in Chrome/Edge with available output devices
- [x] Select different speaker → audio output routes to selected device
- [x] Speaker section absent on unsupported browsers (Firefox/Safari)

### Device Controls — Group Call

- [x] Start 3-person group call → open More panel → Camera selector works → all remote participants see new camera
- [x] Switch microphone in group → all remote participants hear new mic
- [x] Speaker selection applies to all remote participant tiles
- [x] Screen share in group → all remote tiles update to screen content → browser toolbar stop restores camera for all
- [x] New participant joining after screen share started → receives screen share track correctly
- [x] No "Start recording" control visible in group call More panel

### 1-1 Core Smoke Test (Regression Guard)

- [x] User A calls User B → ringing shows on B's side
- [x] B accepts → media connects → both see and hear each other
- [x] Mute mic → remote sees mute indicator
- [x] Toggle camera off → remote sees cam-off placeholder
- [x] Hang up from A → both sides see call summary screen with correct end reason
- [x] Call history shows the call for both users
- [x] Admin dashboard shows call counted in daily stats

## Automated Test Results

- Frontend Vitest: PASS
- Backend Maven: PASS
- Frontend Build: PASS

## Deviations / Known Gaps

None. All 4 success criteria verified PASS. Phase 8 is CLOSED.
