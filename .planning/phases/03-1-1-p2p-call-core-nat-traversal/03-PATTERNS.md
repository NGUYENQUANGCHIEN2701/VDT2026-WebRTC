# Phase 3: 1-1 P2P Call Core & NAT Traversal - Pattern Map

**Mapped:** 2026-06-18
**Files analyzed:** 24 (new + modified)
**Analogs found:** 19 with strong analog / 24 total (5 are genuinely new — no analog)

> Source-of-truth note: where RESEARCH.md's proposed signaling names differ from the
> shipped envelope, this map favours the **actual codebase shape** (Phase 1-2 code).
> The planner should treat the *existing files' patterns* as binding and RESEARCH.md as
> the WebRTC-API reference.

---

## File Classification

### Backend (Java / Spring Boot 4)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `ws/message/ClientMessage.java` (MODIFY) | message-union | event-driven | itself + `ServerMessage.java` | exact (same file) |
| `ws/message/ServerMessage.java` (MODIFY) | message-union | event-driven | itself | exact (same file) |
| `ws/message/CallOffer.java` (NEW) | message-record | event-driven | `ws/message/Ping.java` / `SessionSuperseded.java` | exact |
| `ws/message/CallAccept.java` (NEW) | message-record | event-driven | `ws/message/SessionSuperseded.java` | exact |
| `ws/message/CallReject.java` (NEW) | message-record | event-driven | `ws/message/SessionSuperseded.java` | exact |
| `ws/message/CallCancel.java` (NEW) | message-record | event-driven | `ws/message/SessionSuperseded.java` | exact |
| `ws/message/HangUp.java` (NEW) | message-record | event-driven | `ws/message/SessionSuperseded.java` | exact |
| `ws/message/SdpMessage.java` (NEW) | message-record | event-driven (opaque blob) | `ws/message/PresenceSnapshot.java` | exact |
| `ws/message/IceCandidateMessage.java` (NEW) | message-record | event-driven (opaque blob) | `ws/message/PresenceSnapshot.java` | exact |
| `ws/SessionRegistry.java` (NEW, recommended) | registry/component | request-response | (sessions map inside `PresenceWebSocketHandler`) | role-match |
| `ws/LocalMessageRouter.java` (MODIFY) | router/service | request-response | `broadcast()` in same file | exact (same file) |
| `ws/PresenceWebSocketHandler.java` (MODIFY) | ws-handler | event-driven | itself (`handleTextMessage`) | exact (same file) |
| `ws/WebSocketConfig.java` (MODIFY) | config | — | itself | exact (same file) |
| `call/TurnController.java` (NEW) | controller | request-response | `user/UserController.java` + `admin/AdminController.java` | role-match |
| `call/TurnCredentialsResponse.java` (NEW) | dto-record | request-response | `auth/dto/AuthResponse.java`, `user/dto/UserProfile.java` | role-match |
| `config/SecurityConfig.java` (MODIFY, maybe) | config | — | itself | exact (same file) |
| `resources/application.yaml` (MODIFY) | config | — | itself (`jwt.*` block) | exact (same file) |

### Frontend (React 19 / TS)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `realtime/messages.ts` (MODIFY) | type-union | event-driven | itself | exact (same file) |
| `realtime/wsClient.ts` (MODIFY) | service/dispatcher | event-driven | itself (`onmessage`) | exact (same file) |
| `webrtc/PeerManager.ts` (NEW) | service (plain TS class) | streaming | `realtime/wsClient.ts` (module-level singleton outside React) | role-match |
| `webrtc/media.ts` (NEW) | utility | file-I/O (device) | — | no analog (greenfield WebRTC) |
| `webrtc/stats.ts` (NEW) | utility | transform | — | no analog (greenfield WebRTC) |
| `webrtc/signaling.ts` (NEW, optional sender) | utility | event-driven | `wsClient.ts` heartbeat `socket.send` | role-match |
| `store/callStore.ts` (NEW) | store (Zustand) | event-driven | `store/presenceStore.ts` | exact |
| `api/turn.ts` or inline (NEW) | api-call | request-response | `api/axios.ts` usage + `App.tsx` `api.get` | role-match |
| `pages/CallPage.tsx` (NEW) | page/component | streaming | `pages/HomePage.tsx`, `components/presence/OnlineUsersList.tsx` | role-match |
| `components/call/SelfViewPreview.tsx` (NEW) | component | streaming | `components/presence/OnlineUserRow.tsx` (inline-style) | role-match |
| `components/call/IncomingCallCard.tsx` (NEW) | component | event-driven | `components/presence/SessionKickNotice.tsx` (overlay) | role-match |
| `components/call/QualityIndicator.tsx` (NEW) | component | request-response | `components/presence/ConnectionIndicator.tsx` | exact (visual twin) |
| `components/call/DebugPanel.tsx` (NEW) | component | transform | `components/presence/ConnectionIndicator.tsx` | role-match |
| `components/call/MediaErrorNotice.tsx` (NEW) | component | — | `components/presence/SessionKickNotice.tsx` | role-match |
| `components/call/AudioOnlyBadge.tsx` (NEW) | component | — | `components/presence/StatusBadge.tsx` | role-match |
| `components/call/{HangUp,Nhan,TuChoi,Huy}Button.tsx` (NEW) | component | — | inline `<button>` in `OnlineUserRow`-style | role-match |
| `components/presence/OnlineUserRow.tsx` (MODIFY) | component | event-driven | itself | exact (same file) |
| `App.tsx` (MODIFY — add `/call` route) | router | — | itself | exact (same file) |
| `vite.config.ts` (MODIFY — HTTPS) | config | — | — | no analog (new HTTPS config) |
| `.env` / `.env.local` (MODIFY) | config | — | itself | exact (same file) |

### Tests (Wave 0 — write before implementation)

| New File | Role | Analog | Match Quality |
|----------|------|--------|---------------|
| `backend/.../ws/CallSignalingTest.java` (NEW) | integration test | `ws/WsIdentityTest.java` (extends `WsTestSupport`) | exact |
| `backend/.../call/TurnControllerTest.java` (NEW) | unit test | `auth/AuthControllerTest.java` | role-match |
| `frontend/src/webrtc/PeerManager.test.ts` (NEW) | unit test | `realtime/wsClient.test.ts` (mock-global pattern) | exact |
| `frontend/src/webrtc/media.test.ts` (NEW) | unit test | `realtime/wsClient.test.ts` | role-match |
| `frontend/src/webrtc/stats.test.ts` (NEW) | unit test | `realtime/wsClient.test.ts` | role-match |

---

## Pattern Assignments

### `ws/message/CallOffer.java` + all call message records (NEW, message-record, event-driven)

**Analog:** `backend/src/main/java/com/vdt/webrtc/ws/message/SessionSuperseded.java` (record with a field) and `Ping.java` (no-field record).

**Pattern to copy — single-line record implementing the sealed interface:**
```java
// SessionSuperseded.java (full file)
package com.vdt.webrtc.ws.message;

public record SessionSuperseded(String reason) implements ServerMessage {
}
```
- Client→server records (`CallOffer`, `CallAccept`, `CallReject`, `CallCancel`, `HangUp`) `implements ClientMessage`.
- Server→client variants implement `ServerMessage`.
- **`SdpMessage` / `IceCandidateMessage` carry an opaque payload.** Use a `JsonNode` (Jackson 3 `tools.jackson.databind.JsonNode`) or a typed sub-record so the server never parses SDP. The `to`/`from`/`callId` fields are first-class; the SDP/candidate body is opaque. Model on `PresenceSnapshot(List<OnlineUser> users)` for the "record wraps a payload object" shape.
- **`from` is NEVER a constructor field on the inbound (Client) record** — the server stamps `from` from the session principal when building the outbound (Server) variant (see WsIdentityTest below).

---

### `ws/message/ClientMessage.java` (MODIFY, message-union, event-driven)

**Analog:** itself — extend the existing `@JsonSubTypes` + `permits` list.

**Current state (full file):**
```java
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = Ping.class, name = "ping"),
})
public sealed interface ClientMessage permits Ping {
}
```

**Modification pattern (add permits + subtypes):**
- Annotations stay `com.fasterxml.jackson.annotation.*` (Jackson-annotation jar did NOT move to `tools.jackson` — confirmed by this file).
- Add each new record to BOTH `@JsonSubTypes` and the `permits` clause.
- Keep `@JsonIgnoreProperties(ignoreUnknown = true)` — lets a future field land without breaking deserialization.
- `ServerMessage.java` is the identical pattern minus `@JsonIgnoreProperties`.

---

### `ws/SessionRegistry.java` (NEW, registry, request-response)

**Analog:** the sessions map currently inlined in `PresenceWebSocketHandler.java`:
```java
// PresenceWebSocketHandler.java line 30
private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
// ... registered at line 41, removed at line 63
```

**Pattern:** Extract this `ConcurrentHashMap<String, WebSocketSession>` into a `@Component` so `LocalMessageRouter.sendToUser` can resolve a target session without coupling to the handler (RESEARCH Pattern 3, Option C). The handler then calls `registry.register/deregister` in `afterConnectionEstablished` / `afterConnectionClosed`, and `broadcastSnapshot` reads `registry.all()`. This is the natural Phase 6 (Redis) seam.

**Bean wiring style to copy** — constructor injection, `@Component`/`@Service`, as in `LocalMessageRouter`:
```java
@Service
public class LocalMessageRouter implements MessageRouter {
    private final ObjectMapper mapper;
    public LocalMessageRouter(ObjectMapper mapper) { this.mapper = mapper; }
}
```

---

### `ws/LocalMessageRouter.java` (MODIFY — implement `sendToUser`, router/service, request-response)

**Analog:** the `broadcast()` method in the **same file** — copy its serialize-once + per-session synchronized-send + open-check structure.

**Replace this stub (lines 51-54):**
```java
@Override
public void sendToUser(String userId, ServerMessage message) {
    throw new UnsupportedOperationException("sendToUser: để dành Phase 3 signaling");
}
```

**Copy the serialization + send pattern from `broadcast()` (lines 28-49):**
```java
String json;
try {
    json = mapper.writeValueAsString(message);
} catch (JacksonException e) {            // tools.jackson.core.JacksonException — UNCHECKED
    log.error("Không serialize được message", e);
    return;
}
TextMessage textMessage = new TextMessage(json);
// ... look up single session via SessionRegistry.get(userId), then:
synchronized (session) {                  // sendMessage is NOT thread-safe
    if (session.isOpen()) {
        session.sendMessage(textMessage);
    }
}
```
- Imports: `tools.jackson.databind.ObjectMapper`, `tools.jackson.core.JacksonException` (NOT `com.fasterxml`) — confirmed at lines 12-13 of this file.
- Resolve the target via the new `SessionRegistry` (or, fallback, a `sendToUser` method on the handler). When target is offline/absent: log and drop (matches `broadcast`'s best-effort error handling). RESEARCH Pattern 3 has the full method body.

---

### `ws/PresenceWebSocketHandler.java` (MODIFY — route call messages, ws-handler, event-driven)

**Analog:** `handleTextMessage` in the **same file** (lines 50-58).

**Current dispatch pattern to extend:**
```java
@Override
protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
    String username = username(session);
    ClientMessage clientMessage = mapper.readValue(message.getPayload(), ClientMessage.class);
    if (clientMessage instanceof Ping) {
        presence.heartbeat(username);
        router.broadcast(new Pong(), List.of(session));
    }
}
```

**Modification pattern:**
- Add `else if (clientMessage instanceof CallOffer co)` ... branches (Java 21 pattern matching — already used implicitly here; use record-pattern binding).
- For each call message: read `to` from the client record, stamp `from = username` (the authenticated principal via `username(session)` at line 74-76 — NEVER trust a client-supplied `from`), build the server-variant message, then `router.sendToUser(to, serverMessage)`.
- The server forwards SDP/ICE **opaquely** — copy the inbound opaque payload straight into the outbound record without inspecting it.
- Identity stamping is the load-bearing security rule — see Shared Patterns → Server-Owns-Identity.

---

### `call/TurnController.java` (NEW, controller, request-response)

**Analog:** `user/UserController.java` (uses `Authentication`/principal) + `admin/AdminController.java` (`@RestController` + `@RequestMapping("/api/...")` shape).

**Controller skeleton to copy (from UserController, lines 10-24):**
```java
@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserService userService;
    public UserController(UserService userService) { this.userService = userService; }

    @GetMapping("/me")
    public UserProfile getCurrentUser(Authentication authentication) {
        String username = authentication.getName();   // principal — same source for TURN username
        ...
    }
}
```

**Apply to TurnController:**
- `@RestController @RequestMapping("/api")`, `@GetMapping("/turn-credentials")`.
- Take `Authentication authentication` (project convention) — NOT `Principal` — and use `authentication.getName()` for the `userId` part of the TURN username. Matches UserController exactly.
- Read secret/server/TTL via `@Value("${turn.*}")` — copy the `@Value` injection style from `config/JwtService.java` lines 20-25:
```java
public JwtService(
        @Value("${jwt.secret}") String secret,
        @Value("${jwt.access-token-ttl-ms}") long accessTokenTtlMs) { ... }
```
- HMAC-SHA1 via `javax.crypto.Mac` — `JwtService` already uses `javax.crypto.SecretKey` + `StandardCharsets.UTF_8` (lines 3, 6, 30); mirror that crypto style. Full HMAC body in RESEARCH Pattern 5.
- `/api/turn-credentials` falls under `.anyRequest().authenticated()` in SecurityConfig (line 39) — no SecurityConfig change needed for auth (it's already protected). Only touch SecurityConfig if HTTPS work requires it.

---

### `call/TurnCredentialsResponse.java` (NEW, dto-record, request-response)

**Analog:** `auth/dto/AuthResponse.java`, `user/dto/UserProfile.java`, `admin/dto/UserSummary.java` — project DTOs are Java records in a `*/dto/` (or feature) package.

**Pattern:** `public record TurnCredentialsResponse(List<String> urls, String username, String credential) {}` — plain record, returned directly from the controller (Jackson 3 auto-serializes; same as UserController returning `UserProfile`).

---

### `realtime/messages.ts` (MODIFY, type-union, event-driven)

**Analog:** itself — extend both discriminated unions.

**Current (full file):**
```typescript
export type ServerMessage =
    | { type: 'presence'; users: OnlineUser[] }
    | { type: 'session-superseded'; reason: string }
    | { type: 'pong' }

export type ClientMessage = { type: 'ping' }
```

**Modification pattern:** add call variants to each union with a literal `type` discriminant. Server→client variants carry `from` + `callId`; client→server carry `to` + `callId`. SDP/candidate variants carry `sdp: RTCSessionDescriptionInit` / `candidate: RTCIceCandidateInit`. Full union in RESEARCH Pattern 4. The `wsClient.onmessage` switch keys off `msg.type` — keep variants exhaustive so TS narrows correctly.

---

### `realtime/wsClient.ts` (MODIFY — dispatch call messages, service, event-driven)

**Analog:** the `socket.onmessage` handler in the **same file** (lines 34-45) and the `socket.send` heartbeat (lines 81-85).

**Dispatch pattern to extend:**
```typescript
socket.onmessage = (e: MessageEvent) => {
    const msg = JSON.parse(e.data) as ServerMessage
    const store = usePresenceStore.getState()
    if (msg.type === 'presence') {
        store.setOnline(msg.users)
    } else if (msg.type === 'session-superseded') {
        ...
    }
}
```

**Modification pattern:**
- Add `else if (msg.type === 'call-offer-received' / 'call-accept' / 'call-reject' / 'call-cancel' / 'hang-up')` → route to `useCallStore.getState().<setter>(...)`.
- Add `else if (msg.type === 'sdp' / 'ice-candidate')` → forward to the `PeerManager` instance's `handleSignalingMessage(...)` (PeerManager lives outside React — same module-singleton style as this `wsClient` file itself).
- **Outbound send:** expose a `sendSignal(msg: ClientMessage)` helper that mirrors the heartbeat `socket.send(JSON.stringify({ type: 'ping' }))` at line 83 — guard on `socket.readyState === WebSocket.OPEN`. `PeerManager`/UI call this to emit `call-offer`, `sdp`, `ice-candidate`, etc.
- Keep using `import.meta.env.VITE_WS_URL` (line 25) — for WSS, only the env value changes, not this code.

---

### `webrtc/PeerManager.ts` (NEW, service / plain TS class, streaming)

**Analog:** `realtime/wsClient.ts` — the project's established "module-level service outside React that reads/writes a Zustand store via `getState()`" pattern. CONTEXT.md and CLAUDE.md mandate this exact shape for the peer manager.

**Pattern to copy from wsClient.ts:**
- Module-singleton state held in module scope (wsClient holds `let socket`, `heartbeatTimer`, `backoff` at lines 10-14) — PeerManager holds `RTCPeerConnection`, `MediaStream`, `pendingCandidates`, the negotiation flags. **None of these go in Zustand** (CLAUDE.md mandate; RESEARCH Anti-Patterns).
- Call into the store via `getState()` from event callbacks, exactly like `usePresenceStore.getState().setConnState?.('open')` at line 30 — PeerManager's `oniceconnectionstatechange` → `useCallStore.getState().setCallState('connected')`.
- Emit signaling via the `wsClient.sendSignal(...)` helper (mirrors `socket.send` at line 83).

**Perfect negotiation + candidate buffering body:** copy verbatim from RESEARCH Pattern 1 (the MDN-adapted class) and Pattern 2. Polite/impolite: **callee is always polite** (UI-SPEC Interaction Pattern 2.d; RESEARCH A2). This is the CLAUDE.md "from commit one" mandate — do not retrofit.

---

### `webrtc/media.ts` (NEW, utility, device I/O) — NO ANALOG

No existing media-device code. Build from RESEARCH Pattern 7 (`acquireMedia()` error taxonomy + audio-only fallback). UI copy/labels are fixed in UI-SPEC Copywriting Contract (5 error types, Vietnamese). Self-view mirror is CSS `transform: scaleX(-1)` (UI-SPEC SelfViewPreview), not a media-layer concern.

---

### `webrtc/stats.ts` (NEW, utility, transform) — NO ANALOG

No existing getStats code. Build from RESEARCH Pattern 6 (poll cadence 1000ms; RTT/loss from `remote-inbound-rtp`; bitrate delta from `outbound-rtp`; ICE type via `transport → candidate-pair → local-candidate`). DebugPanel toggles polling on/off (UI-SPEC Interaction Pattern 4.4).

---

### `store/callStore.ts` (NEW, Zustand store, event-driven)

**Analog:** `store/presenceStore.ts` (full file is the template).

**Pattern to copy (full file):**
```typescript
import { create } from 'zustand'

export type ConnectionState = 'connecting' | 'open' | 'closed'

interface PresenceState {
    onlineUsers: OnlineUser[]
    connectionState: ConnectionState
    kicked: boolean
    setOnline: (users: OnlineUser[]) => void
    setConnState: (state: ConnectionState) => void
    setKicked: (kicked: boolean) => void
}

export const usePresenceStore = create<PresenceState>((set) => ({
    onlineUsers: [],
    connectionState: 'connecting',
    kicked: false,
    setOnline: (users) => set({ onlineUsers: users }),
    setConnState: (connectionState) => set({ connectionState }),
    setKicked: (kicked) => set({ kicked }),
}))
```

**Apply to callStore:**
- State: `callState: 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'reconnecting' | 'failed'`, `remoteUserId: string | null`, `callId: string | null`, `mediaMode: 'av' | 'audio-only' | null`, plus serializable stats numbers.
- **ONLY serializable derived state** — `RTCPeerConnection`/`MediaStream` stay in PeerManager (CLAUDE.md mandate; UI-SPEC Interaction Pattern 6 "Important" note).
- ICE→callState mapping table is in UI-SPEC Interaction Pattern 6.

---

### `pages/CallPage.tsx` + `components/call/*` (NEW, page/components, streaming)

**Analogs (inline-style baseline — no Tailwind/shadcn, confirmed by UI-SPEC):**

| New component | Closest analog | What to copy |
|---------------|----------------|--------------|
| `QualityIndicator.tsx` | `components/presence/ConnectionIndicator.tsx` | Near-identical: `role="status" aria-live="polite"`, 8px dot + colored text, a `Record<state,{color,text}>` map. |
| `IncomingCallCard.tsx` | `components/presence/SessionKickNotice.tsx` (overlay) + `OnlineUsersList.tsx` (centered card) | fixed-overlay + centered card; add `role="dialog" aria-modal`. |
| `MediaErrorNotice.tsx` | `SessionKickNotice.tsx` | `role="alert"`, inline-styled card, Vietnamese copy. |
| `AudioOnlyBadge.tsx` | `components/presence/StatusBadge.tsx` | small inline-styled pill. |
| Buttons (`HangUp/Nhan/TuChoi/Huy`) | inline `<button>` style + `OnlineUserRow.tsx` inline styling | inline `style={{}}`, no CSS classes. |
| `SelfViewPreview.tsx` / `CallPage.tsx` | `pages/HomePage.tsx` (page layout) + `OnlineUsersList.tsx` | flex layout, inline styles, CSS vars. |

**`ConnectionIndicator.tsx` is the canonical visual twin for `QualityIndicator` (full file):**
```typescript
const MAP: Record<ConnectionState, { color: string; text: string }> = {
    connecting: { color: '#6b7280', text: 'Đang kết nối...' },
    open: { color: '#16a34a', text: 'Đã kết nối' },
    closed: { color: '#dc2626', text: 'Đang kết nối lại...' },
}
export default function ConnectionIndicator() {
    const state = usePresenceStore((s) => s.connectionState)
    const { color, text } = MAP[state]
    return (
        <div role="status" aria-live="polite"
             style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ... fontWeight: 600 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ color }}>{text}</span>
        </div>
    )
}
```
- All styling = inline `style={{}}` objects + `index.css` CSS variables (`var(--bg)`, `var(--code-bg)`, `var(--accent)`, `var(--border)`, `var(--text-h)`, `var(--mono)`). No new styling tooling (UI-SPEC Design System).
- All copy Vietnamese (UI-SPEC Copywriting Contract — exact strings provided there).
- Exact dimensions/colors/spacing are fully specified in UI-SPEC Component Inventory — the planner reads styling specs from UI-SPEC, structure/patterns from these analogs.

---

### `OnlineUserRow.tsx` (MODIFY — add "Gọi" button) + `App.tsx` (MODIFY — add `/call` route)

**OnlineUserRow analog:** itself (lines 7-24). Add an inline-styled accent "Gọi" `<button>` after `<StatusBadge>`, visible only when `user.status === 'ONLINE'` and not self. Disabled state styling in UI-SPEC Screen 1.

**App.tsx analog:** itself (lines 61-72). Add `<Route path="/call" element={<ProtectedRoute><CallPage /></ProtectedRoute>} />` — copy the existing `/` route's `ProtectedRoute` wrapping pattern exactly:
```typescript
<Route path="/" element={
  <ProtectedRoute><HomePage /></ProtectedRoute>
} />
```

---

### `api/turn.ts` (NEW or inline, api-call, request-response)

**Analog:** `App.tsx` usage `await api.get('/api/users/me')` (line 46) + `api/axios.ts` (the configured client with JWT interceptor).

**Pattern:** `const res = await api.get<TurnCredentialsResponse>('/api/turn-credentials')`. The `api` instance auto-attaches the Bearer token (axios.ts request interceptor lines 12-18) and handles 401-refresh — no per-call auth needed. Call this once before constructing the `RTCPeerConnection` (RESEARCH Pattern 5 frontend snippet).

---

## Shared Patterns

### Server-Owns-Identity (the load-bearing security rule)
**Source:** `ws/PresenceWebSocketHandler.java` lines 74-76 (`username(session)`) + proven by `ws/WsIdentityTest.java`.
**Apply to:** every call-message route in the handler; TurnController.
```java
// PresenceWebSocketHandler.java
private String username(WebSocketSession session) {
    return (String) session.getAttributes().get("username");
}
```
The server stamps `from` from the authenticated session — **never** from the client body. WsIdentityTest asserts a spoofed `"from":"bob"` is ignored. Same rule: TurnController derives the TURN username's userId from `authentication.getName()`, not from any request param.

### Jackson 3 / Boot 4 (recurring gotcha)
**Source:** `ws/LocalMessageRouter.java` lines 12-13; `PresenceWebSocketHandler.java` line 21.
**Apply to:** all new backend code touching JSON (records, router, handler, TurnController if it serializes).
- Inject/import `tools.jackson.databind.ObjectMapper` and catch unchecked `tools.jackson.core.JacksonException`.
- BUT `@JsonTypeInfo` / `@JsonSubTypes` / `@JsonIgnoreProperties` stay `com.fasterxml.jackson.annotation.*` (confirmed in `ServerMessage.java` / `ClientMessage.java`).

### Constructor injection + `@Service`/`@Component`/`@RestController`
**Source:** `LocalMessageRouter` (ctor inject), `UserController` (ctor inject), `JwtService` (`@Value` ctor inject).
**Apply to:** SessionRegistry, TurnController. No field injection; no Lombok `@RequiredArgsConstructor` (existing code writes explicit constructors).

### Module-singleton-outside-React + `store.getState()` callback bridge
**Source:** `realtime/wsClient.ts` (whole file) — module-scope mutable state, `useXStore.getState().setter()` from socket callbacks.
**Apply to:** `PeerManager.ts`, `webrtc/signaling.ts`. Non-serializable objects (`RTCPeerConnection`, `MediaStream`, sockets, timers) live in module scope; only serializable derived state crosses into Zustand.

### Zustand store shape
**Source:** `store/presenceStore.ts` (whole file).
**Apply to:** `callStore.ts`. `create<State>((set) => ({...}))`, flat setters, typed state interface, exported `useXStore`.

### Inline-style + CSS-variable components (no styling library)
**Source:** every file under `components/presence/` (esp. `ConnectionIndicator.tsx`, `OnlineUserRow.tsx`).
**Apply to:** all `components/call/*` + `CallPage.tsx`. `style={{}}` objects, `var(--*)` from `index.css`, `role`/`aria-*` for a11y, Vietnamese copy.

### `@Value` config injection + env-with-default
**Source:** `JwtService.java` lines 20-25; `application.yaml` lines 26-31 (`${ENV:default}`).
**Apply to:** TurnController (`turn.secret`, `turn.server`, `turn.credential-ttl-seconds`) and the new `turn:` block in `application.yaml`. Copy the `${TURN_SECRET:dev-default}` shape used by `jwt.secret`.

---

## Test Patterns

### Backend integration — `CallSignalingTest.java`
**Source:** `ws/WsIdentityTest.java` + base `ws/WsTestSupport.java`.
**Copy:** `extends WsTestSupport`; `mintToken(username)`, `connect(token, new CollectingHandler())`, `handler.awaitMatching(predicate, timeoutMs)` (handles full-snapshot noise). Drive two clients (caller alice, callee bob); assert a `call-offer` from alice arrives at bob's handler via `sendToUser`, carrying server-stamped `from:"alice"`. The two-client + CollectingHandler pattern is in WsIdentityTest lines 12-23.

### Backend unit — `TurnControllerTest.java`
**Source:** `auth/AuthControllerTest.java` (controller-test conventions). Assert HMAC-SHA1 formula: `credential == base64(HMAC-SHA1(secret, "expiry:userId"))` — recompute independently and compare.

### Frontend unit — `PeerManager.test.ts` / `media.test.ts` / `stats.test.ts`
**Source:** `realtime/wsClient.test.ts` (the project's mock-global + Zustand-mock template).
**Copy these techniques (verbatim shape):**
- `vi.stubGlobal('WebSocket', MockWebSocket)` → `vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)` / mock `navigator.mediaDevices.getUserMedia`.
- A hand-written `class MockWebSocket` with an `instances[]` static + `receive()` helper (lines 6-20) → analogous `MockRTCPeerConnection` exposing event hooks + a `getStats()` returning a mock `RTCStatsReport` (Map).
- `vi.hoisted` + `vi.mock('../store/...')` to stub the Zustand store (lines 24-33) → mock `callStore` the same way.
- `vi.useFakeTimers()` / `advanceTimersByTime` for stats poll cadence (lines 41, 66).
- `beforeEach`/`afterEach` reset + `vi.unstubAllGlobals()` (lines 35-48).

---

## No Analog Found

| File | Role | Data Flow | Reason / Source to use instead |
|------|------|-----------|-------------------------------|
| `webrtc/media.ts` | utility | device I/O | First getUserMedia code in repo → RESEARCH Pattern 7 |
| `webrtc/stats.ts` | utility | transform | First getStats code in repo → RESEARCH Pattern 6 |
| `webrtc/PeerManager.ts` (RTCPeerConnection internals) | service | streaming | Structure follows wsClient.ts; WebRTC body from RESEARCH Patterns 1-2 (MDN perfect negotiation) |
| `vite.config.ts` HTTPS block | config | — | No existing HTTPS config → RESEARCH Pattern 8 (mkcert) |
| `coturn/turnserver.conf` + docker-compose `coturn` service | infra | — | No existing coturn → RESEARCH Pattern 9 (host-mode, relay range) |

---

## Metadata

**Analog search scope:** `backend/src/main/java/com/vdt/webrtc/{ws,call,user,admin,auth,config}`, `backend/src/test/java/.../ws`, `frontend/src/{realtime,store,components,pages,routes,api}`, `backend/src/main/resources`.
**Files scanned:** 31 backend Java + 19 frontend TS/TSX + 1 application.yaml read in full or targeted.
**Pattern extraction date:** 2026-06-18
