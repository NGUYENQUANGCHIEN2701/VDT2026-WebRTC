---
phase: quick
plan: 260701-tkz
subsystem: ui
tags: [webrtc, canvas, mediarecorder, group-call, recording, vitest]

requires:
  - phase: 08-screen-share-recording-device-control
    provides: RecordingController canvas compositor and RecordingControllerOptions shipped in Phase 8
provides:
  - Pure, unit-tested layout-math helpers (computeGridLayout, computePresentationLayout) mirroring GroupCallPage.tsx's on-screen tile layout
  - Live isScreenSharing getter wired into RecordingController so the draw loop reflects mid-call layout toggles
affects: [group-call, recording]

tech-stack:
  added: []
  patterns:
    - "Pure layout-math functions (no DOM/canvas coupling) extracted from a stateful draw loop for direct unit testability"
    - "Live state read via a constructor-injected getter callback (isScreenSharing: () => boolean) instead of a value snapshotted at start() time"

key-files:
  created: []
  modified:
    - frontend/src/webrtc/recording.ts
    - frontend/src/webrtc/recording.test.ts
    - frontend/src/pages/GroupCallPage.tsx

key-decisions:
  - "computeGridLayout mirrors gridStyle()'s 2-column grid exactly, including the isThirdInThree special case (rect[2] centered, half canvas width, positioned in the second row) instead of the old ceil(sqrt(count)) square grid."
  - "computePresentationLayout derives proportions directly from GroupCallStyles.css flex values (main:sidebar = 6.5:3.5, 16px gaps, 140px thumbnail row height, 12px inter-thumbnail gap) rather than hardcoding independent percentages."
  - "In presentation mode, both the recorder's main and speaker regions draw the local video track, matching GroupCallPage.tsx's own JSX where both presentation-main and presentation-speaker render the local self-view during screen sharing."
  - "isScreenSharing is read via useRoomStore.getState().isScreenSharing inside a getter passed to RecordingController, not a snapshotted boolean, so a mid-call toggle is picked up on the next animation frame without restarting the recorder."

patterns-established:
  - "Layout-math extraction pattern: any canvas/DOM compositor logic that mirrors on-screen CSS layout should be split into pure Rect-returning functions placed above the class, testable without a DOM or canvas context."

requirements-completed: []

coverage:
  - id: D1
    description: "computeGridLayout reproduces GroupCallPage.tsx's 2-column grid math for counts 1/2/3/4, including the 3-participant centered half-width tile in the second row."
    verification:
      - kind: unit
        ref: "frontend/src/webrtc/recording.test.ts#computeGridLayout"
        status: pass
    human_judgment: false
  - id: D2
    description: "computePresentationLayout reproduces GroupCallStyles.css's main/sidebar/speaker/thumbnails proportions for remoteCount 0/1/3, with no divide-by-zero at remoteCount=0."
    verification:
      - kind: unit
        ref: "frontend/src/webrtc/recording.test.ts#computePresentationLayout"
        status: pass
    human_judgment: false
  - id: D3
    description: "RecordingController.draw() branches on a live isScreenSharing() getter each frame, drawing the grid layout or presentation layout accordingly, and GroupCallPage.tsx supplies this getter reading the live Zustand store value."
    verification:
      - kind: unit
        ref: "frontend/src/webrtc/recording.test.ts (existing RecordingController suite, unchanged and still passing)"
        status: pass
      - kind: manual_procedural
        ref: "Start a group call with 3 participants, record, verify downloaded recording shows the 3rd tile centered below the first two; repeat while screen sharing to confirm main/speaker/thumbnails composition and mid-call toggle behavior."
        status: unknown
    human_judgment: true
    rationale: "Actual canvas pixel output and MediaRecorder-produced video frames cannot be verified by unit tests (jsdom has no real canvas/video rendering); a human must play back a real recording to confirm the on-screen layout is visually mirrored, per the plan's own manual verification step."

duration: 25min
completed: 2026-07-01
status: complete
---

# Quick Task 260701-tkz: Fix Group Call Recording to Mirror the On-Screen Layout Summary

**Extracted pure `computeGridLayout`/`computePresentationLayout` helpers mirroring GroupCallPage.tsx's CSS grid and presentation-mode proportions, and wired a live `isScreenSharing` getter into `RecordingController` so the canvas draw loop matches the actual on-screen layout every frame instead of a generic `ceil(sqrt(count))` square grid.**

## Performance

- **Duration:** 25 min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `recording.ts` now exports `computeGridLayout(count, width, height)` and `computePresentationLayout(remoteCount, width, height)` as pure, DOM-free functions returning plain `Rect` objects, replacing the inline `Math.ceil(Math.sqrt(count))` square-grid math in `draw()`.
- `computeGridLayout` reproduces the 2-column grid from `gridStyle()`, including the count===3 special case where the third tile is centered at half canvas width in the second row (mirrors `gridColumn: '1 / -1', justifySelf: 'center', width: '50%'`).
- `computePresentationLayout` reproduces the `.presentation-main` (flex 6.5) / `.presentation-sidebar` (flex 3.5) / `.presentation-speaker` / `.presentation-thumbnails` (140px height, 12px gaps) proportions from `GroupCallStyles.css`, safely returning an empty thumbnails array when `remoteCount === 0`.
- `RecordingController.draw()` reads a live `isScreenSharing` getter every animation frame and branches between the grid and presentation compositions, so a mid-call screen-share toggle is reflected in the recording without restarting it.
- `GroupCallPage.tsx` passes `isScreenSharing: () => useRoomStore.getState().isScreenSharing` into the `RecordingController` constructor — a one-line addition with no on-screen UI/CSS changes.
- `recording.test.ts` gained 7 new passing test cases (counts 1/2/3/4 for the grid helper; remoteCount 0/1/3 for the presentation helper); all 8 pre-existing tests still pass (15/15 total).

## Task Commits

Each task was committed atomically, following RED → GREEN TDD for Task 1:

1. **Task 1 (RED): Add failing tests for layout-math helpers** - `531425a` (test)
2. **Task 1 (GREEN): Extract layout-math helpers and wire them into the draw loop** - `5b986e9` (feat)
3. **Task 2: Wire live screen-share state from GroupCallPage into the recording controller** - `64912e8` (feat)

_TDD gate sequence verified in git log: test(recording) → feat(recording) → feat(recording)._

## Files Created/Modified
- `frontend/src/webrtc/recording.ts` - Added exported `Rect` type, `computeGridLayout`, `computePresentationLayout`; added `isScreenSharing` field/option; rewrote `draw()` to branch on live screen-share state using the new helpers instead of the old square-grid math.
- `frontend/src/webrtc/recording.test.ts` - Added `computeGridLayout` describe block (counts 1/2/3/4) and `computePresentationLayout` describe block (remoteCount 0/1/3); extended the `RecordingModule` test-only type with the two new exports.
- `frontend/src/pages/GroupCallPage.tsx` - Added `isScreenSharing: () => useRoomStore.getState().isScreenSharing` to the `RecordingControllerOptions` object in `startRecording()`.

## Decisions Made
- Both the presentation "main" and "speaker" canvas regions draw the local video track (not a second stream), matching the fact that GroupCallPage's own JSX renders the local self-view in both `.presentation-main` and `.presentation-speaker` during screen sharing — this is existing on-screen behavior, not a new assumption.
- Thumbnail row width math subtracts inter-thumbnail gaps (12px, matching `.presentation-thumbnail-wrapper`'s implicit flex gap) before dividing evenly across `remoteCount` — verified via a widths-plus-gaps-equal-sidebar-width test assertion.

## Deviations from Plan

None - plan executed exactly as written. One test assertion (`remoteCount=3` thumbnail width sum) was written more precisely than the plan's prose to account for inter-thumbnail gaps, which is a refinement of the plan's own described test case, not a deviation from behavior.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The recording feature now composes frames matching the live on-screen layout for both grid and presentation modes.
- Manual 2-browser (or 3-participant) verification is still recommended per the plan's own verification step 3 (not automatable — canvas/video pixel output requires visual playback of a real downloaded recording).
- No blockers for continuing Phase 9 (monitoring, CI/CD, full delivery) work.

---
*Phase: quick*
*Completed: 2026-07-01*

## Self-Check: PASSED

All claimed files verified present on disk; all claimed commit hashes (531425a, 5b986e9, 64912e8) verified present in git log.
