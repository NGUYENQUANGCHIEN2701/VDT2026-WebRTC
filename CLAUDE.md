<!-- GSD:project-start source:PROJECT.md -->
## Project

**VDT WebRTC — Realtime Video Call**

Ứng dụng video call realtime cho phép 2 người dùng gọi video trực tiếp theo mô hình peer-to-peer bằng WebRTC, signaling qua WebSocket. Đây là đề tài project học tập (VDT) — mục tiêu vừa xây sản phẩm hoàn chỉnh vừa học sâu về WebRTC, kiến trúc realtime, và hệ thống scale ngang. Người dùng đăng ký/đăng nhập, thấy danh sách user online, và gọi video/audio 1-1; admin quản trị hệ thống.

**Core Value:** Hai người dùng gọi video 1-1 cho nhau ổn định, realtime, theo đúng mô hình peer-to-peer WebRTC — nếu mọi thứ khác hỏng, cuộc gọi 1-1 vẫn phải hoạt động.

### Constraints

- **Tech stack**: Backend Java Spring Boot, Frontend React + TypeScript, PostgreSQL — lựa chọn đã chốt theo định hướng học tập và môi trường doanh nghiệp VN
- **Mô hình**: Media phải đi peer-to-peer (đúng đề bài) — server chỉ làm signaling, không relay media (trừ TURN fallback)
- **Hạ tầng**: Toàn bộ demo chạy được bằng Docker Compose trên 1 máy, bao gồm demo scale 2+ instance
- **Bàn giao**: Source code, database script, tài liệu setup, demo thực tế
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Backend Core
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Java | **21 LTS** (Temurin) | Language runtime | Sweet spot: virtual threads, records, pattern matching; every tool (Lombok, Testcontainers, Docker base images, GitHub Actions) is rock-solid on 21. Java 25 LTS (Sept 2025) also works with Boot 4 but adds zero value for this project. Confidence: HIGH |
| Spring Boot | **4.0.x** (latest patch) | App framework, signaling + REST | Boot 4.0 GA'd Nov 2025 (Spring Framework 7, Spring Security 7). Boot 3.5.x OSS support ends ~June 2026 — starting a multi-month greenfield on it means no OSS patches during dev. The APIs this project uses (Spring WebSocket `TextWebSocketHandler`, Security filter chain, Data JPA, Actuator) are essentially unchanged from 3.x, so 3.x tutorials still translate. **Fallback:** if any dependency lags Boot 4 at setup, drop to 3.5.x latest — everything in this doc works on both. Confidence: MEDIUM (verify supported versions on start.spring.io at setup) |
| Maven | 3.9.x (via wrapper `mvnw`) | Build | More common than Gradle in VN enterprise; simpler CI caching; Spring docs default to it. Confidence: HIGH |
| Starter | Purpose |
|---------|---------|
| `spring-boot-starter-web` | REST API (Spring MVC) |
| `spring-boot-starter-websocket` | Signaling — raw `WebSocketHandler` (see note below) |
| `spring-boot-starter-security` | JWT auth filter chain, RBAC (Admin/User) |
| `spring-boot-starter-data-jpa` | PostgreSQL persistence (users, call history) |
| `spring-boot-starter-data-redis` | Pub/sub routing + presence (Lettuce client) |
| `spring-boot-starter-amqp` | RabbitMQ producer/consumer for call-history events |
| `spring-boot-starter-actuator` | Health checks, `/actuator/prometheus` |
| `spring-boot-starter-validation` | Bean validation on DTOs |
| `spring-boot-starter-test` | JUnit 5 + Mockito + AssertJ + Spring Test (test scope) |
### Frontend Core
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | **19.x** | UI | Current major (19.0 Dec 2024, 19.2 Oct 2025). No reason to start on 18 in 2026. Confidence: HIGH |
| TypeScript | **5.9.x** (latest 5.x) | Types | Current stable line. TS 7 (Go-port compiler) is not the stable default — don't chase it. Confidence: MEDIUM on exact minor |
| Vite | **7.x** (latest; take 8.x if stable at setup) | Build/dev server | The default React+TS toolchain in 2025/26; CRA is dead. Vite 7 requires Node 20.19+/22.12+. Confidence: HIGH on Vite, MEDIUM on major number |
| Node.js | **22 LTS** (dev/CI only) | Toolchain runtime | Broadest compatibility with Vite/Vitest; Node 24 LTS also fine. Production serves static files via nginx — Node never runs in prod. Confidence: HIGH |
| Zustand | **5.x** | Call/client state | Best fit for call state: tiny API, store usable from outside React (your WebRTC service module can call `useCallStore.getState().setConnectionState(...)` from `onconnectionstatechange` callbacks), selector-based re-renders keep video UI cheap. Confidence: HIGH |
| TanStack Query | **5.x** | Server state | User lists, call history, admin dashboards — caching, refetch, pagination for REST data. Keeps Zustand purely for realtime call state. Confidence: HIGH |
| React Router | **7.x** (library mode) | Routing | Login / call / admin pages. Plain library, not framework mode. Confidence: HIGH |
| Axios | 1.x | HTTP client | Interceptors make JWT attach/refresh-on-401 clean. Native fetch acceptable if you prefer zero deps. Confidence: HIGH |
| Concern | Use | Not |
|---------|-----|-----|
| Peer connections | Native `RTCPeerConnection` + the **"perfect negotiation"** pattern (polite/impolite peer, from MDN/W3C) | `simple-peer` (effectively unmaintained, predates perfect negotiation), `PeerJS` (bundles its own signaling server — defeats the entire Spring signaling assignment) |
| Camera/mic | `navigator.mediaDevices.getUserMedia` | — |
| Screen share | `getDisplayMedia` + `RTCRtpSender.replaceTrack()` (no renegotiation needed for same kind) | Adding a second video transceiver in v1 (more complex) |
| Recording | Native `MediaRecorder` on local+remote streams (webm) | `RecordRTC` (unmaintained) |
| Browser shims | Nothing — modern Chrome/Firefox/Safari are spec-compliant | `webrtc-adapter` (legacy shim, unnecessary in 2026) |
| Group mesh | One `RTCPeerConnection` per remote peer in a `Map<userId, PeerManager>` inside a plain TS class/module (NOT React state — store only serializable derived state in Zustand) | Putting `RTCPeerConnection`/`MediaStream` objects in Zustand/Redux (non-serializable, devtools and re-render pain) |
| WebSocket client | Native `WebSocket` + a ~50-line reconnect/heartbeat wrapper you write yourself (learning value, exponential backoff) | `reconnecting-websocket` npm package (stale), `socket.io` (different protocol, won't talk to Spring WebSocket) |
### Database & Data Layer
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | **17.x** (`postgres:17-alpine`) | Users, call history | Mature current major; 18 (Sept 2025) is fine too but buys nothing here. Confidence: HIGH |
| Flyway | latest (managed by Boot BOM) | Schema migrations | Deliverable requires "database script" — Flyway gives versioned SQL files in-repo (`V1__init.sql`...), runs on boot, doubles as the deliverable. Use `flyway-database-postgresql` module. Confidence: HIGH |
| Hibernate / JPA | via Boot BOM | ORM | Default; set `ddl-auto: validate` — Flyway owns the schema. Confidence: HIGH |
| Lettuce | via `spring-boot-starter-data-redis` (default) | Redis client | Boot's default; netty-based, handles pub/sub via `RedisMessageListenerContainer`. Do NOT switch to Jedis. Redisson unnecessary (no distributed locks needed). Confidence: HIGH |
| Redis (server) | **7.x** (`redis:7-alpine`) | Cross-instance signaling pub/sub + presence | 7.x is the safe, universally documented line; 8.x works identically but isn't worth the churn for a demo. Presence: TTL keys refreshed by WS heartbeat (e.g. `presence:{userId}` EX 30) + a pub/sub channel per user or per instance for routing. Confidence: HIGH |
### Messaging
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| RabbitMQ (server) | **4.1.x** (`rabbitmq:4.1-management`) | Async call-history events | Current major; `-management` tag gives the admin UI (great for demos). Confidence: MEDIUM on minor |
| Spring AMQP | via `spring-boot-starter-amqp` (Boot BOM) | Producer/consumer | Configure: `Jackson2JsonMessageConverter` (never Java serialization), publisher confirms, a DLQ (`x-dead-letter-exchange`) on the call-history queue, retry with backoff. Confidence: HIGH |
### Auth
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| JJWT (`io.jsonwebtoken:jjwt-api/impl/jackson`) | **0.12.6+** (take 0.13.x if current) | JWT issue + verify | Most-documented Java JWT lib; fluent builder/parser; HS256 with configured secret is plenty. You control the filter, which you need anyway for the WebSocket handshake. Confidence: HIGH on choice, MEDIUM on version |
| Spring Security | 7.x via Boot 4 BOM | Filter chain, RBAC | Lambda DSL `SecurityFilterChain` bean, stateless sessions, `OncePerRequestFilter` for JWT on REST, and a `HandshakeInterceptor` (token via query param or `Sec-WebSocket-Protocol`) for the WS upgrade. Confidence: HIGH |
### Infrastructure (Docker Compose services)
| Service | Image | Why |
|---------|-------|-----|
| Backend x2 | Multi-stage Dockerfile: `maven:3.9-eclipse-temurin-21` build → `eclipse-temurin:21-jre-alpine` run | `backend-1`, `backend-2` replicas for the scale-out demo |
| Frontend | Multi-stage: `node:22-alpine` build → `nginx:1.27-alpine` serve | nginx serves the React build AND reverse-proxies `/api` + `/ws` |
| Load balancer | Same nginx (or separate `nginx:1.27-alpine`) | `upstream` over backend-1/backend-2; WebSocket needs `proxy_http_version 1.1` + `Upgrade`/`Connection` headers. Round-robin is fine — the Redis routing layer makes instance affinity unnecessary (that's the whole demo) |
| PostgreSQL | `postgres:17-alpine` | |
| Redis | `redis:7-alpine` | |
| RabbitMQ | `rabbitmq:4.1-management` | |
| coturn | **`coturn/coturn:4.6`** (official image; take 4.7 if current) | See below |
| Prometheus | `prom/prometheus` (3.x) | Scrapes both backend instances — per-instance metrics make the scale demo visible |
| Grafana | `grafana/grafana` (11.x/12.x) | Provisioned datasource + dashboards as code (`/etc/grafana/provisioning`) |
- Mount a static `turnserver.conf`; key directives: `use-auth-secret`, `static-auth-secret=<shared secret>`, `realm=<domain/ip>`, `min-port=49160 max-port=49200` (a *small* relay range — Docker can't sanely map 16k ports), `fingerprint`.
- **Ephemeral credentials (TURN REST API spec):** a Spring endpoint `GET /api/turn-credentials` returns `username = expiry-timestamp:userId`, `credential = base64(HMAC-SHA1(secret, username))`. Production-standard (never ship static TURN passwords to browsers) and a great learning artifact.
- Networking: prefer `network_mode: host` for the coturn container on the Linux demo box (UDP relay through Docker NAT is the #1 TURN-in-Docker failure mode); otherwise explicitly map 3478/udp+tcp and the relay range, and set `external-ip` to the host IP.
- Frontend builds `iceServers` from fetched credentials: `stun:host:3478` + `turn:host:3478?transport=udp`.
### Monitoring
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Micrometer + `micrometer-registry-prometheus` | via Boot BOM | Metrics export | Add the registry dep, set `management.endpoints.web.exposure.include=health,info,prometheus`; Boot auto-wires the rest. Confidence: HIGH |
| Custom metrics | — | Demo-worthy dashboards | `Gauge` active WS sessions per instance, `Gauge` online users (from Redis), `Counter` calls started/completed/missed, `Timer` signaling message handling. Tag with instance to visualize the 2-node demo |
| Actuator health | — | Compose healthchecks + LB readiness | Liveness/readiness groups; Redis/RabbitMQ/DB indicators auto-configured |
### Testing
| Tool | Version | Layer | Why |
|------|---------|-------|-----|
| JUnit 5 (Jupiter) | via `spring-boot-starter-test` | Backend unit/integration | Default |
| Mockito + AssertJ | via starter-test | Backend unit | Default bundle |
| Testcontainers | **1.21+** (postgresql, rabbitmq modules; generic for Redis) | Backend integration | Real Postgres/Redis/RabbitMQ in tests; Boot's `@ServiceConnection` auto-wires containers to Spring config. Runs natively on GitHub Actions `ubuntu-latest`. Confidence: HIGH |
| Awaitility | 4.x | Backend async | Asserting "RabbitMQ consumer wrote call history within 5s" without `Thread.sleep` |
| `StandardWebSocketClient` (spring-websocket) | via BOM | Signaling integration tests | Drive two fake clients against the app; with two app contexts + Testcontainers Redis you can integration-test cross-instance routing — the highest-value backend test in this project |
| Vitest | **3.x** (take 4.x if stable) | Frontend unit | Vite-native runner; Jest is the wrong choice in a Vite project. Confidence: HIGH on choice, MEDIUM on major |
| React Testing Library | 16.x + `@testing-library/jest-dom`, jsdom | Frontend component | Standard pairing with Vitest |
| Playwright | **1.5x latest** | E2E call testing | The only practical way to E2E-test WebRTC: launch Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, open two browser contexts, place a real call, assert the remote `<video>` renders frames. Confidence: HIGH |
### CI/CD (GitHub Actions)
- `actions/setup-java` (Temurin 21, Maven cache) → `./mvnw verify` (Testcontainers work on `ubuntu-latest`)
- `actions/setup-node` (22) → `npm ci && npm run lint && npx vitest run && npm run build`
- `docker/build-push-action` + `docker/metadata-action` → GHCR
- Optional job: `docker compose up -d` + Playwright E2E against the composed stack
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Lombok | latest | Backend boilerplate | Optional; prefer Java records for DTOs |
| springdoc-openapi (`springdoc-openapi-starter-webmvc-ui`) | **3.x for Boot 4** (2.7+ for Boot 3.5) | Swagger UI | Helps the setup-docs deliverable. Confidence: MEDIUM on Boot-4-compatible major |
| Jackson | via Boot BOM | JSON everywhere (REST, WS signaling, AMQP) | Define signaling messages as sealed interface + records with `@JsonTypeInfo` |
| Tailwind CSS | 4.x | Styling | Optional but recommended — fastest clean call UI without a component-library detour |
| react-hook-form + zod | 7.x / latest | Forms | Optional; only if forms grow beyond login/register |
| ESLint 9 (flat) + typescript-eslint + Prettier | latest | Lint/format | Vite React-TS template ships most of it |
## Alternatives Considered / What NOT to Use
| Category | Recommended | Rejected | Why Not |
|----------|-------------|----------|---------|
| Signaling layer | Raw `TextWebSocketHandler` + JSON | Spring STOMP + simple broker | In-memory broker doesn't scale across instances; supported scale path (RabbitMQ STOMP relay) conflicts with decided Redis pub/sub; hides the mechanics you're learning |
| WebRTC client | Native APIs + perfect negotiation | simple-peer, PeerJS | Stale/unmaintained; PeerJS replaces your signaling server entirely (fails the assignment) |
| WS client | Native WebSocket + own wrapper | socket.io-client | Different protocol — cannot talk to Spring WebSocket |
| Call state | Zustand | Redux Toolkit; bare React Context | RTK serializability conventions fight WebRTC objects + boilerplate; Context alone causes re-render storms on frequent connection-state updates |
| Server state | TanStack Query | Hand-rolled useEffect fetching | Cache/refetch/loading for free; the 2025/26 default |
| Redis client | Lettuce (Boot default) | Jedis, Redisson | Jedis: older model; Redisson: heavyweight, only needed for distributed locks you don't have |
| JWT | JJWT | jose4j, auth0 java-jwt, Keycloak | JJWT has best docs/tutorial coverage; Keycloak is wild overkill for 2 roles and replaces the auth code you're supposed to write |
| Migrations | Flyway | Liquibase, `ddl-auto: update` | Flyway = plain SQL (doubles as the required DB-script deliverable); `ddl-auto: update` is a known footgun |
| FE build | Vite | CRA, Next.js | CRA deprecated; SSR adds zero value to a client-side WebRTC SPA and complicates Docker |
| Recording | Client-side MediaRecorder | Server-side recording | Server-side requires media to touch the server — violates the P2P constraint |
| Group calls | Mesh, 1 PC per peer | SFU (Jitsi/mediasoup/Janus/LiveKit) | Out of scope per PROJECT.md; room abstraction leaves the v2 seam |
| TURN | coturn + ephemeral HMAC credentials | Static TURN credentials; managed TURN (Twilio/Cloudflare) | Static creds in a browser bundle are a security hole; managed TURN defeats self-hosted Compose requirement |
## Installation
## Version Verification Checklist (do at Phase 1 setup)
## Sources
- Training knowledge (cutoff Jan 2026): Spring Boot 4.0 GA Nov 2025; Spring support policy (12-month OSS per minor); React 19.2 Oct 2025; Vite 7 June 2025; RabbitMQ 4.x; Playwright fake-media flags; MDN "perfect negotiation"; TURN REST API ephemeral credentials; Testcontainers `@ServiceConnection`. Live verification unavailable this session — confidence levels reflect that.
- Authoritative URLs for setup-time verification: https://start.spring.io · https://spring.io/projects/spring-boot#support · https://vite.dev · https://react.dev · https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation · https://github.com/coturn/coturn · https://java.testcontainers.org · https://playwright.dev
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
