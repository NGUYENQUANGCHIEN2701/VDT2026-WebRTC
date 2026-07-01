---
phase: quick
plan: 260701-tkz
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/webrtc/recording.ts
  - frontend/src/webrtc/recording.test.ts
  - frontend/src/pages/GroupCallPage.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Downloaded group-call recording's normal-grid composition uses a 2-column layout, and when there are exactly 3 participants the 3rd tile is centered full-width below the first two — matching what the user saw on screen during the call."
    - "Downloaded group-call recording's screen-share composition shows one large main region (screen-share content), a large speaker tile, and a thumbnail row for remaining participants, in the same proportions as the live presentation-layout."
    - "Layout mode used by the recorder reflects the live isScreenSharing state at each drawn frame, so a mid-call toggle between grid and presentation layout is reflected in the recording without needing to restart recording."
  artifacts:
    - "frontend/src/webrtc/recording.ts exports pure layout-math helper functions (grid layout with 3-participant special case, presentation layout) that are unit-testable independent of canvas/video rendering."
    - "frontend/src/webrtc/recording.test.ts has new passing tests covering: 2-column grid math for counts 1/2/4, the 3-participant centered-tile case, and presentation-mode region math (main/speaker/thumbnails)."
  key_links:
    - "GroupCallPage.tsx passes a live isScreenSharing getter/reader into RecordingController.start() (or via a dedicated setter called from the existing isScreenSharing effect) so the draw loop can read current screen-share state every frame instead of only at start() time."
    - "RecordingController.draw() branches on the current screen-share state each frame: presentation composition (main + speaker + thumbnails) when true, grid composition (with 3-participant special case) when false."
---

<objective>
Fix `RecordingController`'s canvas compositor (`frontend/src/webrtc/recording.ts`) so the downloadable recording mirrors the actual on-screen layout of `GroupCallPage.tsx`, instead of recomputing a generic `ceil(sqrt(count))` square grid from participant count alone.

Purpose: Currently a user who screen-shares or has exactly 3 participants sees one layout live but downloads a recording composed with an unrelated square-grid layout. This breaks the "what you see is what you get" expectation for the recording feature shipped in Phase 8.

Output:
- `recording.ts` gains pure, testable layout-math helpers mirroring `gridStyle()` + the `isThirdInThree` special case, and a presentation-mode layout helper mirroring `.presentation-main` / `.presentation-sidebar` / `.presentation-speaker` / `.presentation-thumbnails` proportions from `GroupCallStyles.css`.
- `RecordingController` accepts a way to know the live screen-share state (continuously, not just at `start()` time) and redraws each canvas frame using the layout matching that state.
- `GroupCallPage.tsx` wires this live screen-share state into the controller with minimal changes (no on-screen UI redesign).
- `recording.test.ts` continues to pass and gains coverage for the new layout math.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@frontend/src/webrtc/recording.ts
@frontend/src/webrtc/recording.test.ts
@frontend/src/pages/GroupCallPage.tsx
@frontend/src/pages/GroupCallStyles.css
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract layout-math helpers and wire them into the draw loop</name>
  <files>frontend/src/webrtc/recording.ts, frontend/src/webrtc/recording.test.ts</files>
  <behavior>
    - `computeGridLayout(count, width, height)` returns an array of `{ x, y, width, height }` rects, one per tile index, using a 2-column layout matching `gridStyle()` in GroupCallPage.tsx:
      - count === 1: single rect filling the full width/height (1 col x 1 row).
      - count === 2: two rects side by side, each half-width, full height (`repeat(2, 1fr)` columns, `1fr` row — matches the `count <= 2` branch of `gridStyle`).
      - count === 3: rect[0] and rect[1] are the normal top-row half-width/half-height cells (2 cols x 2 rows grid); rect[2] ("isThirdInThree") is centered, full-row-width but rendered at half canvas width centered horizontally, positioned in the second row — mirroring `gridColumn: '1 / -1', justifySelf: 'center', width: '50%'` from the JSX.
      - count === 4 (and other counts > 3): standard 2-column, N-row grid (`Math.ceil(count / 2)` rows), each cell `width/2` by `height/rows` — matches the `else` branch of `gridStyle` (2 cols, `repeat(2, 1fr)` rows literal only applies to count in {3,4}; for count > 4 continue extending rows using the same 2-col/N-row math since GroupCallPage does not special-case beyond 3).
      - Row-major placement: index -> col = index % 2, row = floor(index / 2), except the count===3 special case above.
    - `computePresentationLayout(remoteCount, width, height)` returns `{ main: rect, speaker: rect, thumbnails: rect[] }` approximating the CSS flex proportions in GroupCallStyles.css: main region flex-basis 6.5 of (6.5+3.5)=10 total horizontal flex (main width ≈ width * 0.65, minus half the 16px gap), sidebar occupies the remaining ≈0.35 width; within the sidebar, speaker tile fills available sidebar height above a fixed-height thumbnail row (thumbnails height ≈ 140px scaled proportionally to canvas HEIGHT/on-screen viewport height, speaker fills the rest); thumbnails is one rect per remote participant laid out in a single equal-width row spanning the sidebar width (mirrors `.presentation-thumbnails` flex row, `flex: 1` per `.presentation-thumbnail-wrapper`). Handle `remoteCount === 0` by returning an empty thumbnails array without dividing by zero.
    - Both helpers are pure functions (no canvas/video/DOM access) so they can be unit tested directly with plain number assertions.
    - Test cases to add in recording.test.ts: `computeGridLayout` for count=1 (full canvas), count=2 (two equal side-by-side halves), count=3 (verify rect[2] is centered/half-width and positioned below the first row), count=4 (2x2 equal grid); `computePresentationLayout` for remoteCount=0, remoteCount=1, remoteCount=3 (verify main rect ~65% width, sidebar rects fill remaining width, thumbnails array length matches remoteCount and each thumbnail rect has equal width summing to the sidebar width).
  </behavior>
  <action>
    Add `computeGridLayout` and `computePresentationLayout` as exported pure functions near the top of recording.ts (after the WIDTH/HEIGHT/FPS constants, before the RecordingController class), replacing the inline `cols`/`rows`/`cellWidth`/`cellHeight` math currently in `draw()` (lines ~217-220). Both take only primitive numeric args (`count`/`remoteCount`, `width`, `height`) and return plain rect objects/arrays — no DOM/canvas coupling — so they satisfy the Nyquist rule directly via unit tests. Export a shared `Rect = { x: number, y: number, width: number, height: number }` type used by both helpers' return values.

    Add a private `isScreenSharing: (() => boolean) | undefined` field on `RecordingController`, set from a new optional `isScreenSharing?: () => boolean` field on `RecordingControllerOptions` (constructor already destructures `options`; add this alongside `onError`). Rewrite `private draw = (): void => {}` (lines 208-234) to read `const sharing = this.isScreenSharing?.() ?? false` each invocation, then branch:
      - `sharing === false`: build `allVideos` exactly as today (local + remoteVideos in order), call `computeGridLayout(allVideos.length, WIDTH, HEIGHT)`, and draw each `allVideos[i]` (or placeholder) into the returned rect via the existing `drawVideoOrPlaceholder` helper (reuse as-is, just pass `rect.x, rect.y, rect.width, rect.height`).
      - `sharing === true`: call `computePresentationLayout(this.remoteVideos.length, WIDTH, HEIGHT)`. Draw the local video (`this.localVideo`/`this.localLabel`) into `layout.main` (the screen-share content is carried on the local video element per GroupCallPage's screen-share flow, where the local stream IS the presentation's screen-share track) and again into `layout.speaker` (mirrors GroupCallPage's own "speaker" tile currently also showing the local self-view per the read source at lines 268-280), then draw `this.remoteVideos[i]` into `layout.thumbnails[i]` for each remote video, iterating only up to `Math.min(this.remoteVideos.length, layout.thumbnails.length)` to stay defensive.
    Keep the `ctx.fillRect` full-canvas background fill and the `requestAnimationFrame(this.draw)` scheduling unchanged (still the last line of `draw`).
  </action>
  <verify>
    <automated>cd frontend && npx vitest run src/webrtc/recording.test.ts</automated>
  </verify>
  <done>All existing recording.test.ts tests still pass; new tests for computeGridLayout (counts 1/2/3/4) and computePresentationLayout (remoteCount 0/1/3) pass, asserting the 3-participant centered/half-width rect and the ~65/35 main/sidebar split.</done>
</task>

<task type="auto">
  <name>Task 2: Wire live screen-share state from GroupCallPage into the recording controller</name>
  <files>frontend/src/pages/GroupCallPage.tsx</files>
  <action>
    In `startRecording()` (lines ~133-157), add `isScreenSharing: () => useRoomStore.getState().isScreenSharing` to the `RecordingControllerOptions` object passed to `new RecordingController({...})`, alongside the existing `callId`, `localLabel`, and `onError` fields. This reads the live store value at draw-time (not the stale `isScreenSharing` value closed over from the component's render), so a mid-call screen-share toggle is picked up by the recorder's next animation frame without needing to restart the recorder. Do not change `controller.start(...)`'s existing positional arguments (`localStream, remoteStreams, room.roomId, remoteLabels`) — the new behavior is entirely carried through the options getter added in Task 1. Do not modify the on-screen JSX, `gridStyle()`, or the `presentation-layout` render branch (lines ~254-303) — those already reflect the correct live UI and are the source of truth the recorder now mirrors.
  </action>
  <verify>
    <automated>cd frontend && npx tsc --noEmit -p tsconfig.app.json</automated>
  </verify>
  <done>GroupCallPage.tsx type-checks cleanly; RecordingController is constructed with an isScreenSharing getter reading useRoomStore.getState().isScreenSharing; no on-screen layout code was touched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| N/A | Client-only canvas composition change; no new trust boundary, network input, or persisted data. Recording pixels are derived entirely from the same local/remote MediaStream tracks already rendered on screen. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick260701-01 | Denial of Service | `computePresentationLayout` divide-by-zero on `remoteCount === 0` | low | mitigate | Task 1 explicitly requires handling `remoteCount === 0` without division by zero (return empty thumbnails array; main/speaker rects computed independent of thumbnail count). |

No new external input, no new data persistence, no new attack surface — this is a pure client-side rendering-fidelity fix.
</threat_model>

<verification>
1. `cd frontend && npx vitest run src/webrtc/recording.test.ts` — all existing + new tests pass.
2. `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — no new type errors introduced by the options field or GroupCallPage wiring.
3. Manual smoke check (not automated): start a group call with 3 participants, start recording, verify after stopping that the previewed/downloaded recording shows the 3rd tile centered below the first two (not a plain 2x2 grid with a blank 4th cell). Repeat while screen sharing active to confirm main/speaker/thumbnails composition appears instead of a square grid.
</verification>

<success_criteria>
- `computeGridLayout` and `computePresentationLayout` exist as pure, exported, unit-tested functions in recording.ts.
- `RecordingController.draw()` no longer computes `Math.ceil(Math.sqrt(count))`; it delegates to the two new helpers and branches on live screen-share state each frame.
- `GroupCallPage.tsx` supplies the live `isScreenSharing` reader with a single-line addition to the existing `RecordingController` construction; no on-screen UI/CSS changed.
- All pre-existing recording.test.ts assertions still pass; new assertions cover the 3-participant special case and presentation-mode proportions.
</success_criteria>

<output>
Create `.planning/quick/260701-tkz-fix-group-call-recording-to-mirror-the-o/260701-tkz-SUMMARY.md` when done
</output>
