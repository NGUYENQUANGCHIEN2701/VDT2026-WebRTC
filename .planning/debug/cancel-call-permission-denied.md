---
status: awaiting_human_verify
trigger: "Khi user từ chối cấp quyền camera/mic (getUserMedia bị reject), cuộc gọi không bị hủy — UI vẫn treo ở trạng thái đang gọi/đang kết nối thay vì tự động hủy và báo lỗi cho người dùng."
created: 2026-07-02
updated: 2026-07-02
---

## Symptoms

- **Expected behavior:** Khi getUserMedia bị trình duyệt từ chối quyền camera/mic, cuộc gọi phải tự động hủy: (1) hủy trạng thái đang gọi/đang kết nối trong UI, (2) gửi tín hiệu hangup/cancel cho phía kia nếu signaling đã bắt đầu, (3) hiển thị thông báo lỗi rõ ràng cho user.
- **Actual behavior:** UI vẫn treo ở trạng thái "đang gọi" / "đang kết nối" — cuộc gọi không bị hủy, không rõ có thông báo lỗi hay không.
- **Error messages:** Không rõ — user chưa kiểm tra console, cần agent tự kiểm tra code (getUserMedia catch/reject handling) để xác định có bị nuốt lỗi (swallowed promise) hay không.
- **Timeline:** Luôn luôn bị (pre-existing) — chưa từng xử lý case permission-denied đúng cách.
- **Reproduction:** Xảy ra ở cả 3 luồng: (1) người gọi (caller) bấm gọi 1-1 và bị từ chối quyền, (2) người nhận (callee) accept cuộc gọi 1-1 và bị từ chối quyền, (3) group call. Cần kiểm tra CallPage.tsx, GroupCallPage.tsx, PeerManager.ts.

## Current Focus

hypothesis: "CONFIRMED and FIXED — verified via full vitest suite (67/67 green, incl. 4 new regression tests) + tsc + eslint clean"
test: "Ran `npx vitest run` (full suite), `npx tsc -b --noEmit`, `npx eslint` on all touched files"
expecting: "All pre-existing tests stay green + new regression tests for the 3 fixed call sites (startCall/acceptCall/doCreateMesh) pass"
next_action: "Request human verification (real browser permission-denial in both 1-1 and group-call flows, 2-device manual check) before archiving."
reasoning_checkpoint:
  hypothesis: "getUserMedia rejection (acquireLocalMedia throwing MediaAcquisitionError) is caught at each call-entry function (startCall, acceptCall, enterActiveCall in callActions.ts; doCreateMesh in roomActions.ts), but every catch site only records the error (setMediaError / toast) and then does a bare `return` — none of them send a cancel/reject/leave signal to the counterparty, and none of them reset the local UI state, so the UI is left stuck in its pre-failure state (outgoing/incoming/invite-modal) indefinitely (1-1) or until a 30s client-side timer (group)."
  confirming_evidence:
    - "startCall (callActions.ts:340-344): `useCallStore.getState().startOutgoing(remoteUsername, '')` sets callState='outgoing' + callId=''. On getMedia() failure, function returns before ever sending 'call-invite'. sendIntent()/cancelCall() checks `if (callId)` — callId is '' (falsy) forever since call-invite was never sent and no 'ringing' echo will ever arrive to fill it in. So the SelfViewPreview overlay's 'Hủy cuộc gọi' button is a dead no-op; user is stuck on the outgoing overlay forever."
    - "acceptCall (callActions.ts:347-352): on getMedia() failure, function returns without calling rejectCall()/hangUp(). CallLayer renders IncomingCallCard (not SelfViewPreview) while callState==='incoming' — IncomingCallCard has no mediaError prop at all, so zero error feedback is shown to the callee. The caller keeps ringing/waiting indefinitely since no call-reject signal was ever sent."
    - "enterActiveCall (callActions.ts:307-337): same getMedia() early-return pattern reached on WS-reconnect-after-refresh; call.setCallState('reconnecting') was already set (isRebuild path) and never advanced or torn down; no hang-up sent to remote."
    - "doCreateMesh (roomActions.ts:340-342): `if (!selfId || !(await ensureLocalMedia()) || !localStream) return` — on failure, initRoom() (which clears incomingInvite and sets roomId) is never called. GroupInviteModal (App.tsx) stays rendered because `incomingInvite` is never cleared by acceptRoomInvite() itself (only by initRoom on success or declineRoomInvite on explicit reject). GroupInviteModal has its own 30s auto-reject timer (GroupInviteModal.tsx:12-15) which is the ONLY thing eventually clearing the hang — meanwhile no leave-room signal is sent, so server keeps this client registered as a room member (ghost membership) for up to 30s."
  falsification_test: "If any of these functions already called reset()/rejectCall()/hangUp()/leaveRoom() equivalent cleanup on the getMedia()/ensureLocalMedia() failure branch, the hypothesis would be false. Read confirms none do — all are bare `return` (or `return` after only a toast)."
  fix_rationale: "Add explicit cleanup (signal to counterparty when the other side already knows about the call/room, else just local reset) plus a user-visible toast on the exact getUserMedia-rejection catch path in each of the 4 entry points. This directly addresses the root cause (missing teardown on media-acquisition failure) rather than papering over one specific manifestation."
  blind_spots: "Cannot literally revoke browser camera/mic permission in this sandboxed environment to reproduce end-to-end; verification relies on tracing the code path + existing acquireLocalMedia() unit tests (media.test.ts, already green) + new/updated unit tests around the fixed call sites + full vitest run. Real 2-browser manual confirmation still recommended (flagged in human-verify checkpoint)."

## Evidence

- timestamp: 2026-07-02T00:00:00Z
  checked: frontend/src/webrtc/media.ts (acquireLocalMedia)
  found: getUserMedia rejections are already correctly classified into MediaAcquisitionError types (permission-denied/no-device/device-busy/overconstrained/security-error/unknown) with audio-only fallback for no-device/overconstrained. This layer is NOT the bug — it already has full try/catch coverage (confirmed by existing green media.test.ts).
  implication: "Bug is not in the error classification/catching itself — it's in what the CALLERS of acquireLocalMedia do after they catch the error."

- timestamp: 2026-07-02T00:00:01Z
  checked: frontend/src/realtime/callActions.ts (getMedia, startCall, acceptCall, enterActiveCall)
  found: "getMedia() helper (line 266-279) correctly sets call.setMediaError(type) and returns false on failure. But all 3 call sites (startCall line 340-344, acceptCall line 347-352, enterActiveCall line 307-337) do `if (!(await getMedia())) return` with NOTHING else — no signal sent, no state reset."
  implication: "Confirmed missing-teardown pattern is the root cause, repeated 3x in callActions.ts."

- timestamp: 2026-07-02T00:00:02Z
  checked: frontend/src/realtime/callActions.ts (sendIntent, cancelCall) + frontend/src/components/call/SelfViewPreview.tsx
  found: "sendIntent() only calls sendSignal if `callId` is truthy. startCall() calls startOutgoing(remoteUsername, '') — callId stays '' until server's 'ringing' echo arrives, which never happens because call-invite itself was never sent (getMedia failed first). SelfViewPreview's 'Hủy cuộc gọi' button is wired to cancelCall — confirmed dead no-op in this exact scenario."
  implication: "Caller-side manifestation: UI permanently stuck showing SelfViewPreview + MediaErrorNotice with a non-functional Cancel button."

- timestamp: 2026-07-02T00:00:03Z
  checked: frontend/src/components/call/CallLayer.tsx + IncomingCallCard.tsx + callStore.ts (mediaError field usage)
  found: "mediaError from callStore is ONLY consumed by SelfViewPreview (rendered when callState==='outgoing'). IncomingCallCard (rendered when callState==='incoming', i.e. the callee's accept flow) takes no mediaError prop at all."
  implication: "Callee-side manifestation: getUserMedia denial during acceptCall() produces ZERO visible feedback to the callee, and the caller keeps ringing forever since no call-reject/hang-up signal is ever sent."

- timestamp: 2026-07-02T00:00:04Z
  checked: frontend/src/realtime/roomActions.ts (ensureLocalMedia, doCreateMesh) + frontend/src/store/roomStore.ts (initRoom) + frontend/src/components/call/GroupInviteModal.tsx + App.tsx (incomingInvite render gate)
  found: "ensureLocalMedia() failure already shows a toast (line 310: 'Không mở được camera/mic (${type})') — some feedback exists here, unlike the 1-1 flows. But doCreateMesh() returns early on failure WITHOUT calling initRoom() (which is what clears incomingInvite/outgoingInvitees and sets roomId) and WITHOUT sending any 'leave-room' signal to the server. GroupInviteModal has its own independent 30s auto-decline timer (onReject after setTimeout) which is the only thing that eventually clears the stuck modal — but the server is never told this client left, leaving a ghost room member for up to 30s."
  implication: "Group-call manifestation: modal hangs (visually) for up to 30s instead of immediately, AND server-side ghost membership persists until the 30s decline fires — same missing-teardown root cause as the 1-1 flows, just partially masked by the modal's own timeout."

## Eliminated

- hypothesis: "getUserMedia errors are silently swallowed (uncaught promise rejection) with no error classification at all"
  evidence: "media.ts's acquireLocalMedia() has complete try/catch coverage classifying all 6 DOMException types, confirmed by existing green media.test.ts (permission-denied/device-busy/security-error/no-device/overconstrained/unknown all covered, including audio-only fallback). The rejection is caught correctly at the lowest layer — the bug is entirely in what the 4 call sites do (or fail to do) after receiving the classified error."
  timestamp: 2026-07-02T00:00:01Z

## Resolution

root_cause: "acquireLocalMedia()/getUserMedia rejections are correctly classified in media.ts, but the 4 call sites that consume this (startCall, acceptCall, enterActiveCall in callActions.ts; doCreateMesh in roomActions.ts) only record the error (setMediaError/toast) and then bare-return — none of them (a) reset local call/room UI state to idle, (b) send a cancel/reject/hangup/leave-room signal to the counterparty when one is expected, or (c) surface a user-visible error message on every affected UI surface (callee's IncomingCallCard shows nothing at all). Result: caller flow leaves a dead-end overlay with a non-functional Cancel button (callId stuck at '' since call-invite was never sent); callee flow shows zero feedback while the caller rings forever; group-call flow relies on GroupInviteModal's own 30s timer to eventually clear the hang, with a ghost room membership left server-side until then."
fix: |
  1. frontend/src/webrtc/media.ts — extracted MediaErrorNotice's Vietnamese copy map
     into an exported `MEDIA_ERROR_COPY` + `mediaErrorToastMessage()` helper, so every
     call site (visual overlay AND toast-only flows) shows the same clear message.
  2. frontend/src/components/call/MediaErrorNotice.tsx — now imports the shared copy
     instead of duplicating it locally (single source of truth).
  3. frontend/src/realtime/callActions.ts:
     - startCall(): on getMedia() failure, show toast (reportGetMediaError) +
       useCallStore.getState().reset() — call-invite was never sent (callId still ''),
       so there is nothing to cancel server-side; just get out of the stuck outgoing
       overlay immediately instead of leaving a dead Cancel button.
     - acceptCall(): on getMedia() failure, show toast + rejectCall() — server already
       knows this callId (already past 'ringing'), so send 'call-reject' to stop the
       caller ringing forever; UI reset happens via the existing server-authoritative
       'ended'/reason==='rejected' handler (no duplicate reset logic needed).
     - enterActiveCall(): on getMedia() failure (F5-reconnect path), show toast +
       hangUp() (guarded by generation check) instead of leaving callState stuck at
       'reconnecting' forever with no signal to the counterparty.
     - cancelCall(): defense-in-depth — falls back to useCallStore.getState().reset()
       when callId is still empty (e.g. user clicks "Hủy cuộc gọi" while getMedia()
       is still pending), since sendIntent() silently no-ops on an empty callId and
       would otherwise leave the Cancel button dead in that narrow window.
  4. frontend/src/realtime/roomActions.ts:
     - ensureLocalMedia(): toast now uses mediaErrorToastMessage() instead of exposing
       the raw internal MediaErrorType key.
     - doCreateMesh(): on ensureLocalMedia() failure, send {type:'leave-room', roomId}
       (using the roomId parameter directly, since store.roomId is still null at this
       point) + call teardownRoom() (the same cleanup leaveRoom() uses) — clears
       incomingInvite/outgoingInvitees immediately instead of waiting for
       GroupInviteModal's independent 30s auto-decline timer, and tells the server
       this client is not actually a room member.
  5. Added regression tests: frontend/src/realtime/callActions.mediaError.test.ts
     (startCall + acceptCall) and frontend/src/realtime/roomActions.mediaError.test.ts
     (room-joined → doCreateMesh failure path).
verification: |
  - `npx vitest run` (frontend): 67/67 tests green (63 pre-existing + 4 new regression
    tests covering the 3 fixed call sites), zero regressions.
  - `npx tsc -b tsconfig.json --noEmit`: clean, no type errors.
  - `npx eslint` on all touched files: clean, no lint errors.
  - enterActiveCall's fix (F5-reconnect path) verified by code reading + generation-guard
    consistency check only (not covered by an automated test — reaching this path
    requires simulating a 'call-state-changed'/'active' server signal after a prior
    successful call setup, which needs a heavier mock harness than was proportionate
    for this fix; flagged for the human-verify checkpoint / manual 2-device check).
  - NOT yet verified: real browser permission-DENIAL end-to-end in an actual 2-tab/
    2-device session (this sandbox cannot revoke getUserMedia permission interactively).
    Flagged in human-verify checkpoint below.
files_changed:
  - frontend/src/webrtc/media.ts
  - frontend/src/components/call/MediaErrorNotice.tsx
  - frontend/src/realtime/callActions.ts
  - frontend/src/realtime/roomActions.ts
  - frontend/src/realtime/callActions.mediaError.test.ts (new)
  - frontend/src/realtime/roomActions.mediaError.test.ts (new)
