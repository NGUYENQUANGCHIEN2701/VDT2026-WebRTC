---
status: awaiting_human_verify
trigger: "Cuộc gọi 1-1: sau khi kết nối thành công (hiển thị \"Đã kết nối\", timer chạy 00:00), video của remote (người kia) thường xuyên bị đen/trống — chỉ thấy self-view (PiP góc dưới phải) hiển thị, còn khung video chính (remote) không hiện hình dù trạng thái kết nối báo connected. Xảy ra \"nhiều khi\" (không phải 100% các lần gọi) — có kèm ảnh chụp màn hình CallPage lúc bị lỗi."
created: 2026-07-02
updated: 2026-07-02
---

## Symptoms

- **Expected behavior:** Sau khi trạng thái báo "Đã kết nối", khung video remote chính (giữa màn hình) phải hiển thị hình ảnh trực tiếp của người gọi kia.
- **Actual behavior:** Khung video remote vẫn đen/trống dù badge "Đã kết nối" + timer đang chạy (00:00). Chỉ self-view (PiP góc dưới phải) hiển thị camera của chính mình.
- **Error messages:** Chưa kiểm tra console trình duyệt (F12) hoặc log backend — cần agent hướng dẫn/soi log nếu có thể tái hiện được.
- **Timeline:** Xảy ra lặp lại "nhiều khi" (không phải mọi lần gọi) — chưa xác định mốc bắt đầu, có thể đã tồn tại qua nhiều phase trước.
- **Reproduction:** Chủ yếu quan sát khi test bằng 2 tab/trình duyệt trên cùng một máy (localhost/LAN, không phải NAT thật). Chưa thử toggle camera hoặc refresh khi đang bị đen hình để xem có tự hồi phục không.

## Current Focus

hypothesis: "CONFIRMED (revised, 2 combined bugs): (A) PeerManager.ts — the 'polite' (callee) PeerManager self-initiates its own SDP offer on the very first onnegotiationneeded (glare), which then gets implicitly rolled back when the real caller offer arrives; ICE candidates gathered for that rolled-back offer generation can still be sent/added and corrupt the ICE candidate pool, leaving pc.iceConnectionState stuck at 'new' forever even though signalingState reaches 'stable' (SDP fully applied) — this is the PRIMARY root cause. (B) CallPage.tsx's remote-video attach effect also unconditionally destructively reset srcObject (null->reassign) on every remoteStreamVersion bump, aborting in-flight play() calls — a SECONDARY, independently real bug that was insufficient alone to explain the failures (falsified below) but still worth fixing."
test: "Applied fix (B) alone first (track-count guard in CallPage.tsx) and reran the repro loop — bug STILL reproduced on attempt 1/15 (readyState stuck at 0, pc.iceConnectionState='new'/connectionState='new' confirmed via temp debugState() polling despite signalingState='stable'). This FALSIFIED hypothesis (B) as sufficient on its own. Re-investigated: added track.onunmute/onmute + iceConnectionState/connectionState + onnegotiationneeded logging -> confirmed glare (both sides self-initiate offers) on EVERY run, and on FAILING runs iceConnectionState never leaves 'new' despite stable signaling. Applied fix (A) (gate polite side's self-initiated offer on the very first negotiation) together with fix (B), then reran: 20x + 30x custom repro script (50/50 pass) + 8x official Playwright E2E spec (8/8 pass), all against vite dev server on current source. Also reran after removing all temp debug instrumentation: 15/15 pass."
expecting: "0 failures across all repro batches after both fixes; vitest (63/63) and eslint clean."
next_action: "update Resolution with final root_cause/fix/files_changed, set status to verifying then awaiting_human_verify, request user confirmation via real 2-browser/2-device call."
reasoning_checkpoint:
  hypothesis: "Root cause is a WebRTC negotiation glare bug: PeerManager's onnegotiationneeded handler lets BOTH the impolite (caller) AND polite (callee) side self-initiate an SDP offer with no gating (canInitiateOffer is only ever passed by MeshManager/group calls, never by 1-1 callActions.createPeer). On the callee's side this self-initiated offer is immediately superseded/implicitly-rolled-back by the caller's real incoming offer, but ICE candidates already gathered/emitted for that abandoned offer generation can still be sent to and applied by the peer, corrupting its ICE candidate pool for the CURRENT (accepted) negotiation. Result: signalingState reaches 'stable' (SDP application succeeds) but iceConnectionState/connectionState never leave 'new' — connectivity checks never start — so no RTP ever flows and MediaStreamTrack.muted stays true forever, even though the app's callState/UI badge (driven by real pc state per prior investigation) eventually still reads as if progressing normally in some runs. A secondary, independently real bug in CallPage.tsx's video-attach effect (destructive srcObject null-then-reassign on every remoteStreamVersion bump, which fires once per ontrack call) was ALSO present and could abort in-flight play() calls, but fixing it alone did not eliminate the failures — proving it was not the (sole) root cause."
  confirming_evidence:
    - "Fix (B) alone: reran repro loop after applying ONLY the CallPage.tsx track-count guard — still failed on attempt 1/15, with getActivePeer().debugState() (temp instrumentation) showing connectionState='new', iceConnectionState='new', signalingState='stable', iceGatheringState='complete'/'gathering' on BOTH sides at time of failure. This is decisive: SDP negotiation completed (stable) but ICE connectivity checks never started."
    - "Temp onnegotiationneeded logging confirmed glare on EVERY run (both callerOk=true/false runs): both caller (impolite) and callee (polite) log '[negotiationneeded] hasRemoteDesc:false' near-simultaneously, meaning callee always self-initiates its own offer before receiving the caller's, exactly the collision perfect-negotiation is designed to resolve at the SDP level — but evidently not always safely at the ICE level given trickled candidates from the abandoned generation."
    - "After applying fix (A) (skip self-initiated offer on polite side's first negotiation, i.e. only initiate once currentRemoteDescription exists) together with fix (B): 20/20, then 30/30 additional custom repro runs passed; 8/8 official Playwright E2E spec runs passed (previously this same spec failed 3/8 with 'Test timeout of 90000ms exceeded' inside waitForRemoteFrames before any fix). 15/15 final confirmation run after removing all debug instrumentation also passed."
    - "vitest (63/63, 7/7 files) and `npm run lint` both clean after the fix — no regression in perfect-negotiation collision handling for the impolite side, ICE-restart recovery path (scheduleRecoveryIfNeeded), or MeshManager (unaffected, already had its own canInitiateOffer gating)."
  falsification_test: "If real-world 2-device manual verification (not fake-media E2E) still shows intermittent black remote video after this fix, the hypothesis is incomplete — would need to check whether the STAB-02 ICE-restart path (which also calls handleNegotiationNeeded, now also gated by the same polite-check but AFTER first negotiation so currentRemoteDescription exists by then and should be unaffected) introduces a related glare during reconnects specifically over a real lossy network the fake-media/localhost E2E can't exercise."
  fix_rationale: "(A) addresses the actual mechanism: prevents the polite side from ever entering the offer/rollback race during the FIRST negotiation, which is what corrupted the ICE candidate pool. The callee doesn't need to self-initiate at all for the initial connection — its local tracks (added via addLocalStream before any signaling) are automatically included in the implicit answer it sends back in response to the caller's offer, so gating away the redundant self-offer costs nothing functionally. The gate only applies pre-first-negotiation (!currentRemoteDescription), so later legitimate renegotiations (e.g. ICE restart recovery, which can be initiated by either side) are unaffected. (B) addresses a real, separate defect (destructive resets aborting play()) with a minimal, targeted guard rather than removing the underlying 'force reload for a genuinely new track' behavior entirely."
  blind_spots: "Root cause mechanism for WHY stale-generation ICE candidates specifically corrupt the pool (vs. being silently ignored by ufrag mismatch, as spec would suggest) was not traced at the browser-internals level (e.g. chrome://webrtc-internals dump) — inferred from indirect evidence (iceConnectionState stuck at 'new' with stable signaling, glare confirmed present, fix eliminates failures). Verification is 100% fake-media/localhost E2E plus vitest/lint — no real 2-device/real-network manual test performed by the agent (requires the user); STUN/TURN relay paths and cross-instance (backend-1 vs backend-2) routing under this fix specifically were not separately isolated, though earlier evidence (Eliminated) already showed correct message routing even under the bug."
tdd_checkpoint: null

## Evidence

- timestamp: 2026-07-02T1
  checked: "frontend/src/webrtc/PeerManager.ts ontrack/negotiation logic, frontend/src/pages/CallPage.tsx remote-video attach effect, frontend/src/store/callStore.ts, frontend/src/realtime/callActions.ts createPeer/enterActiveCall"
  found: "Two PRIOR fix attempts already exist for black-video symptoms: commit 0829431 (bump remoteStreamVersion on ontrack so effect re-attaches srcObject) and commit 49fb59c (force-reload trick: srcObject=null then reassign when stream reference is unchanged, to pick up a track added later to the same MediaStream). Bug still reported after both fixes."
  implication: "Root cause is not the negotiation/buffering logic (already solid: perfect negotiation + ICE candidate buffering before remoteDescription look correct) but something in how the two prior fixes interact — worth testing empirically rather than more static reading."

- timestamp: 2026-07-02T2
  checked: "docker ps — found the project's full docker-compose stack already running (nginx:8080 LB'ing backend-1/backend-2, redis, postgres, rabbitmq, coturn); frontend/e2e/one-to-one-call.spec.ts — existing Playwright fake-media 2-context 1-1 call E2E test with a waitForRemoteFrames() assertion (videoWidth/videoHeight>0)"
  found: "Ran the E2E test in a loop (8x) against the live stack: 5 passed, 3 failed with 'Test timeout of 90000ms exceeded' inside waitForRemoteFrames — reproduced the exact reported bug (video never gets frames) using FAKE media devices, ruling out physical-camera contention as an explanation."
  implication: "This is a genuine, reproducible code bug (not a local 2-tabs-sharing-one-webcam test artifact). Confirmed reproducible against both the built docker image AND the vite dev server running current source (frontend/vite.config.ts proxies /api,/ws -> localhost:8080), so it's present in the current working tree, not stale/already-fixed."

- timestamp: 2026-07-02T3
  checked: "Wrote standalone Playwright+CDP repro script (scratchpad/repro_black_video.js) capturing raw WebSocket signaling frames (Network.webSocketFrameSent/Received via CDP) for both caller and callee pages, plus final <video> srcObject/track/readyState dump on failure."
  found: "On a captured failing run: both caller and callee end up with a valid srcObject containing 2 live, enabled tracks (audio+video, readyState:'live') but video.paused=true/false, readyState=0 (HAVE_NOTHING), videoWidth/videoHeight=0. The captured WS frame trace shows a full, structurally correct SDP offer/answer + trickled ICE candidate exchange on both directions (both m-lines under one BUNDLE), including a real glare (both peers independently self-initiate an offer via onnegotiationneeded — polite side is not gated with canInitiateOffer, only MeshManager/group calls pass that callback) that gets resolved correctly per perfect-negotiation rules (impolite ignores colliding offer, polite implicit-rollback + answers)."
  implication: "SDP/ICE negotiation is NOT the failure point — it completes correctly (with an unnecessary-but-harmless glare each time, since 1-1 PeerManager never passes canInitiateOffer:false to gate the polite side). The failure is entirely downstream, in how the browser <video> element receives/renders an already-fully-negotiated, track-complete MediaStream."

- timestamp: 2026-07-02T4
  checked: "Added temporary console.log instrumentation to PeerManager.ts ontrack handler and CallPage.tsx attach effect (before/after srcObject state, explicit .play() call + resolve/reject logging); reran repro against vite dev server."
  found: "CALLEE log sequence for a failing run: ontrack(audio, streamTrackCount=2) -> ontrack(video, streamTrackCount=2) -> effect run 1 'plain assign' -> effect run 2 'FORCE RELOAD' -> effect run 3 'FORCE RELOAD' -> 2x 'play() REJECTED: AbortError: The play() request was interrupted by a new load request' (3rd play() call left permanently pending, never resolved or rejected). CALLER showed the same pattern (4 effect runs, 3 REJECTED, final one pending)."
  implication: "Confirms a real mechanism (CallPage churn aborting play()) — applied fix (B) for it, but this alone was later shown NOT sufficient to eliminate failures (see T5), meaning it was a secondary/contributing bug, not the (sole) root cause."

- timestamp: 2026-07-02T5
  checked: "Applied fix (B) only (CallPage.tsx track-count guard, removing redundant destructive resets), reran custom repro script."
  found: "Still reproduced on attempt 1/15 after fix (B) alone: video.readyState stuck at 0, videoWidth/Height 0, tracks live-but-permanently-muted on both sides. Added temp PeerManager.debugState() + window.__DBG_getActivePeer hook to poll real pc state on failure: connectionState='new', iceConnectionState='new', signalingState='stable', iceGatheringState='complete'(caller)/'gathering'(callee)."
  implication: "FALSIFIES fix (B) as sufficient — hypothesis from T4 was incomplete. Decisive new finding: SDP negotiation DOES complete (signalingState stable) but ICE connectivity checks NEVER START (iceConnectionState stuck at 'new'), meaning the failure is upstream of the video-element rendering layer entirely — it's a transport/ICE-level failure, not (only) a client rendering race."

- timestamp: 2026-07-02T6
  checked: "Added temp logging for onnegotiationneeded (polite flag + hasRemoteDescription + signalingState) and track.onunmute/onmute events; reran repro."
  found: "EVERY run (pass or fail) shows glare: both caller (impolite) and callee (polite) independently self-initiate their own SDP offer via onnegotiationneeded (callee's addLocalStream()-triggered onnegotiationneeded fires with hasRemoteDesc:false, i.e. before it has received the caller's real offer). onunmute never fires on failing runs — tracks stay permanently muted (no RTP ever received), consistent with T5's iceConnectionState='new' finding (ICE never started checking, so DTLS/SRTP never established, so no media flows)."
  implication: "The double-offer glare (callee's own self-initiated offer gets implicitly rolled back when the caller's real offer arrives) is the likely trigger: ICE candidates gathered/emitted for the callee's now-abandoned offer generation can still be sent and applied, corrupting the ICE candidate pool used for the FINAL (accepted) negotiation. 1-1 PeerManager never gates this via canInitiateOffer (that callback is only ever passed by MeshManager for group calls) — every 1-1 call always races both self-initiated offers on the first negotiation, and usually 'gets lucky' (glare resolves cleanly), but intermittently corrupts ICE state instead."

- timestamp: 2026-07-02T7
  checked: "Applied fix (A): gated handleNegotiationNeeded so the 'polite' side skips self-initiating an offer while it has never received a remoteDescription yet (`if (this.polite && !this.pc.currentRemoteDescription) return`), kept fix (B). Removed all temp debug instrumentation (console.log calls, debugState(), window.__DBG_getActivePeer hook). Reran: 20x + 30x custom repro (fake-media, CDP WS capture), 8x official frontend/e2e/one-to-one-call.spec.ts, 15x final post-cleanup confirmation, plus `npx vitest run` and `npm run lint`."
  found: "50/50 custom repro passed, 8/8 official E2E passed (was 3/8 failing before any fix, ~11-13s avg -> now ~3.3-3.5s consistently), 15/15 final confirmation passed, vitest 63/63 (7/7 files) passed, lint clean."
  implication: "Combined fix (A)+(B) eliminates the reproduction entirely across 65 total automated call attempts plus the project's own E2E spec — root cause confirmed and fix verified to the extent automatable (fake-media, localhost/docker network). Real 2-device/real-network manual verification still needed from the user before declaring fully resolved (see Resolution/checkpoint)."

## Eliminated

- hypothesis: "'Đã kết nối' badge is driven by the signaling-level call-state-machine (Redis CAS) rather than actual RTCPeerConnection state, showing 'connected' before ICE/DTLS actually finishes."
  evidence: "PeerManager.mapIceState()/mapConnectionState() write callState directly from pc.oniceconnectionstatechange/onconnectionstatechange (real ICE/connection state) for 1-1 calls (no callbacks passed in callActions.createPeer, so it always falls through to useCallStore.getState().setCallState(next) driven by the real RTCPeerConnection state, not the server's call-state-changed message alone)."
  timestamp: 2026-07-02T1

- hypothesis: "Physical webcam contention across 2 browser tabs on the same test machine causes one side's camera capture to silently fail, explaining the intermittent black remote video."
  evidence: "Reproduced the exact same failure signature using Playwright's --use-fake-device-for-media-stream (synthetic per-context video source, zero hardware contention possible) against both the docker-compose stack and vite dev server — bug is a genuine code issue, not a local-test-environment artifact."
  timestamp: 2026-07-02T2

- hypothesis: "Backend Redis cross-instance signaling relay (nginx round-robin sending caller/callee to different backend-1/backend-2 instances) drops or reorders SDP/ICE messages, causing incomplete negotiation on one side."
  evidence: "CDP-captured raw WS frames for a failing repro run show a complete, correctly-ordered SDP offer/answer + ICE candidate exchange on both sides — negotiation fully completes even when the bug reproduces. RedisMessageRouter.sendToUser/RoutingMessageListener code review also shows synchronous, session-registry-first routing with route:{userId} keys set at connection time, well before any call signaling begins."
  timestamp: 2026-07-02T3

## Resolution

root_cause: |
  TWO combined bugs, both in the 1-1 WebRTC connection setup path:

  (A) PRIMARY — frontend/src/webrtc/PeerManager.ts: handleNegotiationNeeded() let
  BOTH the impolite (caller) and polite (callee) side self-initiate their own SDP
  offer with no gating (the canInitiateOffer callback that could prevent this was
  only ever passed by MeshManager for group calls, never by 1-1 callActions.ts).
  On every 1-1 call, both sides' addLocalStream() triggers onnegotiationneeded and
  both race to send their own offer (glare). The callee's self-initiated offer is
  implicitly rolled back when the caller's real offer arrives shortly after (per
  perfect-negotiation), but ICE candidates already gathered/emitted for that
  abandoned offer generation could still be sent and applied, corrupting the ICE
  candidate pool for the final (accepted) negotiation. Result: signalingState
  reaches 'stable' (SDP fully applied on both sides) but iceConnectionState/
  connectionState get stuck at 'new' forever — ICE connectivity checks never
  start, so DTLS/SRTP never establishes, so no RTP ever flows and the remote
  MediaStreamTrack objects stay permanently muted, even though the app's own
  "Đã kết nối" badge (in some code paths) and the srcObject/tracks on the
  <video> element all look otherwise valid.

  (B) SECONDARY (real but insufficient alone) — frontend/src/pages/CallPage.tsx's
  remote-video attach useEffect unconditionally performed a destructive
  srcObject=null-then-reassign ("force reload", added in commit 49fb59c) every
  time it re-ran while the attached stream's object reference was unchanged.
  Because PeerManager bumps remoteStreamVersion on every ontrack call (once per
  track), the effect could fire 2-4 times in rapid succession per connect, each
  "force reload" cancelling the previous run's in-flight <video>.play() with an
  AbortError — contributing additional churn on top of bug (A), though fixing
  (B) alone did not eliminate the failures (falsified via repro after fix (B)
  only, still showed iceConnectionState stuck at 'new').

fix: |
  (A) frontend/src/webrtc/PeerManager.ts — handleNegotiationNeeded() now returns
  early (skips self-initiating an offer) when `this.polite && !this.pc.currentRemoteDescription`
  — i.e. the polite/callee side never races its own offer before it has received
  anything from the remote peer. It still responds normally: once the caller's
  real offer arrives, setRemoteDescription + implicit setLocalDescription(answer)
  proceeds as before (local tracks were already added via addLocalStream(), so
  the answer still carries the callee's own media). The gate only blocks the
  FIRST negotiation attempt (before any currentRemoteDescription exists) so later
  legitimate renegotiations (e.g. STAB-02 ICE-restart recovery, which can be
  triggered by either side) are unaffected.

  (B) frontend/src/pages/CallPage.tsx — the remote/local video attach effect now
  tracks the track-count actually attached to each <video> element in a ref
  (remoteAttachedTrackCountRef / localAttachedTrackCountRef) and only performs
  the destructive srcObject=null-then-reassign "force reload" when the stream's
  track count has genuinely changed since the last attach, instead of doing it
  unconditionally on every effect re-run. Preserves the original intent (still
  force-reloads when a track is genuinely added later to an already-attached
  stream) while eliminating the redundant resets that were aborting in-flight
  play() calls.

verification: |
  - Reproduced the bug reliably pre-fix: Playwright fake-media 2-context 1-1 call
    (frontend/e2e/one-to-one-call.spec.ts) failed 3/8 runs against the live
    docker-compose stack; custom repro script (scratchpad/repro_black_video*.js,
    using CDP to capture raw WS signaling frames) failed ~1-in-4 to 1-in-8 runs
    against both the docker stack and vite dev server on current source.
  - After fix (B) alone: still failed 1/15 (falsified as sole root cause) —
    confirmed via temp instrumentation that iceConnectionState was stuck at 'new'.
  - After fix (A)+(B) together, with all temp debug instrumentation removed:
      - Custom repro script: 20/20, then 30/30 additional runs — 50/50 total.
      - Official frontend/e2e/one-to-one-call.spec.ts: 8/8 runs passed (~3.3-3.5s
        each, vs previously 3/8 failing with 90s timeouts).
      - Final post-cleanup confirmation: 15/15 custom repro runs passed.
      - `npx vitest run`: 63/63 tests passed (7/7 files, including
        PeerManager.test.ts's existing perfect-negotiation/glare-collision tests
        — no regression).
      - `npm run lint`: clean.
  - NOT yet verified: real 2-device / real-network manual call (only fake-media
    E2E + docker-compose localhost network tested by the agent). Requesting user
    confirmation via an actual 2-browser or 2-device call before archiving.

files_changed:
  - frontend/src/webrtc/PeerManager.ts
  - frontend/src/pages/CallPage.tsx
