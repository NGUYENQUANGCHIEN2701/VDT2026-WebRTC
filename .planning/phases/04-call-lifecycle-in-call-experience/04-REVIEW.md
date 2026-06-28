---
phase: 04-call-lifecycle-in-call-experience
reviewed: 2026-06-28T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - backend/src/main/java/com/vdt/webrtc/call/CallService.java
  - backend/src/main/java/com/vdt/webrtc/call/CallStateMachine.java
  - backend/src/main/java/com/vdt/webrtc/call/CallStateRepository.java
  - backend/src/main/java/com/vdt/webrtc/call/CallTimerService.java
  - backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java
  - backend/src/main/resources/scripts/create_call.lua
  - backend/src/main/resources/scripts/transition_call.lua
  - frontend/src/realtime/callActions.ts
  - frontend/src/webrtc/PeerManager.ts
  - frontend/src/store/callStore.ts
  - frontend/src/realtime/mediaControls.ts
  - frontend/src/webrtc/media.ts
  - frontend/src/components/call/CallLayer.tsx
  - frontend/src/components/call/CallSummaryScreen.tsx
  - frontend/src/pages/CallPage.tsx
  - frontend/src/hooks/useCallDuration.ts
findings:
  critical: 4
  warning: 9
  info: 5
  total: 18
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-06-28
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Reviewed the Phase 4 call-lifecycle implementation: server-authoritative Redis state machine (Lua CAS), WebSocket signaling, grace-period recovery/reconnect, perfect-negotiation peer rebuild, and the in-call/summary UI. The architecture is sound and the CAS guards are mostly correct, but the review found several correctness defects that bite real (not pathological) flows:

- **Active calls die after 5 minutes** because the Redis TTL set at creation is never refreshed on `active` transition (CR-01). This is the most severe finding — any call longer than the ring TTL silently loses its server state.
- **Race window in `handleInvite`/`createCall`** where a caller already in a call is not reliably blocked, and the GLARE branch leaves the loser with no server-side record cleanup (CR-02).
- **Grace timer leaks and a double-broadcast window** in the disconnect/hangup/reconnect interplay (CR-03).
- **Duration is wrong after a reconnect**: `connectedAt` is preserved across rebuild but the perfect-negotiation rebuild re-enters `connected`, and on a fresh post-F5 client `connectedAt` restarts from the rebuild, under-counting duration (CR-04).

Warnings cover unbounded `pendingSignals` growth, missing actor/state validation, glare double-accept, ICE-restart storms, and several robustness gaps.

## Critical Issues

### CR-01: Active call Redis state expires after ring TTL (5 min); long calls lose all server state

**File:** `backend/src/main/resources/scripts/create_call.lua:41-43`, `backend/src/main/resources/scripts/transition_call.lua` (whole file)

**Issue:** `create_call.lua` sets a 300s TTL (`ARGV[5]="300"` from `CallStateMachine.createCall`) on `call:{id}`, `user-call:{caller}`, `user-call:{callee}`. `transition_call.lua` never refreshes (PERSIST or re-EXPIRE) these keys when transitioning to `active`. Consequence: any call that stays active longer than ~5 minutes has its Redis record and both busy-pointers silently evaporate. After that:
- `repo.find(callId)` returns empty → `handleHangUp` / `handleDisconnect` / `handleReconnect` all become no-ops (the `ifPresent` body never runs). Hang-up no longer broadcasts `ended`; the peer is never told the call ended.
- `findCallIdByUser` returns empty → grace/reconnect recovery is dead for long calls.
- Both users appear "free" to `create_call` even though they are mid-call → BUSY detection fails, glare detection fails.

This converts the headline feature ("two users call 1-1 stably") into something that breaks at the 5-minute mark.

**Fix:** On `active` transition, make the call record persistent (or refresh to a long TTL) and refresh the pointers:
```lua
-- in transition_call.lua, Bước 5
if ARGV[2] == 'active' then
    redis.call('HSET', KEYS[1], 'activeAt', ARGV[4])
    redis.call('PERSIST', KEYS[1])
    if KEYS[2] ~= '' then redis.call('PERSIST', KEYS[2]) end
    if KEYS[3] ~= '' then redis.call('PERSIST', KEYS[3]) end
end
```
If you keep a TTL for safety, refresh it to a value well above any expected call length and renew it on heartbeat. Either way the current behavior (active call inherits the 300s ring TTL) is a defect.

### CR-02: `handleInvite` caller-busy check races; GLARE branch leaves loser orphaned

**File:** `backend/src/main/java/com/vdt/webrtc/call/CallService.java:40-56`, `backend/src/main/resources/scripts/create_call.lua:28-31`

**Issue (a) — caller-busy is not atomic with intent:** `create_call.lua` checks `EXISTS user-call:{callerId}` (step 3) to reject a caller already in a call. But a single user can hold one WS session and fire two `call-invite` messages, or be the callee of an in-flight `ringing` call while initiating a new invite. Because the caller-busy guard only returns BUSY (`-1`), the caller is told "the *other* party is busy" — `handleInvite` maps `-1` to `CallStateChanged(..., "busy")` and the toast says `${calleeId} đang bận`. That is a misleading/incorrect message: the *caller* is the one who is busy. The user sees "Bob is busy" when Bob is perfectly free.

**Issue (b) — GLARE leaves an orphaned half-call:** On GLARE the Java code intentionally does nothing (`CallService.java:50-54`), relying on the client. But the second (reverse) `create_call` did NOT create a record — only the first call exists. The losing client (the one whose invite returned GLARE) is never sent any `CallStateChanged`. It stays stuck in `outgoing` forever unless the *reverse* `ringing` happens to arrive first. The ordering between "my invite returns GLARE (silent)" and "the other side's ringing reaches me" is not guaranteed by anything; if the GLARE-losing invite is processed and the reverse ringing was already delivered, the auto-accept in `callActions.handleCallState` (line 177) may or may not fire depending on whether `callState==='outgoing'` still holds. This is a latent stuck-call.

**Fix:**
- (a) Distinguish caller-busy from callee-busy. Return a third code (e.g. `-3 = CALLER_BUSY`) from the Lua script and surface a correct message ("Bạn đang trong một cuộc gọi khác") instead of blaming the callee.
- (b) Make GLARE deterministic on the server: have `create_call.lua`/`CallService` decide the winner (lower-userId-wins is already the documented rule) and emit an explicit `CallStateChanged` to the loser so the client has a single source of truth rather than racing two messages.

### CR-03: Grace timer leaks and double-broadcast window on hangup/reconnect during grace

**File:** `backend/src/main/java/com/vdt/webrtc/call/CallService.java:108-157`, `CallTimerService.java:43-48`

**Issue:** When user A drops mid-call, `handleDisconnect` schedules a grace timer. Several interleavings are mishandled:

1. **Hangup during grace does not cancel the grace timer.** `handleHangUp` cancels only the *ring* timer (`timers.cancelRingTimer`), never the grace timer. If B hangs up while A is in grace, the call transitions `active→ended(completed)` and the pointers are DELeted, but the grace timer keeps running. When it fires, `onGraceExpired` calls `repo.find` (record still present until TTL), sees state `ended`, CAS `active→ended` fails → no double broadcast (good), but the timer leaked for the full grace window and `onGraceExpired` ran needless work. With CR-01's pointer DELETE this is benign; combined with many calls it is a steady timer leak.

2. **`scheduleGrace` uses `computeIfAbsent` → a stale grace timer is never replaced.** If A drops, grace scheduled; A reconnects (cancelGrace removes it); A drops again within the same call — fine, a new one is scheduled. But if `handleDisconnect` is somehow invoked twice (e.g. superseded-session close + real close) before the first fires, the second is a no-op and the first timer's callback still references the *original* grace deadline. Generally acceptable, but note `computeIfAbsent` silently ignores the second request rather than restarting the window — verify that is the intended semantics; for "extend grace on each drop" it is wrong.

3. **Reconnect broadcasts `active` without re-validating that media actually recovered.** `handleReconnect` (line 146) cancels grace and immediately broadcasts `active` to both. If the reconnecting WS belongs to a user whose old session was superseded (login elsewhere) rather than a genuine reconnect of the same human, the surviving peer is forced to tear down and rebuild its PC against a party that may not complete negotiation, with no fallback timer re-armed. There is no re-arm of grace if the rebuild then fails.

**Fix:**
- Cancel the grace timer in `handleHangUp`, `handleReject`, `handleCancel` (any terminal transition): add `timers.cancelGrace(callId);` alongside the existing `cancelRingTimer`.
- Decide explicitly whether a second disconnect should restart the grace window; if yes, replace `computeIfAbsent` with a cancel-then-reschedule.
- After `handleReconnect` broadcasts `active`, consider re-arming a shorter grace/connection-watchdog so a failed rebuild still terminates the call instead of hanging in `reconnecting`.

### CR-04: Call duration is wrong across reconnect / post-refresh rebuild

**File:** `frontend/src/store/callStore.ts:69-74,79-84`, `frontend/src/realtime/callActions.ts:82-104`

**Issue:** `setCallState` only stamps `connectedAt` "the first time" it reaches `connected` (`s.connectedAt == null`). Two failure modes:

1. **Surviving peer keeps `connectedAt` from the original connect** — correct for that side. But the **refreshed/reconnected peer** lost its store on F5 (`reset()` clears `connectedAt` to null). When it rebuilds and reaches `connected`, `connectedAt` is stamped at *rebuild time*, not the original call start. Its duration (and the value persisted into `durationMs` at `endCall`) under-counts by the entire pre-refresh portion of the call. The two peers now report different durations; the refreshed side's summary is simply wrong.

2. **`durationMs` is computed from `connectedAt` only.** Because server is authoritative and stamps `activeAt` in Redis (`transition_call.lua:29`), the correct duration source is the server, not the client clock. The client never reads `activeAt`, so any client whose `connectedAt` was reset reports a wrong number, and call history (when added) will disagree with the UI.

**Fix:** Carry the authoritative call start from the server. Include `activeAt` in the `active` `CallStateChanged` payload and use it to seed `connectedAt` on rebuild (so a refreshed client recovers the true start), e.g.:
```ts
// when entering active, if server provides activeAt, prefer it
if (msg.activeAt) useCallStore.setState({ connectedAt: msg.activeAt })
```
Persist the call start through `saveActiveCall` (sessionStorage) as a fallback for the F5 case.

## Warnings

### WR-01: `pendingSignals` can grow unbounded and is never time-bounded

**File:** `frontend/src/realtime/callActions.ts:15-19,73-76`

**Issue:** Inbound SDP/ICE that arrive before `peer` exists are pushed to `pendingSignals`. If `createPeer` never runs (e.g. the `active` message is lost, or `getMedia()` fails so `enterActiveCall` returns early at line 96 without creating a peer), buffered signals are never drained and keep accumulating for the lifetime of the module (until a `teardownMedia`). A malicious or buggy peer can stream ICE candidates indefinitely into this array.

**Fix:** Cap the buffer length (drop oldest beyond N), and clear `pendingSignals` whenever `enterActiveCall` bails (media failure) or the call ends. Currently `teardownMedia` clears it but the early-return path at line 96 does not.

### WR-02: `enterActiveCall` is re-entrant; overlapping `active` messages can build two peers / orphan media

**File:** `frontend/src/realtime/callActions.ts:82-104`

**Issue:** `enterActiveCall` is `async` and awaits `getMedia()` and `createPeer()` (which awaits `fetchIceConfig`). If two `active` `CallStateChanged` messages arrive in quick succession (e.g. reconnect resync racing with the original active, or a duplicated broadcast), two invocations interleave. The second can run `peer?.close(); peer = null` while the first is mid-`await createPeer`, then both assign `peer`, leaking one `RTCPeerConnection` and possibly attaching the wrong polite/impolite role. There is no in-flight guard.

**Fix:** Add a re-entrancy guard (a module-level `enteringActive` boolean or a generation counter compared after each await) so a stale invocation aborts before assigning `peer`.

### WR-03: Glare auto-accept can fire twice / before media is ready

**File:** `frontend/src/realtime/callActions.ts:174-180`

**Issue:** On glare, the code calls `call.startIncoming(...)` then `acceptCall()`. `acceptCall` reads `callId` from the store and awaits `getMedia()` before sending `call-accept`. If two `ringing` messages arrive (server retry, or the user also clicks accept), `acceptCall` can be invoked twice, sending duplicate `call-accept`. The server CAS makes the second a no-op, but the second `getMedia()` call is wasteful and `getMedia` is only idempotent on `localStream` presence — concurrent calls before the first resolves both proceed to `getUserMedia`.

**Fix:** Guard `acceptCall` against concurrent/duplicate invocation (track an `accepting` flag or check `callState !== 'incoming'`).

### WR-04: Both peers calling `restartIce()` simultaneously with no backoff can storm

**File:** `frontend/src/webrtc/PeerManager.ts:144-146`

**Issue:** On `iceConnectionState === 'failed'`, `mapIceState` immediately calls `restartIce()`. Both peers can hit `failed` together and both restart, and if the restart also fails it will fire again on the next `failed` transition with no backoff or attempt cap. On a genuinely dead network this produces repeated offer churn. The comment claims perfect negotiation resolves collisions, which is true for correctness but not for the unbounded-retry concern.

**Fix:** Add a restart attempt counter / cooldown; after N failed restarts, surface `failed` to the user instead of looping.

### WR-05: `mapIceState` `disconnected → reconnecting` can overwrite server `connected`/`ended` semantics

**File:** `frontend/src/webrtc/PeerManager.ts:139-158`, `frontend/src/realtime/callActions.ts:185-205`

**Issue:** ICE-derived state is written directly into the same `callState` field the server-authoritative flow uses. The `close()` handler-nulling (PeerManager.ts:97) protects the `ended` path *only if* `teardownMedia` runs before any pending async ICE event. But `oniceconnectionstatechange` is async; a `disconnected` event already queued before `close()` can still execute its handler? (It cannot after the handler is nulled — verify.) More concretely, a transient `disconnected` blip during a healthy call flips the UI to `reconnecting` (dimmed video, spinner) even though the server still considers the call `active` and nothing is actually wrong, then recovers — UI flicker that can be mistaken for instability.

**Fix:** Treat ICE-derived states as advisory only; debounce `disconnected→reconnecting` (e.g. only after it persists >2s) and never let ICE states regress a server-confirmed terminal state.

### WR-06: No actor authorization on SDP/ICE/media-state relay

**File:** `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java:81-91`

**Issue:** `SdpMessage`, `IceCandidateMessage`, and `MediaState` are relayed straight to `msg.to()` with no check that sender and `to` are actually peers in a live call (`repo` is not consulted). Any authenticated user can push arbitrary SDP/ICE/media-state to any other online user, forcing UI changes (e.g. fake "remote muted") or interfering with their negotiation. Lifecycle messages are validated via the state machine; relay messages are not.

**Fix:** Before relaying, look up the sender's active call and verify `to` is the counterparty (`repo.findCallIdByUser(sender)` → `find` → assert `to` is the other party and state is `active`/`ringing`). Drop otherwise.

### WR-07: `find` casts Redis hash values without null/type safety

**File:** `backend/src/main/java/com/vdt/webrtc/call/CallStateRepository.java:22-28`

**Issue:** `(String) h.get("state")` etc. assume keys exist. If a record is partially written or partially expired (CR-01 makes partial expiry possible across multiple keys, though hash-field TTL isn't used here), `state`/`callerId` can be null, and downstream `"active".equals(call.state())` is null-safe but `call.callerId()` flowing into `transition`/`broadcast` with null produces `user-call:null` keys and `sendToUser(null, ...)`. No guard.

**Fix:** Validate required fields are non-null in `find` and return `Optional.empty()` if the record is incomplete.

### WR-08: `CallLayer` F5-recovery seeds `startIncoming` regardless of original role

**File:** `frontend/src/components/call/CallLayer.tsx:28-42`

**Issue:** On refresh-survival the saved call is restored via `call.startIncoming(saved.remote, saved.callId)` unconditionally, even if the refreshing user was the *caller*. The role is corrected later when the server `active` arrives (`enterActiveCall` recomputes `amCaller` from `msg.callerId`), so the final state is right, but during the window before resync the local store has the wrong role, and the 20s bail relies on `getActivePeer() == null` which is correct but the temporary mislabeling could surface in any UI that reads role from the store in that window.

**Fix:** Persist the role (amCaller) in sessionStorage alongside callId/remote and restore it accurately, or document that role is intentionally provisional until resync.

### WR-09: `handleHangUp` only allows `active→ended`; hang-up while still ringing is silently dropped

**File:** `backend/src/main/java/com/vdt/webrtc/call/CallService.java:108-119`

**Issue:** `handleHangUp` hardcodes the expected state `active`. If the UI sends `hang-up` (rather than `cancel`/`reject`) while the call is still `ringing` (plausible given the FE `hangUp()` is wired to the in-call HangUpButton, but a fast user or a state mismatch could send it early), the CAS `active→ended` fails and nothing happens — the call keeps ringing until ring-timeout. The ring timer is cancelled (line 112) *before* the CAS, so a failed CAS leaves the call ringing with no timer → it will never auto-miss either.

**Fix:** Either accept multiple from-states in hang-up, or do not cancel the ring timer unless the transition succeeds. Reorder so the timer is only cancelled on a successful transition (`if (ok) timers.cancelRingTimer(callId)`), matching the pattern that protects against orphaned ringing calls.

## Info

### IN-01: Magic number `"300"` TTL hardcoded in Java, not configurable

**File:** `backend/src/main/java/com/vdt/webrtc/call/CallStateMachine.java:25`

**Issue:** The call-record TTL `"300"` is a string literal in the call site while ring/grace timeouts are externalized via `@Value`. Inconsistent and easy to miss (see CR-01).

**Fix:** Externalize as a config property and pass it in.

### IN-02: `find` after timeout/grace re-reads stale `call` captured in lambda

**File:** `backend/src/main/java/com/vdt/webrtc/call/CallService.java:58-67,132-144`

**Issue:** `onRingTimeout`/`onGraceExpired` re-`find` the call (good, fresh read) but then `transition` using `call.callerId()/calleeId()` from that fresh snapshot — consistent. No bug, but note `broadcast` uses the snapshot's caller/callee which is fine. Left as info to confirm intent.

### IN-03: `setCallState('connecting')` after `createPeer` may immediately be overwritten by ICE handler

**File:** `frontend/src/realtime/callActions.ts:103`

**Issue:** After `createPeer`, code sets `connecting`. But `createPeer` may already have driven the PC to `checking`/`connected` via buffered signals, whose `mapIceState` already set the state; the trailing `setCallState('connecting')` can regress a more-advanced state momentarily.

**Fix:** Set `connecting` before `createPeer`, or omit it (PeerManager's ICE handler already reports `connecting`).

### IN-04: Inconsistent message-instance formatting / line break in `handleTextMessage`

**File:** `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java:86-88`

**Issue:** The `else if (clientMessage instanceof\n\nIceCandidateMessage ...)` has stray blank lines mid-expression — a formatting artifact, harmless but confusing.

**Fix:** Reformat the chain.

### IN-05: `CallSummaryScreen` busy/missed labels are dead for the toast path

**File:** `frontend/src/components/call/CallSummaryScreen.tsx:13-20`, `frontend/src/realtime/callActions.ts:189-203`

**Issue:** `busy` and `missed` (callee) are handled via toast + `reset()` and never reach the summary screen, so their `LABEL` entries are effectively unreachable (except missed-for-caller). Not a bug; comment already acknowledges it. Keep for completeness, but note the dead branches.

---

_Reviewed: 2026-06-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
