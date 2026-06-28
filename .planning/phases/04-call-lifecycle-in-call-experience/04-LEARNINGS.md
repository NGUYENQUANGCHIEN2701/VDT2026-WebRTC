---
phase: 04
phase_name: "call-lifecycle-in-call-experience"
project: "VDT WebRTC — Realtime Video Call"
generated: "2026-06-28"
counts:
  decisions: 7
  lessons: 8
  patterns: 6
  surprises: 4
missing_artifacts:
  - "SUMMARY.md (phase built by hand in mentor mode, not via gsd-executor — git history substitutes)"
  - "VERIFICATION.md (not run)"
  - "UAT.md (manual 2-device verification only)"
---

# Phase 4 Learnings: call-lifecycle-in-call-experience

> Source note: this phase was built by hand (mentor mode), so there are no SUMMARY.md
> files. Lessons/surprises are attributed to 04-REVIEW.md and the git commit history
> (the executed record), decisions to 04-CONTEXT.md.

## Decisions

### Server-authoritative call state machine via Redis Lua CAS
Lifecycle (ringing→active→ended{reason}) lives in Redis as a `call:{id}` HASH plus
`user-call:{id}` pointers, mutated only through atomic Lua EVAL scripts (`create_call.lua`,
`transition_call.lua`) using compare-and-set on the `state` field — not WATCH/MULTI/EXEC,
not the default RedisTemplate.

**Rationale:** atomic EVAL is single-threaded in Redis, so every lifecycle transition has
exactly one winner — this is what makes glare, double-accept, and simultaneous-hangup races
correct without app-level locks.
**Source:** 04-CONTEXT.md, commit ea0acc0

### SDP/ICE + mute/cam relayed opaquely; only lifecycle goes through the state machine
Signaling payloads (SDP, ICE candidates, media-state) are relayed peer→peer via
`sendToUser` without inspection; only intents (invite/accept/reject/cancel/hangup) drive
the Redis FSM.

**Rationale:** keeps the server a thin signaling/control plane (P2P constraint) while still
owning authoritative call state.
**Source:** 04-CONTEXT.md (D-14), commit c8aaa7d

### Six end-reasons in one shared summary; `dropped` styled as warning
completed / rejected / cancelled / missed / busy / dropped, rendered by one
CallSummaryScreen; `dropped` uses warning color.
**Rationale:** single source of truth for "call ended" UI; dropped is a fault, others neutral.
**Source:** 04-CONTEXT.md (D-07/D-08), commit 7e708f7

### Server owns all lifecycle timers (ring ~30s, grace 15s) via TaskScheduler
Ring-timeout → missed; grace → dropped. Both env-configurable
(`CALL_RING_TIMEOUT_SECONDS`, `CALL_GRACE_PERIOD_SECONDS`).
**Rationale:** server-owned timers prevent the two clients from disagreeing on call state.
**Source:** 04-CONTEXT.md (D-11), commits c8aaa7d, 8e790f8

### Grace-period recovery instead of immediate teardown on WS drop
On `afterConnectionClosed` of an active call, schedule a grace timer rather than ending;
on reconnect within grace, cancel it and resync.
**Rationale:** a refresh or network blip should not kill a live call (tiêu chí #5).
**Source:** 04-CONTEXT.md (D-12), commit 8e790f8

### Perfect negotiation with caller=impolite, callee=polite
Native RTCPeerConnection + MDN perfect-negotiation; deterministic polite/impolite by role.
**Rationale:** exactly one polite + one impolite side resolves offer collisions during
renegotiation/ICE-restart without custom glare logic.
**Source:** 04-CONTEXT.md, commit eb07fd8

### FE reconnect bail must exceed backend grace
Client refresh-recovery overlay bails to Home after 20s — strictly longer than the 15s
server grace.
**Rationale:** within the grace window the server can still rescue the call (resync); the
client must not give up first. The bail is only a fallback for "WS never reconnects."
**Source:** commit 1aa48c4

---

## Lessons

### TTL must be refreshed on the active transition or live calls die after ~5 min
`create_call.lua` set a 300s TTL; `transition_call.lua` never refreshed it, so after the
ring TTL the `call:{id}` hash and `user-call:` pointers expired and every lifecycle handler
became a silent no-op. Re-EXPIRE all three keys on `active`.
**Context:** CR-01, the single load-bearing defect found in review.
**Source:** 04-REVIEW.md (CR-01), commit 3c58eac

### `pc.close()` fires `oniceconnectionstatechange('closed')` asynchronously
Closing a peer fired a state event after `endCall()` set state to 'ended'; the handler
mapped closed→idle, overwriting 'ended' and making the summary vanish. Detach pc handlers
before closing when teardown is intentional.
**Context:** summary screen flashed then disappeared after a connected call.
**Source:** commit ad53b26

### After refresh, BOTH peers must rebuild — a new DTLS cert can't renegotiate onto an old PC
A refreshed peer creates a fresh RTCPeerConnection (new DTLS fingerprint); the survivor
cannot accept that onto its existing PC, so remote video froze forever. Server must resync
'active' to BOTH parties so both tear down and rebuild, like the initial active flow.
**Context:** E1 refresh recovery looked done but remote stayed black.
**Source:** commit 915384d

### Signals arriving before the local peer exists get dropped → perfect-negotiation deadlock
`createPeer` awaits `fetchIceConfig` before assigning `peer`; an SDP offer arriving in that
window hit `peer?.handleSignalingMessage` on null and was silently dropped. A dropped offer
makes the impolite side ignore the other offer → neither has a remote description → stuck
at 'connecting'. Buffer inbound signals while peer is null, flush after creation.
**Context:** deterministic with fake cameras; intermittent with real cameras.
**Source:** commit 7bd3312

### Remote `<video>` must re-attach reactively when the track arrives, not just on state change
srcObject was set in a useEffect keyed only on callState; a track arriving after 'connected'
left the remote black. Wire `onRemoteStream` → bump a store version the effect also depends on.
**Context:** remote black under back-to-back calls / load.
**Source:** commit 0829431

### Grace timer must be cancelled on every terminal transition
`handleHangUp` cancelled only the ring timer; if a peer dropped (grace running) and the other
hung up, the grace timer leaked to expiry doing needless work. Cancel grace on hang-up.
**Context:** CR-03.
**Source:** 04-REVIEW.md (CR-03), commit 029bb91

### A "critical" review finding can be a non-issue once the other side is traced
Review flagged a glare "orphaned loser" as critical, but the FE already rescues the loser via
the winner's `ringing` broadcast + auto-accept. Cross-layer tracing is required before acting
on single-layer findings.
**Context:** CR-02(b) downgraded after FE trace.
**Source:** 04-REVIEW.md (CR-02), conversation triage

### Idempotent `getMedia` serves both glare and post-refresh resync
Making `getMedia` return early when `localStream` exists let the glare loser reuse its
already-acquired stream AND let the resync path skip re-acquiring when media survived — one
guard, two flows.
**Source:** commits 0c4b49f, 79aa67b

---

## Patterns

### Lua CAS guard for atomic FSM transitions
`HGET state` → compare to expected `from` → only mutate if equal → return 1/0. Every
terminal path (hangup/reject/cancel/missed/dropped) routes through the same guard, so exactly
one wins. Reusable for any server-authoritative state machine on Redis.
**When to use:** concurrent actors mutating shared state where exactly-one-winner matters.
**Source:** transition_call.lua, commit ea0acc0

### Server-owned timers keyed by callId, idempotent scheduling
`ConcurrentHashMap<callId, ScheduledFuture>` + `computeIfAbsent` so a second drop doesn't
double-schedule; explicit cancel on reconnect/terminal transitions.
**When to use:** per-entity deadlines (ring, grace) that must survive across events and be
cancellable.
**Source:** CallTimerService.java, commit 8e790f8

### Buffer-then-flush for signals arriving before the consumer is ready
Queue inbound messages while the consumer (peer) is being created asynchronously; flush in
order once ready. Prevents dropped-message deadlocks.
**When to use:** any async-initialized consumer fed by an independent event stream.
**Source:** callActions.ts pendingSignals, commit 7bd3312

### Reactive re-attach of imperative media objects via store version-bump
RTCPeerConnection/MediaStream live outside React; bump a serializable counter in the store
when a non-serializable object changes so effects re-run and re-attach.
**When to use:** bridging imperative WebRTC/Media objects into React render without storing
them in state.
**Source:** callStore.remoteStreamVersion, commit 0829431

### sessionStorage scoped naturally to "refresh within the same tab"
sessionStorage auto-clears on tab close, so a key present ⟺ a mid-call refresh — exactly the
case to restore. No manual lifecycle needed for the cross-close case.
**When to use:** surviving a page refresh without persisting across full tab/session restarts.
**Source:** callActions readSavedCall/clearSavedCall, commit 79aa67b

### Test timers by asserting state, not by waiting
Assert `redis.getExpire(key) > ringTtl` to prove TTL was extended, instead of sleeping 5 min.
Use 2-client `StandardWebSocketClient` for lifecycle E2E and short env-tuned grace.
**When to use:** verifying timeout/TTL behavior deterministically and fast.
**Source:** CallStateMachineTest, CallRecoveryTest, commits 3c58eac, dddbaa1

---

## Surprises

### Fake cameras exposed a race that real cameras hid
`--use-fake-device-for-media-stream` resolves getUserMedia instantly, so both peers reached
createPeer simultaneously and the peer-creation race became deterministic — real-camera
warmup latency had been masking a genuine deadlock bug.
**Impact:** the most serious connect-time bug (7bd3312) was only found via fake-camera testing.
**Source:** conversation, commit 7bd3312

### Single-webcam same-machine testing produces black-remote false alarms
Two browser tabs sharing one physical camera made remote video look broken — indistinguishable
at first glance from a real bug, costing investigation time.
**Impact:** wasted a debugging cycle; resolved by switching to fake-camera + separate profiles.
**Source:** conversation

### Most recovery bugs surfaced only in manual testing, not unit tests
Grace/dropped had green E2E tests, yet refresh-rebuild, remote re-attach, summary-state-overwrite,
and the peer race all surfaced during hands-on 2-window testing.
**Impact:** reinforced that realtime media needs manual/interactive verification beyond unit E2E.
**Source:** 04-REVIEW.md, conversation

### The documented glare rule (lower-userId-wins) turned out functionally unnecessary
D-03 specified deterministic lower-userId winner, but Redis CAS already yields a single
consistent surviving call with one polite/impolite assignment, so only the FE auto-accept was
needed — the userId comparison was never required for correctness.
**Impact:** simpler implementation than planned; D-03 kept as documentation, not enforced.
**Source:** 04-CONTEXT.md (D-03), commit 0c4b49f
