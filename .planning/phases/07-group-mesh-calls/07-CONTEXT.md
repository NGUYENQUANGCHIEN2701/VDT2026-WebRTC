# Phase 7: Group Mesh Calls - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Up to 4 users join a **room** and talk over a **P2P full mesh** (one `RTCPeerConnection` per
pair). A **joiner-initiates** protocol with **per-pair politeness** brings each new participant
online against every existing member. The **server enforces the cap of 4** (the 5th join is
rejected server-side). A participant **leaving or dropping does not break** the remaining peers
(only that one PC is torn down); partial-mesh failures are **surfaced per-tile in the UI**.
**Per-sender bitrate caps** apply when there are >2 participants.

Covers ADV-03. Builds on Phase 6 (all shared state in Redis, `router.sendToUser` already routes
signaling cross-instance) and reuses the existing per-peer `PeerManager` (perfect negotiation).

**Not in this phase:**
- SFU for >4 (ADV-04) — the room model is the upgrade seam, not built here.
- Group-call recording / compositing (ADV-05), screen share in group (Phase 8).
- Refactoring the existing 1-1 call into rooms — the 1-1 flow stays untouched (core value:
  "1-1 must always work"); group is a **separate, additive** flow.
- Escalating an in-progress 1-1 into a group ("add person" mid-1-1-call) — out of scope (D-01).

</domain>

<decisions>
## Implementation Decisions

### Room entry / UX (ADV-03)
- **D-01:** **Multi-invite entry.** From the online-user list, the initiator selects multiple
  users and invites them all into a group; invitees receive an invite (the existing 1-1
  invite flow, fanned out) → accept → join the room. Reuses the presence/online-list and
  invite/accept UX; the room is still a first-class server entity. (Rejected: room-code/link
  join — more new UI; mid-1-1 "add person" escalation — most complex, deferred.)

### Relationship to the 1-1 call
- **D-02:** **Separate, parallel group flow — 1-1 stays untouched.** Do NOT refactor the
  Phase 4 `CallService`/`callStore` 1-1 state machine into rooms. Add a new room/group path
  (backend `RoomService` + frontend room orchestration) that **reuses** the existing generic
  SDP/ICE relay messages and the per-peer `PeerManager`. Protects the rock-solid, tested 1-1
  path; the signaling layer is already generic so duplication is minimal. (Rejected: unify
  "1-1 = room of 2" — large refactor, risks the core 1-1 value.)

### Server room state & cap (ADV-03 success criteria #2)
- **D-03:** **Room membership in Redis (cross-instance) with an atomic Lua-script cap.**
  Room = a Redis SET `room:{roomId}`. Join runs a single Lua script: "if `SCARD < 4` then
  `SADD` and return OK, else return FULL" — atomic, race-free even when two users join
  simultaneously at size 3. This is the CAS that Phase 6 deferred; mesh join genuinely needs
  it. The 5th join is rejected server-side with a clear "room full" message.
- **D-04:** **Join protocol = joiner-initiates with server-provided member list.** On a
  successful join, the server returns the current member list to the joiner; the joiner
  creates an offer to each existing member (one `PeerManager` per peer). The server broadcasts
  `participant-joined` / `participant-left` to the room so every client updates its roster.
  The room key is deleted when the last member leaves, with a TTL safety net (mirrors Phase 6
  route-map TTL self-cleanup if an instance dies). Per-pair **politeness is deterministic via
  userId comparison** (e.g. the lexicographically larger userId is the polite peer) so each
  pair agrees without coordination.

### Multi-party UI (ADV-03 success criteria #3) & media (#4)
- **D-05:** **Even grid layout (up to 2x2 for 4).** Each tile is one participant (video + name
  + per-peer status: mic-muted / cam-off / connection state). Self-view is one tile. Per-tile
  connection state is how **partial-mesh failure is surfaced** — a dropped/failed peer shows
  reconnecting/failed on its own tile while the others stay connected (correctness: tear down
  only that peer's PC, never the whole room). Visual details deferred to UI-SPEC.
- **D-06:** **Dynamic per-sender bitrate cap when ≥3 participants.** Use
  `RTCRtpSender.setParameters` to set `maxBitrate` per sender: no cap at 2 participants; cap
  each sender when the room reaches 3–4 (concrete value ~300–500 kbps — researcher confirms).
  Apply/remove dynamically as the room crosses the 2-participant threshold. Verifiable in the
  existing DebugPanel.

### Claude's Discretion
- Room id generation scheme; exact Redis key layout beyond `room:{roomId}` (e.g. reverse index
  user→room, presence/IN_CALL interaction).
- Concrete Lua script text and how it's loaded/invoked via Lettuce/StringRedisTemplate.
- The new signaling/room message types (join/leave/invite-to-room/participant-joined/left/
  room-full) as sealed-interface records + `@JsonTypeInfo` per CLAUDE.md; reuse existing
  `SdpMessage`/`IceCandidate*` relay for per-peer media negotiation.
- How the frontend holds `Map<userId, PeerManager>` and per-peer remote streams/state OUTSIDE
  Zustand (only serializable derived roster/state in the store) — `PeerManager.mapIceState`
  currently writes a single global `callStore` state and must be decoupled to per-peer.
- Exact bitrate ladder values and whether to also cap resolution/framerate (research).
- Reconnect/ICE-restart behavior within a mesh peer (PeerManager already does ICE restart).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 7: Group Mesh Calls" — goal, 4 success criteria, ADV-03
- `.planning/REQUIREMENTS.md` — ADV-03 (group mesh ≤4, room model, joiner-initiates, server cap,
  bitrate caps); ADV-04/ADV-05 are explicitly deferred (out of scope)

### Stack & conventions (locked)
- `CLAUDE.md` §"WebRTC client" table — Group mesh = one `RTCPeerConnection` per remote peer in a
  `Map<userId, PeerManager>` inside a plain TS class/module (NOT React state); native
  `RTCPeerConnection` + perfect negotiation; `RTCRtpSender` for bitrate
- `CLAUDE.md` §"Alternatives" — Mesh (1 PC/peer), NOT SFU; room abstraction is the v2/SFU seam
- `CLAUDE.md` §signaling — sealed interface + records + Jackson `@JsonTypeInfo`; raw
  `TextWebSocketHandler` + JSON (Jackson 3 / `tools.jackson` ObjectMapper)

### Cross-phase dependencies (reuse, do not break)
- `.planning/phases/06-horizontal-scaling/06-CONTEXT.md` + commits — `router.sendToUser` routes
  signaling cross-instance (route map + per-instance pub/sub); room state must live in Redis to
  be cross-instance; Lua atomic-cap is the CAS deferred there
- `.planning/phases/04-call-lifecycle-in-call-experience/04-CONTEXT.md` — the 1-1 state machine
  that Phase 7 must NOT disturb; end-reason/grace patterns to mirror for participant drop
- `frontend/src/webrtc/PeerManager.ts` — the per-peer perfect-negotiation class to reuse (note
  the `useCallStore` coupling to decouple); `PeerManager.test.ts` for the test pattern
- `frontend/src/webrtc/stats.ts` + `components/call/DebugPanel.tsx` — where bitrate is verified
- `backend/.../ws/PresenceWebSocketHandler.java` + `MessageRouter`/`RedisMessageRouter` — the
  signaling entry + cross-instance relay the room flow plugs into
- `backend/.../call/CallService.java` + `CallStateRepository.java` — analogs for a new
  `RoomService` + Redis room repository (StringRedisTemplate usage, Lua scripting)

No external ADRs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/webrtc/PeerManager.ts` — per-peer perfect negotiation, ICE buffering, ICE
  restart already implemented. Reuse one instance per remote peer. MUST decouple
  `mapIceState()` from the single global `useCallStore.setCallState` → per-peer state instead.
- `frontend/src/store/callStore.ts` — 1-1-only shape (single `remoteUserId`, single stream).
  Group needs a separate room store holding a serializable roster + per-peer derived state
  (NOT the PeerConnection/MediaStream objects).
- `frontend/src/realtime/callActions.ts` + signaling message types — generic SDP/ICE relay to
  reuse; add room/group message types alongside.
- `frontend/src/components/call/*` — DebugPanel, QualityIndicator, RemoteMute/CamOff overlays,
  SelfViewPreview are per-peer building blocks reusable in grid tiles.
- `backend/.../call/CallService.java` + `CallStateRepository.java` — pattern for a new
  `RoomService` + Redis-backed room repo; existing Lua-script usage (Phase 4 call-state CAS)
  is the model for the join-cap Lua script.
- `backend/.../ws/RedisMessageRouter.java` — `sendToUser` already delivers per-peer signaling
  cross-instance; room broadcast can fan out via `sendToUser` per member.

### Established Patterns
- Server-authoritative state in Redis (Phase 4/6); room membership + cap follow the same model.
- Cross-instance everything (Phase 6): room members may be on different backend instances —
  per-peer signaling already works via the route map; room broadcasts iterate members.
- Sealed-interface + records + `@JsonTypeInfo` for new room/signaling messages.

### Integration Points
- Multi-invite → server creates/locates room → Lua atomic add (cap) → return member list to
  joiner + broadcast participant-joined → joiner opens a PeerManager per existing member.
- Participant leave/drop → server SREM + broadcast participant-left → each peer closes only
  that PeerManager; UI marks that tile gone; room deleted when empty.
- Bitrate: when roster size crosses 2, each PeerManager applies/removes `maxBitrate`.

</code_context>

<specifics>
## Specific Ideas

- Keep the demo bounded to 4 and lean on the existing online-list for entry — minimal new UX.
- Grid should read clearly in a demo; per-tile connection state doubles as the partial-failure
  signal (no separate error UI needed).
- Bitrate cap should be observable in the existing DebugPanel for the success-criteria #4 proof.

</specifics>

<deferred>
## Deferred Ideas

- SFU media server for >4 (ADV-04) — room model is the seam; not built now.
- Group-call recording / compositing (ADV-05) — future.
- Screen share within a group call — Phase 8 (ADV-01).
- Escalating an active 1-1 into a group ("add person" mid-call) — deferred (D-01); revisit later.
- Room-code/link join UX — deferred in favor of multi-invite (D-01); a natural later addition.
- Active-speaker layout — deferred in favor of the even grid (D-05).
- Kick/host-controls (remove a participant, mute others) — not in ADV-03 scope.

</deferred>

---

*Phase: 7-group-mesh-calls*
*Context gathered: 2026-06-29*
