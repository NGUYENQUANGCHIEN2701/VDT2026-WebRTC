# Phase 7: Group Mesh Calls — Pattern Map

**Mapped:** 2026-06-29
**Files analyzed:** 22 new/modified files
**Analogs found:** 22 / 22

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/.../room/RoomService.java` | service | event-driven, CRUD | `backend/.../call/CallService.java` | exact |
| `backend/.../room/RoomRepository.java` | repository | CRUD | `backend/.../call/CallStateRepository.java` | exact |
| `backend/.../room/RoomSnapshot.java` | model | transform | `backend/.../call/CallSnapshot.java` | exact |
| `backend/.../room/CreateResult.java` (JoinResult enum) | model | — | `backend/.../call/CreateResult.java` | exact |
| `backend/src/main/resources/scripts/join_room.lua` | utility | transform | `backend/.../scripts/create_call.lua` | exact |
| `backend/src/main/resources/scripts/leave_room.lua` | utility | transform | `backend/.../scripts/transition_call.lua` | exact |
| `backend/.../ws/message/ClientMessage.java` (modified) | model | request-response | self (sealed interface extension) | exact |
| `backend/.../ws/message/ServerMessage.java` (modified) | model | request-response | self (sealed interface extension) | exact |
| `backend/.../ws/message/CreateRoom.java` + 8 others | model | request-response | `backend/.../ws/message/CallStateChanged.java` | exact |
| `backend/.../ws/PresenceWebSocketHandler.java` (modified) | handler | request-response | self (dispatch block extension) | exact |
| `frontend/src/store/roomStore.ts` | store | event-driven | `frontend/src/store/callStore.ts` | exact |
| `frontend/src/webrtc/MeshManager.ts` | service | event-driven | `frontend/src/realtime/callActions.ts` (module scope) | role-match |
| `frontend/src/webrtc/PeerManager.ts` (modified) | service | event-driven | self (add optional callback) | exact |
| `frontend/src/realtime/roomActions.ts` | service | event-driven | `frontend/src/realtime/callActions.ts` | exact |
| `frontend/src/realtime/messages.ts` (modified) | model | — | self (type union extension) | exact |
| `frontend/src/pages/GroupCallPage.tsx` | page | request-response | `frontend/src/pages/CallPage.tsx` | exact |
| `frontend/src/components/call/ParticipantTile.tsx` | component | request-response | `frontend/src/components/call/RemoteCamOffOverlay.tsx` | role-match |
| `frontend/src/components/call/GroupInviteModal.tsx` | component | request-response | `frontend/src/components/call/IncomingCallCard.tsx` | exact |
| `frontend/src/components/call/OutgoingGroupInviteCard.tsx` | component | request-response | `frontend/src/components/call/SelfViewPreview.tsx` | exact |
| `frontend/src/components/call/CallButtons.tsx` (modified) | component | request-response | self (add LeaveRoomButton export) | exact |
| `frontend/src/components/call/DebugPanel.tsx` (modified) | component | request-response | self (extend for per-peer stats) | exact |
| `frontend/src/components/presence/MultiSelectUserList.tsx` | component | request-response | `frontend/src/components/presence/OnlineUsersList.tsx` | exact |
| `frontend/src/components/presence/OnlineUsersList.tsx` (modified) | component | request-response | self (add group call trigger) | exact |
| `frontend/src/components/presence/OnlineUserRow.tsx` (modified) | component | request-response | self (add optional checkbox) | exact |
| `backend/.../room/RoomStateMachineTest.java` (new) | test | CRUD | `backend/.../call/CallStateMachineTest.java` | exact |
| `backend/.../ws/RoomMeshTest.java` (new) | test | event-driven | `backend/.../ws/CrossInstanceCallTest.java` | exact |
| `frontend/src/webrtc/MeshManager.test.ts` (new) | test | event-driven | `frontend/src/webrtc/PeerManager.test.ts` | exact |

---

## Pattern Assignments

---

### `backend/.../room/RoomRepository.java` (repository, CRUD)

**Analog:** `backend/src/main/java/com/vdt/webrtc/call/CallStateRepository.java`

**Imports pattern** (lines 1–8):
```java
package com.vdt.webrtc.room;

import java.util.List;
import java.util.Optional;

import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Repository;
```

**Core pattern — Lua script loading** (analog lines 17–21):
```java
// Copy exactly from CallStateMachine.java lines 17-21
private final RedisScript<Long> joinRoomScript;

public RoomRepository(StringRedisTemplate redis) {
    this.redis = redis;
    this.joinRoomScript = RedisScript.of(
        new ClassPathResource("scripts/join_room.lua"), Long.class);
    this.leaveRoomScript = RedisScript.of(
        new ClassPathResource("scripts/leave_room.lua"), Long.class);
}
```

**Core pattern — Lua execute + switch** (analog lines 23–41):
```java
// Copy pattern from CallStateMachine.createCall (lines 23-41)
public JoinResult join(String roomId, String userId) {
    Long result = redis.execute(joinRoomScript,
        List.of("room:" + roomId, "user-room:" + userId),
        userId, roomId, "14400");
    if (result == null) throw new IllegalStateException("Redis Lua returned null");
    return switch (result.intValue()) {
        case  1 -> JoinResult.OK;
        case -1 -> JoinResult.FULL;
        case -2 -> JoinResult.ALREADY_MEMBER;
        default -> throw new IllegalStateException("Unexpected Lua result: " + result);
    };
}
```

**Redis SET helpers** (analog lines 37–39 in CallStateRepository — simple GET pattern):
```java
// Pattern: CallStateRepository.findCallIdByUser (lines 37-39)
// Use opsForSet for room membership
public Optional<Set<String>> members(String roomId) {
    Set<String> m = redis.opsForSet().members("room:" + roomId);
    return (m == null || m.isEmpty()) ? Optional.empty() : Optional.of(m);
}

public Optional<String> findRoomByUser(String userId) {
    return Optional.ofNullable(redis.opsForValue().get("user-room:" + userId));
}
```

---

### `backend/src/main/resources/scripts/join_room.lua` (Lua, atomic transform)

**Analog:** `backend/src/main/resources/scripts/create_call.lua`

**Header comment pattern** (analog lines 1–10):
```lua
-- join_room.lua — atomic join with cap enforcement
-- KEYS[1] = room:{roomId}        (Redis SET of member userIds)
-- KEYS[2] = user-room:{userId}   (reverse pointer: which room is this user in)
-- ARGV[1] = userId
-- ARGV[2] = roomId
-- ARGV[3] = ttl seconds (e.g. "14400")
-- Returns: 1 = joined OK; -1 = FULL (>=4 members); -2 = already a member
```

**Core atomic pattern** (analog lines 13–46 — check then multi-set):
```lua
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

---

### `backend/src/main/resources/scripts/leave_room.lua` (Lua, atomic transform)

**Analog:** `backend/src/main/resources/scripts/transition_call.lua`

**Core pattern** (analogous to transition: CAS then conditional cleanup):
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

---

### `backend/.../room/RoomService.java` (service, event-driven)

**Analog:** `backend/src/main/java/com/vdt/webrtc/call/CallService.java`

**Imports + class header pattern** (analog lines 1–41):
```java
package com.vdt.webrtc.room;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.vdt.webrtc.ws.MessageRouter;
// room message imports

@Service
public class RoomService {
    private final RoomRepository repo;
    private final MessageRouter router;

    public RoomService(RoomRepository repo, MessageRouter router) {
        this.repo = repo;
        this.router = router;
    }
```

**Fanout broadcast pattern** (analog: `CallService.broadcast` lines 44–48 + `handleInvite` lines 50–66):
```java
// Copy broadcast pattern from CallService.broadcast (lines 44-48)
// but fan out to N members instead of 2
private void broadcastToRoom(String roomId, ServerMessage message, Set<String> members, String exclude) {
    for (String memberId : members) {
        if (!memberId.equals(exclude)) {
            router.sendToUser(memberId, message);  // sendToUser handles cross-instance (Phase 6)
        }
    }
}
```

**createRoom pattern** (analog: `CallService.handleInvite` lines 50–66):
```java
public void createRoom(String initiatorId, List<String> inviteeIds) {
    String roomId = UUID.randomUUID().toString();
    // Atomically add initiator — same pattern as createCall
    JoinResult r = repo.join(roomId, initiatorId);
    if (r != JoinResult.OK) return;

    // Fan out invites — same loop pattern as broadcast, skip busy users
    for (String inviteeId : inviteeIds) {
        boolean busyCall = Boolean.TRUE.equals(redisTemplate.hasKey("user-call:" + inviteeId));
        boolean busyRoom = Boolean.TRUE.equals(redisTemplate.hasKey("user-room:" + inviteeId));
        if (busyCall || busyRoom) continue;
        router.sendToUser(inviteeId, new RoomInvite(roomId, initiatorId, inviteeIds.size() + 1));
    }
    router.sendToUser(initiatorId, new RoomCreated(roomId));
}
```

**Disconnect cleanup pattern** (analog: `CallService.handleDisconnect` lines 145–154):
```java
// Copy handleDisconnect pattern from CallService (lines 145-154)
public void handleDisconnect(String userId) {
    repo.findRoomByUser(userId).ifPresent(roomId -> {
        // No grace period for mesh — leave immediately (peer's tile shows failed, ICE restart handles reconnect)
        handleLeaveRoom(userId, roomId);
    });
}
```

---

### `backend/.../ws/message/ClientMessage.java` (modified — sealed interface extension)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/message/ClientMessage.java` (self)

**Sealed interface + @JsonSubTypes pattern** (lines 7–25 of existing file):
```java
// Existing pattern to copy for new room message types:
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    // ... existing entries ...
    @JsonSubTypes.Type(value = CreateRoom.class,        name = "create-room"),
    @JsonSubTypes.Type(value = JoinRoom.class,          name = "join-room"),
    @JsonSubTypes.Type(value = LeaveRoom.class,         name = "leave-room"),
    @JsonSubTypes.Type(value = DeclineRoomInvite.class, name = "decline-room-invite"),
})
public sealed interface ClientMessage
    permits /* existing */ ..., CreateRoom, JoinRoom, LeaveRoom, DeclineRoomInvite {
}
```

**Note:** Use `com.fasterxml.jackson.annotation` (NOT tools.jackson) for `@JsonSubTypes`/`@JsonTypeInfo` — verified from existing ClientMessage.java lines 4–5. The ObjectMapper injected in handlers uses `tools.jackson` but annotations remain `com.fasterxml`.

---

### `backend/.../ws/message/ServerMessage.java` (modified — sealed interface extension)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/message/ServerMessage.java` (self)

**Record-implements-interface pattern** (analog: `CallStateChanged.java`):
```java
// Pattern for each new server message record — copy from CallStateChanged.java
package com.vdt.webrtc.ws.message;

public record RoomInvite(
    String roomId,
    String initiatorId,
    int memberCount
) implements ServerMessage {}

public record RoomJoined(
    String roomId,
    java.util.List<String> members   // existing member list for joiner-initiates
) implements ServerMessage {}

public record ParticipantJoined(String roomId, String userId) implements ServerMessage {}
public record ParticipantLeft(String roomId, String userId)   implements ServerMessage {}
public record RoomFullError(String roomId)                     implements ServerMessage {}
```

---

### `backend/.../ws/PresenceWebSocketHandler.java` (modified — dispatch extension)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java` (self)

**Dispatch block pattern** (lines 100–121 — else-if chain):
```java
// Copy existing else-if dispatch pattern (lines 100-121)
// Add new room message handlers at the end of the chain, before the final else:
} else if (clientMessage instanceof CreateRoom createRoom) {
    roomService.createRoom(username, createRoom.invitees());
} else if (clientMessage instanceof JoinRoom joinRoom) {
    roomService.joinRoom(username, joinRoom.roomId());
} else if (clientMessage instanceof LeaveRoom leaveRoom) {
    roomService.handleLeaveRoom(username, leaveRoom.roomId());
} else if (clientMessage instanceof DeclineRoomInvite decline) {
    roomService.handleDecline(username, decline.roomId());
}
// SDP/ICE routing is UNCHANGED — reuse existing sdp/ice-candidate handlers as-is
// (router.sendToUser(sdpMessage.to(), received) works for group calls with roomId in callId field)
```

**afterConnectionClosed extension** (lines 127–134):
```java
// Extend afterConnectionClosed to also clean up room membership:
@Override
public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    String username = username(session);
    if (sessionRegistry.deregister(username, session)) {
        callService.handleDisconnect(username);
        roomService.handleDisconnect(username);  // NEW: also clean up room
        presence.leave(username);
        redisTemplate.delete("route:" + username);
    }
}
```

---

### `frontend/src/store/roomStore.ts` (store, event-driven)

**Analog:** `frontend/src/store/callStore.ts`

**Imports + create pattern** (analog lines 1–5):
```typescript
import { create } from 'zustand'

export type PeerConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'idle'

export interface PeerRosterEntry {
    userId: string
    connectionState: PeerConnectionState
    micMuted: boolean
    camOff: boolean
    streamVersion: number   // bump to force <video>.srcObject re-attach (same as remoteStreamVersion in callStore)
}
```

**State shape pattern** (analog lines 18–45 — flat interface, actions co-located):
```typescript
interface RoomState {
    roomId: string | null
    members: Record<string, PeerRosterEntry>   // key = userId; NOT RTCPeerConnection
    micMuted: boolean
    camOff: boolean
    connectedAt: number | null
    // actions
    initRoom: (roomId: string, myUserId: string, initialMembers: string[]) => void
    addPeer: (userId: string) => void
    removePeer: (userId: string) => void
    setPeerConnectionState: (userId: string, state: PeerConnectionState) => void
    bumpStreamVersion: (userId: string) => void
    setMicMuted: (b: boolean) => void
    setCamOff: (b: boolean) => void
    reset: () => void
}
```

**create() + set() pattern** (analog lines 47–87):
```typescript
// Copy create((set) => ({ ... })) pattern from callStore.ts lines 47-87
export const useRoomStore = create<RoomState>((set) => ({
    roomId: null,
    members: {},
    micMuted: false,
    camOff: false,
    connectedAt: null,
    setMicMuted: (micMuted) => set({ micMuted }),
    setCamOff: (camOff) => set({ camOff }),
    // connectedAt: set on first 'connected' peer — same pattern as callStore lines 69-73
    setPeerConnectionState: (userId, connectionState) =>
        set((s) => ({
            members: { ...s.members, [userId]: { ...s.members[userId], connectionState } },
            // First connected peer marks the room as active
            connectedAt: connectionState === 'connected' && s.connectedAt == null
                ? Date.now() : s.connectedAt,
        })),
    bumpStreamVersion: (userId) =>
        set((s) => ({
            members: { ...s.members, [userId]: { ...s.members[userId], streamVersion: (s.members[userId]?.streamVersion ?? 0) + 1 } },
        })),
    removePeer: (userId) =>
        set((s) => {
            const { [userId]: _, ...rest } = s.members
            return { members: rest }
        }),
    reset: () => set({ roomId: null, members: {}, micMuted: false, camOff: false, connectedAt: null }),
}))
```

---

### `frontend/src/webrtc/PeerManager.ts` (modified — add optional callback)

**Analog:** `frontend/src/webrtc/PeerManager.ts` (self)

**Constructor signature extension** (current lines 33–43 — add one parameter):
```typescript
// Current constructor (lines 33-43):
constructor(
    iceServers: RTCIceServer[],
    polite: boolean,
    sendSignal: (s: OutboundSignal) => void,
    iceTransportPolicy?: RTCIceTransportPolicy,
    // ADD this optional parameter — non-breaking (1-1 path omits it):
    onConnectionStateChange?: (state: CallState) => void,
) {
    this.polite = polite
    this.sendSignal = sendSignal
    this.onConnectionStateChange = onConnectionStateChange
    this.pc = new RTCPeerConnection({ iceServers, iceTransportPolicy })
    this.setupHandlers()
}
```

**mapIceState decoupling** (current lines 139–158 — add callback branch):
```typescript
private mapIceState() {
    if (this.pc.iceConnectionState === 'failed') {
        this.pc.restartIce()
    }
    const map: Record<string, CallState> = {
        new: 'connecting', checking: 'connecting',
        connected: 'connected', completed: 'connected',
        disconnected: 'reconnecting', failed: 'reconnecting',
        closed: 'idle',
    }
    const next = map[this.pc.iceConnectionState]
    if (!next) return
    // NEW: per-peer callback for mesh; fallback to legacy callStore for 1-1
    if (this.onConnectionStateChange) {
        this.onConnectionStateChange(next)           // mesh: per-peer callback
    } else {
        useCallStore.getState().setCallState(next)   // 1-1 legacy path (unchanged)
    }
}
```

**New method for bitrate capping** (add after getStats, line 106):
```typescript
// Add to PeerManager class — used by MeshManager.applyBitrateCap()
setSendersMaxBitrate(maxBitrateKbps: number | null): void {
    for (const sender of this.pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue
        const params = sender.getParameters()
        if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}]
        }
        params.encodings[0].maxBitrate = maxBitrateKbps != null
            ? maxBitrateKbps * 1000   // kbps → bps
            : undefined
        sender.setParameters(params).catch(() => {})  // best-effort; ignore not-yet-active senders
    }
}
```

---

### `frontend/src/webrtc/MeshManager.ts` (service, event-driven)

**Analog:** `frontend/src/realtime/callActions.ts` (module-scope non-serializable state pattern)

**Module-scope non-serializable map pattern** (analog lines 11–19 in callActions.ts):
```typescript
// Analog: callActions.ts lines 11-19 (module-scope non-React objects)
// In MeshManager.ts, the Map<userId, PeerManager> lives on the class instance
// Module-level stream map (non-serializable, outside Zustand — same as callActions.ts `localStream`):
export const remoteStreams = new Map<string, MediaStream>()
```

**Class structure** (analog: PeerManager class structure, callActions module functions):
```typescript
export class MeshManager {
    private peers = new Map<string, PeerManager>()
    private localStream: MediaStream | null = null
    private iceServers: RTCIceServer[] = []
    private iceTransportPolicy?: RTCIceTransportPolicy
    private myUserId: string

    constructor(myUserId: string) {
        this.myUserId = myUserId
    }

    setLocalMedia(stream: MediaStream, iceServers: RTCIceServer[], policy?: RTCIceTransportPolicy) {
        this.localStream = stream
        this.iceServers = iceServers
        this.iceTransportPolicy = policy
    }

    addPeer(remoteUserId: string, roomId: string): PeerManager {
        // Politeness: lexicographically larger userId = polite peer (D-04)
        const polite = this.myUserId > remoteUserId
        const pm = new PeerManager(
            this.iceServers,
            polite,
            (sig) => sendRoomSignal(sig, remoteUserId, roomId),
            this.iceTransportPolicy,
            (state) => this.handlePeerStateChange(remoteUserId, state),  // NEW callback
        )
        pm.onRemoteStream = (stream) => this.handleRemoteStream(remoteUserId, stream)
        if (this.localStream) pm.addLocalStream(this.localStream)
        this.peers.set(remoteUserId, pm)
        return pm
    }

    removePeer(remoteUserId: string) {
        const pm = this.peers.get(remoteUserId)
        if (pm) { pm.close(); this.peers.delete(remoteUserId) }
        useRoomStore.getState().removePeer(remoteUserId)
    }

    applyBitrateCap(maxBitrateKbps: number | null) {
        for (const pm of this.peers.values()) {
            pm.setSendersMaxBitrate(maxBitrateKbps)
        }
    }

    // Copy teardownMedia pattern from callActions.ts lines 131-138
    destroy() {
        for (const pm of this.peers.values()) pm.close()
        this.peers.clear()
        this.localStream?.getTracks().forEach(t => t.stop())
        this.localStream = null
        remoteStreams.clear()
        useRoomStore.getState().reset()
    }

    private handlePeerStateChange(userId: string, state: PeerConnectionState) {
        useRoomStore.getState().setPeerConnectionState(userId, state)
        // Apply bitrate cap when roster crosses 2-participant threshold
        applyBitrateCapIfNeeded()
    }

    private handleRemoteStream(userId: string, stream: MediaStream) {
        remoteStreams.set(userId, stream)
        useRoomStore.getState().bumpStreamVersion(userId)
    }
}
```

---

### `frontend/src/realtime/roomActions.ts` (service, event-driven)

**Analog:** `frontend/src/realtime/callActions.ts`

**Module-scope state + exports pattern** (analog lines 11–23):
```typescript
// Copy module-scope non-serializable pattern from callActions.ts lines 11-23
import { MeshManager, remoteStreams } from '../webrtc/MeshManager'
import { useRoomStore } from '../store/roomStore'
import { useAuthStore } from '../store/authStore'
import { sendSignal, setRoomSignalHandler } from './wsClient'  // NEW: add setRoomSignalHandler to wsClient
import { fetchIceConfig } from '../api/turn'
import { acquireLocalMedia } from '../webrtc/media'
import { useToastStore } from '../store/toastStore'

let meshManager: MeshManager | null = null

export function getRoomStream(userId: string): MediaStream | null {
    return remoteStreams.get(userId) ?? null
}
export function getMeshManager(): MeshManager | null { return meshManager }
```

**forceRelayEnabled pattern** (analog lines 59–61):
```typescript
// Copy exactly from callActions.ts lines 59-61
function forceRelayEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('relay') === '1'
}
```

**handleRoomJoined pattern** (analog: `enterActiveCall` lines 82–104):
```typescript
// Copy await-getMedia + createPeer pattern from callActions.ts enterActiveCall (lines 82-104)
async function handleRoomJoined(msg: RoomJoined) {
    const me = useAuthStore.getState().user!.username
    const { iceServers, iceTransportPolicy } = await fetchIceConfig(forceRelayEnabled())
    const media = await acquireLocalMedia()

    meshManager = new MeshManager(me)
    meshManager.setLocalMedia(media.stream, iceServers, iceTransportPolicy)
    useRoomStore.getState().initRoom(msg.roomId, me, msg.members)

    // Joiner-initiates: create one PeerManager per existing member (D-04)
    for (const memberId of msg.members.filter(id => id !== me)) {
        meshManager.addPeer(memberId, msg.roomId)
    }

    applyBitrateCapIfNeeded()
    // navigate to /group-call — same as callActions navigate pattern
}
```

**Server signal handler dispatch** (analog: `handleServerSignal` lines 142–160):
```typescript
// Copy switch-case dispatch pattern from callActions.ts lines 142-160
function handleRoomServerSignal(msg: RoomServerMessage) {
    switch (msg.type) {
        case 'room-invite':
            useRoomStore.getState().setPendingInvite(msg)
            break
        case 'room-joined':
            handleRoomJoined(msg)
            break
        case 'participant-joined':
            meshManager?.addPeer(msg.userId, msg.roomId)
            useRoomStore.getState().addPeer(msg.userId)
            break
        case 'participant-left':
            meshManager?.removePeer(msg.userId)
            break
        case 'room-full-error':
            useToastStore.getState().show('Phòng đã đầy (tối đa 4 người)', 'warning')
            break
        // sdp-received / ice-candidate-received routed to per-peer PeerManager:
        case 'sdp-received':
            meshManager?.peers.get(msg.from)?.handleSignalingMessage({ sdp: msg.sdp })
            break
        case 'ice-candidate-received':
            meshManager?.peers.get(msg.from)?.handleSignalingMessage({ candidate: msg.candidate })
            break
    }
}
```

**Bitrate cap helper** (apply on roster change):
```typescript
// Called from MeshManager.handlePeerStateChange and after addPeer/removePeer
function applyBitrateCapIfNeeded() {
    if (!meshManager) return
    const count = Object.keys(useRoomStore.getState().members).length + 1  // +1 for self
    const cap = count >= 3 ? 350 : null  // 350 kbps per D-06
    meshManager.applyBitrateCap(cap)
}
```

---

### `frontend/src/realtime/messages.ts` (modified — type union extension)

**Analog:** `frontend/src/realtime/messages.ts` (self)

**Type union extension pattern** (analog lines 21–28 — `CallServerSignal`):
```typescript
// Add new union types alongside existing CallServerSignal (lines 21-28)
export type RoomServerMessage =
    | { type: 'room-invite'; roomId: string; initiatorId: string; memberCount: number }
    | { type: 'room-joined'; roomId: string; members: string[] }
    | { type: 'room-full-error'; roomId: string }
    | { type: 'participant-joined'; roomId: string; userId: string }
    | { type: 'participant-left'; roomId: string; userId: string }
    | { type: 'sdp-received'; from: string; callId: string; sdp: RTCSessionDescriptionInit }  // reused
    | { type: 'ice-candidate-received'; from: string; callId: string; candidate: RTCIceCandidateInit }  // reused

// New client → server intents for rooms:
// Add to ClientMessage union (lines 33-43):
// | { type: 'create-room'; invitees: string[] }
// | { type: 'join-room'; roomId: string }
// | { type: 'leave-room'; roomId: string }
// | { type: 'decline-room-invite'; roomId: string }
```

---

### `frontend/src/pages/GroupCallPage.tsx` (page, request-response)

**Analog:** `frontend/src/pages/CallPage.tsx`

**Imports pattern** (analog lines 1–13):
```typescript
// Copy import pattern from CallPage.tsx lines 1-13
import { useEffect, useRef, useState } from 'react'
import { useRoomStore } from '../store/roomStore'
import { getMeshManager, getRoomStream } from '../realtime/roomActions'
import { MuteButton, CamToggleButton } from '../components/call/CallButtons'
import { LeaveRoomButton } from '../components/call/CallButtons'    // new export
import { startStatsPolling, type StatsSample } from '../webrtc/stats'
import DebugPanel, { DebugToggle } from '../components/call/DebugPanel'
import { toggleMic, toggleCam } from '../realtime/mediaControls'    // reuse existing
import ParticipantTile from '../components/call/ParticipantTile'    // new
import { useCallDuration } from '../hooks/useCallDuration'          // reuse
```

**Top bar pattern** (analog lines 44–53):
```typescript
// Copy top bar structure from CallPage.tsx lines 44-53
<div style={{ height: 44, display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '0 16px' }}>
    {/* Participant count badge — new, replaces QualityIndicator */}
    <span aria-label={`${memberCount} người trong phòng`}
        style={{ fontSize: 14, color: 'var(--text)', background: 'var(--code-bg)',
                 borderRadius: 4, padding: '2px 8px' }}>
        {memberCount} người
    </span>
    {/* Duration — same as CallPage lines 47-50 */}
    {duration && (
        <span aria-label="Thời lượng cuộc gọi"
              style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {duration}
        </span>
    )}
    <DebugToggle open={debugOpen} onClick={() => setDebugOpen(v => !v)} />
</div>
```

**Video grid area** (analog lines 55–71 — single video → multi-tile grid):
```typescript
// Replace single <video> with CSS grid of ParticipantTile components
// Grid columns determined by member count (IC-3 from UI-SPEC)
const gridTemplate = memberCount === 4 ? '1fr 1fr'
    : memberCount === 3 ? '1fr 1fr'
    : '1fr 1fr'   // 2 participants side by side

<div style={{ flex: 1, display: 'grid',
    gridTemplateColumns: gridTemplate,
    gap: 8, padding: 8, background: '#000' }}>
    {/* Self tile */}
    <ParticipantTile userId={me} isSelf stream={localStream} connectionState="connected"
        micMuted={micMuted} camOff={camOff} />
    {/* Remote tiles */}
    {Object.values(members).map(peer => (
        <ParticipantTile key={peer.userId} userId={peer.userId} isSelf={false}
            stream={getRoomStream(peer.userId)}
            connectionState={peer.connectionState}
            micMuted={peer.micMuted} camOff={peer.camOff} />
    ))}
</div>
```

**Control bar pattern** (analog lines 73–78):
```typescript
// Copy control bar pattern from CallPage.tsx lines 73-78
// Replace HangUpButton with LeaveRoomButton
<div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: 16 }}>
    <MuteButton muted={micMuted} onClick={toggleMic} />
    <CamToggleButton off={camOff} onClick={toggleCam} />
    <LeaveRoomButton onClick={leaveRoom} />
</div>
```

**App.tsx route registration** (analog lines 78–81):
```typescript
// Add /group-call route to App.tsx alongside /call (lines 78-81)
<Route path="/group-call" element={
    <ProtectedRoute><GroupCallPage /></ProtectedRoute>
} />
```

---

### `frontend/src/components/call/ParticipantTile.tsx` (component, request-response)

**Analog:** `frontend/src/components/call/RemoteCamOffOverlay.tsx` + `CallPage.tsx` (video + overlay pattern)

**Video with srcObject ref pattern** (analog: CallPage.tsx lines 57–71):
```typescript
// Copy video srcObject via useEffect+ref pattern from CallPage.tsx lines 29-33
const videoRef = useRef<HTMLVideoElement>(null)
useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream ?? null
}, [stream, streamVersion])
```

**Cam-off overlay pattern** (analog: RemoteCamOffOverlay.tsx lines 1–16):
```typescript
// Copy avatar circle pattern from RemoteCamOffOverlay.tsx lines 1-16
// Embed inline in tile (no separate component import needed — tile is self-contained)
{camOff && (
    <div style={{ position: 'absolute', inset: 0, background: '#1f2937',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%',
            background: 'var(--code-bg)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 40, color: '#fff' }}>
            {username.charAt(0).toUpperCase()}
        </div>
    </div>
)}
```

**Reconnecting overlay pattern** (analog: CallPage.tsx lines 63–67):
```typescript
// Copy reconnecting overlay from CallPage.tsx lines 63-67 — per-tile version
{connectionState === 'reconnecting' && (
    <div role="status" aria-live="polite"
        style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                 alignItems: 'center', justifyContent: 'center', gap: 12,
                 background: 'rgba(0,0,0,0.45)', color: '#fff' }}>
        <span className="spinner" aria-hidden="true" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Đang kết nối lại…</span>
    </div>
)}
```

**Self-view mirror pattern** (analog: CallPage.tsx line 70):
```typescript
// Copy self-view transform from CallPage.tsx line 70
style={{ ..., transform: isSelf ? 'scaleX(-1)' : undefined }}
```

---

### `frontend/src/components/call/GroupInviteModal.tsx` (component, request-response)

**Analog:** `frontend/src/components/call/IncomingCallCard.tsx`

**Overlay + card pattern** (analog lines 10–34 — copy exactly, change text):
```typescript
// Copy overlay structure from IncomingCallCard.tsx lines 10-34
// role="dialog" aria-modal="true" aria-labelledby pattern is identical
<div role="dialog" aria-modal="true" aria-labelledby="group-invite-heading"
    style={{ position: 'fixed', inset: 0, display: 'flex',
             alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
    <div style={{ background: 'var(--code-bg)', borderRadius: 12, padding: 24,
                  maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
        <h2 id="group-invite-heading" style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            {initiatorUsername}
        </h2>
        <p style={{ fontSize: 16, margin: '8px 0 24px', color: 'var(--text)' }}>
            Đang mời bạn vào cuộc gọi nhóm ({memberCount} người)
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            {/* Accept/Reject button pattern from IncomingCallCard.tsx lines 28-31 */}
            <button onClick={onAccept}
                style={{ minWidth: 120, height: 44, borderRadius: 8, border: 'none',
                         background: '#16a34a', color: '#fff', fontSize: 16, cursor: 'pointer' }}>
                Tham gia
            </button>
            <button onClick={onReject}
                style={{ minWidth: 120, height: 44, borderRadius: 8, border: 'none',
                         background: '#dc2626', color: '#fff', fontSize: 16, cursor: 'pointer' }}>
                Từ chối
            </button>
        </div>
    </div>
</div>
```

**Auto-timeout pattern** (analog: callActions.ts `setTimeout(() => reset(), 3000)` lines 201–203):
```typescript
// Copy setTimeout auto-dismiss pattern from callActions.ts lines 201-203
useEffect(() => {
    const timer = setTimeout(() => onTimeout(), 30_000)
    return () => clearTimeout(timer)
}, [])
```

---

### `frontend/src/components/call/OutgoingGroupInviteCard.tsx` (component, request-response)

**Analog:** `frontend/src/components/call/SelfViewPreview.tsx`

**Overlay + card structure** (analog lines 27–60 — copy overlay, replace video with invite list):
```typescript
// Copy fixed-overlay + card structure from SelfViewPreview.tsx lines 27-60
// Replace video element with invitee status list
<div style={{ position: 'fixed', inset: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
    <div style={{ maxWidth: 400, width: '100%', background: 'var(--code-bg)',
                  borderRadius: 12, padding: 24, boxShadow: 'var(--shadow)' }}>
        <p style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px', textAlign: 'center' }}>
            Đang mời vào phòng nhóm…
        </p>
        {/* Invitee status list — new; no analog for this specific pattern */}
        <ul style={{ margin: 0, padding: 0 }}>
            {invitees.map(inv => (
                <li key={inv.userId} style={{ display: 'flex', alignItems: 'center',
                    gap: 8, padding: '6px 0', listStyle: 'none', fontSize: 16 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%',
                                   background: statusColor(inv.status) }} aria-hidden="true" />
                    {inv.userId}
                    <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--text)' }}>
                        {statusLabel(inv.status)}
                    </span>
                </li>
            ))}
        </ul>
        {/* Cancel button — copy CancelButton pattern from SelfViewPreview.tsx line 55 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <button onClick={onCancel} style={{ minWidth: 120, height: 44, borderRadius: 8,
                border: 'none', background: 'var(--border)', color: 'var(--text-h)',
                fontSize: 16, cursor: 'pointer' }}>
                Huỷ mời
            </button>
        </div>
    </div>
</div>
```

---

### `frontend/src/components/call/CallButtons.tsx` (modified — add LeaveRoomButton)

**Analog:** `frontend/src/components/call/CallButtons.tsx` (self)

**round() helper pattern** (analog lines 12–15):
```typescript
// Copy HangUpButton pattern (lines 61-70) — change aria-label only:
export function LeaveRoomButton({ onClick }: { onClick: () => void }) {
    return (
        <button onClick={onClick} aria-label="Rời phòng"
            style={{
                width: 56, height: 56, borderRadius: '50%', border: 'none',
                background: '#dc2626', color: '#fff', fontSize: 20, fontWeight: 600, cursor: 'pointer',
            }}>
            ✕
        </button>
    )
}
```

---

### `frontend/src/components/call/DebugPanel.tsx` (modified — per-peer group mode)

**Analog:** `frontend/src/components/call/DebugPanel.tsx` (self)

**rows + grid pattern** (analog lines 22–40):
```typescript
// Extend DebugPanel to accept optional peerId for group mode
// Copy rows array + Fragment grid pattern from DebugPanel.tsx lines 22-40
// Group mode: wrap in a section per peer with username header
export default function DebugPanel({
    stats,
    peerId,             // NEW optional: if set, show as one peer section in a multi-peer panel
    maxBitrateKbps,     // NEW optional: show active cap value
}: {
    stats: StatsSample | null
    peerId?: string
    maxBitrateKbps?: number | null
}) {
    const dash = '—'
    const rows: [string, React.ReactNode][] = [
        // ... existing rows (copy lines 23-29) ...
        // ADD new row for bitrate cap:
        ['maxBitrate', maxBitrateKbps != null ? `${maxBitrateKbps} kbps (mesh cap)` : dash],
    ]
    // Copy grid render from lines 31-40 unchanged
}
```

---

### `frontend/src/components/presence/MultiSelectUserList.tsx` (component, request-response)

**Analog:** `frontend/src/components/presence/OnlineUsersList.tsx`

**section + ul pattern** (analog lines 5–49):
```typescript
// Copy section + ul structure from OnlineUsersList.tsx lines 5-49
// Add checkbox column and selection counter

export default function MultiSelectUserList({
    selected, onToggle, maxSelect = 3
}: { selected: Set<string>; onToggle: (u: string) => void; maxSelect?: number }) {
    const onlineUsers = usePresenceStore(s => s.onlineUsers)
    const me = useAuthStore(s => s.user?.username)
    const others = onlineUsers.filter(u => u.username !== me && u.status === 'ONLINE')

    return (
        <ul style={{ margin: 0, padding: 0 }}>
            {others.map(u => {
                const isSelected = selected.has(u.username)
                const disabled = !isSelected && selected.size >= maxSelect
                return (
                    <li key={u.username}
                        style={{ display: 'flex', alignItems: 'center', gap: 8,
                                 padding: '8px 16px', borderBottom: '1px solid var(--border)',
                                 listStyle: 'none', opacity: disabled ? 0.4 : 1 }}>
                        <input type="checkbox" id={`sel-${u.username}`}
                            checked={isSelected} disabled={disabled}
                            onChange={() => !disabled && onToggle(u.username)}
                            style={{ width: 20, height: 20, cursor: disabled ? 'not-allowed' : 'pointer' }} />
                        <label htmlFor={`sel-${u.username}`}
                            style={{ flex: 1, fontSize: 16, color: 'var(--text-h)', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                            {u.username}
                        </label>
                    </li>
                )
            })}
        </ul>
    )
}
```

---

### `frontend/src/components/presence/OnlineUsersList.tsx` (modified — group call trigger)

**Analog:** `frontend/src/components/presence/OnlineUsersList.tsx` (self)

**Heading + button addition** (analog lines 12–16):
```typescript
// Add "Gọi nhóm" button above heading (lines 12-16 area)
// Copy disabled pattern from OnlineUserRow.tsx lines 21-28
<button onClick={() => setGroupMode(true)}
    disabled={callActive || groupMode}
    style={{ height: 44, minWidth: 140, borderRadius: 8,
             border: '1px solid var(--accent-border)', color: 'var(--accent)',
             background: 'transparent', cursor: callActive ? 'not-allowed' : 'pointer',
             opacity: callActive ? 0.4 : 1 }}>
    Gọi nhóm
</button>
```

---

### `frontend/src/components/presence/OnlineUserRow.tsx` (modified — optional checkbox)

**Analog:** `frontend/src/components/presence/OnlineUserRow.tsx` (self)

**Optional prop addition** (analog lines 10–30):
```typescript
// Add optional groupMode + selected props to OnlineUserRow
// Preserve existing "Gọi" button behavior (lines 21-28) unchanged when groupMode=false
export default function OnlineUserRow({
    user,
    groupMode = false,
    selected = false,
    onSelect,
}: { user: OnlineUser; groupMode?: boolean; selected?: boolean; onSelect?: () => void }) {
    // ... existing code ...
    // Add checkbox before the dot when groupMode=true
    {groupMode && user.status === 'ONLINE' && (
        <input type="checkbox" checked={selected}
            onChange={() => onSelect?.()} style={{ width: 20, height: 20 }} />
    )}
```

---

## Shared Patterns

### Lua Script Loading (backend — all Redis atomic ops)

**Source:** `backend/src/main/java/com/vdt/webrtc/call/CallStateMachine.java` lines 17–21
**Apply to:** `RoomRepository.java`

```java
// Exact copy pattern for any new Lua script
private final RedisScript<Long> joinRoomScript;
this.joinRoomScript = RedisScript.of(
    new ClassPathResource("scripts/join_room.lua"), Long.class);
// Execute: redis.execute(script, List.of(KEYS...), ARGV...)
```

### Cross-Instance Message Routing (backend)

**Source:** `backend/src/main/java/com/vdt/webrtc/ws/RedisMessageRouter.java` lines 57–93
**Apply to:** `RoomService.java` fan-out, `PresenceWebSocketHandler.java` room dispatch

```java
// Exact API: router.sendToUser(userId, serverMessage)
// Handles: local session (direct WS send) + remote instance (Redis pub/sub envelope)
// No changes needed — reuse as-is for room fanout
```

### Redis StringRedisTemplate Ops (backend)

**Source:** `backend/src/main/java/com/vdt/webrtc/call/CallStateRepository.java` lines 37–40
**Apply to:** `RoomRepository.java`

```java
// Pattern: opsForValue().get() for reverse-pointer lookup
// Pattern: opsForSet().members() for room member set
// Pattern: opsForValue().set(key, value, Duration.ofSeconds(TTL)) for pointer with TTL
```

### ObjectMapper (backend — tools.jackson, NOT com.fasterxml)

**Source:** `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java` line 35
**Apply to:** Any new class that needs JSON serialization

```java
// IMPORTANT: inject tools.jackson.databind.ObjectMapper (not com.fasterxml)
// per CLAUDE.md §"Jackson 3 / Boot 4 ObjectMapper"
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
// @JsonSubTypes/@JsonTypeInfo annotations remain com.fasterxml (verified: ClientMessage.java lines 4-5)
```

### Zustand Store (frontend — create + set pattern)

**Source:** `frontend/src/store/callStore.ts` lines 47–87
**Apply to:** `roomStore.ts`

```typescript
// Pattern: create<StateType>((set) => ({ ...state, ...actions }))
// Pattern: set({ field }) for simple updates
// Pattern: set((s) => ({ ...derived })) for computed updates
// Pattern: connectedAt timestamp set on first 'connected' (lines 69-73)
```

### Non-Serializable Objects Outside Zustand (frontend)

**Source:** `frontend/src/realtime/callActions.ts` lines 11–19
**Apply to:** `MeshManager.ts`, `roomActions.ts`

```typescript
// Pattern: module-scope or class-level variables for MediaStream, RTCPeerConnection
// Pattern: export const remoteStreams = new Map<string, MediaStream>()
// NEVER put RTCPeerConnection or MediaStream into Zustand store
// Zustand only holds serializable derived state (userId, connectionState, boolean flags)
```

### Inline-Style Component Pattern (frontend)

**Source:** `frontend/src/components/call/IncomingCallCard.tsx` + `frontend/src/components/call/CallButtons.tsx`
**Apply to:** All new Phase 7 components

```typescript
// No Tailwind, no className, no CSS modules
// All styles are inline objects: style={{ property: value }}
// CSS custom properties via var(--token) in style strings
// Tokens: var(--bg), var(--code-bg), var(--accent), var(--accent-border),
//         var(--border), var(--text), var(--text-h), var(--shadow), var(--mono)
// Semantic colors (hardcoded per existing pattern):
//   #16a34a = accept/success, #dc2626 = reject/destructive,
//   #d97706 = warning/IN_CALL, #6b7280 = muted gray, #1f2937 = cam-off bg
```

### Video srcObject Pattern (frontend)

**Source:** `frontend/src/pages/CallPage.tsx` lines 29–33
**Apply to:** `ParticipantTile.tsx`, `GroupCallPage.tsx`

```typescript
// MediaStream cannot be set via JSX — always use useEffect + ref
const videoRef = useRef<HTMLVideoElement>(null)
useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream ?? null
}, [stream, streamVersion])   // streamVersion bump from store forces re-attach
```

### Sealed Interface Record Pattern (backend)

**Source:** `backend/src/main/java/com/vdt/webrtc/ws/message/CallStateChanged.java`
**Apply to:** All new room message records

```java
// Pattern: Java record implements ServerMessage or ClientMessage
public record CreateRoom(java.util.List<String> invitees) implements ClientMessage {}
public record JoinRoom(String roomId)                      implements ClientMessage {}
// No @JsonTypeInfo on the record itself — handled by the sealed interface annotation
```

### Integration Test Pattern — 2-SpringContext (backend)

**Source:** `backend/src/test/java/com/vdt/webrtc/ws/CrossInstanceCallTest.java`
**Apply to:** `CrossInstanceRoomTest.java`

```java
// Copy @BeforeAll static startAll() pattern (lines 52-64): containers → bootInstance x2
// Copy bootInstance() (lines 70-88): SpringApplicationBuilder.run() with container props
// Copy CollectingHandler.awaitMatching() (lines 241-258): BlockingQueue + Predicate poll
// Copy flushRedis() @BeforeEach (lines 108-113): isolate test state
// Copy awaitRouteRegistered() pattern (lines 151-165): poll Redis before assertions
```

### Lua Test Pattern — @SpringBootTest (backend)

**Source:** `backend/src/test/java/com/vdt/webrtc/call/CallStateMachineTest.java`
**Apply to:** `RoomStateMachineTest.java`

```java
// Copy: @SpringBootTest + @Import(TestcontainersConfiguration.class) (lines 17-18)
// Copy: @Autowired + @BeforeEach clean() flushAll (lines 21-28)
// Copy: CountDownLatch + AtomicInteger concurrency test (lines 89-115) for cap race
```

### Frontend Unit Test Pattern (frontend)

**Source:** `frontend/src/webrtc/PeerManager.test.ts`
**Apply to:** `MeshManager.test.ts`

```typescript
// Copy MockRTCPeerConnection class (lines 10-41): vi.fn() spies, settable state
// Copy vi.stubGlobal('RTCPeerConnection', ...) (line 49): browser API shim
// Copy vi.mock('../store/callStore', ...) (lines 43-45): mock store to avoid real Zustand
// For MeshManager tests: also mock '../store/roomStore' with same pattern
// For setSendersMaxBitrate: mock pc.getSenders() → spy, assert .setParameters() called
```

---

## No Analog Found

All Phase 7 files have strong analogs in the existing codebase. No files are without a pattern match.

---

## Metadata

**Analog search scope:** All directories under `frontend/src/` and `backend/src/`
**Files scanned:** ~90 source files (all TypeScript/TSX frontend + all Java backend)
**Key analog relationships:**
- `RoomService` ← `CallService` (exact role+data-flow match)
- `RoomRepository` ← `CallStateRepository` (exact)
- `join_room.lua` ← `create_call.lua` (exact — same Redis Lua atomic pattern)
- `roomStore` ← `callStore` (exact — Zustand shape)
- `roomActions` ← `callActions` (exact — module-scope non-serializable + server signal dispatch)
- `MeshManager` ← `callActions` module-scope + `PeerManager` class structure (role-match)
- `GroupCallPage` ← `CallPage` (exact — top bar + grid + control bar)
- `GroupInviteModal` ← `IncomingCallCard` (exact — overlay + card + buttons)
- `OutgoingGroupInviteCard` ← `SelfViewPreview` (exact — overlay + card + cancel)
- `ParticipantTile` ← `RemoteCamOffOverlay` + `CallPage` video pattern (role-match)
- `CrossInstanceRoomTest` ← `CrossInstanceCallTest` (exact — 2-context test harness)
- `RoomStateMachineTest` ← `CallStateMachineTest` (exact — SpringBootTest + Lua + concurrency)
- `MeshManager.test.ts` ← `PeerManager.test.ts` (exact — MockRTCPeerConnection + vi.mock)

**Pattern extraction date:** 2026-06-29
