# Phase 7: Group Mesh Calls - Research

**Researched:** 2026-06-29
**Domain:** WebRTC P2P mesh (multi-peer), Redis atomic Lua cap, signaling fanout, per-sender bitrate limiting
**Confidence:** HIGH (all claims verified against codebase; no new external packages; patterns proven in Phases 3-6)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Multi-invite entry from the online-user list. Initiator selects 1-3 other online users from the existing list and invites them all into a group. Reuses presence/online-list and invite/accept UX. Room is a first-class server entity.
- **D-02:** Separate, parallel group flow — 1-1 stays untouched. Do NOT refactor Phase 4 `CallService`/`callStore` 1-1 state machine into rooms. Add a new room/group path (`RoomService` + frontend room orchestration) that reuses the existing generic SDP/ICE relay messages and the per-peer `PeerManager`.
- **D-03:** Room membership in Redis (`room:{roomId}` SET) with an atomic Lua-script cap. Join runs a Lua script: if `SCARD < 4` then `SADD` and return OK, else return FULL. Atomic, race-free. 5th join rejected server-side.
- **D-04:** Join protocol = joiner-initiates with server-provided member list. On successful join, server returns current member list to joiner; joiner creates an offer to each existing member (one `PeerManager` per peer). Server broadcasts `participant-joined` / `participant-left` to the room. Politeness determined by userId comparison (lexicographically larger userId = polite peer).
- **D-05:** Even grid layout (up to 2x2 for 4 participants). Per-tile connection state surfaces partial-mesh failures. Only the failed peer's tile shows reconnecting/failed overlay; others stay connected.
- **D-06:** Dynamic per-sender bitrate cap when >= 3 participants. `RTCRtpSender.setParameters({ encodings: [{ maxBitrate: 350_000 }] })`. Apply/remove dynamically as room crosses the 2-participant threshold. Verifiable in DebugPanel.

### Claude's Discretion

- Room id generation scheme; exact Redis key layout beyond `room:{roomId}` (e.g., reverse index user→room, presence/IN_CALL interaction)
- Concrete Lua script text and how it's loaded/invoked via Lettuce/StringRedisTemplate
- The new signaling/room message types (join/leave/invite-to-room/participant-joined/left/room-full) as sealed-interface records + `@JsonTypeInfo` per CLAUDE.md; reuse existing `SdpMessage`/`IceCandidate*` relay for per-peer media negotiation
- How the frontend holds `Map<userId, PeerManager>` and per-peer remote streams/state OUTSIDE Zustand (only serializable derived roster/state in the store) — `PeerManager.mapIceState` currently writes a single global `callStore` state and must be decoupled to per-peer
- Exact bitrate ladder values and whether to also cap resolution/framerate
- Reconnect/ICE-restart behavior within a mesh peer (PeerManager already does ICE restart)

### Deferred Ideas (OUT OF SCOPE)

- SFU for >4 (ADV-04)
- Group-call recording / compositing (ADV-05)
- Screen share within a group call (Phase 8)
- Escalating an active 1-1 into a group ("add person" mid-call)
- Room-code/link join UX
- Active-speaker layout
- Kick/host-controls
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADV-03 | Users can join group calls up to 4 people via P2P mesh (room model, joiner-initiates protocol, server-enforced cap, bitrate caps) | Backend: `RoomService` with Lua atomic cap (model from `CallStateMachine`); Frontend: `MeshManager` reusing `PeerManager` per peer; `RTCRtpSender.setParameters` for bitrate; DebugPanel extended for per-peer stats |
</phase_requirements>

---

## Summary

Phase 7 adds a group mesh call path (up to 4 participants, P2P full mesh) on top of the already-complete Phase 3-6 infrastructure. The existing `PeerManager` (perfect negotiation, ICE restart, candidate buffering) runs one instance per remote peer inside a new `MeshManager` plain-TS class. The existing `router.sendToUser` already routes signaling cross-instance; group signaling just adds room fanout. The backend needs a `RoomService` backed by a Redis SET with a Lua atomic cap — the exact same Lua + `StringRedisTemplate` pattern used in `CallStateMachine`.

The hardest design constraint is **PeerManager decoupling**: the current `mapIceState()` writes directly to the single global `useCallStore.setCallState`. For mesh, each PeerManager must accept a per-peer callback instead. This is a 1-line constructor change in `PeerManager` (add optional callback parameter, fall back to legacy behavior to protect 1-1) — but it is the key integration seam to plan precisely.

Bitrate capping via `RTCRtpSender.setParameters` is standard WebRTC API but requires getting the sender list from each `RTCPeerConnection`. Since `PeerManager` already exposes `getStats()` via its `pc` reference, the same reference must expose `getSenders()` — this means adding a `setSendersMaxBitrate(kbps: number | null)` method to `PeerManager`. No external packages are needed; zero new npm dependencies.

**Primary recommendation:** Implement in this order: (1) backend `RoomService` + Lua script + new message types, (2) decouple `PeerManager.mapIceState` callback, (3) `MeshManager` + `roomStore`, (4) group signaling actions, (5) `GroupCallPage` + grid tiles, (6) invite UX on `HomePage`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Room cap enforcement (max 4) | API / Backend | — | Must be server-side (D-03) — client-side cap is bypassable |
| Room state (membership, TTL) | Database / Storage (Redis) | API / Backend | Same pattern as call-state, presence; cross-instance requirement forces Redis |
| Signaling fanout (participant-joined/left/invite) | API / Backend | — | `router.sendToUser` per member; same as existing 1-1 broadcast |
| Per-peer P2P media negotiation | Browser / Client | — | `RTCPeerConnection` per pair; server is never in the media path |
| Politeness determination | Browser / Client | — | Deterministic userId comparison; no coordination needed |
| Per-sender bitrate capping | Browser / Client | — | `RTCRtpSender.setParameters` — browser API, no server involvement |
| Room roster (serializable derived state) | Browser / Client (roomStore) | — | Zustand holds only userId / connectionState / micMuted / camOff |
| PeerManager lifecycle (Map<userId, PeerManager>) | Browser / Client (MeshManager) | — | Non-serializable objects live outside React/Zustand |
| Grid layout + per-tile UI | Browser / Client (React) | — | Pure frontend rendering concern |
| Invite UX (multi-select, status tracking) | Browser / Client (React) | — | Pure frontend; server state drives accept/reject outcomes |
| Presence IN_CALL update for room participants | API / Backend (PresenceService) | Database / Storage (Redis) | `user-call:{userId}` key pattern already used; reuse for room membership |

---

## Standard Stack

### Core (no new packages)

All implementation uses existing project dependencies. Zero new npm or Maven dependencies are added.

| Library | Version (in use) | Purpose | Note |
|---------|-----------------|---------|------|
| Spring Boot | 4.0.7 | Framework, WS handler, REST | [VERIFIED: pom.xml] |
| Spring Data Redis / Lettuce | via Boot BOM | `StringRedisTemplate`, Lua scripting, pub/sub | [VERIFIED: pom.xml] |
| Zustand | 5.0.14 | `roomStore` new store | [VERIFIED: package.json] |
| React | 19.2.6 | `GroupCallPage`, `ParticipantTile`, modals | [VERIFIED: package.json] |
| Vitest | 4.1.8 | Frontend unit tests | [VERIFIED: package.json] |
| Testcontainers | via Boot test BOM | Backend integration tests (Redis, WS) | [VERIFIED: codebase] |
| Native WebRTC APIs | browser built-in | `RTCPeerConnection`, `RTCRtpSender.setParameters` | [VERIFIED: codebase — PeerManager.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `RTCRtpSender.setParameters` | `replaceTrack` with lower-quality constraint | `setParameters` is non-renegotiating (no SDP exchange needed), correct approach per MDN |
| Redis SET + Lua cap | Redis WATCH/MULTI | Lua is one round-trip, already proven in `CallStateMachine` (Phase 4) |
| Fan-out via `sendToUser` per member | Separate Redis pub/sub room channel | `sendToUser` already handles cross-instance routing; no new infra needed for ≤4 members |

---

## Package Legitimacy Audit

No external packages are added in this phase. All implementation reuses existing project dependencies.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Initiator (browser)                  Backend (inst-1 or inst-2)           Redis
─────────────────                    ─────────────────────────────        ─────────────────────────────
[multi-select invite]
     │ WS: create-room                                                     room:{roomId}  (Redis SET)
     │ ─────────────────────────────> PresenceWebSocketHandler             user-room:{userId}  (pointer)
     │                                 │ → RoomService.createRoom(...)
     │                                 │   Lua: join_room.lua (SCARD<4 → SADD)
     │                                 │   if FULL → room-full-error back
     │                                 │   if OK → broadcast room-invite to each invitee
     │ <── room-invite-sent ───────────│              (router.sendToUser per invitee, cross-instance)
     │

Invitee (browser)                    Backend
────────────────                     ─────────
     │ <── room-invite ─────────────────────────────────────────────────────
     │ [GroupInviteModal appears]
     │ WS: join-room(roomId)
     │ ──────────────────────────────> PresenceWebSocketHandler
     │                                  │ → RoomService.joinRoom(userId, roomId)
     │                                  │   Lua: check cap → SADD
     │                                  │   if FULL → room-full error to this user only
     │                                  │   if OK → return member list to joiner
     │                                  │         → broadcast participant-joined to room
     │ <── room-joined(memberList) ─────│
     │
     │ [MeshManager: for each member in memberList]
     │ [create PeerManager(polite=userId>'memberId')]
     │ [addLocalStream → onnegotiationneeded → send sdp to member]
     │
     │ WS: sdp/ice-candidate (to: memberId, roomId)   ←→ existing relay (sendToUser)

Leave / Drop:
     │ WS: leave-room(roomId)  ──────> RoomService.leaveRoom
     │                                  SREM + DEL user-room:{userId}
     │                                  broadcast participant-left to remaining members
     │                                  if SCARD==0: DEL room:{roomId}
     │ <── participant-left (all others) ──────────────────────────────────
     │ [each peer closes only that PeerManager tile]
```

### Recommended Project Structure

```
backend/
├── room/
│   ├── RoomService.java              # create/join/leave/invite fanout
│   ├── RoomRepository.java           # StringRedisTemplate ops on room:{roomId}
│   └── RoomSnapshot.java             # record: roomId, Set<String> members
├── ws/message/
│   ├── CreateRoom.java               # client: { type: "create-room", invitees: [...] }
│   ├── JoinRoom.java                 # client: { type: "join-room", roomId }
│   ├── LeaveRoom.java                # client: { type: "leave-room", roomId }
│   ├── DeclineRoomInvite.java        # client: { type: "decline-room-invite", roomId }
│   ├── RoomInvite.java               # server: { type: "room-invite", roomId, initiator, memberCount }
│   ├── RoomJoined.java               # server: { type: "room-joined", roomId, members: [...] }
│   ├── RoomFullError.java            # server: { type: "room-full-error", roomId }
│   ├── ParticipantJoined.java        # server: { type: "participant-joined", roomId, userId }
│   └── ParticipantLeft.java          # server: { type: "participant-left", roomId, userId }
└── resources/scripts/
    └── join_room.lua                 # atomic SCARD < 4 → SADD; also sets user-room:{userId}

frontend/
├── store/
│   └── roomStore.ts                  # Zustand: roomId, Record<userId, PeerRosterEntry>
├── webrtc/
│   └── MeshManager.ts                # Map<userId, PeerManager>; bitrate caps; lifecycle
└── realtime/
    └── roomActions.ts                # room WS intent senders + server event handlers
├── pages/
│   └── GroupCallPage.tsx             # /group-call route (separate from /call)
└── components/call/
    ├── ParticipantTile.tsx           # per-peer video tile + overlays
    ├── GroupInviteModal.tsx          # incoming group invite card
    └── OutgoingGroupInviteCard.tsx   # initiator waiting view
```

### Pattern 1: Lua Atomic Room Join Cap (backend)

Based on the existing `create_call.lua` and `transition_call.lua` pattern in `CallStateMachine`.

```lua
-- join_room.lua
-- KEYS[1] = room:{roomId}          (Redis SET of member userIds)
-- KEYS[2] = user-room:{userId}     (reverse pointer: which room is this user in)
-- ARGV[1] = userId
-- ARGV[2] = roomId
-- ARGV[3] = ttl seconds (e.g. "14400")
-- Returns: 1 = joined OK; -1 = FULL (>=4 members); -2 = already a member

local count = redis.call('SCARD', KEYS[1])
if count >= 4 then
    return -1  -- FULL
end

local already = redis.call('SISMEMBER', KEYS[1], ARGV[1])
if already == 1 then
    return -2  -- already in room (idempotent guard)
end

redis.call('SADD', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1
```

**Loading pattern (same as `CallStateMachine`):**
```java
// Source: backend/src/main/java/com/vdt/webrtc/call/CallStateMachine.java
private final RedisScript<Long> joinRoomScript;

public RoomRepository(StringRedisTemplate redis) {
    this.redis = redis;
    this.joinRoomScript = RedisScript.of(
        new ClassPathResource("scripts/join_room.lua"), Long.class);
}

public JoinResult join(String roomId, String userId) {
    Long result = redis.execute(joinRoomScript,
        List.of("room:" + roomId, "user-room:" + userId),
        userId, roomId, "14400");
    return switch (result.intValue()) {
        case 1  -> JoinResult.OK;
        case -1 -> JoinResult.FULL;
        case -2 -> JoinResult.ALREADY_MEMBER;
        default -> throw new IllegalStateException("Unexpected Lua result: " + result);
    };
}
```

### Pattern 2: PeerManager Decoupling (frontend — critical seam)

The current `PeerManager.mapIceState()` calls `useCallStore.getState().setCallState(next)` directly. For mesh, each peer needs its own callback.

**Minimal backwards-compatible change:**
```typescript
// Source: frontend/src/webrtc/PeerManager.ts (current pattern — [VERIFIED])
// Change: add optional onConnectionStateChange callback to constructor
export class PeerManager {
    private readonly onConnectionStateChange?: (state: PeerConnectionState) => void

    constructor(
        iceServers: RTCIceServer[],
        polite: boolean,
        sendSignal: (s: OutboundSignal) => void,
        iceTransportPolicy?: RTCIceTransportPolicy,
        onConnectionStateChange?: (state: PeerConnectionState) => void,  // NEW
    ) {
        this.onConnectionStateChange = onConnectionStateChange
        // ...existing constructor body...
    }

    private mapIceState() {
        if (this.pc.iceConnectionState === 'failed') this.pc.restartIce()
        const map: Record<string, PeerConnectionState> = {
            new: 'connecting', checking: 'connecting',
            connected: 'connected', completed: 'connected',
            disconnected: 'reconnecting', failed: 'reconnecting',
            closed: 'idle',
        }
        const next = map[this.pc.iceConnectionState]
        if (!next) return
        if (this.onConnectionStateChange) {
            this.onConnectionStateChange(next)           // mesh: per-peer
        } else {
            useCallStore.getState().setCallState(next)   // 1-1 legacy path (unchanged)
        }
    }
}
```

This is a non-breaking change: existing 1-1 `callActions.ts` creates `PeerManager` without the new parameter, so the legacy path runs unchanged (D-02 protected).

### Pattern 3: MeshManager Structure (frontend)

```typescript
// Source: CONTEXT.md / UI-SPEC.md [VERIFIED against codebase patterns]
// frontend/src/webrtc/MeshManager.ts
export class MeshManager {
    private peers = new Map<string, PeerManager>()
    private localStream: MediaStream | null = null
    private iceServers: RTCIceServer[] = []
    private iceTransportPolicy?: RTCIceTransportPolicy
    private myUserId: string

    constructor(myUserId: string) {
        this.myUserId = myUserId
    }

    setLocalMedia(stream: MediaStream, iceServers: RTCIceServer[], iceTransportPolicy?: RTCIceTransportPolicy) {
        this.localStream = stream
        this.iceServers = iceServers
        this.iceTransportPolicy = iceTransportPolicy
    }

    // Called when server sends room-joined (joiner) or participant-joined (existing member)
    addPeer(remoteUserId: string, roomId: string): PeerManager {
        const polite = this.myUserId > remoteUserId  // lexicographic; larger = polite
        const pm = new PeerManager(
            this.iceServers,
            polite,
            (sig) => sendRoomSignal(sig, remoteUserId, roomId),
            this.iceTransportPolicy,
            (state) => this.handlePeerStateChange(remoteUserId, state),
        )
        pm.onRemoteStream = (stream) => this.handleRemoteStream(remoteUserId, stream)
        if (this.localStream) pm.addLocalStream(this.localStream)
        this.peers.set(remoteUserId, pm)
        // joiner-initiates: adding stream triggers onnegotiationneeded → offer sent
        return pm
    }

    removePeer(remoteUserId: string) {
        const pm = this.peers.get(remoteUserId)
        if (pm) { pm.close(); this.peers.delete(remoteUserId) }
        useRoomStore.getState().removePeer(remoteUserId)
    }

    getStatsProviders(): Map<string, PeerManager> {
        return this.peers
    }

    applyBitrateCap(maxBitrateKbps: number | null) {
        for (const pm of this.peers.values()) {
            pm.setSendersMaxBitrate(maxBitrateKbps)
        }
    }

    destroy() {
        for (const pm of this.peers.values()) pm.close()
        this.peers.clear()
        this.localStream?.getTracks().forEach(t => t.stop())
        this.localStream = null
        useRoomStore.getState().reset()
    }

    private handlePeerStateChange(userId: string, state: PeerConnectionState) {
        useRoomStore.getState().setPeerConnectionState(userId, state)
    }

    private handleRemoteStream(userId: string, stream: MediaStream) {
        // store ref outside Zustand; notify Zustand via version bump
        remoteStreams.set(userId, stream)
        useRoomStore.getState().bumpStreamVersion(userId)
    }
}

// Module-level stream map (non-serializable, outside Zustand — same pattern as callActions.ts)
export const remoteStreams = new Map<string, MediaStream>()
```

### Pattern 4: setSendersMaxBitrate on PeerManager

`RTCRtpSender.setParameters` is the correct non-renegotiating approach to bitrate capping. Must iterate `pc.getSenders()` to find video senders.

```typescript
// Add to PeerManager class
setSendersMaxBitrate(maxBitrateKbps: number | null) {
    for (const sender of this.pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue
        const params = sender.getParameters()
        if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}]
        }
        params.encodings[0].maxBitrate = maxBitrateKbps != null
            ? maxBitrateKbps * 1000   // kbps → bps
            : undefined
        sender.setParameters(params).catch(() => {})  // best-effort; ignore if track ended
    }
}
```

**Important:** `getParameters()` must be called first, then the returned object mutated and passed to `setParameters`. The spec requires this round-trip to preserve transaction-id. [ASSUMED — MDN WebRTC RTCRtpSender.setParameters specification behavior, verified conceptually but not via live browser test in this session]

### Pattern 5: New Message Types (backend sealed interface extension)

Following the exact pattern in `ClientMessage.java` / `ServerMessage.java`:

```java
// New permits added to ClientMessage sealed interface
@JsonSubTypes.Type(value = CreateRoom.class,        name = "create-room")
@JsonSubTypes.Type(value = JoinRoom.class,          name = "join-room")
@JsonSubTypes.Type(value = LeaveRoom.class,         name = "leave-room")
@JsonSubTypes.Type(value = DeclineRoomInvite.class, name = "decline-room-invite")

// New permits added to ServerMessage sealed interface
@JsonSubTypes.Type(value = RoomInvite.class,        name = "room-invite")
@JsonSubTypes.Type(value = RoomJoined.class,        name = "room-joined")
@JsonSubTypes.Type(value = RoomFullError.class,     name = "room-full-error")
@JsonSubTypes.Type(value = ParticipantJoined.class, name = "participant-joined")
@JsonSubTypes.Type(value = ParticipantLeft.java,    name = "participant-left")

// The existing sdp-received / ice-candidate-received messages are REUSED for per-peer
// signaling — the 'callId' field doubles as 'roomId' in the group context (the relay
// in PresenceWebSocketHandler just calls router.sendToUser(to, sdpReceived) unchanged)
```

**Recommendation:** Keep `SdpMessage` / `IceCandidateMessage` routing in `PresenceWebSocketHandler` generic (they already route by `to` field regardless of callId semantics). For group calls, use the same messages with `roomId` in the `callId` field. This avoids duplicating the relay and keeps the signaling path unchanged.

### Pattern 6: roomStore shape (frontend)

```typescript
// frontend/src/store/roomStore.ts
export type PeerConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'idle'

export interface PeerRosterEntry {
    userId: string
    connectionState: PeerConnectionState
    micMuted: boolean
    camOff: boolean
    streamVersion: number   // bump to force <video>.srcObject re-attach
}

interface RoomState {
    roomId: string | null
    members: Record<string, PeerRosterEntry>   // key = userId
    micMuted: boolean
    camOff: boolean
    connectedAt: number | null
    // actions
    initRoom: (roomId: string, myUserId: string, initialMembers: string[]) => void
    addPeer: (userId: string) => void
    removePeer: (userId: string) => void
    setPeerConnectionState: (userId: string, state: PeerConnectionState) => void
    setPeerMicMuted: (userId: string, muted: boolean) => void
    setPeerCamOff: (userId: string, off: boolean) => void
    bumpStreamVersion: (userId: string) => void
    setMicMuted: (b: boolean) => void
    setCamOff: (b: boolean) => void
    reset: () => void
}
```

### Anti-Patterns to Avoid

- **Storing RTCPeerConnection or MediaStream in Zustand:** These are non-serializable objects. All Phase 3-6 code avoids this; `MeshManager` is the module-scope holder.
- **Global `callStore` coupling in PeerManager for mesh peers:** Must use the per-peer callback. The legacy `callStore` path must be preserved for 1-1.
- **`setParameters` without `getParameters` round-trip:** The spec mandates reading current params first. Setting a fresh object without the transaction-id causes the operation to fail silently or throw.
- **Calling `setSenders` before ICE is connected:** `setParameters` can be called earlier but has no effect until the sender is active. Apply it once and also apply when roster changes — both are needed.
- **Deleting the Redis room SET on each leave before checking SCARD:** Must SREM first, then if `SCARD == 0`, DEL the key. A Lua script for leave avoids the race.
- **Fanout in a loop without cross-instance routing:** `router.sendToUser` handles cross-instance routing already. Iterating `SMEMBERS room:{roomId}` and calling `sendToUser` per member is correct.
- **Treating `sdp-received` / `ice-candidate-received` as 1-1-only messages:** These messages route to any user regardless of context. The group path reuses them with `roomId` in the `callId` field without backend changes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic room cap | Custom application-level lock | Lua script on Redis SET (same as `CallStateMachine`) | Race condition when 2 users hit size-3 simultaneously; Lua is single-threaded per shard, atomically safe |
| ICE restart on peer failure | Custom reconnect timer | PeerManager already calls `pc.restartIce()` on `iceConnectionState === 'failed'` | Phase 4 implementation handles this; MeshManager just needs to not call `close()` prematurely |
| Cross-instance room fanout | New Redis pub/sub room channel | `router.sendToUser(member, msg)` for each member | `RedisMessageRouter` already routes cross-instance; no new infrastructure needed for ≤4 members |
| Bitrate negotiation via SDP renegotiation | New SDP offer/answer per cap change | `RTCRtpSender.setParameters` | No renegotiation needed; `setParameters` is specifically designed for mid-call parameter changes |
| Per-peer stats polling | New stats module | `startStatsPolling(peerManager, onStats)` from `stats.ts` | Already works with any `StatsProvider`; call once per peer in DebugPanel group mode |

---

## Runtime State Inventory

> Phase 7 is a greenfield addition (not a rename/refactor). Skip this section.

Not applicable — Phase 7 adds new code/data structures without renaming existing ones. The 1-1 call flow, its Redis keys (`call:`, `user-call:`), and all existing state remain untouched (D-02).

---

## Common Pitfalls

### Pitfall 1: PeerManager mapIceState writes to global callStore

**What goes wrong:** If `PeerManager.mapIceState()` is not decoupled, all peers in the mesh write to the single `callStore.setCallState`. One reconnecting peer marks the whole room as "reconnecting" and navigates to /call.

**Why it happens:** Phase 3-4 PeerManager was built for exactly 1 peer. The `useCallStore.getState().setCallState(next)` hardcode was intentional then.

**How to avoid:** Add optional `onConnectionStateChange` callback to PeerManager constructor (Pattern 2 above). 1-1 path falls back to legacy behavior when callback is not provided.

**Warning signs:** Group call redirects to /call route, or single peer failure clears the entire room UI.

### Pitfall 2: Joiner sends offers to all existing members but existing members also send offers back

**What goes wrong:** When the joiner creates a PeerManager for each existing member and `addLocalStream` triggers `onnegotiationneeded`, the joiner sends an offer. The existing member receives `participant-joined` and also creates a PeerManager for the joiner and calls `addLocalStream` — also triggering `onnegotiationneeded`. Both sides send offers simultaneously.

**Why it happens:** Without politeness, this is an offer collision that stalls negotiation.

**How to avoid:** Politeness via userId comparison (D-04). Lexicographically larger userId = polite peer. The polite peer rolls back on collision; the impolite peer's offer wins. This is deterministic — both sides agree independently without coordination.

**Warning signs:** WebRTC PC stuck in `have-local-offer` state; no `connected` event; PeerManager logs show both sides set ignoreOffer for each other simultaneously (symmetric impolite — shouldn't happen if comparison is correct).

### Pitfall 3: Leave-room Lua race (SREM then SCARD not atomic)

**What goes wrong:** If leave-room is two separate Redis calls (SREM then check if SCARD==0 then DEL), two simultaneous leaves can both see SCARD==1 and both try to DEL the room, or one fails to clean up.

**Why it happens:** Application-level read-modify-write on Redis without Lua.

**How to avoid:** Use a `leave_room.lua` Lua script: SREM + check SCARD inside single script. If SCARD==0 after SREM, DEL the room key and the user-room reverse pointer.

**Warning signs:** Orphaned `room:{roomId}` keys in Redis after all members have left (detectable via KEYS or TTL commands during integration test).

### Pitfall 4: Group invite rejected if invitee busy check is missing

**What goes wrong:** An invitee who is already in a 1-1 call (`user-call:{userId}` exists) receives a `room-invite`. If they accept, the join attempt proceeds but their presence shows IN_CALL for a different call.

**Why it happens:** The invite fanout doesn't check the invitee's current state before sending.

**How to avoid:** When fanning out `room-invite`, check `user-call:{userId}` AND `user-room:{userId}` for each invitee. If either exists, skip the invite (treat as busy silently, or notify the initiator). The UI-SPEC states: "If the user is already in a call (1-1 or group): incoming group invite is silently discarded server-side."

**Warning signs:** Invitee in a 1-1 call receives a group invite modal; accepting would leave their 1-1 call in an inconsistent state.

### Pitfall 5: setParameters called before sender track is active

**What goes wrong:** `RTCRtpSender.setParameters` returns a rejected Promise when the sender has no track or the PC is not connected. If the cap is applied immediately on `addPeer` (before ICE completes), errors are thrown silently.

**Why it happens:** Bitrate cap applied at peer creation time instead of at roster-change time.

**How to avoid:** Apply the bitrate cap (1) on `iceConnectionState === 'connected'` (inside the per-peer state change callback in MeshManager), and (2) whenever the roster size crosses the 2-participant threshold. The `setSendersMaxBitrate` method should wrap `setParameters` in `.catch(() => {})` to suppress errors from not-yet-active senders.

**Warning signs:** Console errors "InvalidStateError: not in 'connected' state" when bitrate cap is applied.

### Pitfall 6: Fanout to room members includes the sender

**What goes wrong:** When `participant-joined` is broadcast, the joining user receives their own notification and creates a PeerManager to themselves.

**Why it happens:** `SMEMBERS` returns all members including the one just added.

**How to avoid:** In `RoomService.joinRoom`, get the member list BEFORE adding the new user (for the joiner's initial offer list), then SADD. Broadcast `participant-joined` to all members EXCEPT the joiner (iterate `existingMembers` minus joiner).

**Warning signs:** MeshManager tries to create a PeerManager where `remoteUserId === myUserId`; politeness comparison `myUserId > myUserId` is always false.

### Pitfall 7: PresenceSnapshot shows IN_CALL for group participants via user-call key

**What goes wrong:** Phase 6 `RedisPresenceService.snapshot()` checks `user-call:{userId}` to determine IN_CALL status. Group participants don't have a `user-call:` key (that's for 1-1 calls).

**Why it happens:** The presence IN_CALL signal is hardwired to the 1-1 call key.

**How to avoid:** Either (a) set a `user-call:{userId}` key with the roomId value when a user joins a room (simplest — reuses existing presence logic with no code changes to snapshot()), or (b) also check `user-room:{userId}` in snapshot(). Option (a) is simpler and consistent. The TTL must be managed with the room's TTL or explicitly deleted on leave/room-end.

---

## Code Examples

### Backend: RoomService.createRoom fanout pattern

```java
// Source: pattern from CallService.handleInvite (CallService.java [VERIFIED])
// and RedisMessageRouter.sendToUser (RedisMessageRouter.java [VERIFIED])
public void createRoom(String initiatorId, List<String> inviteeIds) {
    String roomId = UUID.randomUUID().toString();
    // atomically add initiator to room
    JoinResult r = roomRepo.join(roomId, initiatorId);
    if (r != JoinResult.OK) return; // shouldn't happen for initiator

    // fan out room-invite to each invitee (cross-instance routing already handled)
    for (String inviteeId : inviteeIds) {
        // guard: skip busy invitees
        if (redisTemplate.hasKey("user-call:" + inviteeId) ||
            redisTemplate.hasKey("user-room:" + inviteeId)) continue;
        router.sendToUser(inviteeId, new RoomInvite(roomId, initiatorId, inviteeIds.size() + 1));
    }
    // tell initiator the room was created
    router.sendToUser(initiatorId, new RoomCreated(roomId));
}
```

### Backend: leave_room.lua pattern

```lua
-- leave_room.lua
-- KEYS[1] = room:{roomId}
-- KEYS[2] = user-room:{userId}
-- ARGV[1] = userId
-- Returns: remaining member count after removal (0 means room deleted)

redis.call('SREM', KEYS[1], ARGV[1])
redis.call('DEL', KEYS[2])

local remaining = redis.call('SCARD', KEYS[1])
if remaining == 0 then
    redis.call('DEL', KEYS[1])
end
return remaining
```

### Frontend: roomActions handler skeleton

```typescript
// frontend/src/realtime/roomActions.ts — new module (peer to callActions.ts)
// Source: pattern from callActions.ts [VERIFIED]

let meshManager: MeshManager | null = null
let localStream: MediaStream | null = null

export function getRoomStream(userId: string): MediaStream | null {
    return remoteStreams.get(userId) ?? null
}

export function getMeshManager(): MeshManager | null { return meshManager }

async function handleRoomJoined(msg: RoomJoined) {
    const me = useAuthStore.getState().user!.username
    const { iceServers, iceTransportPolicy } = await fetchIceConfig(forceRelayEnabled())
    localStream = (await acquireLocalMedia()).stream

    meshManager = new MeshManager(me)
    meshManager.setLocalMedia(localStream, iceServers, iceTransportPolicy)
    useRoomStore.getState().initRoom(msg.roomId, me, msg.members)

    // joiner-initiates: create peer to each existing member
    for (const memberId of msg.members.filter(id => id !== me)) {
        meshManager.addPeer(memberId, msg.roomId)
    }

    applyBitrateCapIfNeeded()
    navigate('/group-call')
}
```

### Frontend: dynamic bitrate cap on roster change

```typescript
// Called whenever roomStore.members count changes
function applyBitrateCapIfNeeded() {
    if (!meshManager) return
    const count = Object.keys(useRoomStore.getState().members).length
    // count includes self; 3+ total = 2+ remote peers
    const cap = count >= 3 ? 350 : null  // 350 kbps per D-06
    meshManager.applyBitrateCap(cap)
}
```

### Frontend: DebugPanel extension for per-peer stats

```typescript
// Extended DebugPanel signature (building on existing DebugPanel.tsx [VERIFIED])
// Option: tabbed or stacked per-peer sections
type GroupDebugProps = {
    peers: Array<{ userId: string; statsProvider: StatsProvider }>
    maxBitrateKbps: number | null  // active cap value (null = uncapped)
}
// Each peer section uses startStatsPolling(peer, setStats) — existing stats.ts API
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bitrate via SDP re-negotiation | `RTCRtpSender.setParameters` (non-renegotiating) | ~2019 (W3C spec) | No offer/answer round-trip needed for mid-call bitrate changes |
| Manual offer/answer orchestration for group calls | Perfect negotiation (polite/impolite) applies per-pair to mesh | MDN 2020+ | Each PeerConnection in mesh handles collisions independently |
| Simple-peer library for mesh | Native `RTCPeerConnection` per peer in a Map | Project decision (CLAUDE.md) | simple-peer is unmaintained; native API is spec-complete in all modern browsers |

**No deprecated approaches in this phase** — the WebRTC APIs used (`RTCRtpSender.setParameters`, `RTCPeerConnection` perfect negotiation) are current spec and browser-stable.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `RTCRtpSender.setParameters` requires `getParameters()` round-trip first (transaction-id preservation) | Pattern 4 | If wrong, a fresh params object would also work — low risk; `getParameters` round-trip is safe regardless |
| A2 | Applying `setParameters` before sender track is active throws silently (rejected Promise) | Pitfall 5 | If wrong (e.g., queued until ready), the `.catch(() => {})` guard is still harmless |
| A3 | `RTCRtpSender.setParameters({ encodings: [{ maxBitrate: 350_000 }] })` results in visible bitrate reduction in DebugPanel `bitrateKbps` stat from `outbound-rtp` | Architecture / D-06 | If browser enforcement is looser than spec, cap might not be observable — test required |

**If this table is empty:** All other claims were verified from codebase source files in this session.

---

## Open Questions

1. **Presence IN_CALL for room participants**
   - What we know: `RedisPresenceService.snapshot()` reads `user-call:{userId}` to determine IN_CALL
   - What's unclear: Should group participants show as IN_CALL in the online users list?
   - Recommendation: Yes — write `user-call:{userId} = roomId` when user joins a room (same key, roomId as value). This makes the presence logic work with zero changes to `snapshot()`. Delete this key on leave. Planner should confirm this approach.

2. **Ring timeout for group invites**
   - What we know: 1-1 invites have a `ring-timeout-seconds` server timer (~30s)
   - What's unclear: Should the server auto-expire a group invite after 30s if invitee doesn't respond? Or only track it on the frontend?
   - Recommendation: Frontend-only timeout (UI-SPEC says ~30s auto-dismiss); server doesn't need a per-invite timer. If the room TTL expires before invitees join, they get a room-full or room-not-found response.

3. **Toaster for room-full style**
   - What we know: Toaster only supports 'info' and 'warning' variants; room-full uses background `var(--code-bg)` per UI-SPEC (not a warning color)
   - What's unclear: Use `useToastStore.show(...)` or a custom toast element?
   - Recommendation: Add a 'neutral' variant to `toastStore` (or render a custom toast in `GroupCallPage`) — planner should decide.

---

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all required services are already in the existing Docker Compose stack from Phase 6).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (Frontend) | Vitest 4.1.8 |
| Config file (Frontend) | `frontend/vitest.config.ts` (globals: true, environment: jsdom) |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |
| Framework (Backend) | JUnit 5 + Spring Boot Test + Testcontainers |
| Config file (Backend) | `backend/src/test/java/com/vdt/webrtc/TestcontainersConfiguration.java` |
| Quick run command | `cd backend && ./mvnw test -pl . -Dtest=RoomStateMachineTest -q` |
| Full suite command | `cd backend && ./mvnw verify` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADV-03 #1 | 4 users join room, each gets member list, P2P mesh forms | integration (WS) | `./mvnw test -Dtest=RoomMeshTest` | Wave 0 |
| ADV-03 #2 | 5th join rejected server-side with room-full message | unit (Lua) + integration (WS) | `./mvnw test -Dtest=RoomStateMachineTest` | Wave 0 |
| ADV-03 #3 | Participant leaves/drops; remaining peers unaffected | integration (WS) | `./mvnw test -Dtest=RoomMeshTest` | Wave 0 |
| ADV-03 #4 | Bitrate cap applied when ≥3 participants (verifiable in DebugPanel) | unit (frontend) | `npx vitest run --reporter=verbose src/webrtc/MeshManager.test.ts` | Wave 0 |
| Lua cap atomicity | Two simultaneous joins at size-3; only one succeeds | unit (Lua via Redis) | `./mvnw test -Dtest=RoomStateMachineTest#concurrent*` | Wave 0 |
| PeerManager decoupling | Per-peer callback fires; legacy callStore path unaffected | unit (frontend) | `npx vitest run src/webrtc/PeerManager.test.ts` | ✅ (modify existing) |
| Joiner-initiates polite/impolite | Offer collision resolved correctly for mesh pair | unit (frontend) | `npx vitest run src/webrtc/PeerManager.test.ts` | ✅ (extend) |
| setSendersMaxBitrate | Sets maxBitrate on video senders | unit (frontend) | `npx vitest run src/webrtc/MeshManager.test.ts` | Wave 0 |
| Cross-instance room signaling | Alice (inst1) → Bob (inst2) via room fanout | integration (2-context) | `./mvnw test -Dtest=CrossInstanceRoomTest` | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd backend && ./mvnw test -Dtest=RoomStateMachineTest` + `cd frontend && npx vitest run --reporter=verbose src/webrtc/MeshManager.test.ts`
- **Per wave merge:** Full backend `./mvnw verify` + full frontend `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `backend/src/test/java/com/vdt/webrtc/room/RoomStateMachineTest.java` — covers ADV-03 #2, Lua cap atomicity
- [ ] `backend/src/test/java/com/vdt/webrtc/ws/RoomMeshTest.java` — covers ADV-03 #1, #3 (WS integration with Testcontainers)
- [ ] `backend/src/test/java/com/vdt/webrtc/ws/CrossInstanceRoomTest.java` — covers cross-instance room fanout (2-SpringContext pattern from CrossInstanceCallTest.java)
- [ ] `frontend/src/webrtc/MeshManager.test.ts` — covers ADV-03 #4, setSendersMaxBitrate, per-peer callback

*(PeerManager.test.ts already exists and covers the politeness/offer-collision case — extend it for the new callback parameter, do not replace.)*

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (no new auth flows; existing JWT filter unchanged) | — |
| V3 Session Management | No | — |
| V4 Access Control | Yes | Server-side cap enforcement (D-03 Lua); room membership verified server-side before routing any message; `from` field on SDP/ICE always taken from authenticated session, never from client payload |
| V5 Input Validation | Yes | `invitees` list in `CreateRoom`: validate non-empty, max 3 elements, no self-invite; `roomId` validated as UUID format on all room messages |
| V6 Cryptography | No | No new crypto; media uses DTLS-SRTP (browser default) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client spoofs `from` field on SDP/ICE to impersonate another user | Spoofing | `from` is always set server-side from authenticated WS session (`username(session)`) — same as existing SdpReceived pattern |
| Client sends `join-room` for a room they were not invited to | Elevation of Privilege | `RoomService.joinRoom` checks that user received an invite (store pending-invites in Redis OR check room membership model); or enforce that only the room initiator flow creates the room (room exists = someone was invited) |
| Invite list > 3 members submitted by client | Tampering | Validate `invitees.size() <= 3` in `CreateRoom` handler; reject with 400/error message |
| Malformed `roomId` used to probe room existence | Information Disclosure | Validate UUID format; return generic error regardless of whether room exists or is full |
| Rapid `join-room` spam to exhaust Redis | DoS | Rate-limit in WS handler (or rely on per-user room pointer: user can only be in 1 room at a time) |

---

## Sources

### Primary (HIGH confidence — verified from codebase files in this session)

- `frontend/src/webrtc/PeerManager.ts` — PeerManager class, mapIceState, callStore coupling
- `frontend/src/realtime/callActions.ts` — module-scope non-serializable state, deliverSignal, createPeer pattern
- `frontend/src/store/callStore.ts` — Zustand store shape and selector pattern
- `frontend/src/realtime/wsClient.ts` — sendSignal, callSignalHandler dispatch
- `frontend/src/realtime/messages.ts` — existing ClientMessage/ServerMessage types
- `frontend/src/webrtc/stats.ts` — StatsProvider interface, startStatsPolling
- `frontend/src/components/call/DebugPanel.tsx` — current DebugPanel structure
- `frontend/src/components/call/CallButtons.tsx` — round button pattern
- `frontend/src/components/call/CallLayer.tsx` — CallLayer routing logic (navigate to /call)
- `frontend/src/pages/App.tsx` — routing structure (how to add /group-call route)
- `frontend/src/store/toastStore.ts` — Toaster variants and auto-dismiss behavior
- `backend/.../call/CallStateMachine.java` — RedisScript Lua loading pattern
- `backend/.../call/CallService.java` — service broadcast pattern
- `backend/.../ws/PresenceWebSocketHandler.java` — message dispatch pattern, where new message types are handled
- `backend/.../ws/RedisMessageRouter.java` — sendToUser cross-instance routing
- `backend/.../ws/message/ClientMessage.java` — sealed interface + @JsonSubTypes extension pattern
- `backend/.../ws/message/ServerMessage.java` — sealed interface + @JsonSubTypes extension pattern
- `backend/.../presence/RedisPresenceService.java` — snapshot() IN_CALL detection via user-call key
- `backend/src/main/resources/scripts/create_call.lua` — Lua script structure reference
- `backend/src/main/resources/scripts/transition_call.lua` — Lua script structure reference
- `backend/src/test/.../ws/CrossInstanceCallTest.java` — 2-SpringContext integration test pattern
- `backend/src/test/.../ws/WsTestSupport.java` — CollectingHandler, awaitMatching pattern
- `.planning/phases/07-group-mesh-calls/07-CONTEXT.md` — all locked decisions D-01 through D-06
- `.planning/phases/07-group-mesh-calls/07-UI-SPEC.md` — component inventory, interaction contracts IC-1 through IC-7
- `frontend/package.json` — actual library versions
- `backend/pom.xml` — Spring Boot 4.0.7, Java 21

### Secondary (MEDIUM confidence)

- MDN WebRTC specification for `RTCRtpSender.setParameters` behavior (getParameters round-trip requirement) — [ASSUMED: A1]
- W3C WebRTC perfect negotiation pattern for mesh (per-pair politeness via deterministic comparison) — consistent with Phase 3/4 implementation

### Tertiary (LOW confidence)

- None — all architectural claims are grounded in verified codebase patterns.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all libraries verified from package.json and pom.xml
- Architecture: HIGH — all patterns are direct extrapolations of Phase 4/6 verified code
- Pitfalls: HIGH — most pitfalls are derived from actual Phase 3-6 implementation code (not speculation)
- Bitrate cap behavior: MEDIUM — RTCRtpSender.setParameters is well-documented API but exact browser enforcement requires empirical verification (A3)

**Research date:** 2026-06-29
**Valid until:** 2026-07-29 (30 days; stack is stable — no fast-moving dependencies)
