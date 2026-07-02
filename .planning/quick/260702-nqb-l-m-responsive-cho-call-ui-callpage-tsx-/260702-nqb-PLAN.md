---
phase: quick
plan: 260702-nqb
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/index.css
  - frontend/src/pages/GroupCallStyles.css
  - frontend/src/pages/GroupCallPage.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "On a 390x844 mobile viewport, CallPage's (1-1) top-left call-info pill, top-center status pill, bottom control bar, and self-video PiP render with zero pairwise overlap and zero horizontal page overflow."
    - "On the same viewport (and 375x667), GroupCallPage's default participant tile grid and its screen-share presentation layout (main + sidebar + speaker + thumbnails) render with zero overlap and zero horizontal overflow — the sidebar no longer forces a 320px minimum that breaks phone-width layouts."
    - "All six 1-1 call controls (mute, camera, share, record, more, hang up) stay fully on-screen and tappable at phone width — none are clipped by the viewport edge."
    - "A long/unbounded remote username in the top-left HUD truncates with an ellipsis instead of pushing into or being overlapped by the top-center status pill."
  artifacts:
    - "frontend/src/index.css — the existing `@media (max-width: 760px)` block (started at the Task 4/Wave-4 HUD-stack override) extended with mobile rules for `.call-1v1-top-left/-top-center/-top-right`, `.call-1v1-bottom-bar`, `.call-labeled-btn*`, `.self-video-box`, `.call-video--pip`, `.call-video--presenting`, `.self-video-box--presenting`."
    - "frontend/src/pages/GroupCallStyles.css — a new `.call-tile-grid` base class plus a `@media (max-width: 760px)` block overriding `.presentation-layout` (flex-direction: column), `.presentation-sidebar` (min-width reset), `.presentation-thumbnails`, and `.call-tile-grid`."
    - "frontend/src/pages/GroupCallPage.tsx — the inline style object on the no-active-sharer grid `<section>` replaced by `className=\"call-tile-grid\"` (keeping only the per-participant-count `gridStyle()` result as inline `style`)."
  key_links:
    - "`.call-1v1-top-left`, `.call-1v1-top-center`, `.call-1v1-top-right`, `.call-1v1-bottom-bar`, and `.call-labeled-btn*` are shared classes rendered by BOTH CallPage.tsx and GroupCallPage.tsx — a single edit to index.css's shared media-query block fixes the top HUD and bottom bar on both pages simultaneously."
    - "`.call-tile-grid`'s static positioning/gap must stay compatible with the dynamic `gridStyle(roster.length)` inline style GroupCallPage.tsx still merges in via the `style` prop (React merges `className` rules and inline `style` — inline always wins for the properties it sets, i.e. `gridTemplateColumns`/`gridTemplateRows`)."
    - "`.call-1v1-top-right` is hidden on mobile in both pages: CallPage's instance is an unwired `<button>` (no `onClick`, dead UI on desktop too) and GroupCallPage's instance duplicates the bottom bar's `LabeledMoreButton` (both call `setMorePanelOpen`) — hiding it loses no reachable functionality on either page."
---

<objective>
Make the in-call UI (`CallPage.tsx` 1-1 call and `GroupCallPage.tsx` group call) usable and visually correct on real phone widths (~375-430px), by fixing three concrete overflow/overlap bugs already identified by codebase audit: the absolutely-positioned top HUD row overlapping itself, the 6-button bottom control bar overflowing/clipping, and `GroupCallStyles.css`'s `.presentation-sidebar` forcing a hard 320px minimum width inside a flex row that cannot fit on a phone screen.

Purpose: Both call pages currently only have a single mobile breakpoint (`@media (max-width: 760px)`, index.css:2514) that fixes the HUD-stack share/recording pills and converts the more-panel/recording-preview modals to bottom sheets — it does not touch the top-left/top-center/top-right HUD corners, the bottom control bar, the self-video PiP, or any of GroupCallPage's presentation/grid layout. On a real phone these currently overlap or clip.

Output:
- `frontend/src/index.css`: the existing mobile breakpoint extended with rules for the shared top HUD, bottom control bar, and 1-1-specific self-video/presenting-mode positioning.
- `frontend/src/pages/GroupCallStyles.css`: a new mobile breakpoint stacking the presentation layout vertically and a new `.call-tile-grid` class (replacing an inline style) so the default grid is also responsive.
- `frontend/src/pages/GroupCallPage.tsx`: a small refactor swapping an inline style object for the new CSS class.
- A Chrome DevTools MCP-driven visual + scripted-assertion pass against a real, connected 1-1 call and group call at 390x844 and 375x667, confirming no overlap/clipping in either page's HUD, controls, and layout modes.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@frontend/src/pages/CallPage.tsx
@frontend/src/pages/GroupCallPage.tsx
@frontend/src/pages/GroupCallStyles.css
@frontend/src/index.css
@frontend/src/components/call/CallButtons.tsx
@frontend/e2e/one-to-one-call.spec.ts
@frontend/vite.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Responsive CSS for the shared call HUD, bottom bar, and 1-1 self-video/presenting layout</name>
  <files>frontend/src/index.css</files>
  <action>
    Extend the existing `@media (max-width: 760px)` block (index.css, starts around line 2514, currently ends with the `.more-panel-recording-row, .recording-preview-meta, .modal-actions` rule) with new rules — do not create a second/duplicate breakpoint, add to this one so all mobile-only call rules toggle together:

    Top HUD (shared by CallPage.tsx and GroupCallPage.tsx — both render `.call-1v1-top-left`, `.call-1v1-top-center`, `.call-1v1-top-right`): currently all three sit on the same `top: 24px` row via `position: absolute; left/right/center`, and their combined content width exceeds any phone viewport, guaranteeing overlap. Restructure into two stacked rows and drop the third corner: `.call-1v1-top-left` moves to `top: 10px; left: 10px;` with reduced `padding: 6px 10px; gap: 8px;` and `max-width: calc(100vw - 20px)` so it never exceeds the viewport even with a long name; `.call-1v1-logo-box` shrinks to `width: 32px; height: 32px; border-radius: 9px;`; `.call-1v1-info h2` and `.call-1v1-info p` both get `font-size: 12px`/`11px` respectively plus `max-width: 46vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` so an arbitrarily long remote username (CallPage's `<p>{remoteUserId}</p>` is unbounded) truncates instead of overlapping the row below. `.call-1v1-top-center` moves to a second row via `top: 56px;` (leave its existing `left: 50%; transform: translateX(-50%)` untouched) with `padding: 5px 10px; gap: 8px; font-size: 11px; max-width: calc(100vw - 20px);`. `.call-1v1-top-right` gets `display: none;` — in CallPage.tsx it is a `<button>` with no `onClick` handler (non-functional on desktop too), and in GroupCallPage.tsx it wraps a decorative `LayoutGrid` icon plus a `MoreVertical` icon whose `onClick` duplicates the bottom bar's `LabeledMoreButton` (both call `setMorePanelOpen`) — hiding it removes no reachable feature on either page. Leave `.call-hud-stack`'s existing mobile override (`top: 92px`) untouched — the two new rows above end by ~84px, preserving its clearance.

    Bottom control bar (shared `.call-1v1-bottom-bar` + `.call-labeled-btn*`, both pages render up to 6 buttons at `min-width: 64px` with 12px gaps — total minimum width far exceeds any phone viewport, causing overflow/clipping): add `.call-1v1-bottom-bar { bottom: 16px; gap: 4px; padding: 8px 10px; max-width: calc(100vw - 16px); overflow-x: auto; }` (the `overflow-x: auto` is a safety net so an unexpectedly tight viewport scrolls instead of clipping — it should not be needed once buttons are sized correctly below). Shrink `.call-labeled-btn { min-width: 44px; gap: 2px; }`, `.call-labeled-btn-icon { width: 42px; height: 42px; border-radius: 12px; }`, and hide the caption via `.call-labeled-btn-text { display: none; }` (every `LabeledXButton` in CallButtons.tsx already sets a `title` attribute with the same label, so the accessible/tooltip name is unaffected — this is a purely visual icon-only compaction). Keep the wider hang-up button proportional with `.call-labeled-btn.danger .call-labeled-btn-icon { width: 56px; }`.

    Self-video PiP and 1-1 presenting mode (CallPage.tsx only, but classes live in this file): the shorter mobile bottom bar (now topping out around `bottom: 16px` + ~72px tall ≈ 88px from the viewport bottom) needs the self-video/PiP tile pushed up to clear it — add `.self-video-box, .call-video--pip { right: 10px; bottom: 100px; }`. For 1-1 screen-share presentation mode, mirror the top-HUD margin and reserve clearance for both the bottom bar and the PiP tile above it: `.call-video--presenting, .self-video-box--presenting { top: 124px; left: 10px; width: calc(100% - 20px); height: calc(100% - 304px); }`.
  </action>
  <verify>
    <automated>cd frontend && npm run build</automated>
  </verify>
  <done>`npm run build` succeeds with no CSS/type errors; the `@media (max-width: 760px)` block in index.css contains the new rules for `.call-1v1-top-left/-top-center/-top-right`, `.call-1v1-bottom-bar`, `.call-labeled-btn*`, `.self-video-box`, `.call-video--pip`, `.call-video--presenting`, and `.self-video-box--presenting` as described above.</done>
</task>

<task type="auto">
  <name>Task 2: Responsive CSS for GroupCallPage's presentation layout and default tile grid</name>
  <files>frontend/src/pages/GroupCallStyles.css, frontend/src/pages/GroupCallPage.tsx</files>
  <action>
    In GroupCallStyles.css, `.presentation-layout` lays `.presentation-main` (`flex: 6.5`) and `.presentation-sidebar` (`flex: 3.5; min-width: 320px`) side by side in a row — the hard 320px sidebar minimum cannot coexist with a main pane on any phone-width viewport. Add a `@media (max-width: 760px)` block (new — this file currently has none) with: `.presentation-layout { inset: 124px 10px 100px; flex-direction: column; gap: 10px; }` (switching the layout axis to vertical makes the existing `flex: 6.5`/`flex: 3.5` ratios split height 65/35 instead of width, giving the main video the larger top region and the sidebar a shorter bottom region — no ratio change needed); `.presentation-sidebar { min-width: 0; gap: 8px; }` (resets the now-impossible 320px width floor and tightens the internal speaker/thumbnails gap since `.presentation-sidebar`'s own `flex-direction: column` already stacks its children regardless of the parent's axis); `.presentation-thumbnails { height: 84px; gap: 8px; }` (shrinks the fixed 140px thumbnail-row height to leave more of the now-shorter sidebar for the speaker tile). The `124px 10px 100px` inset matches the mobile top-HUD/bottom-bar clearance established in Task 1 (no floating self-video PiP exists in GroupCallPage's presentation mode, so the bottom clearance only needs to cover the mobile bottom bar, not a PiP tile).

    GroupCallPage.tsx's no-active-sharer grid section (JSX around line 392) currently sets ALL its layout via an inline `style` object (`position: 'absolute', inset: '80px 24px 140px', display: 'grid', gap: 16, padding: 0, ...gridStyle(roster.length), transition: '...'`), which cannot be targeted by a media query. Add a new `.call-tile-grid` base rule to GroupCallStyles.css carrying every STATIC property from that inline object (`position: absolute; inset: 80px 24px 140px; display: grid; gap: 16px; padding: 0; transition: grid-template-columns 0.2s ease;`), then in GroupCallPage.tsx replace the inline style object on that `<section>` with `className="call-tile-grid"` and `style={gridStyle(roster.length)}` — keeping ONLY the per-participant-count `gridTemplateColumns`/`gridTemplateRows` (the genuinely dynamic part) as inline style; React merges the className's static rules with the inline style's dynamic ones. Finally add `.call-tile-grid { inset: 124px 10px 100px; gap: 10px; }` inside the same mobile media block added above, matching `.presentation-layout`'s mobile inset for consistency.
  </action>
  <verify>
    <automated>cd frontend && npm run build</automated>
  </verify>
  <done>`npm run build` succeeds; GroupCallStyles.css has a `.call-tile-grid` base class plus a `@media (max-width: 760px)` block overriding `.presentation-layout`, `.presentation-sidebar`, `.presentation-thumbnails`, and `.call-tile-grid`; GroupCallPage.tsx's default-grid `<section>` uses `className="call-tile-grid"` with only `style={gridStyle(roster.length)}` remaining inline.</done>
</task>

<task type="auto">
  <name>Task 3: Visual + scripted verification on a real connected call at phone viewports</name>
  <files>None — verification-only task. Drives the local dev stack via Bash (docker compose, curl) and the running browser via chrome-devtools MCP tools.</files>
  <action>
    Bring up a real, connected call and drive it through Chrome DevTools MCP at phone viewport sizes — a CSS-only change is not sufficient evidence here per the task's explicit visual-confirmation requirement.

    1. Start the backing services (skip coturn/prometheus/grafana — not needed for this check): from the repo root, `docker compose up -d --build postgres redis rabbitmq backend-1 backend-2 nginx`, then poll `docker compose ps` / `curl http://localhost:8080/actuator/health` until `backend-1`/`backend-2`/`nginx` report healthy. In a second terminal, `cd frontend && npm run dev` (Vite dev server on `http://localhost:5173`, which already proxies `/api` and `/ws` to `http://localhost:8080` per vite.config.ts — `localhost` counts as a secure context so `getUserMedia`/`getDisplayMedia` work over plain HTTP here).
    2. Register two throwaway users the same way `frontend/e2e/one-to-one-call.spec.ts`'s `registerUser` helper does: `curl -X POST http://localhost:8080/api/auth/register` with a unique `{username, password: "password123", confirmPassword: "password123", email}` JSON body for each (e.g. `visual-caller-<timestamp>`, `visual-callee-<timestamp>`).
    3. Using chrome-devtools MCP, open two separate pages/tabs against `http://localhost:5173`. In each, fill the login form (`input[autocomplete="username"]`, `input[autocomplete="current-password"]`) with one of the two users and submit, confirming navigation to `/`.
    4. From the caller tab, find the callee's row in the online-users list and click its call button; from the callee tab, wait for the incoming-call dialog and click "Nhận" to accept. Confirm both tabs navigate to `/call`.
    5. On one tab, use the MCP viewport/device-emulation tool to set a 390x844 viewport, take a screenshot, and run an `evaluate_script` that: computes `getBoundingClientRect()` for `.call-1v1-top-left`, `.call-1v1-top-center`, `.call-1v1-bottom-bar`, every `.call-labeled-btn`, and `.self-video-box`; asserts no two of those rects intersect; asserts every rect's right/bottom edge is `<= window.innerWidth`/`<= window.innerHeight`; and asserts `document.documentElement.scrollWidth <= document.documentElement.clientWidth`. Repeat the same emulate+screenshot+assertion at 375x667 (tightest target width, iPhone SE class).
    6. Trigger 1-1 screen share from one tab (click the share control) to render `.call-video--presenting`/`.self-video-box--presenting`; if the fake-media/auto-accept prompts needed for this (`getDisplayMedia`) are not already granted by the MCP browser session, relaunch/connect the MCP browser to a Chrome instance started with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (the same flags `frontend/e2e/playwright.config.ts` uses) so the picker auto-accepts. Repeat the 390x844 screenshot + bounding-box assertion for the presenting-mode elements, then stop sharing.
    7. End the 1-1 call (click the hang-up control) so no dangling call state is left in Redis.
    8. Repeat an equivalent flow for `/group-call`: join/start a room with the same two users, verify the default tile grid (`.call-tile-grid` children) at 390x844 with the same overlap/overflow assertions, then have one participant start screen share to render `.presentation-layout`/`.presentation-main`/`.presentation-sidebar`/`.presentation-thumbnails` and repeat the assertions, then stop sharing and leave the room.
    9. If any assertion fails or a screenshot shows visible overlap/clipping, adjust the specific values introduced in Task 1/Task 2 (same files) and re-run the affected check before considering this task done — the hand-calculated offsets in those tasks are estimates and may need small corrections against real rendered font/icon metrics.
  </action>
  <verify>
    <automated>Chrome DevTools MCP session against http://localhost:5173: for /call (idle HUD/bottom-bar and 1-1 presenting mode) and /group-call (default tile grid and presentation layout), at both 390x844 and 375x667, the evaluate_script bounding-box assertions (no pairwise rect intersection, no rect exceeding viewport bounds, document.documentElement.scrollWidth <= clientWidth) all return true, and the corresponding screenshots show no visually overlapping or clipped controls.</automated>
  </verify>
  <done>Screenshots and scripted bounding-box assertions confirm zero overlap/clipping across both call pages, both layout modes (idle/presenting), and both target viewports; the real 1-1 call and group room used for verification are cleanly ended/left afterward.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| N/A | Pure client-side CSS/layout change plus a local verification pass; no new network input, persisted data, or trust boundary is introduced. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick260702-01 | Information Disclosure | Task 3 registers throwaway users via the public `/api/auth/register` endpoint against the local dev stack | low | accept | Identical pattern already used by `frontend/e2e/one-to-one-call.spec.ts` (unique timestamped usernames, disposable password, local docker compose stack only — no production data or endpoint touched). |

No other new attack surface — this plan only edits CSS media queries and one inline-style-to-className refactor.
</threat_model>

<verification>
1. `cd frontend && npm run build` — succeeds after both CSS tasks (catches any CSS/TSX syntax error).
2. Chrome DevTools MCP visual + scripted pass (Task 3) against a real connected 1-1 call and group call at 390x844 and 375x667 — zero overlap, zero horizontal overflow, all six 1-1 controls reachable, confirmed by both screenshot and `getBoundingClientRect()`-based assertions.
</verification>

<success_criteria>
- CallPage's top-left/top-center HUD stack cleanly on two rows at phone width with no overlap; the unwired/duplicate top-right corner is hidden on both pages with no functionality lost.
- The 6-button bottom control bar fits within phone viewport width without clipping, using icon-only compact buttons (tooltip labels preserved via existing `title` attributes).
- The self-video PiP and 1-1 screen-share presenting mode stay clear of the bottom bar at phone height.
- GroupCallPage's `.presentation-sidebar` no longer enforces an unfittable 320px minimum on phones — the presentation layout stacks vertically instead.
- GroupCallPage's default (no-sharer) tile grid is now targetable by a media query via the new `.call-tile-grid` class, and is confirmed non-overlapping at phone width.
- All of the above is confirmed by a real Chrome DevTools MCP visual + scripted-assertion pass, not just a CSS-only change.
</success_criteria>

<output>
Create `.planning/quick/260702-nqb-l-m-responsive-cho-call-ui-callpage-tsx-/260702-nqb-SUMMARY.md` when done
</output>
