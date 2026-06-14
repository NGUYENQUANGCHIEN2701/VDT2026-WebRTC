# Phase 2: Realtime Presence & WebSocket Layer - Research

**Researched:** 2026-06-14
**Domain:** Spring Framework 7 / Spring Boot 4 raw WebSocket signaling, in-memory presence, native browser WebSocket client
**Confidence:** HIGH (API surface verified against existing codebase + Spring docs; all decisions locked in CONTEXT.md)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Presence storage & scale seam):** Presence runs on a **local in-memory implementation behind a `PresenceService` interface** (in-memory `Map` of userId → last-seen + a scheduled sweeper). **Redis is NOT introduced in Phase 2** — the interface is the design-for-scale seam; Phase 6 swaps in the Redis TTL implementation. PRES-02's "Redis TTL heartbeat" wording is satisfied at Phase 6; Phase 2 reproduces the same *behavior* (~60s auto-offline) with the local impl. Same pattern applies to `MessageRouter` (local now, Redis pub/sub Phase 6).
- **D-02 (Single-session policy, PRES-03):** When a user opens a new session, the server **pushes a control message** (e.g. `session-superseded` / "đăng nhập ở nơi khác") to the OLD WebSocket, **then closes it**. The old tab shows a notice and **redirects to /login**. Not a silent disconnect.
- **D-03 (Online list status & update model, PRES-01):** The server pushes a **full snapshot** of the online-user list on every change (join/leave/status). Not delta events. The status field is a **forward-compatible enum**: `ONLINE` now; `IN_CALL` is wired in Phase 4 (Phase 2 only emits ONLINE/offline).
- **D-04 (Offline detection timing, PRES-02):** Heartbeat interval **~25s**; a user is marked **offline after ~60s** with no heartbeat (≈2 missed beats).

### Claude's Discretion
- **WS auth token transport** at handshake (query param vs `Sec-WebSocket-Protocol` subprotocol) — researcher/planner choose; reuse the existing in-memory JWT (Phase 1 D-03). Validate with the same `JwtService`. Reject the upgrade if token invalid/expired. **→ Research recommends query param (`?token=`) for Phase 2; see "Pattern 1" + the STAB-05 v2 hardening note.**
- **MessageRouter / PresenceService interface shape** (method signatures) — design so the Redis impl is a drop-in swap in Phase 6 (no caller changes). **→ Concrete interface shapes proposed below.**
- **Signaling message envelope** — sealed interface + records + Jackson `@JsonTypeInfo` per CLAUDE.md. **→ Concrete envelope proposed below.**
- **Heartbeat protocol** (ping/pong frames vs app-level heartbeat message) and reconnect/backoff details on the client WS wrapper. **→ Research recommends app-level JSON `ping`/`pong`; see "Pattern 5".**
- Raw `TextWebSocketHandler` + JSON (NOT STOMP) per CLAUDE.md tech-stack decision.

### Deferred Ideas (OUT OF SCOPE)
- Redis-backed presence + cross-instance pub/sub routing → Phase 6.
- Actual call signaling payloads over the WS → Phase 3.
- `IN_CALL` status wiring (depends on call state machine) → Phase 4.
- One-time WebSocket ticket auth (STAB-05, v2) — replaces query-param JWT; out of scope now.

None of these are in Phase 2 scope — only the abstractions/seam are built now.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-04 | WebSocket connections are authenticated at handshake; server binds identity server-side (client `from` field never trusted) | `HandshakeInterceptor` validates the Phase 1 JWT via existing `JwtService`, puts username into handshake attributes; `TextWebSocketHandler` reads it from `session.getAttributes()` — never from the message body. Pattern 1 + Pattern 2. |
| PRES-01 | User sees a realtime list of online users with their status (online / in-call) | `PresenceService` (local impl) + full-snapshot broadcast via `MessageRouter` on every join/leave. Forward-compatible `PresenceStatus` enum (ONLINE now). Pattern 3 + Pattern 6. |
| PRES-02 | Presence tracked via TTL heartbeat — crashed clients go offline automatically within ~60s | App-level `ping`/`pong` (25s client interval) refreshes last-seen; `@Scheduled` sweeper marks offline after 60s. Local impl mirrors the Phase 6 Redis-TTL behavior. Pattern 4 + Pattern 5. |
| PRES-03 | Only one active session per user — opening a new tab/device kicks the old session | On `afterConnectionEstablished`, if a session already exists for the userId, send `session-superseded` to the old session then `close()` it. Pattern 2 (single-session). |
</phase_requirements>

## Summary

Phase 2 builds a JWT-authenticated raw-WebSocket layer on the existing Spring Boot 4.0.7 / Java 21 backend and a native-WebSocket client on the React 19 / Vite frontend. There is **no new runtime infrastructure** — no Redis, no RabbitMQ, no new Docker service. Presence and message routing are local in-memory implementations behind interfaces (`PresenceService`, `MessageRouter`) that Phase 6 swaps for Redis without touching callers.

The backend adds exactly one Maven dependency, `spring-boot-starter-websocket` (BOM-managed, no version pin needed). The WebSocket API used — `WebSocketConfigurer`, `TextWebSocketHandler`, `HandshakeInterceptor`, `WebSocketSession` — is unchanged in Spring Framework 7 from 6.x, so existing tutorials translate directly [VERIFIED: docs.spring.io/spring-boot/reference/messaging/websockets.html]. Authentication happens **at the handshake** (an interceptor validates the token with the existing `JwtService` and stamps the username into handshake attributes), not in the Spring Security filter chain — so the WS endpoint path must be `permitAll()` in `SecurityConfig`, with the interceptor as the real gate. The frontend adds **zero npm dependencies**: native `WebSocket` plus a ~50-line reconnect/heartbeat wrapper, reading the in-memory access token from the existing Zustand `authStore` exactly like `axios.ts` does today.

The two highest-risk areas are (1) **thread-safety of the sessions map** — `TextWebSocketHandler` callbacks run on container I/O threads concurrently, and the `@Scheduled` sweeper runs on yet another thread, so all shared state must be a `ConcurrentHashMap` and `WebSocketSession.sendMessage` must be synchronized per session; and (2) **the token-in-query-string trade-off** — convenient and the documented v1 approach, but the URL (and thus token) can land in access logs, so it must be flagged and is explicitly slated for hardening in v2 (STAB-05).

**Primary recommendation:** Add `spring-boot-starter-websocket`; register one handler at `/ws` behind a `JwtHandshakeInterceptor`; build `PresenceService`/`MessageRouter` interfaces with `ConcurrentHashMap` local impls and a `@Scheduled` sweeper; model all WS messages as a sealed interface of records with Jackson `@JsonTypeInfo`; on the frontend write a native-WebSocket service module with exponential-backoff reconnect and a 25s heartbeat, feeding a Zustand `presenceStore`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WS handshake authentication | API / Backend (`HandshakeInterceptor`) | — | Identity must be server-owned (AUTH-04); browser cannot be trusted to assert who it is. |
| Session→user binding | API / Backend (`WebSocketSession` attributes) | — | Server attributes every message from the authenticated principal; client `from` is ignored. |
| Presence state (who is online) | API / Backend (`PresenceService`, in-memory) | Database/Storage (Phase 6: Redis) | Authoritative presence lives server-side; local map now, Redis later — interface is the seam. |
| Offline detection (TTL sweep) | API / Backend (`@Scheduled` sweeper) | — | Server decides offline; client only sends heartbeats, never declares its own presence. |
| Online-list snapshot broadcast | API / Backend (`MessageRouter`) | — | Fan-out is a server concern; local loop now, Redis pub/sub in Phase 6. |
| Heartbeat origination | Browser/Client (25s timer) | — | Client proves liveness; server interprets. |
| Reconnect/backoff | Browser/Client (WS wrapper) | — | Network resilience is a client concern (STAB-01 groundwork). |
| Presence rendering + kick handling | Browser/Client (Zustand + HomePage) | — | UI state derived from server snapshots; kick → redirect to /login. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spring-boot-starter-websocket` | BOM-managed (Boot 4.0.7) | Raw WebSocket server (`WebSocketConfigurer`, `TextWebSocketHandler`, `HandshakeInterceptor`) | The single official starter for MVC WebSocket support; pulls `spring-websocket` + Tomcat WS. Artifact name unchanged in Boot 4 (no `-webmvc` rename for this one) [VERIFIED: docs.spring.io/spring-boot/reference/messaging/websockets.html]. |
| Jackson (`jackson-databind`) | via Boot BOM | JSON (de)serialization of the sealed message envelope incl. `@JsonTypeInfo` | Already on the classpath via `spring-boot-starter-webmvc`; `ObjectMapper` is an injectable bean. [VERIFIED: present in existing app] |
| `JwtService` (existing) | in-repo | Validate the handshake JWT (`isTokenValid` / `extractUsername`) | Reuse Phase 1 code — zero new auth surface (CONTEXT D-01 / Phase 1 D-03). [VERIFIED: backend/.../config/JwtService.java] |
| Spring `@Scheduled` | via `spring-context` (already present) | Presence sweeper (~60s TTL) | No new dependency; enable with `@EnableScheduling`. [VERIFIED: spring-context on classpath via Boot] |
| Native `WebSocket` (browser) | platform | Frontend WS client | CLAUDE.md mandate: native WebSocket + own reconnect wrapper, not socket.io/reconnecting-websocket. Zero new npm deps. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zustand (existing) | 5.0.14 | `presenceStore` (online list, connection state) | Already a dependency; the WS service module mutates it from outside React via `getState()`, mirroring `axios.ts`. [VERIFIED: frontend/package.json] |
| `spring-websocket` `StandardWebSocketClient` | via the websocket starter | Integration-test two fake clients against the live handler | Highest-value backend test for this phase (CLAUDE.md testing table). |
| Lombok (existing) | BOM | Reduce handler/service boilerplate (optional; prefer records for DTOs) | Already present. [VERIFIED: pom.xml] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `TextWebSocketHandler` + JSON | Spring STOMP + simple broker | **Rejected by CLAUDE.md** — in-memory broker doesn't scale across instances; hides the mechanics being learned; STOMP relay conflicts with the decided Redis pub/sub path. |
| App-level JSON `ping`/`pong` | Native WebSocket `PingMessage`/`PongMessage` frames | Native frames are lower-overhead but harder to drive from the browser (`WebSocket` API can't send ping frames; only the server can), and harder to assert in tests. App-level keeps client + server symmetric and observable. **Recommend app-level.** |
| Token via `?token=` query param | `Sec-WebSocket-Protocol` subprotocol header | Subprotocol keeps the token out of URLs/logs but the browser `WebSocket` constructor only accepts protocol *names* (no spaces/dots in some impls) so the token must be smuggled as a fake protocol — awkward and easy to get wrong. Query param is simpler and the documented v1 approach; **recommend query param now, harden to one-time ticket in v2 (STAB-05).** |
| Native WebSocket + own wrapper | socket.io-client / reconnecting-websocket | **Rejected by CLAUDE.md** — socket.io is a different wire protocol (won't talk to Spring WebSocket); reconnecting-websocket is stale. |

**Installation (backend — the only new dependency):**
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>
```
No `<version>` — managed by `spring-boot-starter-parent` 4.0.7. **Frontend: no new packages.**

**Version verification (do at setup):**
```bash
./mvnw -q dependency:tree -Dincludes=org.springframework:spring-websocket   # confirm spring-websocket 7.x resolves under Boot 4.0.7
```
Boot 4.0.7 is the locked parent in `backend/pom.xml` [VERIFIED: backend/pom.xml line 8]. Maven Central lists `spring-boot-starter-websocket` through the current Boot 4.x line [CITED: central.sonatype.com/artifact/org.springframework.boot/spring-boot-starter-websocket]. The starter is BOM-versioned, so no manual pin is needed and slopcheck/registry concerns do not apply (first-party Spring artifact).

## Package Legitimacy Audit

> Phase 2 adds **one** backend dependency (a first-party Spring starter) and **zero** frontend dependencies. No third-party/community packages are introduced.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `org.springframework.boot:spring-boot-starter-websocket` | Maven Central | 10+ yrs | very high (Spring core) | github.com/spring-projects/spring-boot | n/a (first-party, BOM-managed) | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*No npm/PyPI packages added; no slopcheck run required. The single Maven artifact is a first-party Spring Boot starter pinned transitively by the locked `spring-boot-starter-parent:4.0.7`.*

## Architecture Patterns

### System Architecture Diagram

```
 BROWSER (React 19 / Vite)                          BACKEND (Spring Boot 4.0.7, Java 21)
 ┌───────────────────────────┐                      ┌──────────────────────────────────────────┐
 │ presenceStore (Zustand)   │                      │  SecurityConfig: /ws/** -> permitAll()     │
 │   onlineUsers[], connState│                      │  (real gate is the interceptor, not SF)    │
 └─────────▲─────────────────┘                      └───────────────┬────────────────────────────┘
           │ snapshot/kick                                          │ HTTP Upgrade  ?token=<JWT>
           │                                                        ▼
 ┌─────────┴─────────────────┐   ws://host/ws       ┌──────────────────────────────────────────┐
 │ wsClient.ts (native WS)   │ ───── Upgrade ─────► │ JwtHandshakeInterceptor.beforeHandshake()  │
 │  • reads token (authStore)│                      │   • JwtService.isTokenValid(token)?         │
 │  • 25s heartbeat ping     │ ◄─── 101 / 401 ───── │   • yes: attrs["username"]=subject -> 101   │
 │  • expo-backoff reconnect │                      │   • no : return false -> handshake rejected │
 └─────────┬─────────────────┘                      └───────────────┬────────────────────────────┘
           │ JSON frames                                            ▼
           │  {type:ping}                          ┌──────────────────────────────────────────┐
           │  {type:hello}                         │ PresenceWebSocketHandler (TextWebSocketHandler)
           └──────────────────────────────────────►│  afterConnectionEstablished:               │
                                                   │    user=session.attrs["username"]          │
                                                   │    single-session: kick old session map[u] │
                                                   │    sessions.put(u, session); presence.join │
                                                   │  handleTextMessage: ping->pong; refresh    │
                                                   │  afterConnectionClosed: sessions.remove;   │
                                                   │    presence.leave -> broadcast             │
                                                   └───────┬───────────────────┬────────────────┘
                                                           │                   │
                                          ┌────────────────▼──────┐   ┌────────▼─────────────────┐
                                          │ PresenceService (iface)│   │ MessageRouter (iface)    │
                                          │  LocalPresenceService:  │   │  LocalMessageRouter:     │
                                          │   ConcurrentHashMap     │   │   iterate sessions map,  │
                                          │   <userId,lastSeen>     │   │   sendMessage(snapshot)  │
                                          └────────────▲────────────┘   └──────────────────────────┘
                                                       │ markOffline(stale)
                                          ┌────────────┴────────────┐
                                          │ @Scheduled sweeper      │
                                          │  every ~20s: evict      │
                                          │  lastSeen<now-60s ->    │
                                          │  leave + broadcast      │
                                          └─────────────────────────┘
 (Phase 6 swap point: Local*Service -> Redis*Service; callers + handler unchanged)
```

The reader can trace the primary use case: token-bearing upgrade → interceptor validates → handler registers session and updates presence → router broadcasts the full snapshot to every session → all clients' Zustand stores re-render the online list.

### Recommended Project Structure
```
backend/src/main/java/com/vdt/webrtc/
├── ws/                              # WebSocket transport layer
│   ├── WebSocketConfig.java         # @EnableWebSocket; registerWebSocketHandlers("/ws") + interceptor
│   ├── JwtHandshakeInterceptor.java # validates JWT, stamps username into handshake attributes
│   ├── PresenceWebSocketHandler.java# TextWebSocketHandler: lifecycle + single-session + ping/pong
│   ├── MessageRouter.java           # interface (fan-out seam)
│   ├── LocalMessageRouter.java      # in-memory impl: iterate sessions, sendMessage
│   └── message/                     # the sealed envelope
│       ├── ServerMessage.java       # sealed interface (@JsonTypeInfo) — server→client
│       ├── ClientMessage.java       # sealed interface (@JsonTypeInfo) — client→server
│       ├── PresenceSnapshot.java    # record (type "presence") : List<OnlineUser>
│       ├── SessionSuperseded.java   # record (type "session-superseded")
│       ├── Pong.java / Ping.java    # records (type "pong" / "ping")
│       └── OnlineUser.java          # record(username, PresenceStatus)
└── presence/
    ├── PresenceService.java         # interface (scale seam)
    ├── LocalPresenceService.java    # ConcurrentHashMap<String,Long> userId->lastSeen
    ├── PresenceStatus.java          # enum { ONLINE, IN_CALL }  (IN_CALL unused until Phase 4)
    └── PresenceSweeper.java         # @Scheduled component (or @Scheduled method on the service)

frontend/src/
├── realtime/
│   ├── wsClient.ts                  # native WebSocket wrapper: connect, reconnect(backoff), heartbeat
│   └── messages.ts                  # TS discriminated-union types mirroring the server envelope
├── store/
│   └── presenceStore.ts            # Zustand: onlineUsers[], connectionState, kicked flag
└── pages/
    └── HomePage.tsx                 # subscribe to presenceStore, render online list, handle kick→/login
```

### Pattern 1: JWT-authenticated handshake (AUTH-04)
**What:** A `HandshakeInterceptor` runs during the HTTP→WS upgrade. It extracts the token from the `?token=` query param, validates it with the existing `JwtService`, and—on success—copies the username into the `attributes` map (which becomes `WebSocketSession.getAttributes()`). On failure it returns `false`, which makes Spring reject the upgrade.
**When to use:** Always — this is the only place identity is established. The handler trusts `session.getAttributes().get("username")` and nothing from the message body.
**Example:**
```java
// Source: pattern per docs.spring.io/spring-framework/reference/7.0/web/websocket.html (HandshakeInterceptor)
//         + reuse of existing JwtService [VERIFIED: backend/.../config/JwtService.java]
public class JwtHandshakeInterceptor implements HandshakeInterceptor {
    private final JwtService jwtService;
    public JwtHandshakeInterceptor(JwtService jwtService) { this.jwtService = jwtService; }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String token = UriComponentsBuilder.fromUri(request.getURI()).build()
                .getQueryParams().getFirst("token");
        if (token == null || !jwtService.isTokenValid(token)) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);   // 401, upgrade rejected
            return false;
        }
        attributes.put("username", jwtService.extractUsername(token)); // server-owned identity
        return true;
    }
    @Override public void afterHandshake(ServerHttpRequest req, ServerHttpResponse res,
                                         WebSocketHandler h, Exception ex) { }
}
```
Registration:
```java
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final PresenceWebSocketHandler handler;
    private final JwtService jwtService;
    // ctor injection...
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws")
                .addInterceptors(new JwtHandshakeInterceptor(jwtService))
                .setAllowedOrigins(/* the frontend origin(s) */);   // do NOT use "*" with credentials
    }
}
```
And `SecurityConfig` must let the upgrade through to the interceptor:
```java
.requestMatchers("/ws/**").permitAll()   // auth is enforced by JwtHandshakeInterceptor, not Spring Security
```
[VERIFIED: necessity confirmed — a documented Spring Security issue is that WS endpoints 401 unless explicitly permitted; the handshake interceptor is the real gate — github.com/spring-projects/spring-security/issues/14971]

### Pattern 2: Handler lifecycle, session tracking, and single-session enforcement (PRES-03)
**What:** `TextWebSocketHandler` exposes `afterConnectionEstablished`, `handleTextMessage`, `afterConnectionClosed`. Track sessions in `ConcurrentHashMap<String userId, WebSocketSession>`. On a new connection for a userId already in the map, send `session-superseded` to the old session, close it, then install the new one.
**When to use:** Core of the phase.
**Example:**
```java
// Source: TextWebSocketHandler lifecycle per Spring Framework 7 WebSocket docs;
//         single-session/kick pattern per CONTEXT D-02
@Component
public class PresenceWebSocketHandler extends TextWebSocketHandler {
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final PresenceService presence;
    private final MessageRouter router;
    private final ObjectMapper mapper;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String user = (String) session.getAttributes().get("username");
        WebSocketSession old = sessions.put(user, session);     // atomic replace
        if (old != null && old.isOpen() && !old.getId().equals(session.getId())) {
            sendJson(old, new SessionSuperseded("đăng nhập ở nơi khác"));
            try { old.close(new CloseStatus(4001, "superseded")); } catch (IOException ignored) {}
        }
        presence.join(user);
        router.broadcast(presence.snapshot(), sessions.values());  // full snapshot to all
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage msg) throws Exception {
        String user = (String) session.getAttributes().get("username");
        ClientMessage in = mapper.readValue(msg.getPayload(), ClientMessage.class);
        if (in instanceof Ping) {                       // app-level heartbeat
            presence.heartbeat(user);                   // refresh last-seen
            sendJson(session, new Pong());
        }
        // server attributes everything to `user` — client-supplied `from` is never read (AUTH-04)
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String user = (String) session.getAttributes().get("username");
        // only remove if THIS session is still the registered one (avoid removing the superseding session)
        sessions.remove(user, session);
        presence.leave(user);
        router.broadcast(presence.snapshot(), sessions.values());
    }

    private void sendJson(WebSocketSession s, ServerMessage m) throws IOException {
        synchronized (s) {                              // sendMessage is NOT thread-safe per-session
            if (s.isOpen()) s.sendMessage(new TextMessage(mapper.writeValueAsString(m)));
        }
    }
}
```
**Critical:** `sessions.remove(user, session)` (the 2-arg form) prevents the close of a *superseded* old session from evicting the *new* session that just replaced it — a real race when a user reconnects fast.

### Pattern 3: Scale-seam interfaces (D-01)
**What:** `PresenceService` and `MessageRouter` are interfaces whose local impls Phase 6 replaces with Redis impls — no caller changes. Method shapes are chosen so a Redis impl is a clean drop-in.
**Example:**
```java
public interface PresenceService {
    void join(String userId);                 // mark online (local: put lastSeen=now)
    void heartbeat(String userId);            // refresh TTL (local: update lastSeen)
    void leave(String userId);                // mark offline (local: remove)
    List<OnlineUser> snapshot();              // current online list (local: map keys -> OnlineUser ONLINE)
    // Phase 6 Redis impl: SETEX presence:{userId} 60, SMEMBERS, etc. — same signatures
}

public interface MessageRouter {
    // local: iterate the passed sessions and sendMessage; Phase 6: PUBLISH to a Redis channel per user/instance
    void broadcast(ServerMessage message, Collection<WebSocketSession> localSessions);
    void sendToUser(String userId, ServerMessage message);   // reserved for Phase 3 signaling; local lookup now
}
```
> Note: keep `broadcast`'s session collection a parameter (not an internal field) so the Phase 6 Redis router can ignore it and fan out via pub/sub. Alternatively the router owns the sessions map — either is a valid seam; document the choice in the plan.

### Pattern 4: Presence sweeper (PRES-02, D-04)
```java
// Source: Spring @Scheduled; behavior mirrors the Phase 6 Redis TTL (CONTEXT D-01/D-04)
@Component
public class PresenceSweeper {
    private final LocalPresenceService presence;   // exposes lastSeen map + evict
    private final PresenceWebSocketHandler handler; // to re-broadcast after eviction

    @Scheduled(fixedDelay = 20_000)                 // run ~every 20s; 60s TTL => ≤80s worst-case detect
    public void sweep() {
        long cutoff = System.currentTimeMillis() - 60_000;
        List<String> evicted = presence.evictStaleBefore(cutoff);  // atomic per-entry removeIf
        if (!evicted.isEmpty()) handler.broadcastSnapshot();
    }
}
```
Enable with `@EnableScheduling` on a config class. `fixedDelay` (not `fixedRate`) avoids overlapping runs if a sweep is slow.

### Pattern 5: App-level heartbeat (client 25s / server 60s, D-04)
**What:** Client sends `{"type":"ping"}` every 25s; server refreshes last-seen and replies `{"type":"pong"}`. The server's sweeper (Pattern 4) is the actual offline authority. The client uses `pong` (or any inbound traffic) to confirm the link is alive and reset its own watchdog.
**Why app-level over native frames:** the browser `WebSocket` API cannot send native ping frames (only respond to server pings), so a symmetric client-initiated heartbeat must be app-level; it is also trivially assertable in integration tests.

### Pattern 6: Message envelope (sealed interface + records + @JsonTypeInfo)
```java
// Source: CLAUDE.md mandate (sealed interface + records + @JsonTypeInfo); Jackson polymorphic typing
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = PresenceSnapshot.class, name = "presence"),
    @JsonSubTypes.Type(value = SessionSuperseded.class, name = "session-superseded"),
    @JsonSubTypes.Type(value = Pong.class,             name = "pong")
})
public sealed interface ServerMessage permits PresenceSnapshot, SessionSuperseded, Pong {}

public record PresenceSnapshot(List<OnlineUser> users) implements ServerMessage {}
public record SessionSuperseded(String reason)         implements ServerMessage {}
public record Pong()                                   implements ServerMessage {}
public record OnlineUser(String username, PresenceStatus status) {}

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({ @JsonSubTypes.Type(value = Ping.class, name = "ping") })
public sealed interface ClientMessage permits Ping {}
public record Ping() implements ClientMessage {}
```
This `type` discriminator on the wire maps cleanly to a TypeScript discriminated union on the client (`messages.ts`).

### Frontend: native WebSocket wrapper (~50 lines) + Zustand
```typescript
// Source: CLAUDE.md mandate (native WebSocket + own reconnect/heartbeat wrapper);
//         module-level store access mirrors existing frontend/src/api/axios.ts
import { useAuthStore } from '../store/authStore'
import { usePresenceStore } from '../store/presenceStore'

let ws: WebSocket | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null
let backoff = 1000                      // 1s -> max 30s

export function connectWs() {
  const token = useAuthStore.getState().token
  if (!token) return
  const url = `${import.meta.env.VITE_WS_URL}/ws?token=${encodeURIComponent(token)}`
  ws = new WebSocket(url)

  ws.onopen = () => {
    backoff = 1000
    usePresenceStore.getState().setConnState('open')
    heartbeat = setInterval(() => ws?.readyState === WebSocket.OPEN
      && ws.send(JSON.stringify({ type: 'ping' })), 25_000)
  }
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.type === 'presence')           usePresenceStore.getState().setOnline(msg.users)
    else if (msg.type === 'session-superseded') {
      disconnectWs(); usePresenceStore.getState().setKicked(msg.reason)   // HomePage redirects to /login
    }
    // 'pong' -> link alive (optional watchdog reset)
  }
  ws.onclose = () => {
    if (heartbeat) clearInterval(heartbeat)
    usePresenceStore.getState().setConnState('closed')
    if (!usePresenceStore.getState().kicked) {            // don't reconnect after a kick
      setTimeout(connectWs, backoff)
      backoff = Math.min(backoff * 2, 30_000)             // exponential backoff, capped
    }
  }
}
export function disconnectWs() { if (heartbeat) clearInterval(heartbeat); ws?.close(); ws = null }
```
Integration: call `connectWs()` when HomePage mounts with a valid token; `disconnectWs()` on logout. The kick path sets a `kicked` flag the store/HomePage reads to show the notice and `navigate('/login')`.

### Anti-Patterns to Avoid
- **Reading `from` off the message body** — violates AUTH-04. Always use `session.getAttributes().get("username")`.
- **Putting the sessions map in a plain `HashMap`** — concurrent lifecycle callbacks + sweeper thread = corruption. Use `ConcurrentHashMap`.
- **Calling `session.sendMessage` from multiple threads without per-session sync** — Spring's `WebSocketSession.sendMessage` is **not** concurrency-safe; the sweeper broadcast and a handler broadcast can interleave on the same session. Synchronize per session (or wrap with `ConcurrentWebSocketSessionDecorator`).
- **`permitAll()` AND trying to also secure `/ws` in the Spring filter chain** — the WS upgrade is GET; let it through and gate in the interceptor. Securing it in SF leads to 401-before-handshake confusion.
- **`setAllowedOrigins("*")`** with credentialed clients — set the explicit frontend origin(s).
- **Reconnecting after a kick** — the client must NOT auto-reconnect after `session-superseded`, or it will fight the new session. Guard with the `kicked` flag.
- **`fixedRate` sweeper** — can overlap; use `fixedDelay`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polymorphic JSON for the message envelope | Manual `if (json.has("type"))` switch + hand parsing | Jackson `@JsonTypeInfo` + `@JsonSubTypes` on a sealed interface | Type-safe, exhaustive (sealed), and symmetric with the TS discriminated union; CLAUDE.md mandate. |
| Per-session write safety | Custom lock map | `ConcurrentWebSocketSessionDecorator` (spring-websocket) **or** a simple `synchronized(session)` | Spring ships the decorator specifically for concurrent sends + send-buffer limits. |
| JWT parse/verify | New verification code | Existing `JwtService.isTokenValid` / `extractUsername` | Phase 1 already owns the signing key + parser; reuse keeps one source of truth. |
| WS handshake auth wiring | A custom servlet filter on the upgrade | `HandshakeInterceptor` | Purpose-built hook with access to the attributes map that flows into the session. |
| Scheduled sweeping | Manual `Thread` + `sleep` loop | Spring `@Scheduled(fixedDelay=...)` | Managed lifecycle, no leaked threads, testable. |
| Client reconnect/heartbeat | socket.io / reconnecting-websocket | ~50-line native wrapper (above) | CLAUDE.md mandate; learning value; socket.io can't talk to Spring WS. |

**Key insight:** Almost everything in this phase is *wiring existing primitives*, not building new infrastructure. The only genuinely custom code is the ~50-line client wrapper (intentional, per CLAUDE.md) and the two local service impls (intentional seams). Resist adding Redis, STOMP, or a WS library "to make it easier."

## Runtime State Inventory

> Phase 2 is **greenfield for this layer** (no rename/refactor of existing runtime state). One cross-cutting note:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — presence is in-memory and ephemeral by design (D-01). | none |
| Live service config | None — no new Docker service, no external config (Redis deferred to Phase 6). | none |
| OS-registered state | None. | none |
| Secrets/env vars | `jwt.secret` (existing) is reused to validate the WS token — **no new secret**. Frontend needs a new `VITE_WS_URL` env var (e.g. `ws://localhost:8080`) alongside the existing `VITE_API_URL`. | Add `VITE_WS_URL` to `.env.example` / frontend env. |
| Build artifacts | None stale. | none |

**Nothing found in most categories** — verified by inspecting `backend/pom.xml`, `application.yaml` (no ws/redis config present), and `frontend/package.json`.

## Common Pitfalls

### Pitfall 1: Token in query string is logged in plaintext
**What goes wrong:** `?token=<JWT>` lands in nginx/Tomcat access logs, browser history, and any proxy logs — leaking a valid bearer token.
**Why it happens:** URLs are logged by default everywhere; WS upgrades are GET requests.
**How to avoid:** Accept it for v1 (short-lived 15–30min access token limits the blast radius), but (a) ensure the LB/nginx access-log format used in Phase 6/Infra does not log query strings for `/ws`, and (b) plan the v2 one-time-ticket hardening (STAB-05) now. Flag this in the plan as a known, accepted risk.
**Warning signs:** Tokens visible in `docker logs` of the LB/backend.

### Pitfall 2: Sessions map race on fast reconnect / supersede
**What goes wrong:** Old session's `afterConnectionClosed` removes the userId entry that the *new* session just installed → the just-connected user appears offline.
**Why it happens:** Close of the superseded socket fires asynchronously after the new socket registered.
**How to avoid:** Use `sessions.remove(user, session)` (value-checked removal) and `sessions.put` returning the previous value to drive the kick (Pattern 2). Compare session IDs before kicking.
**Warning signs:** A reconnecting user flickers offline→online; the kicked tab and the new tab both end up disconnected.

### Pitfall 3: Concurrent `sendMessage` corruption
**What goes wrong:** `IllegalStateException: TEXT_PARTIAL_WRITING` or garbled frames when the sweeper broadcast and a join broadcast hit the same session simultaneously.
**Why it happens:** `WebSocketSession.sendMessage` is not thread-safe; broadcasts originate from different threads (I/O thread vs scheduler thread).
**How to avoid:** `synchronized(session)` around every send, or wrap sessions in `ConcurrentWebSocketSessionDecorator`.
**Warning signs:** Intermittent send exceptions under multi-client load.

### Pitfall 4: Reconnect storm after backend restart
**What goes wrong:** All clients reconnect simultaneously with no jitter, hammering the backend.
**Why it happens:** Fixed/identical backoff across clients.
**How to avoid:** Exponential backoff capped at ~30s **plus random jitter** (e.g. `delay = base + Math.random()*base`). Add jitter to the wrapper in Pattern's `setTimeout`.
**Warning signs:** Synchronized reconnect spikes in metrics after any restart.

### Pitfall 5: `@Scheduled` not running
**What goes wrong:** Sweeper never fires; crashed clients stay "online" forever.
**Why it happens:** Forgot `@EnableScheduling`.
**How to avoid:** Add `@EnableScheduling` to a `@Configuration` class and integration-test that a client which stops sending pings disappears within ~80s.
**Warning signs:** Offline detection never triggers in manual testing.

### Pitfall 6: CORS/allowed-origins blocks the upgrade
**What goes wrong:** Handshake fails in the browser with an origin error even though the token is valid.
**Why it happens:** `setAllowedOrigins` not configured to the frontend origin (default is restrictive for cross-origin).
**How to avoid:** Set the explicit frontend origin(s) in `registerWebSocketHandlers`, matching the existing `CorsConfig` allowlist. Never `"*"` with credentials.

## Code Examples

(Concrete, verified-pattern examples are embedded inline in Patterns 1–6 and the Frontend wrapper above, each tagged with its source.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| STOMP + SimpleBroker for "easy" WS | Raw `TextWebSocketHandler` + JSON for learnable, scalable signaling | project decision | CLAUDE.md mandate; matches the Redis pub/sub scale path. |
| `webrtc-adapter` / socket.io shims | Native browser `WebSocket` + spec-compliant APIs | ~2024+ | No client WS library needed; zero npm deps this phase. |
| Boot 3.x `spring-boot-starter-web` | Boot 4.x `spring-boot-starter-webmvc` (already in pom); **`spring-boot-starter-websocket` name is unchanged** | Boot 4.0 GA Nov 2025 | Don't guess a `-websocket`→`-webmvc` rename; the WS starter keeps its name [VERIFIED: Spring Boot docs]. |

**Deprecated/outdated:**
- Spring Boot 4.1.0 exists [CITED: WebSocket.org / Maven Central search], but the project is pinned to **4.0.7** in `pom.xml` — do not bump as part of Phase 2.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Spring Framework 7 keeps the 6.x `WebSocketConfigurer`/`TextWebSocketHandler`/`HandshakeInterceptor` API identical | Patterns 1–2 | LOW — Boot docs confirm the starter and MVC WebSocket support exist for Boot 4; method signatures have been stable since 4.x. Verify by compiling against Boot 4.0.7 at setup. |
| A2 | Browser `WebSocket` cannot send native ping frames (only respond) → app-level heartbeat required | Pattern 5 | LOW — long-standing WHATWG WebSocket API limitation; well-documented. |
| A3 | `?token=` query param survives the nginx/LB proxy untouched into the upgrade request | Pitfall 1 / Pattern 1 | MEDIUM — depends on Phase 6 LB config; ensure `proxy_pass` preserves the query string and `proxy_http_version 1.1` + Upgrade headers are set (CLAUDE.md already notes this for the LB). |
| A4 | `VITE_WS_URL` is the right env mechanism (mirrors existing `VITE_API_URL`) | Runtime State Inventory | LOW — confirmed pattern in `axios.ts`. |

**Note:** No `[ASSUMED]` package recommendations exist — the only new dependency is a first-party Spring starter.

## Open Questions

1. **MessageRouter ownership of the sessions map**
   - What we know: Either the handler owns `sessions` and passes it to `router.broadcast(...)`, or the router owns it. Both are valid Phase 6 seams.
   - What's unclear: which gives the cleaner Redis swap.
   - Recommendation: Let the **handler own** the local sessions map (it must, for lifecycle), and have `LocalMessageRouter.broadcast(msg, sessions)` take the collection as a param. The Phase 6 Redis router ignores the param and publishes to a channel. Decide and document in PLAN.

2. **Worst-case offline-detection latency**
   - What we know: 60s TTL + 20s sweep interval → up to ~80s to detect a crash.
   - What's unclear: whether "within ~60s" (PRES-02 wording) is strict.
   - Recommendation: Tighten the sweep interval to ~10s (→ ~70s worst case) or set TTL to 50s if the success criterion is strict. Surface to the planner.

3. **Where to trigger `connectWs()`**
   - What we know: must run when authenticated and on HomePage.
   - What's unclear: app-root effect vs HomePage effect vs a route guard.
   - Recommendation: Connect in a top-level authenticated effect (e.g. in `App.tsx`/`ProtectedRoute`) so presence persists across in-app navigation, not just on HomePage. Plan-time decision.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Java (Temurin) | Backend build/run | ✓ | 21.0.11 LTS | — |
| Maven wrapper (`mvnw`) | Backend build | ✓ | bundled | — |
| Node.js | Frontend build/dev | ✓ | 24.14.0 | — |
| npm | Frontend deps | ✓ | 11.9.0 | — |
| `spring-boot-starter-websocket` | WS server | ✓ (resolves via Boot 4.0.7 BOM) | spring-websocket 7.x | — |
| Redis | (Phase 6 only — NOT this phase) | n/a | — | Local in-memory impl (by design, D-01) |

**Missing dependencies with no fallback:** none — all toolchain present.
**Missing dependencies with fallback:** Redis is intentionally absent; the local `PresenceService`/`MessageRouter` impls are the design, not a fallback (D-01).

## Validation Architecture

> nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework (backend) | JUnit 5 (Jupiter) + AssertJ + Spring Test; Testcontainers 1.21.0 (Postgres) [VERIFIED: pom.xml, AuthControllerTest.java] |
| Framework (frontend) | Vitest (Vite-native) — **not yet installed**; no test files exist yet [VERIFIED: only vite.config.ts present, no vitest config] |
| Config file (backend) | none extra — `@SpringBootTest` + `@Import(TestcontainersConfiguration.class)` |
| Quick run command (backend) | `cd backend && ./mvnw -q -Dtest=PresenceWebSocketHandlerTest test` |
| Full suite command (backend) | `cd backend && ./mvnw verify` |
| Quick run command (frontend) | `cd frontend && npx vitest run src/realtime` (after Wave 0 installs Vitest) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-04 | Handshake with invalid/expired token is rejected (no 101) | integration | `./mvnw -Dtest=WsHandshakeAuthTest test` | ❌ Wave 0 |
| AUTH-04 | Server attributes messages to the token's subject, ignores body `from` | integration | `./mvnw -Dtest=WsIdentityTest test` | ❌ Wave 0 |
| PRES-01 | Two clients connect → both receive a snapshot containing both usernames | integration (two `StandardWebSocketClient`s) | `./mvnw -Dtest=PresenceBroadcastTest test` | ❌ Wave 0 |
| PRES-02 | Client that stops sending pings is evicted within ~TTL+sweep | integration (Awaitility) | `./mvnw -Dtest=PresenceSweeperTest test` | ❌ Wave 0 |
| PRES-03 | New connection for same user → old session receives `session-superseded` then closes | integration (two clients, same token) | `./mvnw -Dtest=SingleSessionTest test` | ❌ Wave 0 |
| PRES-01 | Frontend `wsClient` updates `presenceStore` on snapshot; reconnects with backoff; handles kick | unit (Vitest, mock `WebSocket`) | `npx vitest run src/realtime` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant `./mvnw -Dtest=<X>Test test` (or `npx vitest run <file>`).
- **Per wave merge:** `cd backend && ./mvnw verify` (full backend suite, Testcontainers).
- **Phase gate:** full backend `./mvnw verify` green + frontend `npx vitest run` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `WsHandshakeAuthTest.java` — AUTH-04 reject path (no/invalid/expired token).
- [ ] `WsIdentityTest.java` — AUTH-04 server-owned identity.
- [ ] `PresenceBroadcastTest.java` — PRES-01 two-client snapshot.
- [ ] `PresenceSweeperTest.java` — PRES-02 TTL eviction (Awaitility).
- [ ] `SingleSessionTest.java` — PRES-03 supersede + close.
- [ ] Add **Awaitility 4.x** test dependency (CLAUDE.md testing table) for the sweeper test — not yet in pom.
- [ ] Frontend: install **Vitest 3.x** (+ optional jsdom) and add a `test` script; first test files `src/realtime/wsClient.test.ts`, `messages.test.ts`.
- [ ] No Testcontainers Redis container needed — presence is local this phase (D-01). Postgres container (existing) is only needed if a test boots the full context that hits the DB.

## Security Domain

> security_enforcement enabled, ASVS Level 1 (config.json).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT validated at WS handshake via existing `JwtService` (HS256); reject upgrade on invalid/expired (Pattern 1). |
| V3 Session Management | yes | Single-session enforcement (PRES-03); server-owned identity bound to `WebSocketSession`; short-lived access token. |
| V4 Access Control | yes (light) | Only authenticated users reach `/ws`; role checks (Admin/User) deferred — no role-gated WS actions in Phase 2. |
| V5 Input Validation | yes | All inbound frames parsed through the sealed `ClientMessage` envelope; unknown/malformed JSON rejected (Jackson fails closed); message body `from` never trusted. |
| V6 Cryptography | no (reuse) | No new crypto — reuses Phase 1 HS256 signing key; never hand-roll. |
| V7 Error Handling/Logging | yes | **Do not log the token** (query param); log auth failures without the credential. |

### Known Threat Patterns for raw-WebSocket + JWT-in-query
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leakage via URL/access logs | Information Disclosure | Short-lived token; suppress query string in `/ws` access logs; v2 one-time ticket (STAB-05). |
| Spoofed `from`/sender in message body | Spoofing | Server attributes every message from `session.getAttributes().get("username")` — body sender ignored (AUTH-04). |
| Session fixation / ghost sessions | Tampering | Single-session map with value-checked removal; superseded session closed (PRES-03). |
| Unauthenticated WS connect (CSWSH) | Spoofing/Elevation | `setAllowedOrigins(<frontend origin>)` (not `*`) + handshake token validation. |
| Resource exhaustion via reconnect storm / flood | Denial of Service | Client backoff+jitter; consider a per-IP/per-user connection cap + send-buffer limit (`ConcurrentWebSocketSessionDecorator`) — note for Phase 6 scale hardening. |
| Stale presence after crash | (availability/correctness) | `@Scheduled` TTL sweeper (PRES-02). |

## Sources

### Primary (HIGH confidence)
- `backend/.../config/JwtService.java`, `JwtAuthFilter.java`, `SecurityConfig.java`, `pom.xml` (Boot 4.0.7) — verified reuse surface and dependency baseline.
- `frontend/src/api/axios.ts`, `store/authStore.ts`, `package.json` — verified module-level store access pattern + zero new deps.
- `backend/src/test/.../AuthControllerTest.java`, `TestcontainersConfiguration.java` — verified test infra (JUnit 5, Boot 4 test starters, Testcontainers 1.21).
- docs.spring.io/spring-boot/reference/messaging/websockets.html — `spring-boot-starter-websocket` is the WebSocket module for Boot 4 [VERIFIED].
- CLAUDE.md — locked tech-stack mandates (raw TextWebSocketHandler, native WebSocket client, sealed envelope, Lettuce/Redis to Phase 6).

### Secondary (MEDIUM confidence)
- central.sonatype.com/artifact/org.springframework.boot/spring-boot-starter-websocket — artifact published through current Boot 4.x.
- github.com/spring-projects/spring-security/issues/14971 — WS endpoints 401 unless explicitly permitted (confirms `permitAll` + interceptor-gate approach).
- Spring Framework 7 WebSocket reference (docs.spring.io/spring-framework/reference/7.0/web/websocket.html) — HandshakeInterceptor attributes flow into `WebSocketSession`.

### Tertiary (LOW confidence)
- WebSocket.org Java/Spring guide; assorted blog posts on stateless-JWT WS auth — used only to corroborate the query-param vs subprotocol trade-off, not as primary authority.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — single first-party Spring starter; API surface confirmed against Boot 4 docs + existing codebase compiles on Boot 4.0.7.
- Architecture (interfaces, lifecycle, single-session, sweeper, envelope): HIGH — all locked in CONTEXT.md and built from stable Spring primitives + existing reuse.
- Pitfalls (thread-safety, reconnect race, token-in-query): HIGH — well-known WebSocket concurrency and auth hazards.
- Exact Spring Framework 7 method signatures: MEDIUM-HIGH — verify by compiling at setup (A1).

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (stable; re-check only if the Boot parent version is bumped past 4.0.x).
