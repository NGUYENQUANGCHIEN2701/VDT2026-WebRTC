---
phase: quick-260702-lva
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/pages/CallPage.tsx
  - frontend/src/index.css
autonomous: false
requirements: [QUICK-FIX]

must_haves:
  truths:
    - "The 'Bạn' label visually sits on the small self-view PiP thumbnail (bottom-right, default state), not floating in the bottom-left corner of the full call screen"
    - "When local user is screen-sharing (self-video moves to the main stage top-left area), the label stays hidden per existing activeSharer !== 'local' condition — unchanged behavior"
    - "When camera is off, the avatar placeholder still fills the exact same PiP box as the video would"
    - "GroupCallPage / ParticipantTile already anchors its label correctly (position: relative wrapper) — confirmed no fix needed there"
  artifacts:
    - "frontend/src/index.css: .self-video-box (new wrapper class) replaces .self-video as the positioned element"
    - "frontend/src/pages/CallPage.tsx: video, camOff placeholder, and label are children of one wrapper div"
  key_links:
    - "CallPage.tsx self-view wrapper div className toggles self-video-box / self-video-box--presenting exactly where .self-video / .self-video--presenting toggled before"
    - ".self-video-label position:absolute now resolves against .self-video-box (positioned ancestor) instead of .call-video-stage"
---

<objective>
Fix the "Bạn" (self-view) label in the 1-1 call UI so it is always visually anchored to the small self-camera PiP thumbnail, in every layout state (default bottom-right PiP, and the screen-share "presenting" state where self-video moves to the main stage).

Purpose: Currently `.self-video-label` is a sibling of `.self-video` inside `.call-video-stage` (the full-screen stage). Since `.self-video-label` has no positioned ancestor other than the full-screen stage, its `bottom: 8px; left: 8px` resolves against the whole screen, not the small PiP box — so the label floats in the bottom-left corner of the call screen, disconnected from the actual self-camera thumbnail sitting bottom-right.
Output: CallPage.tsx renders self-video, camOff placeholder, and the "Bạn" label as children of a single positioned wrapper div; index.css moves the position/size/border/shadow/z-index ownership from `.self-video` to this new wrapper class so the label is always relative to the correct box, in both the default and presenting states.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Confirmed via investigation (do not re-diagnose):
- frontend/src/pages/CallPage.tsx lines ~291-314: self `<video>`, the camOff placeholder `<div className="self-video">`, and `<div className="self-video-label">Bạn</div>` are three SIBLINGS directly inside `<section className="call-video-stage">` (the full-screen root, `position: absolute; inset: 0`).
- frontend/src/index.css:
  - `.call-video-stage` (~line 1467): `position: absolute; inset: 0` — full-screen root.
  - `.self-video` (~line 1512): `position: absolute; right: 20px; bottom: 104px; z-index: 15; width: min(240px, 28vw); aspect-ratio: 16/10; border-radius: 10px; background: #111827; border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 18px 40px rgba(0,0,0,0.35)` — this is the small self-view PiP box.
  - `.self-video--presenting` (~line 1563): overrides `.self-video` positioning when local user is screen-sharing — self video moves to `top: 80px; left: 24px; right: auto; bottom: auto; width: calc(100% - 48px); height: calc(100% - 220px); z-index: 5; object-fit: contain; background: #000; border: 2px solid #3b82f6; border-radius: 16px; box-shadow: none`.
  - `.self-video-label` (~line 2236): `position: absolute; bottom: 8px; left: 8px; z-index: 5` plus pill styling — currently resolves against `.call-video-stage` because no ancestor between it and the stage is positioned.
  - `.call-video--pip` (~line 1547): unrelated — this is the REMOTE video's PiP styling when local is presenting; not touched by this fix.
- GroupCallPage.tsx has NO analogous `self-video`/`self-video-label` pattern — it uses `ParticipantTile.tsx`, whose root `<div style={{ position: 'relative', ... }}>` already correctly wraps its own `.participant-label-pill` as a child, so the label already anchors correctly there. No changes needed in GroupCallPage.tsx or ParticipantTile.tsx — this plan touches CallPage.tsx and index.css only.
- No test file (`*.spec.ts`, `*.test.ts`) references `.self-video`, `.self-video-label`, or the "Bạn" text — safe to refactor these class names without breaking test selectors (existing selectors use `data-testid="local-video"`, which is preserved on the `<video>` element).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wrap self-view video, camOff placeholder, and label in one positioned container</name>
  <files>frontend/src/pages/CallPage.tsx, frontend/src/index.css</files>
  <action>
In frontend/src/index.css, rename the current `.self-video` rule (~line 1512) to a new class `.self-video-box` and keep all its positioning/box properties as-is (position: absolute; right: 20px; bottom: 104px; z-index: 15; width: min(240px, 28vw); aspect-ratio: 16/10; border-radius: 10px; background: #111827; border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 18px 40px rgba(0,0,0,0.35)), and additionally add `overflow: hidden` so the inset-filled video/placeholder respect the box's rounded corners. Add a new `.self-video` rule directly after it that is purely a fill-rule for children of the box: position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover. This way the wrapper (`.self-video-box`) owns page-level placement, and `.self-video` (still applied to the `<video>` element, plus reused on the camOff placeholder `<div>` as it is today) just fills the wrapper edge-to-edge, preserving the current visual overlap behavior between the hidden video and the placeholder.

Rename `.self-video--presenting` (~line 1563) to `.self-video-box--presenting`, keeping the same override values (top: 80px; left: 24px; right: auto; bottom: auto; width: calc(100% - 48px); height: calc(100% - 220px); aspect-ratio: auto; z-index: 5; background: #000; border: 2px solid #3b82f6; border-radius: 16px; box-shadow: none) — this now overrides the wrapper's placement instead of the video's. Since object-fit ownership moved to the plain `.self-video` rule (cover by default), add a descendant override `.self-video-box--presenting .self-video { object-fit: contain; }` immediately after `.self-video-box--presenting` so the screen-share self-view still uses `contain` (not `cover`) exactly as it did before — the prior rule set `object-fit: contain` directly on the presenting video.

Leave `.self-video-label` (~line 2236) completely unchanged — it will now correctly resolve `position: absolute; bottom: 8px; left: 8px` against `.self-video-box` (its new nearest positioned ancestor) instead of `.call-video-stage`.

In frontend/src/pages/CallPage.tsx (~lines 291-314), replace the three sibling elements (self `<video>`, camOff placeholder `<div className="self-video">`, and `<div className="self-video-label">`) with a single wrapper `<div>` containing all three as children, in the same relative order. The wrapper's className toggles between `"self-video-box"` and `"self-video-box self-video-box--presenting"` using the same `activeSharer === "local"` condition that previously toggled `"self-video"` / `"self-video self-video--presenting"` on the video element. The `<video ref={selfRef} ...>` element keeps all its existing props (autoPlay, muted, playsInline, data-testid="local-video", aria-label, inline transform/visibility style) but its className becomes the plain `"self-video"` (no more presenting variant — that now lives on the wrapper). The camOff placeholder `<div className="self-video" style={{ display: 'grid', placeItems: 'center', background: '#1f2937' }}>...</div>` and its inner avatar circle are unchanged, just now nested inside the wrapper instead of being a stage-level sibling. The `<div className="self-video-label">Bạn</div>`, gated by the same `activeSharer !== "local"` condition, moves inside the wrapper as its last child.
  </action>
  <verify>
    <automated>cd frontend && npx tsc --noEmit -p tsconfig.app.json</automated>
  </verify>
  <done>frontend/src/pages/CallPage.tsx has one wrapper div (className self-video-box / self-video-box--presenting) containing the self video, camOff placeholder, and self-video-label as children; frontend/src/index.css defines .self-video-box (position/size owner), .self-video (inset:0 fill rule), .self-video-box--presenting (presenting position override), and .self-video-box--presenting .self-video (object-fit: contain override); TypeScript compiles with no errors.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Human-verify self-video label positioning across call layout states</name>
  <action>No code change — confirm Task 1's positioning fix visually across the default PiP state, camOff state, and the screen-share presenting state.</action>
  <what-built>Self-view "Bạn" label now nested inside the same positioned wrapper as the self-camera PiP thumbnail, in both the default layout and the screen-share "presenting" layout.</what-built>
  <how-to-verify>
    1. Run `cd frontend && npm run dev`, open the app in two browser tabs, log in as two different users, and start a 1-1 video call between them.
    2. On either tab: confirm the "Bạn" pill label sits directly on the bottom edge of the small self-camera thumbnail in the bottom-right corner of the screen (not floating alone in the bottom-left corner).
    3. Turn off your camera (cam-off button): confirm the avatar-initial placeholder still fills the same PiP box, in the same position as the video did.
    4. Start screen sharing from your own tab: confirm your self-camera view moves to the top-left main-stage area and the "Bạn" label is now hidden (per the existing activeSharer !== "local" condition — no label shown while presenting).
    5. Stop screen sharing: confirm the self-camera PiP returns to the bottom-right corner and the "Bạn" label reappears correctly anchored to it.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| N/A | This is a pure client-side CSS/JSX positioning fix with no new data flow, no new inputs, no trust boundary crossed. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-260702-lva-01 | N/A | frontend/src/pages/CallPage.tsx, frontend/src/index.css | low | accept | Pure visual layout/CSS fix; no new inputs, no auth/data-flow changes, no attack surface introduced. |
</threat_model>

<verification>
- `cd frontend && npx tsc --noEmit -p tsconfig.app.json` passes with no errors.
- `cd frontend && npx eslint src/pages/CallPage.tsx src/index.css` (if index.css is lint-covered) — or at minimum `npx eslint src/pages/CallPage.tsx` — passes with no new errors.
- Manual 2-tab verification (Task 2 checkpoint) confirms the label is visually attached to the PiP box in default state, camOff state, and after exiting the presenting state.
</verification>

<success_criteria>
- The "Bạn" label is a DOM descendant of the same positioned wrapper as the self-camera video/placeholder in CallPage.tsx, not a stage-level sibling.
- `.self-video-label`'s `position: absolute; bottom: 8px; left: 8px` resolves against `.self-video-box`, confirmed visually via the human-verify checkpoint.
- No change to `data-testid="local-video"`, `aria-label`, or any other test-relevant attribute on the video element — existing Playwright/Vitest selectors keep working.
- GroupCallPage.tsx / ParticipantTile.tsx confirmed to already anchor labels correctly — untouched by this plan.
</success_criteria>

<output>
Create `.planning/quick/260702-lva-fix-self-video-ban-label-positioning-in-/260702-lva-SUMMARY.md` when done
</output>
