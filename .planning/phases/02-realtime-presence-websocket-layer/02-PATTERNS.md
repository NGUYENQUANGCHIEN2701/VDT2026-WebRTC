# Phase 2: Realtime Presence & WebSocket Layer - Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 18 (13 backend new, 1 backend modified, 4 frontend new/modified) + 5 test files
**Analogs found:** 16 / 18 (2 net-new patterns: TextWebSocketHandler, native WS wrapper — no in-repo analog, use RESEARCH.md)

> All structure, interface signatures, and code excerpts below trace to RESEARCH.md Patterns 1-6 + the verified Phase 1 analogs read for this map. Backend package = `com.vdt.webrtc`. Frontend root = `frontend/src`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `ws/WebSocketConfig.java` | config | request-response (handshake) | `config/SecurityConfig.java` | role-match (`@Configuration` + ctor-injected bean wiring) |
| `ws/JwtHandshakeInterceptor.java` | middleware | request-response (auth gate) | `config/JwtAuthFilter.java` | exact (token extract → `JwtService` validate → bind identity) |
| `ws/PresenceWebSocketHandler.java` | controller (WS) | event-driven / pub-sub | `config/JwtAuthFilter.java` (partial) + RESEARCH Pattern 2 | no in-repo analog — new primitive |
| `ws/MessageRouter.java` | service (interface) | pub-sub (fan-out) | `admin/AdminService.java` + RESEARCH Pattern 3 | role-match (service iface, but interface-first is new) |
| `ws/LocalMessageRouter.java` | service (impl) | pub-sub (fan-out) | `admin/AdminService.java` | role-match (`@Service`, ctor inject, stateless logic) |
| `ws/message/ServerMessage.java` | model (sealed iface) | transform (envelope) | RESEARCH Pattern 6 (CLAUDE.md mandate) | no in-repo analog — new pattern |
| `ws/message/ClientMessage.java` | model (sealed iface) | transform (envelope) | RESEARCH Pattern 6 | no in-repo analog — new pattern |
| `ws/message/PresenceSnapshot.java` | model (record) | transform | `admin/dto/UserSummary.java` | exact (record DTO) |
| `ws/message/SessionSuperseded.java` | model (record) | transform | `admin/dto/UserSummary.java` | exact (record DTO) |
| `ws/message/Ping.java` / `Pong.java` | model (record) | transform | `admin/dto/UserSummary.java` | exact (record DTO) |
| `ws/message/OnlineUser.java` | model (record) | transform | `admin/dto/UserSummary.java` | exact (record DTO) |
| `presence/PresenceService.java` | service (interface) | CRUD (in-mem state) | `admin/AdminService.java` + RESEARCH Pattern 3 | role-match |
| `presence/LocalPresenceService.java` | service (impl) | CRUD (in-mem state) | `admin/AdminService.java` | role-match (`@Service` + collection ops; map is new) |
| `presence/PresenceStatus.java` | model (enum) | — | `user/Role.java` | exact (2-value enum) |
| `presence/PresenceSweeper.java` | service (scheduled) | event-driven (timer) | RESEARCH Pattern 4 (`@Scheduled`) | no in-repo analog — new pattern |
| `config/SecurityConfig.java` (**MODIFY**) | config | request-response | itself (lines 34-38 `authorizeHttpRequests`) | exact (add one `requestMatchers` line) |
| `WebrtcApplication.java` (**MODIFY**, or new config) | config | — | itself | add `@EnableScheduling` + `@EnableWebSocket` (or on `WebSocketConfig`) |
| `realtime/wsClient.ts` | service (module) | event-driven (WS stream) | `api/axios.ts` | role-match (module-level `getState()` access; native WS is new) |
| `realtime/messages.ts` | model (TS union) | transform | (mirror of `ws/message/*`) | derived from backend envelope |
| `store/presenceStore.ts` | store | event-driven | `store/authStore.ts` | exact (Zustand `create` slice) |
| `pages/HomePage.tsx` (**MODIFY**) | component | event-driven render | `pages/AdminPage.tsx` + existing `HomePage.tsx` | exact (list render + loading/error) |
| `App.tsx` or `ProtectedRoute.tsx` (**MODIFY**) | component | lifecycle | `App.tsx` lines 17-46 (`useEffect` + `useRef` guard) | exact (connect/disconnect WS on auth) |

## Pattern Assignments

### `ws/JwtHandshakeInterceptor.java` (middleware, request-response)

**Analog:** `backend/src/main/java/com/vdt/webrtc/config/JwtAuthFilter.java`

This is the closest analog: same job as the filter (extract token → validate with `JwtService` → bind a server-owned identity), but at the WS handshake instead of the servlet chain. Copy the validate-and-bind shape; replace header extraction with query-param extraction, replace `SecurityContextHolder` with the handshake `attributes` map.

**Reuse target — `JwtService` API** (`config/JwtService.java` lines 49, 63):
```java
public String extractUsername(String token) { ... }   // line 49 — server-owned subject
public boolean isTokenValid(String token)  { ... }     // line 63 — true on valid+unexpired
```

**Validate-then-bind pattern to copy** (from `JwtAuthFilter.java` lines 45-62, adapt to interceptor):
```java
// JwtAuthFilter today: header → token → extractUsername → bind principal
String token = authHeader.substring(7);
String username = jwtService.extractUsername(token);
// ... bind into SecurityContextHolder
```
Adapt to (RESEARCH Pattern 1):
```java
public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Map<String, Object> attributes) {
    String token = UriComponentsBuilder.fromUri(request.getURI()).build()
            .getQueryParams().getFirst("token");
    if (token == null || !jwtService.isTokenValid(token)) {
        response.setStatusCode(HttpStatus.UNAUTHORIZED);   // 401, upgrade rejected
        return false;
    }
    attributes.put("username", jwtService.extractUsername(token));  // server-owned identity (AUTH-04)
    return true;
}
```

**Constructor-injection convention** (matches `JwtAuthFilter.java` lines 25-28 — plain ctor, no `@Autowired`, no Lombok):
```java
public JwtHandshakeInterceptor(JwtService jwtService) { this.jwtService = jwtService; }
```

**Logging on auth failure** — copy `JwtAuthFilter.java` line 60 style (`@Slf4j` + `log.warn`), but **never log the token** (RESEARCH Security Domain V7 / Pitfall 1):
```java
log.warn("WS handshake rejected: invalid/expired token");   // no credential in the message
```

---

### `ws/WebSocketConfig.java` (config, handshake registration)

**Analog:** `backend/src/main/java/com/vdt/webrtc/config/SecurityConfig.java` (lines 18-26 for the `@Configuration` + ctor-injected collaborator shape)

**Config-class + ctor-injection pattern** (from `SecurityConfig.java` lines 18-25):
```java
@Configuration
@EnableWebSecurity                 // → @EnableWebSocket here
public class SecurityConfig {
    private final JwtAuthFilter jwtAuthFilter;
    public SecurityConfig(JwtAuthFilter jwtAuthFilter) { this.jwtAuthFilter = jwtAuthFilter; }
```

**Apply to WebSocketConfig** (RESEARCH Pattern 1 registration):
```java
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final PresenceWebSocketHandler handler;
    private final JwtService jwtService;
    // ctor injection (same style as SecurityConfig)
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws")
                .addInterceptors(new JwtHandshakeInterceptor(jwtService))
                .setAllowedOrigins("http://localhost:5173");   // MUST match CorsConfig allowlist, NOT "*"
    }
}
```

**Allowed-origins source of truth** — reuse the exact origin from `config/CorsConfig.java` line 17:
```java
configuration.setAllowedOrigins(List.of("http://localhost:5173"));   // ← copy this origin into setAllowedOrigins
```
(RESEARCH Pitfall 6 + anti-pattern: never `setAllowedOrigins("*")` with credentials.)

---

### `config/SecurityConfig.java` (MODIFY — permit /ws)

**Analog:** itself (`SecurityConfig.java` lines 34-38).

Add one matcher to the existing `authorizeHttpRequests` chain. The handshake interceptor is the real gate (RESEARCH Pattern 1 + the Spring Security 401-before-handshake note):
```java
.authorizeHttpRequests(authorize -> authorize
        .requestMatchers("/api/auth/**").permitAll()
        .requestMatchers("/ws/**").permitAll()        // ← ADD: gate is JwtHandshakeInterceptor, not Spring Security
        .requestMatchers("/error").permitAll()
        .requestMatchers("/api/admin/**").hasRole("ADMIN")
        .anyRequest().authenticated())
```

---

### `presence/PresenceService.java` + `LocalPresenceService.java` (service interface + impl, CRUD)

**Analog:** `backend/src/main/java/com/vdt/webrtc/admin/AdminService.java`

`AdminService` is the closest service: `@Service`, ctor injection, returns a `List` of records via stream/`.toList()`. New twist vs analog: PresenceService is **interface-first** (the Phase 6 Redis swap seam, D-01) and holds in-memory state in a `ConcurrentHashMap` (not a JPA repo).

**`@Service` + ctor-inject + stream-to-records shape** (`AdminService.java` lines 10-27):
```java
@Service
public class AdminService {
    private final UserRepository userRepository;
    public AdminService(UserRepository userRepository) { this.userRepository = userRepository; }

    public List<UserSummary> listUsers() {
        return userRepository.findAll().stream()
                .map(user -> new UserSummary(...))
                .toList();
    }
}
```

**Interface signatures to implement** (RESEARCH Pattern 3 — keep verbatim so Phase 6 Redis is a drop-in):
```java
public interface PresenceService {
    void join(String userId);
    void heartbeat(String userId);
    void leave(String userId);
    List<OnlineUser> snapshot();
}
```
**Local impl backing store** (RESEARCH — thread-safety is mandatory, callbacks + sweeper run on different threads):
```java
private final Map<String, Long> lastSeen = new ConcurrentHashMap<>();   // userId → epoch millis
// snapshot(): keys → new OnlineUser(userId, PresenceStatus.ONLINE); use stream + .toList() like AdminService
// sweeper hook: List<String> evictStaleBefore(long cutoff)  // removeIf-style atomic eviction
```

---

### `presence/PresenceStatus.java` (enum)

**Analog:** `backend/src/main/java/com/vdt/webrtc/user/Role.java` (exact — 2-value enum, no body)
```java
public enum Role { USER, ADMIN }            // analog
public enum PresenceStatus { ONLINE, IN_CALL }   // IN_CALL unused until Phase 4 (D-03)
```

---

### `ws/message/*.java` records (model, transform)

**Analog:** `backend/src/main/java/com/vdt/webrtc/admin/dto/UserSummary.java` (exact record-DTO shape)
```java
public record UserSummary(Long id, String username, String email, String role, boolean locked) {}
```
**Apply to each envelope record** (RESEARCH Pattern 6):
```java
public record PresenceSnapshot(List<OnlineUser> users) implements ServerMessage {}
public record SessionSuperseded(String reason)         implements ServerMessage {}
public record Pong()                                   implements ServerMessage {}
public record OnlineUser(String username, PresenceStatus status) {}
public record Ping()                                   implements ClientMessage {}
```

**Sealed-interface envelope — no in-repo analog**, use RESEARCH Pattern 6 + CLAUDE.md mandate (`@JsonTypeInfo` + `@JsonSubTypes`):
```java
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = PresenceSnapshot.class, name = "presence"),
    @JsonSubTypes.Type(value = SessionSuperseded.class, name = "session-superseded"),
    @JsonSubTypes.Type(value = Pong.class,             name = "pong")
})
public sealed interface ServerMessage permits PresenceSnapshot, SessionSuperseded, Pong {}
```

---

### `ws/PresenceWebSocketHandler.java` (WS controller, event-driven) — NO in-repo analog

Use RESEARCH Pattern 2 verbatim. Closest spirit-analog is `JwtAuthFilter` (reads server-owned identity, never trusts client) and `AdminService` (`@Component`/`@Service` + ctor inject). Critical correctness rules from RESEARCH (carry into PLAN as MUST):
- Sessions map = `ConcurrentHashMap<String, WebSocketSession>` (Pitfall 2).
- `sessions.remove(user, session)` value-checked removal (avoids evicting the superseding session on fast reconnect — Pitfall 2).
- `synchronized(session)` around every `sendMessage` (Pitfall 3 — `sendMessage` is not thread-safe).
- Identity from `session.getAttributes().get("username")` only — never read body `from` (AUTH-04 / Anti-pattern).

### `presence/PresenceSweeper.java` (scheduled, event-driven) — NO in-repo analog

Use RESEARCH Pattern 4. `@Scheduled(fixedDelay = ...)` (not `fixedRate` — Pitfall 5). Requires `@EnableScheduling` on a `@Configuration` class (e.g. `WebSocketConfig` or `WebrtcApplication`). 60s TTL; RESEARCH Open Question #2 flags tightening the sweep interval to ~10s if "within 60s" (PRES-02) is read strictly — planner decides.

---

### `realtime/wsClient.ts` (service module, event-driven) — partial analog

**Analog:** `frontend/src/api/axios.ts` — for the **module-level store access** convention (not React-hook access).

**Module-level `getState()` pattern to copy** (`axios.ts` lines 13-14, 65):
```ts
const token = useAuthStore.getState().token          // read token outside React
useAuthStore.getState().setToken(newToken)           // mutate store outside React
```
**Apply to wsClient.ts** (RESEARCH Frontend wrapper — the native `WebSocket` + reconnect/heartbeat body has no analog, it is the intentional ~50-line custom wrapper per CLAUDE.md):
```ts
import { useAuthStore } from '../store/authStore'
import { usePresenceStore } from '../store/presenceStore'
const token = useAuthStore.getState().token
const url = `${import.meta.env.VITE_WS_URL}/ws?token=${encodeURIComponent(token)}`
// onmessage → usePresenceStore.getState().setOnline(...) / setKicked(...)
```
**Env-var convention** mirrors `axios.ts` line 6 (`import.meta.env.VITE_API_URL`) → add `VITE_WS_URL` (RESEARCH Runtime State Inventory). MUST: no auto-reconnect after `session-superseded` (guard with `kicked` flag — Anti-pattern); exponential backoff + jitter (Pitfall 4).

---

### `store/presenceStore.ts` (Zustand store)

**Analog:** `frontend/src/store/authStore.ts` (exact — `create<State>((set) => ({...}))` slice)
```ts
// authStore shape to mirror:
interface AuthState { token: string | null; user: User | null; isLoading: boolean;
  setAuth: (...) => void; setToken: (...) => void; logout: () => void }
export const useAuthStore = create<AuthState>((set) => ({ token: null, ..., logout: () => set({...}) }))
```
**Apply to presenceStore** (RESEARCH frontend):
```ts
interface PresenceState {
  onlineUsers: OnlineUser[]
  connectionState: 'open' | 'closed' | 'connecting'
  kicked: string | null
  setOnline: (users: OnlineUser[]) => void
  setConnState: (s: PresenceState['connectionState']) => void
  setKicked: (reason: string) => void
}
export const usePresenceStore = create<PresenceState>((set) => ({ onlineUsers: [], ... }))
```

---

### `pages/HomePage.tsx` (MODIFY — render online list)

**Analog:** `frontend/src/pages/AdminPage.tsx` (exact — list render + loading/error states) and the existing `HomePage.tsx` (current header/logout to preserve).

**List-render + loading/error pattern** (`AdminPage.tsx` lines 12-22, 31-54):
```tsx
const [users, setUsers] = useState<UserRow[]>([])
const [error, setError] = useState('')
// {loading && <p>…</p>}  {error && <p style={{color:'red'}}>…</p>}
// {users.map(user => <tr key={user.id}>…)}
```
**For HomePage**: source the list from `usePresenceStore((s) => s.onlineUsers)` (selector access, like `HomePage.tsx` line 6 `useAuthStore((state) => state.user)`) instead of an axios `useState`/`useEffect` fetch — presence is push-driven. Handle the kick: read `kicked` from the store, show a notice, `navigate('/login')` (RESEARCH frontend + D-02).

---

### `App.tsx` or `ProtectedRoute.tsx` (MODIFY — connect/disconnect WS)

**Analog:** `frontend/src/App.tsx` lines 15-46 — the `useEffect` + `useRef` StrictMode-guard lifecycle pattern (exact).
```tsx
const didRestore = useRef(false)
useEffect(() => {
  if (didRestore.current) return        // StrictMode double-invoke guard
  didRestore.current = true
  // … async restore …
}, [setAuth, setLoading])
```
**Apply**: connect `connectWs()` when authenticated and disconnect on logout, guarded against StrictMode double-invoke the same way. RESEARCH Open Question #3 recommends a top-level authenticated effect (App/ProtectedRoute) so presence persists across navigation — planner decides exact location. `useLogout.ts` (lines 9-19) is the hook to extend with `disconnectWs()` on logout.

## Shared Patterns

### Server-owned identity (AUTH-04)
**Source:** `config/JwtAuthFilter.java` lines 49-57 (extract subject from token, bind it; client asserts nothing).
**Apply to:** `JwtHandshakeInterceptor` (stamps `username` into handshake attributes) and `PresenceWebSocketHandler` (reads `session.getAttributes().get("username")`; never reads message-body `from`).

### JWT validation reuse (no new auth surface)
**Source:** `config/JwtService.java` — `isTokenValid` (line 63), `extractUsername` (line 49).
**Apply to:** `JwtHandshakeInterceptor` only. Same in-memory access token as Phase 1 (D-03). Do not write new JWT parse/verify code.

### Constructor injection, no Lombok on config/services
**Source:** `SecurityConfig.java` (23-25), `JwtAuthFilter.java` (25-28), `AdminService.java` (14-16) — plain final fields + explicit ctor, no `@Autowired`, no `@RequiredArgsConstructor`.
**Apply to:** all new backend `@Configuration` / `@Service` / `@Component` classes. (Lombok available but the established convention here is explicit ctors; prefer records for DTOs.)

### Record DTOs
**Source:** `admin/dto/UserSummary.java`.
**Apply to:** every `ws/message/*` payload record.

### Module-level Zustand access from a service module
**Source:** `api/axios.ts` lines 13-14, 65-71 (`useAuthStore.getState()` outside React).
**Apply to:** `realtime/wsClient.ts` (reads `authStore` token; mutates `presenceStore`).

### Zustand slice shape
**Source:** `store/authStore.ts` (`create<State>((set) => ({...}))`).
**Apply to:** `store/presenceStore.ts`.

### Allowed-origins allowlist (no `"*"` with credentials)
**Source:** `config/CorsConfig.java` line 17 (`http://localhost:5173`, `setAllowCredentials(true)`).
**Apply to:** `WebSocketConfig.setAllowedOrigins(...)` — copy the same origin (Pitfall 6).

### Integration-test harness (Wave 0 tests)
**Source:** `backend/src/test/.../AuthControllerTest.java` (`@SpringBootTest` + `@Import(TestcontainersConfiguration.class)`, AssertJ) and `TestcontainersConfiguration.java` (`@ServiceConnection` Postgres container).
**Apply to:** the 5 backend WS integration tests (`WsHandshakeAuthTest`, `WsIdentityTest`, `PresenceBroadcastTest`, `PresenceSweeperTest`, `SingleSessionTest`). Drive clients with `StandardWebSocketClient`; use Awaitility for the sweeper (needs adding to pom). Postgres container only needed if the booted context touches the DB; no Redis container this phase (D-01).

## No Analog Found

Files with no close in-repo match — planner uses RESEARCH.md patterns directly:

| File | Role | Data Flow | Reason / Source |
|------|------|-----------|-----------------|
| `ws/PresenceWebSocketHandler.java` | WS controller | event-driven | First `TextWebSocketHandler` in repo — use RESEARCH Pattern 2 verbatim (lifecycle, single-session, per-session sync). |
| `presence/PresenceSweeper.java` | scheduled service | timer | First `@Scheduled` component — use RESEARCH Pattern 4 (`fixedDelay`, `@EnableScheduling`). |
| `ws/message/ServerMessage.java`, `ClientMessage.java` | sealed envelope | transform | First sealed-interface + `@JsonTypeInfo` envelope — use RESEARCH Pattern 6 / CLAUDE.md mandate. |
| `realtime/wsClient.ts` (WS body) | service module | event-driven | First native `WebSocket` wrapper — intentional ~50-line custom code per CLAUDE.md; use RESEARCH Frontend wrapper. (Only the `getState()` access has an analog.) |
| `ws/MessageRouter.java` (interface-first) | service iface | pub-sub | No interface-backed service exists yet (all Phase 1 services are concrete) — use RESEARCH Pattern 3 for the scale seam. |

## Metadata

**Analog search scope:** `backend/src/main/java/com/vdt/webrtc/**` (config, auth, admin, user, common packages), `backend/src/test/**`, `frontend/src/**` (api, store, pages, routes, hooks).
**Files scanned:** 29 backend main + 3 backend test + 10 frontend = 42; 17 read in full for excerpts.
**Pattern extraction date:** 2026-06-14
