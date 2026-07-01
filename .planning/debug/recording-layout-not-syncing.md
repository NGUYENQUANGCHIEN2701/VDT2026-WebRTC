---
status: awaiting_human_verify
trigger: "Bug: recording canvas draw loop doesn't follow the live screen-share layout during a call. In both 1-1 calls and group calls, when the live UI switches to a presentation layout (screen-sharer's tile becomes large/featured) while sharing, the MediaRecorder-based recording composite stays stuck in a fixed grid layout and does not resize/feature the sharer the way the on-screen UI does. Investigate root cause and fix it."
created: 2026-07-01T19:35:16Z
updated: 2026-07-01T19:35:16Z
---

## Current Focus

hypothesis: CallPage.tsx (1-1 call) constructs `new RecordingController({...})` WITHOUT the `getActiveSharer` option (unlike GroupCallPage.tsx, which passes it). Since recording.ts's draw loop does `const sharer = this.getActiveSharer?.() ?? null`, an undefined getActiveSharer means `sharer` is always null, `sharing` is always false, and the 1-1 recording draw loop can NEVER enter the presentation-layout branch — it is permanently stuck on computeGridLayout regardless of isScreenSharing. Separately: RecordingController.localVideo (the offscreen <video> used as the canvas draw source for the local track) is created once in start() via createVideo(localStream) and is never re-attached when the local stream's video track is swapped (camera<->screen via replaceTrackInStream, which mutates the SAME MediaStream object's tracks). CallPage.tsx's own on-screen selfRef <video> works around exactly this browser quirk by forcibly reassigning srcObject = null; srcObject = stream on every localStreamVersion bump (comment: "khắc phục lỗi đen màn hình... khi được khi không") — RecordingController has no equivalent re-attach, which plausibly explains the observed garbled/noise self-view frame after a mid-recording track swap.
test: (1) Confirm CallPage.tsx's startRecording() omits getActiveSharer by re-reading the file — DONE, confirmed at lines 145-155. (2) Confirm GroupCallPage.tsx's equivalent DOES pass getActiveSharer — DONE, confirmed at lines 146-159 (1a33cbc fix was group-call only, CallPage.tsx untouched by that commit). (3) Confirm recording.ts has no mechanism to re-read/re-attach localVideo/remoteVideos srcObject after start() — DONE, no such method exists in recording.ts. (4) Confirm CallPage.tsx's live UI has no presentation-layout equivalent (always full-remote + small self PIP, never a toggled grid/presentation split) — DONE, CallPage.tsx has no presentation-main/sidebar markup at all (that's GroupCallStyles.css only), so the "sync to live UI" framing only strictly applies to group calls; for 1-1 the fix should still make the recording composite feature the sharer (main+PIP layout) since that mirrors intent even though there's no literal live-UI grid toggle to diff against.
expecting: Wiring getActiveSharer into CallPage.tsx's RecordingController construction (using useCallStore's isScreenSharing + remoteUserId, since 1-1 has no ambiguity about WHO is sharing) should make the 1-1 recording draw loop enter presentation mode when isScreenSharing is true. Re-attaching localVideo/remoteVideos srcObject on track-replace should eliminate the garbled/noise self-view frame.
next_action: AWAITING HUMAN VERIFICATION. Self-verification complete (typecheck/lint/build/58 unit tests all green). Need manual 1-1 and group call test: start recording, start screen share, confirm recording composite switches to presentation/featured layout; also toggle screen share off/on and switch camera mid-recording to confirm no garbled/noise frame appears in the self-view. Report back "confirmed fixed" or describe what's still failing.
reasoning_checkpoint:
  hypothesis: "CallPage.tsx's startRecording() omits getActiveSharer from RecordingController construction, permanently locking the 1-1 recording draw loop to grid layout (recording.ts:345 `this.getActiveSharer?.() ?? null` -> always null); and RecordingController never re-attaches its offscreen localVideo/remoteVideo srcObject after start(), so an in-place track swap (screen<->camera via replaceTrackInStream mutating the same MediaStream) leaves the canvas drawing a stale/removed track, producing garbled/noise frames — CallPage.tsx's own on-screen selfRef video works around this exact issue with a forced srcObject reassignment on localStreamVersion bump, but recording.ts has no equivalent."
  confirming_evidence:
    - "Direct read of CallPage.tsx lines 137-162: RecordingController constructor call has no getActiveSharer key, unlike GroupCallPage.tsx lines 146-159 which does (fixed in 1a33cbc, which never touched CallPage.tsx per `git show 1a33cbc --stat`)."
    - "Direct read of recording.ts line 345: `const sharer = this.getActiveSharer?.() ?? null` -- optional chaining on undefined callback always yields null, which the draw() function then treats identically to 'not sharing' (line 346-347), permanently selecting the grid branch."
    - "Direct read of mediaDevices.ts replaceTrackInStream (removeTrack+addTrack on the SAME stream object) plus CallPage.tsx lines 64-91, which contains an explicit code comment describing this exact same-object-mutation browser quirk and its established workaround (null-then-reassign srcObject) for the on-screen self video; recording.ts's createVideo() is only ever called once, inside start(), with no equivalent hook."
  falsification_test: "If I add console logging of `this.getActiveSharer?.()` inside recording.ts's draw() during a manual 1-1 screen-share recording and it is NOT always null (i.e., it resolves to 'local' correctly), hypothesis #1 is false. If after wiring getActiveSharer AND without touching the localVideo re-attach code, a manual 1-1 recording captures a clean (non-garbled) self-view after starting screen share, hypothesis #2 is false / unnecessary."
  fix_rationale: "Both fixes address root cause, not symptom: (1) passes the missing callback so the existing, already-correct per-frame polling logic in recording.ts can actually receive a non-null sharer value for 1-1 calls -- no change to draw()'s logic itself, since that logic is proven correct by group-call tests. (2) adds a re-attach path so RecordingController's offscreen video elements track the SAME live-track-swap handling CallPage.tsx already does for its own on-screen video, using the same trigger (bumpLocalStream/localStreamVersion) rather than inventing a new mechanism."
  blind_spots: "Have not run a live 2-browser manual repro (no browser environment available to this agent) to directly observe the garbled-noise frame or confirm root cause #2 empirically beyond static/code-reasoning evidence -- root cause #2 is inferred from a strong structural analogy (CallPage.tsx's own documented workaround for the identical stream-mutation pattern) rather than directly observed in the recorder. Also have not checked whether remoteVideos in RecordingController need the same re-attach treatment (remote streams are also subject to server-driven track replacement in group/1-1 calls); will address defensively since the mechanism is the same. Self-verification will be via updated/added unit tests plus a human-verify checkpoint for the actual visual outcome, since MediaRecorder/canvas pixel content cannot be asserted in jsdom."
tdd_checkpoint: null

## Symptoms

expected: When a participant starts screen sharing during an active (1-1 or group) call recording, the recording's canvas composite should switch to a "presentation" layout mirroring the live on-screen UI — the sharer's screen tile becomes large/featured, same as what's visually shown to call participants in real time.
actual: The recording composite stays in a fixed grid layout regardless of screen-share state changes and does not feature the sharer. User's own manual test (real webcam + real screen share, 1-1 call) showed the live UI correctly displaying "Sharing screen" state, but the self-view/recording preview thumbnail rendered as static/garbled noise instead of the expected content. Same non-responsive-layout issue reproduces in group calls.
errors: No console error reported by user. Purely a visual/behavioral bug — wrong layout composited into the recording, and a garbled/noise frame in one observed instance.
reproduction: Start a 1-1 or group call, start recording (Ghi hình), then start screen share (Chia sẻ) — observe the recording composite / self-view thumbnail does not switch to a presentation layout featuring the sharer's screen, and may render corrupted frames.
started: Present in current HEAD despite four recent commits specifically targeting this area: 531425a (test: add failing tests for grid/presentation layout-math helpers), 5b986e9 (feat(recording): mirror live grid/presentation layout in canvas draw loop), 64912e8 (feat(recording): wire live screen-share state into RecordingController), 1a33cbc (feat(group-call): focus presentation layout and recording on actual sharer) — appears to be either an incomplete/regressed fix or a related-but-distinct gap in that same work. Note: frontend/src/components/call/GroupCallModal.tsx, frontend/src/pages/GroupCallPage.tsx, frontend/src/webrtc/recording.test.ts, frontend/src/webrtc/recording.ts currently have uncommitted local working-tree changes on top of 1a33cbc — check `git diff` before assuming committed code is what's running.

## Eliminated

- hypothesis: The regression is in recording.ts's draw loop itself (layout computed once/cached, not re-read per frame) as originally framed by the trigger.
  evidence: recording.ts:345 reads `this.getActiveSharer?.()` fresh on every requestAnimationFrame call inside `draw()` — this is correct, live-polled per-frame code, not a stale snapshot. GroupCallPage.tsx wires this correctly (commit 1a33cbc) and its draw-loop behavior is verified by 8 passing tests in recording.test.ts. The bug is not in recording.ts's per-frame re-read mechanism.
  timestamp: 2026-07-02T00:00:00Z

- hypothesis: Uncommitted local working-tree changes (flagged by trigger) to recording.ts/recording.test.ts/GroupCallPage.tsx are an in-progress WIP fix for this exact bug.
  evidence: `git status --short` shows only `.planning/STATE.md` and `frontend/src/components/call/GroupCallModal.tsx` as modified — recording.ts, recording.test.ts, and GroupCallPage.tsx are clean/committed (already part of commit 1a33cbc). The debug trigger's premise about pending edits to those three files was stale/inaccurate by the time investigation started.
  timestamp: 2026-07-02T00:00:00Z

- hypothesis: GroupCallModal.tsx's uncommitted diff is related to this bug.
  evidence: Read full diff — it is a pure visual/UX redesign of the group-call invite picker modal (styling, online/offline sectioning, participant limit 5->3). Zero overlap with recording, canvas, or layout-sync code. Not related to this investigation; left untouched.
  timestamp: 2026-07-02T00:00:00Z

## Evidence

- timestamp: 2026-07-02T00:00:00Z
  checked: frontend/src/webrtc/recording.ts (full file, committed HEAD version)
  found: draw() at line 345 does `const sharer = this.getActiveSharer?.() ?? null`. When the `getActiveSharer` constructor option is undefined, optional chaining yields `undefined`, coalesced to `null` — `sharing` (line 346) is therefore permanently `false`, and the draw loop can only ever take the `else` grid-layout branch (line 367-378), never the presentation branch (line 347-366), for the lifetime of that RecordingController instance.
  implication: Any caller that constructs `new RecordingController(...)` without passing `getActiveSharer` gets a recording that is permanently locked to grid layout regardless of any screen-share activity. This is a construction-site wiring bug, not a draw-loop bug.

- timestamp: 2026-07-02T00:00:00Z
  checked: frontend/src/pages/GroupCallPage.tsx startRecording() (lines 137-166)
  found: Passes `getActiveSharer: () => { const s = useRoomStore.getState(); const sharer = getActiveSharer(s.members, s.selfId, s.isScreenSharing); return sharer === null ? null : sharer === s.selfId ? 'local' : sharer }`. Correctly wired per commit 1a33cbc.
  implication: Group calls are NOT affected by the missing-wiring bug — confirms this bug is scoped specifically to the 1-1 call path.

- timestamp: 2026-07-02T00:00:00Z
  checked: frontend/src/pages/CallPage.tsx startRecording() (lines 137-162)
  found: Constructs `new RecordingController({ callId, localLabel: "You", remoteLabel: remoteUserId ?? "Remote", onError: ... })` — no `getActiveSharer` key at all. This file was NOT touched by commit 1a33cbc (`git show 1a33cbc --stat` lists only GroupCallPage.tsx, recording.ts, recording.test.ts).
  implication: CONFIRMED ROOT CAUSE #1 — the 1-1 call recording path never received the getActiveSharer wiring that group calls got. This directly reproduces "recording composite stays in a fixed grid layout... does not feature the sharer" for 1-1 calls.

- timestamp: 2026-07-02T00:00:00Z
  checked: frontend/src/realtime/callActions.ts (media-state-relay handler, lines 391-400) and callStore.ts isScreenSharing field
  found: `isScreenSharing` in callStore tracks only the LOCAL user's own screen-share state. A code comment explicitly states 1-1 calls do not relay/track the remote peer's isScreenSharing into callStore ("1-1 calls do not use msg.isScreenSharing... a single-peer call has no 'who is sharing' ambiguity" — but this is about local-affects-layout-locally, not about knowing when the REMOTE peer shares). CallPage.tsx's on-screen UI never visually distinguishes "remote is sharing" with a presentation layout either — it's always full-bleed remote video + small self PIP.
  implication: Fix scope for the getActiveSharer wiring in CallPage.tsx should be local-only (`isScreenSharing ? 'local' : null`), matching what the local client can actually observe. This is consistent with existing 1-1 architecture, not a new gap to fix.

- timestamp: 2026-07-02T00:00:00Z
  checked: frontend/src/webrtc/mediaDevices.ts replaceTrackInStream() (lines 34-41), and CallPage.tsx's selfRef useEffect (lines 64-91)
  found: replaceTrackInStream() mutates the existing MediaStream object in place (stream.removeTrack(old); stream.addTrack(new)) rather than creating a new stream — so getLocalStream() returns the same object reference before/after a camera<->screen track swap. CallPage.tsx's own on-screen `<video ref={selfRef}>` explicitly works around a known browser quirk here: on `localStreamVersion` change it does `selfRef.current.srcObject = null; selfRef.current.srcObject = localStream` to force the browser to notice the swapped track (comment: "khắc phục lỗi đen màn hình 'khi được khi không'" — fixes intermittent black-screen). RecordingController.localVideo is created once in start() via createVideo(localStream) and has no equivalent re-attach hook, and callStore's bumpLocalStream()/localStreamVersion is never read by recording.ts.
  implication: CONFIRMED ROOT CAUSE #2 — mid-recording camera<->screen track swaps (screen-share start/stop, or camera-device switch) are not propagated to RecordingController's offscreen video elements. This plausibly explains the observed "static/garbled noise" self-view frame in the user's manual 1-1 test, since the offscreen <video> keeps referencing a track that was removed from its srcObject stream without the forced-reattach workaround CallPage.tsx uses for its own on-screen element.

## Resolution

root_cause: Two independent, compounding bugs in the 1-1 call recording path (frontend/src/pages/CallPage.tsx + frontend/src/webrtc/recording.ts), neither present in the group-call path which was already fixed by commit 1a33cbc: (1) CallPage.tsx's startRecording() never passes a `getActiveSharer` callback to `new RecordingController(...)`, so `recording.ts`'s draw loop's `this.getActiveSharer?.() ?? null` always evaluates to null, permanently locking the composite to grid layout. (2) RecordingController's offscreen `localVideo`/remote video elements are attached once at `start()` and never re-attached when the underlying MediaStream's video track is swapped in place (camera<->screen replaceTrackInStream mutates the same MediaStream object) — CallPage.tsx's own on-screen self-view works around this exact browser quirk via a forced srcObject reassignment on localStreamVersion bump, but RecordingController has no equivalent mechanism, plausibly causing the observed garbled/noise self-view frame after a mid-recording track swap.
fix: |
  (1) recording.ts: added `RecordingController.refreshLocalStream(stream)` and
  `refreshRemoteStream(label, stream)` public methods that force a
  srcObject = null; srcObject = stream re-attach (+ re-play) on the
  controller's offscreen video elements — mirrors the exact workaround
  CallPage.tsx/GroupCallPage.tsx already use for their own on-screen
  self-view videos on the same track-swap signal.

  (2) CallPage.tsx: (a) wired `getActiveSharer: () => useCallStore.getState().isScreenSharing
  ? 'local' : null` into the RecordingController construction in
  startRecording() — 1-1 calls only ever have the local user as an
  observable sharer (remote isScreenSharing is intentionally not relayed
  into callStore for 1-1, per existing callActions.ts design), so this is
  the complete fix for the missing-wiring bug. (b) called
  `recordingControllerRef.current?.refreshLocalStream(localStream)` inside
  the existing `localStreamVersion` effect (the same effect that already
  force-reattaches the on-screen selfRef video), so mid-recording
  camera<->screen swaps propagate to the recording composite too.

  (3) GroupCallPage.tsx: added the equivalent `refreshLocalStream` call in
  its own `localStreamVersion` effect (group-call path had the
  getActiveSharer wiring already from 1a33cbc, but was missing the same
  track re-attach fix as CallPage.tsx — root cause #2 applied to both call
  types equally since it lives in the shared RecordingController).

  (4) recording.test.ts: added 3 tests under "RecordingController —
  refreshLocalStream" (forced null-then-reassign srcObject re-attach while
  recording; no-op/no-crash when not recording; no-op/no-crash after
  stop() — fixed the test's own DOM-query bug along the way: createVideo()
  never appends elements to document.body, so `document.querySelector('video')`
  could never find the controller's offscreen video; switched to spying on
  document.createElement to capture the actual detached element), plus 3
  more tests under "RecordingController — refreshRemoteStream" (re-attach
  only the matching remote-by-label video, untouched others; no-op on
  unknown label; no-op when not recording).
verification: |
  - `npx tsc --noEmit` (frontend) — clean, no type errors.
  - `npx vitest run` (frontend, full suite) — 58/58 tests passing (55
    pre-existing + 3 refreshLocalStream + 3 refreshRemoteStream new tests),
    6/6 test files green.
  - `npx eslint` on all 4 changed files — all reported errors verified
    pre-existing on unmodified HEAD (git stash + re-lint comparison); no new
    lint errors introduced by this fix's added lines.
  - `npx vite build` (frontend) — production build succeeds, no compile
    errors.
  - Static/code-level verification only (no live browser 2-device manual
    test performed by this agent — no browser environment available).
    Manual re-verification of the original repro steps (1-1 call: start
    recording, start screen share, confirm the recording composite enters
    presentation/featured layout and the self-view stays clean/non-garbled
    through a mid-recording screen-share start+stop; group call: same,
    plus confirm a mid-recording camera switch doesn't garble any tile) is
    still required before closing this session, since MediaRecorder/canvas
    pixel output cannot be asserted in jsdom.
files_changed:
  - frontend/src/webrtc/recording.ts
  - frontend/src/webrtc/recording.test.ts
  - frontend/src/pages/CallPage.tsx
  - frontend/src/pages/GroupCallPage.tsx
