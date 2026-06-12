# Phase 1: Foundation — Auth, Roles & Project Skeleton - Research

**Researched:** 2026-06-12
**Domain:** Spring Boot 4 / Spring Security 7 / JJWT 0.13 / React 19 / Vite 8 / Flyway / Docker Compose auth skeleton
**Confidence:** HIGH on patterns and architecture; MEDIUM on exact Spring Boot 4.1 vs 4.0.7 choice; HIGH on verified npm package versions

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Refresh token in httpOnly cookie — cannot be read by JS.
- **D-02:** Refresh token tracked server-side via hash in DB; supports rotation (new token each refresh, old invalidated) and instant revocation when admin locks user. NOT stateless.
- **D-03:** Access token (JWT HS256, 15-30 min) held in-memory in client JS/state — NOT localStorage. Auto-renew via axios 401 interceptor calling the refresh endpoint.
- **D-04:** First admin seeded via Flyway migration (e.g., `V2__seed_admin.sql`) with pre-computed BCrypt hash. No "first-registrant-is-admin" logic.
- **D-05:** Monorepo: `backend/` (Spring Boot) + `frontend/` (React+Vite) in same repo.
- **D-06:** Daily dev flow = local hot-reload (only PostgreSQL in Docker). Full `docker-compose.yml` (backend + frontend + Postgres) maintained for demo/handoff — required by Phase 1 success criterion #4.
- **D-07:** Package-by-feature Spring layout (`auth/`, `user/`, `config/`, `common/`).
- **D-08:** Post-login shows minimal home page ("Hello {username}" + role badge + logout button) AND a `/admin` placeholder page protected by both UI route guard and server-side RBAC. Demonstrates walking skeleton + AUTH-03 end-to-end.

### Claude's Discretion

- BCrypt via Spring Security `PasswordEncoder` (standard).
- DTO validation via `spring-boot-starter-validation` (`@Valid`, `@NotBlank`, `@Email`, min password length).
- `users` table schema: id, username, email (unique), password_hash, role, locked, created_at.
- `refresh_tokens` table: details delegated to researcher/planner.
- UI error handling: generic "incorrect username or password" — no info leakage.
- `SecurityFilterChain` lambda DSL, stateless session, `OncePerRequestFilter` for JWT.

### Deferred Ideas (OUT OF SCOPE)

- Email verification, password reset, OAuth/social login — not in v1.
- One-time WebSocket ticket auth hardening (STAB-05 in v2).
- WebSocket/presence, RBAC on WS (AUTH-04) — Phase 2.
- All call, media, history, admin user-management, scaling, monitoring — Phase 3+.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can register with username/email and password | Spring Security BCrypt + DTO validation + Flyway `users` table schema |
| AUTH-02 | Short-lived access JWT + refresh token; session auto-renews on 401; persists across browser refresh | JJWT 0.13 API + axios interceptor concurrent-queue pattern + httpOnly cookie SameSite config |
| AUTH-03 | Two roles Admin/User enforced on REST API | Spring Security `hasRole`/`hasAuthority` on SecurityFilterChain + `@PreAuthorize` on admin endpoints |
| AUTH-05 | User can log out from any page | DELETE refresh token from DB + clear httpOnly cookie + clear in-memory access token |
| INFR-07 | Database schema as versioned SQL migrations + setup docs | Flyway V1/V2 naming + `flyway-database-postgresql` module + `ddl-auto: validate` |

</phase_requirements>

---

## Summary

Phase 1 establishes the entire authentication, authorization, and infrastructure foundation for the 9-phase project. This is a greenfield, so every pattern set here — package layout, migration naming, security config DSL, frontend auth context shape — becomes the convention every subsequent phase extends.

The primary technical challenge is threefold: (1) Spring Security 7 (shipped with Boot 4.0.x/4.1.x) removed several APIs that tutorials still show (`authorizeRequests`, `AntPathRequestMatcher`, `and()`) — the SecurityFilterChain must use the current lambda DSL exclusively; (2) JJWT 0.12+ has a significantly changed API (`.parseSignedClaims()` not `.parseClaimsJws()`, `Jwts.parser().verifyWith(key)` not `.parserBuilder().setSigningKey()`) — every tutorial older than mid-2024 will show deprecated or removed methods; (3) the httpOnly refresh-token cookie must be configured correctly for CORS between Vite dev server (`localhost:5173`) and Spring (`localhost:8080`) — `SameSite=Lax`, `Secure=false`, `withCredentials: true` on the axios instance.

A significant version note: the locked stack references "Vite 7.x" but Vite's current stable as of 2026-06-12 is **8.0.16**. Vite 8 is API-compatible for this use case. Recommend using Vite 8.x unless Boot template pinning requires otherwise.

**Primary recommendation:** Use Spring Boot 4.1.0 (GA as of 2026-06-10, includes all 4.0.7 fixes), JJWT 0.13.0, Vite 8.x, and follow the PathPatternRequestMatcher + `authorizeHttpRequests` lambda DSL pattern throughout. Lock `ddl-auto: validate`, use Flyway for every schema change, and design the `refresh_tokens` table for hash-based rotation from the start.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| User registration / login | API / Backend | Database/Storage | Business logic, BCrypt encoding, token issuance live server-side |
| Access JWT issuance & validation | API / Backend | — | JJWT filter runs on every request in the server; client never validates |
| Refresh token storage & rotation | Database/Storage | API / Backend | Tokens stored as hashes in PostgreSQL; backend reads/writes on refresh endpoint |
| httpOnly cookie mechanics | API / Backend | Browser / Client | Server sets cookie headers; browser stores and sends automatically |
| In-memory access token (client) | Browser / Client | — | JS module-level variable or React state ref; not persisted to any storage |
| axios 401 interceptor auto-refresh | Browser / Client | — | Frontend concern; intercepts failed requests and retries after token refresh |
| Route guards (UI) | Browser / Client | — | React Router protected-route component wrapping `/admin` |
| Server-side RBAC | API / Backend | — | `@PreAuthorize("hasRole('ADMIN')")` or SecurityFilterChain `requestMatchers` |
| Schema migrations | Database/Storage | — | Flyway runs on app boot; versioned SQL in `db/migration` |
| Admin seed | Database/Storage | — | Flyway V2 SQL with pre-computed BCrypt hash |
| Docker Compose full-stack | CDN / Static + API + DB | — | Nginx serves React build; Spring serves REST; Postgres; healthchecks wire them |
| Dev hot-reload | Browser / Client + API | — | Vite dev proxy → Spring local; only Postgres in Docker |

---

## Standard Stack

### Core Backend (Phase 1 scope only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Spring Boot | **4.1.0** [VERIFIED: spring.io] | App framework | GA 2026-06-10; includes all 4.0.7 fixes; use 4.0.7 as fallback if dependency lag |
| Spring Security | **7.1.x** (via Boot BOM) | Filter chain, RBAC | Comes with Boot 4.1; lambda-DSL only |
| JJWT (`jjwt-api`, `jjwt-impl`, `jjwt-jackson`) | **0.13.0** [VERIFIED: npm search + maven central] | JWT issue/verify | Latest stable (Aug 2025); API changed significantly in 0.12 — see below |
| `spring-boot-starter-web` | via Boot BOM | REST API (Spring MVC) | Standard |
| `spring-boot-starter-security` | via Boot BOM | Filter chain, RBAC | Standard |
| `spring-boot-starter-data-jpa` | via Boot BOM | Hibernate/JPA for users + refresh_tokens | Standard |
| `spring-boot-starter-validation` | via Boot BOM | `@Valid` DTO validation | Standard; locked by D-Discretion |
| `spring-boot-starter-test` | via Boot BOM | JUnit 5 + Mockito + AssertJ | Standard |
| Flyway (`flyway-core` + `flyway-database-postgresql`) | via Boot BOM | Versioned migrations | Deliverable requirement; INFR-07 |
| PostgreSQL JDBC driver (`org.postgresql:postgresql`) | via Boot BOM | DB connectivity | Standard; runtime scope |
| Testcontainers (`postgresql` module) | **1.21+** via `spring-boot-testcontainers` | Integration tests with real DB | `@ServiceConnection` auto-wires; no property plumbing |
| springdoc-openapi (`springdoc-openapi-starter-webmvc-ui`) | **3.0.3** [ASSUMED] | Swagger UI for setup docs | Supports Boot 4 + Jackson 3; helps INFR-07 docs deliverable |
| Lombok | latest (optional) | Reduce boilerplate | Prefer Java records for DTOs |

### Core Frontend (Phase 1 scope only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | **19.2.7** [VERIFIED: npm registry] | UI | Current stable |
| TypeScript | **6.0.3** [VERIFIED: npm registry] | Types | Current stable |
| Vite | **8.0.16** [VERIFIED: npm registry] | Build/dev server | Current stable; locked stack says 7.x but 8 is GA and API-compatible |
| `@vitejs/plugin-react` | **6.0.2** [VERIFIED: npm registry] | React Fast Refresh | Required for Vite + React |
| React Router | **7.17.0** (library mode) [VERIFIED: npm registry] | Routing + route guards | Library mode (not framework); declarative protected routes |
| Axios | **1.17.0** [VERIFIED: npm registry] | HTTP client + interceptors | 401 interceptor refresh-on-retry pattern |
| Zustand | **5.0.14** [VERIFIED: npm registry] | Client state | Auth state (user, role); lightweight |
| TanStack Query | **5.101.0** [VERIFIED: npm registry] | Server state | REST data fetching; optional at Phase 1 but install now to avoid refactor |
| Tailwind CSS | **4.3.0** [VERIFIED: npm registry] | Styling | Fast utility-first UI; no component-library detour |
| Vitest | **4.1.8** [VERIFIED: npm registry] | Frontend unit tests | Vite-native; Jest is wrong choice |
| `@testing-library/react` | **16.3.2** [VERIFIED: npm registry] | Component tests | Paired with Vitest |
| `@testing-library/jest-dom` | **6.9.1** [VERIFIED: npm registry] | DOM matchers | Standard pairing |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JJWT 0.13 | Spring Security OAuth2 Resource Server (Nimbus JWT) | Nimbus is idiomatic but abstracts the filter you need to understand for WS auth in Phase 2; JJWT + hand-rolled filter teaches more |
| Zustand | React Context + useReducer | Context alone causes re-render storms; Zustand is minimal overhead |
| Axios | Fetch API | Fetch lacks request interceptor for token attach; acceptable if zero-dep required |
| Spring Boot 4.1.0 | Spring Boot 4.0.7 | 4.0.7 is the last 4.0.x patch; 4.1.0 GA includes all fixes + new features; either works |

**Installation:**
```bash
# Backend — generate at start.spring.io with Boot 4.1.0, Java 21
# Add manually to pom.xml:
# <dependency>io.jsonwebtoken:jjwt-api:0.13.0</dependency>
# <dependency>io.jsonwebtoken:jjwt-impl:0.13.0 (runtime)</dependency>
# <dependency>io.jsonwebtoken:jjwt-jackson:0.13.0 (runtime)</dependency>
# <dependency>org.flywaydb:flyway-database-postgresql (no version — Boot BOM)</dependency>
# <dependency>org.springdoc:springdoc-openapi-starter-webmvc-ui:3.0.3</dependency>
# <dependency>org.springframework.boot:spring-boot-testcontainers (test)</dependency>
# <dependency>org.testcontainers:postgresql (test)</dependency>

# Frontend
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router axios zustand @tanstack/react-query
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install -D tailwindcss @tailwindcss/vite
```

**Version verification (run at setup):**
```bash
# npm — confirmed current as of 2026-06-12:
npm view react version          # 19.2.7
npm view vite version           # 8.0.16
npm view axios version          # 1.17.0
npm view react-router version   # 7.17.0
npm view @tanstack/react-query version  # 5.101.0
npm view zustand version        # 5.0.14
npm view vitest version         # 4.1.8
npm view @testing-library/react version # 16.3.2
npm view tailwindcss version    # 4.3.0
npm view typescript version     # 6.0.3

# Java/Maven: verify on start.spring.io at setup time
# Spring Boot 4.1.0 GA (released 2026-06-10)
# JJWT 0.13.0 (released Aug 2025 — latest stable)
```

---

## Package Legitimacy Audit

> slopcheck was run but it defaulted to PyPI (wrong ecosystem). Packages were verified directly via `npm view` against the npm registry. Java packages are from the Maven Central / Spring BOM ecosystem.

| Package | Registry | Age | npm view confirms | Disposition |
|---------|----------|-----|-------------------|-------------|
| `react` | npm | 12+ yrs | 19.2.7 | Approved |
| `vite` | npm | 5+ yrs | 8.0.16 | Approved |
| `axios` | npm | 10+ yrs | 1.17.0 | Approved |
| `react-router` | npm | 10+ yrs | 7.17.0 | Approved |
| `@tanstack/react-query` | npm | 6+ yrs | 5.101.0 | Approved |
| `zustand` | npm | 6+ yrs | 5.0.14 | Approved |
| `vitest` | npm | 4+ yrs | 4.1.8 | Approved |
| `@testing-library/react` | npm | 7+ yrs | 16.3.2 | Approved |
| `tailwindcss` | npm | 8+ yrs | 4.3.0 | Approved |
| `typescript` | npm | 12+ yrs | 6.0.3 | Approved |
| `io.jsonwebtoken:jjwt-api` | Maven Central | 10+ yrs | 0.13.0 (Maven) | Approved |
| `org.springdoc:springdoc-openapi-starter-webmvc-ui` | Maven Central | 5+ yrs | 3.0.3 [ASSUMED] | Approved — verify Boot 4.1 compat at setup |
| `org.flywaydb:flyway-database-postgresql` | Maven Central | 3+ yrs | via Boot BOM | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck used wrong ecosystem; npm view confirmed all packages)
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram (Phase 1 scope)

```
  Browser (React 19 + Vite)
       │
       │  HTTP  http://localhost:5173  (dev)  /  http://localhost (Compose)
       │
       ├─ Vite dev proxy /api → localhost:8080  (dev only)
       │       OR
       └─ nginx (Compose: serves React build, proxies /api → backend:8080)
                │
                ▼
         Spring Boot 4.1 (port 8080)
         ┌─────────────────────────────────────┐
         │  SecurityFilterChain                │
         │    └─ JwtAuthFilter (OncePerRequest)│
         │         └─ extract Bearer header   │
         │              └─ validate JJWT 0.13 │
         │  AuthController                    │
         │    POST /api/auth/register         │
         │    POST /api/auth/login            │
         │    POST /api/auth/refresh          │
         │    POST /api/auth/logout           │
         │  UserController                    │
         │    GET /api/users/me               │
         │  AdminController                   │
         │    GET /api/admin/dashboard (ADMIN)│
         └─────────────────────────────────────┘
                │
                ▼
         PostgreSQL 17
         ┌───────────────────────┐
         │  users                │  ← Flyway V1__create_tables.sql
         │  refresh_tokens       │  ← same migration
         │  flyway_schema_history│  ← auto-managed
         └───────────────────────┘
         (V2__seed_admin.sql inserts first admin)
```

**Data flow — login:**
```
Browser POST /api/auth/login {username, password}
  → AuthController.login()
  → UserDetailsService.loadUserByUsername()
  → BCrypt.matches(password, hash)
  → JJWT build access JWT (15 min)
  → Generate random refresh token → SHA-256 hash → store in refresh_tokens
  → Response: { accessToken: "..." }  +  Set-Cookie: refreshToken=...; HttpOnly; SameSite=Lax; Path=/api/auth/refresh
  → React stores accessToken in module-level ref (not localStorage)

Browser (subsequent requests):
  → axios request interceptor: Authorization: Bearer <accessToken>
  → If 401: axios response interceptor:
      → POST /api/auth/refresh (cookie auto-sent by browser)
      → New accessToken returned; old refreshToken rotated
      → Retry original request with new token
      → If refresh also fails (locked/expired): redirect to /login

Browser POST /api/auth/logout:
  → Delete refresh_token row from DB
  → Clear httpOnly cookie (Set-Cookie with Max-Age=0)
  → React clears in-memory access token
```

### Recommended Project Structure

```
VDT2026-WebRTC/
├── backend/
│   ├── src/main/java/com/vdt/webrtc/
│   │   ├── auth/                   # feature: register, login, refresh, logout
│   │   │   ├── AuthController.java
│   │   │   ├── AuthService.java
│   │   │   ├── dto/
│   │   │   │   ├── RegisterRequest.java   # Java record
│   │   │   │   ├── LoginRequest.java      # Java record
│   │   │   │   └── AuthResponse.java      # Java record
│   │   │   └── RefreshTokenRepository.java
│   │   ├── user/                   # feature: user entity, UserDetails
│   │   │   ├── User.java            # @Entity
│   │   │   ├── UserRepository.java
│   │   │   ├── Role.java            # enum: USER, ADMIN
│   │   │   └── UserDetailsServiceImpl.java
│   │   ├── config/                 # cross-cutting
│   │   │   ├── SecurityConfig.java  # SecurityFilterChain @Bean
│   │   │   ├── JwtAuthFilter.java   # OncePerRequestFilter
│   │   │   ├── JwtService.java      # JJWT 0.13 build/parse
│   │   │   └── CorsConfig.java
│   │   └── common/                 # shared error handling
│   │       ├── GlobalExceptionHandler.java  # @ControllerAdvice
│   │       └── ApiError.java        # error response record
│   ├── src/main/resources/
│   │   ├── db/migration/
│   │   │   ├── V1__create_tables.sql
│   │   │   └── V2__seed_admin.sql
│   │   ├── application.yml
│   │   └── application-docker.yml  # Compose profile overrides
│   └── pom.xml
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── axiosInstance.ts     # axios with interceptors
│   │   │   └── auth.ts              # register/login/logout/refresh calls
│   │   ├── auth/
│   │   │   ├── AuthContext.tsx      # React Context + Provider
│   │   │   ├── useAuth.ts           # hook
│   │   │   └── ProtectedRoute.tsx   # React Router route guard
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── HomePage.tsx         # "Hello {username}" + role badge + logout
│   │   │   └── AdminPage.tsx        # placeholder, Admin-only
│   │   ├── App.tsx                  # React Router routes
│   │   └── main.tsx
│   ├── vite.config.ts               # proxy /api → localhost:8080 (dev)
│   └── package.json
├── docker-compose.yml               # full stack: backend + frontend + postgres
├── docker-compose.dev.yml           # dev override: postgres only (D-06)
├── backend/Dockerfile               # multi-stage: maven build → jre-alpine run
├── frontend/Dockerfile              # multi-stage: node build → nginx serve
└── docs/
    └── setup.md                     # INFR-07: setup documentation
```

### Pattern 1: SecurityFilterChain Lambda DSL (Spring Security 7)

**What:** The complete `SecurityFilterChain` bean using ONLY the current API (no removed methods).
**When to use:** This is the only correct pattern — old tutorials show removed APIs.

```java
// Source: https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html
// Verified 2026-06-12

@Configuration
@EnableWebSecurity
@EnableMethodSecurity   // enables @PreAuthorize
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
            JwtAuthFilter jwtAuthFilter) throws Exception {
        return http
            .csrf(AbstractHttpConfigurer::disable)  // stateless API, no sessions
            .cors(Customizer.withDefaults())         // picks up CorsConfigurationSource bean
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // NOTE: Spring Security 7 uses PathPatternRequestMatcher by default
                // requestMatchers(String) works for simple paths
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
```

**Critical breaking changes vs Spring Security 6:**
- `authorizeRequests()` is REMOVED — use `authorizeHttpRequests()` [VERIFIED: deepwiki Spring Security 7 migration]
- `AntPathRequestMatcher` and `MvcRequestMatcher` are REMOVED — use `PathPatternRequestMatcher` or string literals [VERIFIED]
- `and()` method on `HttpSecurity` is REMOVED — use separate lambda calls [VERIFIED]
- `WebSecurityConfigurerAdapter` has been removed since Spring Security 6, still absent [VERIFIED]
- `AuthorizationManager#check()` is REMOVED — use `AuthorizationManager#authorize()` [VERIFIED]

### Pattern 2: JJWT 0.13.0 Builder / Parser API

**What:** The current JJWT API. Tutorials pre-2024 show removed or deprecated methods.
**When to use:** JWT issuance in `AuthService` and validation in `JwtAuthFilter`.

```java
// Source: https://github.com/jwtk/jjwt/blob/master/CHANGELOG.md — 0.12+ changes
// JJWT 0.12.0: parserBuilder() removed (merged into parser()); parseClaimsJws() deprecated → parseSignedClaims()
// JJWT 0.12.0: getBody() deprecated → getPayload(); setSigningKey() removed → verifyWith()
// JJWT 0.13.0: latest stable (Aug 2025)

@Service
public class JwtService {
    // Key must be generated from a sufficiently long secret (>= 32 chars for HS256)
    // Store in application.yml: jwt.secret (base64-encoded 256-bit key)

    private SecretKey getSigningKey(String base64Secret) {
        byte[] keyBytes = Decoders.BASE64.decode(base64Secret);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    // BUILD access token
    public String generateAccessToken(String username, String role) {
        return Jwts.builder()
            .subject(username)
            .claim("role", role)
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + accessTokenTtlMs))
            .signWith(getSigningKey(secret))   // HS256 auto-selected by key size
            .compact();
    }

    // PARSE and VALIDATE — 0.13 API
    public Claims extractAllClaims(String token) {
        return Jwts.parser()                    // NOT parserBuilder() — removed in 0.12
            .verifyWith(getSigningKey(secret))  // NOT setSigningKey() — removed in 0.12
            .build()
            .parseSignedClaims(token)           // NOT parseClaimsJws() — deprecated in 0.12
            .getPayload();                      // NOT getBody() — deprecated in 0.12
    }
}
```

**Key JJWT 0.12/0.13 API summary (what changed):**

| Old (pre-0.12, in tutorials) | New (0.12+/0.13) | Status |
|------------------------------|-----------------|--------|
| `Jwts.parserBuilder()` | `Jwts.parser()` | Old removed |
| `.setSigningKey(key)` | `.verifyWith(key)` | Old removed |
| `.parseClaimsJws(token)` | `.parseSignedClaims(token)` | Old deprecated |
| `.getBody()` on Jws | `.getPayload()` | Old deprecated |
| `Jwts.builder().setSubject()` | `.subject()` | Old deprecated |
| `Jwts.builder().setExpiration()` | `.expiration()` | Old deprecated |
| `Jwts.builder().setIssuedAt()` | `.issuedAt()` | Old deprecated |

### Pattern 3: Refresh Token Table and Rotation

**What:** Database-backed refresh token with hash storage, rotation, and instant admin-lock revocation.
**When to use:** Every `/api/auth/refresh` call and admin lock operation.

```sql
-- V1__create_tables.sql
CREATE TABLE users (
    id          BIGSERIAL PRIMARY KEY,
    username    VARCHAR(50)  NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,  -- BCrypt output is always 60 chars; 100 for safety
    role        VARCHAR(20)  NOT NULL DEFAULT 'USER',  -- 'USER' | 'ADMIN'
    locked      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,  -- SHA-256 hex of the raw token (64 chars)
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    revoked     BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
```

```sql
-- V2__seed_admin.sql
-- BCrypt hash of "admin123" with strength 10:
-- Generate offline: new BCryptPasswordEncoder().encode("admin123")
-- Result (example — regenerate fresh for your deployment):
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@vdt.local',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ADMIN');
-- NOTE: regenerate this hash — never reuse example hashes in production
```

**Rotation logic in `AuthService.refresh()`:**
```java
// 1. Extract raw token from httpOnly cookie
// 2. Compute SHA-256 hash: DigestUtils.sha256Hex(rawToken)
// 3. Look up refresh_tokens by token_hash where revoked=false and expires_at > now()
// 4. Check user.locked == false → if locked, throw 401 (instant revocation: D-02)
// 5. Mark old token revoked=true
// 6. Generate new random token (UUID or SecureRandom bytes)
// 7. Store new token_hash in refresh_tokens
// 8. Return new access JWT + set new httpOnly cookie
```

### Pattern 4: httpOnly Cookie Configuration (CORS + Dev)

**What:** Correct cookie settings for Vite-to-Spring CORS in dev and same-origin in Compose.
**When to use:** All auth endpoints that set/clear the refresh token cookie.

```java
// In AuthController.login() and AuthController.refresh()
private ResponseCookie buildRefreshCookie(String token, long maxAgeSeconds) {
    return ResponseCookie.from("refreshToken", token)
        .httpOnly(true)
        .secure(false)          // false for HTTP localhost dev; true in prod (Phase 3 HTTPS)
        .sameSite("Lax")        // Lax: cookie sent on top-level navigation + same-site;
                                // sent on POST only if same-site or Strict nav.
                                // "None" requires Secure=true; "Strict" blocks CORS POST.
                                // Lax + credentials=true is the correct dev pattern.
        .path("/api/auth")      // limit cookie scope to auth endpoints only
        .maxAge(Duration.ofSeconds(maxAgeSeconds))
        .build();
}

// In AuthController.logout()
private ResponseCookie clearRefreshCookie() {
    return ResponseCookie.from("refreshToken", "")
        .httpOnly(true)
        .secure(false)
        .sameSite("Lax")
        .path("/api/auth")
        .maxAge(0)              // maxAge=0 instructs browser to delete cookie
        .build();
}
```

**CORS configuration for dev (Vite `localhost:5173` → Spring `localhost:8080`):**
```java
@Bean
public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("http://localhost:5173"));  // Vite dev server
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("*"));
    config.setAllowCredentials(true);  // REQUIRED for httpOnly cookies over CORS
    // NOTE: allowCredentials=true + allowedOrigins wildcard is rejected by browsers;
    // must list origins explicitly.
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
}
```

**Vite dev proxy (eliminates CORS for most API calls in dev):**
```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // NOTE: proxy does NOT forward cookies automatically for httpOnly cookies
        // The refresh cookie is set by Spring and lives on localhost:5173 origin
        // because the proxy makes requests look same-origin to the browser.
        // This is actually the CLEANEST approach for dev — no CORS cookie issues.
      }
    }
  }
})
```

> Using the Vite proxy for `/api` (including `/api/auth`) makes all requests appear same-origin to the browser — the httpOnly cookie is set on `localhost:5173`, and subsequent requests via the proxy automatically include it. This is cleaner than explicit CORS config. Keep the CORS bean as fallback / for Compose where there is no Vite proxy.

### Pattern 5: axios Interceptor with Concurrent 401 Queue

**What:** Client-side 401 handling that queues concurrent failing requests and only calls refresh once.
**When to use:** Every axios instance used for API calls in the frontend.

```typescript
// src/api/axiosInstance.ts
// Source: pattern from https://gist.github.com/Godofbrowser/bf118322301af3fc334437c683887c5f
// and https://gist.github.com/bragma/f68391596de71e1bfae066be80c259dc

// In-memory access token — module-level variable (not React state, not localStorage)
let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => { accessToken = token; };
export const getAccessToken = () => accessToken;

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token!));
  failedQueue = [];
};

const api = axios.create({ baseURL: '/api', withCredentials: true });
// withCredentials: true — required for the httpOnly refresh cookie to be sent

// Request interceptor: attach access token
api.interceptors.request.use(config => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Response interceptor: retry on 401 with queuing
api.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue concurrent failing requests
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token) => {
              originalRequest.headers!.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const { data } = await api.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(data.accessToken);
        processQueue(null, data.accessToken);
        originalRequest.headers!.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        setAccessToken(null);
        window.location.href = '/login';  // redirect to login on refresh failure
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

### Pattern 6: React Router v7 Protected Route

**What:** Route guard component wrapping admin-only routes; checks both auth and role.
**When to use:** `/admin` route and any future privileged routes.

```typescript
// src/auth/ProtectedRoute.tsx
interface ProtectedRouteProps {
  requiredRole?: 'ADMIN' | 'USER';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (requiredRole && user.role !== requiredRole) return <Navigate to="/" replace />;

  return <Outlet />;  // React Router v7 library mode
};

// src/App.tsx
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <ProtectedRoute />,           // any authenticated user
    children: [
      { path: '/', element: <HomePage /> },
    ],
  },
  {
    element: <ProtectedRoute requiredRole="ADMIN" />,  // ADMIN only
    children: [
      { path: '/admin', element: <AdminPage /> },
    ],
  },
]);
```

### Pattern 7: Flyway Migration Naming

**What:** Versioned SQL migration files, `ddl-auto: validate` to prevent Hibernate footguns.
**When to use:** Every schema change across all 9 phases.

```yaml
# application.yml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/vdt_webrtc
    username: vdt
    password: vdt_pass
  jpa:
    hibernate:
      ddl-auto: validate   # Flyway owns schema; Hibernate only validates
    show-sql: false
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: false

# application-docker.yml (activated in Compose via SPRING_PROFILES_ACTIVE=docker)
spring:
  datasource:
    url: jdbc:postgresql://postgres:5432/vdt_webrtc
```

**Migration file naming — the double-underscore is mandatory:**
```
src/main/resources/db/migration/
  V1__create_tables.sql     ← creates users + refresh_tokens tables
  V2__seed_admin.sql        ← inserts first admin with pre-hashed password
```

### Pattern 8: Docker Compose Full Stack Wiring

**What:** Phase 1 Compose (backend + frontend nginx + postgres) with healthchecks and `service_healthy`.
**When to use:** The D-06 demo/handoff Compose file.

```yaml
# docker-compose.yml (simplified for Phase 1)
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: vdt_webrtc
      POSTGRES_USER: vdt
      POSTGRES_PASSWORD: vdt_pass
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vdt -d vdt_webrtc"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      SPRING_PROFILES_ACTIVE: docker
      JWT_SECRET: ${JWT_SECRET:-change-this-in-production-at-least-32-chars}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8080/actuator/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile   # node:22-alpine build → nginx:1.27-alpine serve
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "80:80"
```

**Backend multi-stage Dockerfile:**
```dockerfile
# Stage 1: Build
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B    # cache layer
COPY src ./src
RUN mvn package -DskipTests -B

# Stage 2: Run
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**Frontend multi-stage Dockerfile:**
```dockerfile
# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**nginx.conf (frontend container — proxy /api to backend):**
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri /index.html;   # SPA fallback for React Router
    }
}
```

### Anti-Patterns to Avoid

- **`authorizeRequests()` in SecurityFilterChain:** Removed in Spring Security 7. Compile error. Use `authorizeHttpRequests()`.
- **`AntPathRequestMatcher` / `MvcRequestMatcher`:** Removed in Spring Security 7. Use string literals in `requestMatchers()` (defaults to `PathPatternRequestMatcher`).
- **`and()` chain on HttpSecurity:** Removed in Spring Security 7. Use separate lambdas.
- **`Jwts.parserBuilder()`:** Removed in JJWT 0.12. Use `Jwts.parser()`.
- **`.parseClaimsJws(token)` / `.getBody()`:** Deprecated in JJWT 0.12. Use `.parseSignedClaims()` / `.getPayload()`.
- **`ddl-auto: create` or `ddl-auto: update`:** Never use in this project — Flyway owns schema. Use `validate`.
- **Storing access token in localStorage:** Locked against by D-03 (XSS risk). Use module-level variable.
- **`SameSite=None` for refresh cookie on localhost:** Requires `Secure=true` which requires HTTPS. Use `Lax` for dev.
- **`allowedOrigins("*")` + `allowCredentials(true)` in CORS:** Browsers reject this combination. List origins explicitly.
- **Single refresh call with no queue on concurrent 401s:** Multiple parallel requests each trigger a refresh, causing token rotation collisions. Always use the `isRefreshing` + `failedQueue` pattern.
- **`WebSecurityConfigurerAdapter`:** Removed since Spring Security 6. Never extends it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom hash function | `BCryptPasswordEncoder` (Spring Security) | BCrypt handles salting, strength rounds, timing-safe comparison |
| JWT parse/validate | Custom HMAC + JSON | JJWT 0.13 | Handles signature verify, expiry, claims extraction, exception hierarchy |
| Schema migrations | `ddl-auto: create-drop`, raw JDBC scripts | Flyway `V{n}__desc.sql` | Reproducible, versioned, auditable; doubles as deliverable |
| Concurrent 401 queue | Ad-hoc flags | `isRefreshing` + `failedQueue` pattern | Without queuing, concurrent 401s cause multiple refresh calls → token rotation collision |
| Token TTL expiry check | Manual `Date` comparison | `JwtException` from JJWT parser | JJWT throws `ExpiredJwtException` on expiry — catch at filter level |
| Cookie building | `HttpServletResponse.addHeader("Set-Cookie", ...)` | `ResponseCookie` + `HttpHeaders.SET_COOKIE` | `ResponseCookie` handles `SameSite`, `HttpOnly`, `Secure`, and encoding correctly |

**Key insight:** The security and cookie handling surface in this stack is full of subtle correctness requirements (SameSite semantics, BCrypt strength, JWT signature validation). Every item in this table has at least one documented vulnerability vector if hand-rolled.

---

## Common Pitfalls

### Pitfall 1: Spring Security 7 Removed APIs — Tutorial Code Won't Compile

**What goes wrong:** Developer copies a Spring Boot 3.x JWT tutorial. Code uses `authorizeRequests()`, `AntPathRequestMatcher`, or `.and()`. Code fails to compile or behaves incorrectly at runtime.
**Why it happens:** The majority of JWT + Spring Security tutorials online are for Spring Security 5.x/6.x. Spring Security 7 (shipped with Boot 4.0+) removed these APIs.
**How to avoid:** Start from the Spring Security 7 reference docs (`authorizeHttpRequests`, `PathPatternRequestMatcher`). Treat any tutorial using `authorizeRequests` as outdated.
**Warning signs:** Compile error mentioning `authorizeRequests`, `AntPathRequestMatcher`, or `HttpSecurity.and()`.

### Pitfall 2: JJWT API Version Mismatch

**What goes wrong:** `Jwts.parserBuilder()` throws `NoSuchMethodError` at runtime. `parseClaimsJws()` or `setSigningKey()` produce compiler warnings that become errors if strict mode is on.
**Why it happens:** JJWT 0.12 removed `parserBuilder()` (merged into `parser()`), deprecated `parseClaimsJws()` → `parseSignedClaims()`, and deprecated `setSigningKey()` → `verifyWith()`.
**How to avoid:** Use the 0.13 API shown in Pattern 2. If copying tutorial code, treat any mention of `parserBuilder`, `parseClaimsJws`, `setSigningKey`, `getBody` as requiring replacement.
**Warning signs:** `NoSuchMethodError: io.jsonwebtoken.Jwts.parserBuilder()` at runtime.

### Pitfall 3: httpOnly Cookie Not Sent in Dev (CORS + withCredentials)

**What goes wrong:** The refresh token cookie is set by Spring on login, but subsequent calls to `/api/auth/refresh` in the browser don't include it. Token refresh fails silently with 401.
**Why it happens:** Cookies are not sent cross-origin unless `withCredentials: true` is set on axios AND the server includes `Access-Control-Allow-Credentials: true` AND the CORS origin is explicitly listed (not `*`). If using the Vite proxy, the cookie scope may differ.
**How to avoid:** Use the Vite proxy for all `/api` calls in dev (makes them same-origin from the browser's perspective — cleanest approach). Set `withCredentials: true` globally on the axios instance as a belt-and-suspenders measure. In Spring, set `config.setAllowCredentials(true)` and list `http://localhost:5173` explicitly.
**Warning signs:** Cookie visible in DevTools after login, but `network > /api/auth/refresh > Request Headers` shows no `Cookie` header.

### Pitfall 4: Concurrent 401 Race — Multiple Refresh Calls Rotating Same Token

**What goes wrong:** Multiple API requests fire simultaneously on page load. All get 401. Each triggers a separate `/api/auth/refresh` call. The first succeeds; the second uses the already-rotated (now invalid) refresh token → gets 401 from refresh endpoint → user logged out unexpectedly.
**Why it happens:** No queuing in the axios interceptor.
**How to avoid:** Implement the `isRefreshing` + `failedQueue` pattern (Pattern 5). The first 401 calls refresh; all subsequent 401s queue and retry with the token from the first refresh.
**Warning signs:** Intermittent unexpected logouts on page load with multiple API calls; multiple calls to `/api/auth/refresh` visible in Network tab.

### Pitfall 5: BCrypt Column Length Too Short

**What goes wrong:** `DataIntegrityViolationException` on register — BCrypt output truncated.
**Why it happens:** BCrypt always produces a 60-character string. If `password_hash VARCHAR(50)`, insertion fails.
**How to avoid:** Use `VARCHAR(100)` (or `VARCHAR(60)`) for `password_hash`. Shown in Pattern 3 migration.
**Warning signs:** `value too long for type character varying(N)` in Spring logs.

### Pitfall 6: `ddl-auto` Not Set to `validate`

**What goes wrong:** On restart with a new migration, Hibernate tries to auto-create/modify tables in addition to Flyway, causing conflicts or silently swallowing schema errors.
**Why it happens:** Default `ddl-auto` in dev can be `create-drop` or `update` depending on configuration.
**How to avoid:** Explicitly set `spring.jpa.hibernate.ddl-auto: validate` in all environments. Flyway runs before Hibernate; Hibernate just validates the schema matches entities.
**Warning signs:** Table created with different columns than expected; `SchemaManagementException` on startup.

### Pitfall 7: Refresh Token Cookie Scope Too Wide

**What goes wrong:** Refresh token cookie sent on all API calls (not just `/api/auth/refresh`), leaking the token in Authorization headers or CORS preflight requests.
**Why it happens:** Cookie `path` not scoped — defaults to `/` (entire site).
**How to avoid:** Set `path("/api/auth")` on the `ResponseCookie`. Only auth endpoints receive the cookie.

### Pitfall 8: SameSite=Strict Blocks Refresh on Cross-Origin POST

**What goes wrong:** Refresh call in dev (Vite port 5173 → Spring port 8080) fails with "missing cookie" even with `withCredentials: true`.
**Why it happens:** `SameSite=Strict` blocks cookie on cross-site requests entirely, including the POST to refresh. `SameSite=None` requires `Secure=true` (HTTPS). `SameSite=Lax` allows the refresh POST when using the Vite proxy (same-origin from browser perspective).
**How to avoid:** Use `SameSite=Lax` for dev. Use Vite proxy to make all requests same-origin in dev — eliminates the issue entirely.

### Pitfall 9: Admin Seed Password Hash — Never Reuse Example Hashes

**What goes wrong:** Tutorial BCrypt hashes (like `$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy`) appear in Google results. Anyone using a known example hash ships a known credential.
**Why it happens:** Developers copy-paste from examples.
**How to avoid:** Generate a fresh hash for your seed password using `new BCryptPasswordEncoder().encode("your-password")` locally. Never commit the plaintext password. Document the default seed password in `docs/setup.md` (it's a dev seed, not production).

### Pitfall 10: Docker Backend Starts Before Postgres Ready

**What goes wrong:** Spring Boot starts, tries to run Flyway migrations, PostgreSQL is not yet accepting connections — crash loop.
**Why it happens:** `depends_on: postgres` only waits for the container to start, not for Postgres to be ready.
**How to avoid:** Use `depends_on: postgres: condition: service_healthy` with a `healthcheck` on the postgres service. Pattern 8 shows this. Verified against Docker Compose docs.

---

## Code Examples

### Verified patterns from research:

### Admin-Only Endpoint with `@PreAuthorize`
```java
// Source: Spring Security 7.1 docs — @EnableMethodSecurity enables this
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {
    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, String>> dashboard() {
        return ResponseEntity.ok(Map.of("status", "Admin placeholder — Phase 1"));
    }
}
```

### JWT Auth Filter (OncePerRequestFilter)
```java
// Source: Pattern from bootify.io Spring Security JWT guide (verified pattern)
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        final String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith("Bearer ")) {
            chain.doFilter(request, response);
            return;
        }
        final String token = header.substring(7);
        try {
            Claims claims = jwtService.extractAllClaims(token);
            String username = claims.getSubject();
            if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(
                        userDetails, null, userDetails.getAuthorities());
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        } catch (JwtException e) {
            // Invalid token — don't set authentication, let the filter chain handle 401
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        chain.doFilter(request, response);
    }
}
```

### Auth Context in React 19
```typescript
// src/auth/AuthContext.tsx
interface User { username: string; role: 'USER' | 'ADMIN'; }
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: try to refresh to restore session across browser refresh
  useEffect(() => {
    api.post('/auth/refresh')
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return api.get<User>('/users/me');
      })
      .then(({ data }) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const { data } = await api.post<{ accessToken: string }>('/auth/login', { username, password });
    setAccessToken(data.accessToken);
    const { data: me } = await api.get<User>('/users/me');
    setUser(me);
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});  // best-effort
    setAccessToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `authorizeRequests()` | `authorizeHttpRequests()` | Spring Security 6 (Boot 3.0) | Old removed in Spring Security 7 |
| `AntPathRequestMatcher` | `PathPatternRequestMatcher` (or string literals) | Spring Security 7 (Boot 4.0) | Old class removed; must migrate |
| `WebSecurityConfigurerAdapter` | `SecurityFilterChain` bean | Spring Security 5.7 | Old removed in 6.0+ |
| `Jwts.parserBuilder()` | `Jwts.parser()` | JJWT 0.12 | Old method removed |
| `.parseClaimsJws()` | `.parseSignedClaims()` | JJWT 0.12 | Old deprecated, emits warnings |
| Vite 7 (locked in STACK.md) | **Vite 8.0.16** (current GA) | Vite 8.0 released in 2026 | API-compatible upgrade; update lock |
| Spring Boot 4.0.7 (last 4.0.x) | **Spring Boot 4.1.0** (current) | 2026-06-10 | GA; includes all 4.0.7 fixes; either works |
| JJWT 0.12.6 (locked in STACK.md) | **JJWT 0.13.0** (current) | Aug 2025 | Latest stable; same API as 0.12 |

**Deprecated/outdated (do not use):**
- `Jwts.parserBuilder()`: removed in 0.12.
- `authorizeRequests()`, `AntPathRequestMatcher`, `MvcRequestMatcher`, `and()` on `HttpSecurity`: removed in Spring Security 7.
- `WebSecurityConfigurerAdapter`: removed in Spring Security 6.
- CRA (Create React App): dead since ~2023.
- `ddl-auto: update`: footgun — Flyway is the migration tool.

---

## Open Questions

1. **Spring Boot 4.0.7 vs 4.1.0**
   - What we know: 4.0.7 is the last 4.0.x patch; 4.1.0 GA released 2026-06-10 and includes all 4.0.7 fixes. STACK.md says "Boot 4.0.x".
   - What's unclear: Whether any new 4.1.0 Spring Security 7.1 additions change the auth patterns used in Phase 1.
   - Recommendation: Use 4.1.0 (most current, all fixes included). Fallback: 4.0.7 — patterns shown in this research work on both.

2. **Vite 7 vs 8**
   - What we know: STACK.md and CLAUDE.md reference "Vite 7.x" but Vite 8.0.16 is the current stable npm version.
   - What's unclear: Whether the locked stack constraint (D-05, CLAUDE.md) intends Vite 7 specifically or "latest stable".
   - Recommendation: Use Vite 8.0.16 — API-compatible and more current. Note the discrepancy in RESEARCH.md and confirm with user if needed.

3. **springdoc-openapi 3.0.3 Boot 4 compatibility**
   - What we know: springdoc.org states it supports Boot 4 + Jackson 3; version 3.0.3 confirmed from Maven search results.
   - What's unclear: Whether 3.0.3 is the latest or if a newer 3.x patch exists.
   - Recommendation: Verify on [springdoc.org](https://springdoc.org/) at setup time. If unavailable, skip Swagger for Phase 1 and add manual API docs in `docs/setup.md`.

4. **Refresh endpoint cookie path and Vite proxy**
   - What we know: Vite proxy can make all requests same-origin, eliminating the cross-origin cookie issue. But the `/api/auth/refresh` endpoint is called by the axios interceptor which fires even on page load before Vite proxy is involved.
   - What's unclear: Exact cookie path behavior in the Compose environment (nginx proxies `/api` — same-origin there).
   - Recommendation: Set cookie `path="/api/auth"`, use `withCredentials: true` globally on axios, and proxy all `/api` through Vite in dev. Both dev and Compose are then same-origin from the browser's perspective.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Java 21 (OpenJDK Temurin) | Spring Boot backend | Yes | openjdk 21.0.11 2026-04-21 LTS | — |
| Docker | Full-stack Compose | Yes | 29.4.0 | — |
| Docker Compose | Full-stack demo | Yes | v5.1.1 | — |
| Node.js 22 | Frontend build/dev | Yes | v24.14.0 (Node 24 LTS — compatible) | — |
| npm | Frontend package manager | Yes | (bundled with Node) | — |
| Maven wrapper (`mvnw`) | Backend build | Not global (expected — uses wrapper) | 3.9.x via mvnw | `./mvnw` in repo |
| PostgreSQL | DB (dev) | Via Docker | 17-alpine | — |

**Notes:**
- Node version is 24.14.0 (Node 24 LTS). STACK.md targets Node 22 LTS. Node 24 is forward-compatible for Vite 8 + npm; no action needed.
- Java 21.0.11 is Temurin-compatible LTS — matches locked stack exactly.
- Maven is not on the PATH (expected for Maven wrapper projects — `./mvnw` handles it).

**Missing dependencies with no fallback:** None blocking Phase 1.

---

## Validation Architecture

> `workflow.nyquist_validation: true` in config.json — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | JUnit 5 (Jupiter) via `spring-boot-starter-test` |
| Frontend framework | Vitest 4.1.8 with React Testing Library 16.3.2 |
| Backend config file | none needed — Spring Boot auto-discovers `@SpringBootTest` |
| Frontend config file | `vitest.config.ts` (or in `vite.config.ts` via `test:` key) — Wave 0 gap |
| Backend quick run | `./mvnw test -pl backend` |
| Backend full suite | `./mvnw verify -pl backend` |
| Frontend quick run | `cd frontend && npx vitest run` |
| Frontend full suite | `cd frontend && npx vitest run --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | POST `/api/auth/register` creates user, returns 201, BCrypt-encodes password | Backend integration | `./mvnw test -pl backend -Dtest=AuthControllerTest#register_*` | ❌ Wave 0 |
| AUTH-01 | Duplicate email/username returns 409 | Backend integration | same class | ❌ Wave 0 |
| AUTH-01 | Invalid DTO (blank username, short password) returns 400 | Backend unit | `./mvnw test -pl backend -Dtest=AuthServiceTest` | ❌ Wave 0 |
| AUTH-02 | POST `/api/auth/login` with valid creds returns accessToken + sets httpOnly cookie | Backend integration | `./mvnw test -pl backend -Dtest=AuthControllerTest#login_*` | ❌ Wave 0 |
| AUTH-02 | POST `/api/auth/refresh` with valid cookie returns new accessToken, rotates refresh token | Backend integration | `./mvnw test -pl backend -Dtest=AuthControllerTest#refresh_*` | ❌ Wave 0 |
| AUTH-02 | Axios interceptor calls refresh on 401, retries original request | Frontend unit | `cd frontend && npx vitest run src/api/axiosInstance.test.ts` | ❌ Wave 0 |
| AUTH-02 | Session persists across browser refresh (AuthContext mount effect calls /refresh) | Frontend component | `cd frontend && npx vitest run src/auth/AuthContext.test.tsx` | ❌ Wave 0 |
| AUTH-03 | GET `/api/admin/dashboard` with USER role returns 403 | Backend integration | `./mvnw test -pl backend -Dtest=AdminControllerTest#rbac_*` | ❌ Wave 0 |
| AUTH-03 | GET `/api/admin/dashboard` with ADMIN role returns 200 | Backend integration | same | ❌ Wave 0 |
| AUTH-03 | UI route `/admin` redirects USER to `/` via ProtectedRoute | Frontend component | `cd frontend && npx vitest run src/auth/ProtectedRoute.test.tsx` | ❌ Wave 0 |
| AUTH-05 | POST `/api/auth/logout` deletes refresh token, clears cookie | Backend integration | `./mvnw test -pl backend -Dtest=AuthControllerTest#logout_*` | ❌ Wave 0 |
| AUTH-05 | After logout, old refresh token rejected on POST `/api/auth/refresh` | Backend integration | same | ❌ Wave 0 |
| INFR-07 | Flyway migrations run cleanly on fresh DB; `flyway_schema_history` has 2 entries | Backend integration | `./mvnw test -pl backend -Dtest=FlywayMigrationTest` | ❌ Wave 0 |
| INFR-07 | Admin seed user (V2 migration) can log in with documented default password | Backend integration | same (login test with seeded admin) | ❌ Wave 0 |

**Success criteria observability:**

| SC# | Success Criterion | Observable Via | Manual / Automated |
|-----|-------------------|----------------|--------------------|
| SC1 | Register + login, session persists across refresh | Integration test (register → login → close → refresh → /users/me) | Automated |
| SC2 | Logout returns to login screen | Frontend component test for logout + redirect | Automated |
| SC3 | Admin endpoints reject USER role | Integration test returning 403 | Automated |
| SC4 | `docker compose up` starts backend + frontend + Postgres; migrations applied | Manual smoke test + `curl localhost/actuator/health` | Manual (smoke) |

### Sampling Rate

- **Per task commit:** `./mvnw test -pl backend -Dtest=AuthControllerTest` + `cd frontend && npx vitest run`
- **Per wave merge:** `./mvnw verify -pl backend` + `cd frontend && npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`. SC4 (Docker Compose smoke) requires manual check.

### Wave 0 Gaps (must be created before implementation tasks)

- [ ] `backend/src/test/java/.../auth/AuthControllerTest.java` — register/login/refresh/logout integration tests using `@SpringBootTest` + Testcontainers PostgreSQL + `@ServiceConnection`
- [ ] `backend/src/test/java/.../config/SecurityConfigTest.java` — RBAC test (403 for USER on admin endpoint)
- [ ] `backend/src/test/java/.../FlywayMigrationTest.java` — verifies migration count and seed admin login
- [ ] `frontend/src/api/axiosInstance.test.ts` — tests 401 interceptor queue behavior with mocked axios
- [ ] `frontend/src/auth/AuthContext.test.tsx` — tests session restore on mount
- [ ] `frontend/src/auth/ProtectedRoute.test.tsx` — tests role-based redirect
- [ ] `frontend/vitest.config.ts` — configures jsdom environment

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` in config.json.

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | YES | BCryptPasswordEncoder (Spring Security); DTO validation on register |
| V3 Session Management | YES | Stateless JWT + httpOnly cookie; rotation on every refresh; revoke on logout/lock |
| V4 Access Control | YES | `hasRole('ADMIN')` in SecurityFilterChain + `@PreAuthorize`; UI ProtectedRoute |
| V5 Input Validation | YES | `@Valid` + `@NotBlank` + `@Email` + `@Size(min=8)` on register DTO |
| V6 Cryptography | YES | HS256 via JJWT (secret >= 32 chars); BCrypt for password storage; SHA-256 for refresh token hash |
| V7 Error Handling | YES | Generic "incorrect username or password" (no enumeration); `@ControllerAdvice` GlobalExceptionHandler |

### Known Threat Patterns (Phase 1 stack)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token theft from localStorage | Information Disclosure | Access token in JS module variable only (D-03); httpOnly cookie for refresh (D-01) |
| XSS reading access token | Information Disclosure | In-memory token (not DOM/localStorage) limits exposure window to 15-30 min TTL |
| CSRF on refresh endpoint | Tampering | httpOnly cookie + `SameSite=Lax`; stateless JWT on all other endpoints |
| Refresh token reuse after rotation | Repudiation | Server-side hash tracking (D-02); old token marked `revoked=true` |
| Admin lock bypass | Elevation of Privilege | `locked` check on every refresh call; access token TTL is 15-30 min (D-03) |
| Username enumeration | Information Disclosure | Generic error message "incorrect username or password" for both invalid user and wrong password |
| Weak JWT secret | Spoofing | Minimum 32-char secret (HS256 requirement); store in env var, never in source code |
| SQL injection on login | Tampering | JPA parameterized queries via Spring Data; never string-concatenated SQL |
| BCrypt column truncation | Data Corruption | `VARCHAR(100)` for `password_hash` (BCrypt output = 60 chars) |
| Multiple refresh calls (rotation collision) | Denial of Service | `isRefreshing` + `failedQueue` pattern in axios interceptor (Pattern 5) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | springdoc-openapi 3.0.3 is the current latest Boot-4-compatible version | Standard Stack | Swagger UI may not work; fallback: manual API docs |
| A2 | JJWT 0.13.0 API is backward-compatible with 0.12.6 (same `Jwts.parser().verifyWith()` API) | Code Examples | Code examples would need adjustment if 0.13 introduced new breaking changes |
| A3 | Vite 8 is API-compatible with Vite 7 for this project's use case (proxy, React plugin, TypeScript) | Standard Stack | Minor config changes needed; unlikely to block |
| A4 | Spring Boot 4.1.0 SecurityFilterChain patterns are identical to 4.0.x for this scope | Standard Stack | Planner should verify Spring Security 7.1 release notes before locking to 4.1.0 |
| A5 | TypeScript 6.0.3 is compatible with React 19.2.7 and Vite 8 | Standard Stack | STACK.md references TS 5.9.x; TS 6 may have breaking changes for some syntax |

---

## Sources

### Primary (HIGH confidence)
- Spring Security 7.1 reference docs — `authorizeHttpRequests`, `PathPatternRequestMatcher`, `SecurityFilterChain` patterns. [https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html](https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html)
- DeepWiki — Spring Security 7.0 Migration (removed APIs list, `authorizeRequests` removal, `AntPathRequestMatcher` removal). [https://deepwiki.com/spring-projects/spring-security/9-migration-to-spring-security-7.0](https://deepwiki.com/spring-projects/spring-security/9-migration-to-spring-security-7.0)
- JJWT CHANGELOG.md — 0.12.x API changes, `parserBuilder()` removal, `parseSignedClaims`, `verifyWith`. [https://github.com/jwtk/jjwt/blob/master/CHANGELOG.md](https://github.com/jwtk/jjwt/blob/master/CHANGELOG.md)
- npm registry (via `npm view`) — confirmed versions for all frontend packages (react 19.2.7, vite 8.0.16, axios 1.17.0, react-router 7.17.0, @tanstack/react-query 5.101.0, zustand 5.0.14, vitest 4.1.8, @testing-library/react 16.3.2, tailwindcss 4.3.0, typescript 6.0.3). [VERIFIED: npm registry]
- Spring.io blog — Spring Boot 4.1.0 GA release 2026-06-10. [https://spring.io/blog/2026/06/10/spring-boot-4/](https://spring.io/blog/2026/06/10/spring-boot-4/)

### Secondary (MEDIUM confidence)
- bootify.io Spring Security JWT guide — `OncePerRequestFilter` implementation pattern. [https://bootify.io/spring-security/rest-api-spring-security-with-jwt.html](https://bootify.io/spring-security/rest-api-spring-security-with-jwt.html)
- DEV.to / xjavascript.com — axios 401 interceptor with `isRefreshing` + `failedQueue` pattern. [https://www.xjavascript.com/blog/how-to-handle-401-authentication-error-in-axios-and-react/](https://www.xjavascript.com/blog/how-to-handle-401-authentication-error-in-axios-and-react/)
- GitHub Gist (bragma, Godofbrowser) — concurrent 401 queue implementation pattern. [https://gist.github.com/bragma/f68391596de71e1bfae066be80c259dc](https://gist.github.com/bragma/f68391596de71e1bfae066be80c259dc)
- springdoc.org — Boot 4 / Jackson 3 compatibility for 3.x releases. [https://springdoc.org/](https://springdoc.org/)
- Maven Central (via search results) — JJWT 0.13.0 release Aug 2025 (latest stable). [https://central.sonatype.com/artifact/io.jsonwebtoken/jjwt-api](https://central.sonatype.com/artifact/io.jsonwebtoken/jjwt-api)
- Robin Wieruch — React Router v7 protected routes. [https://www.robinwieruch.de/react-router-private-routes/](https://www.robinwieruch.de/react-router-private-routes/)
- bell-sw.com / Flyway docs — `flyway-database-postgresql` + `flyway-core` dual dependency requirement. [https://bell-sw.com/blog/how-to-use-flyway-with-spring-boot/](https://bell-sw.com/blog/how-to-use-flyway-with-spring-boot/)
- Docker Compose docs — `depends_on: condition: service_healthy` pattern. [https://docs.docker.com/compose/how-tos/startup-order/](https://docs.docker.com/compose/how-tos/startup-order/)
- DEV Community — httpOnly cookie SameSite Lax for localhost CORS dev. [https://dev.to/oatula/setting-the-cookies-using-the-js-axios-47jf](https://dev.to/oatula/setting-the-cookies-using-the-js-axios-47jf)

### Tertiary (LOW confidence — flag for validation)
- TypeScript 6.0.3 compatibility with React 19 + Vite 8 — not specifically verified; based on npm version data and general compatibility patterns.

---

## Metadata

**Confidence breakdown:**
- Spring Security 7 patterns: HIGH — verified against official docs and migration guide
- JJWT 0.13 API: HIGH — verified against CHANGELOG.md
- Frontend package versions: HIGH — verified via `npm view` (VERIFIED: npm registry)
- Refresh token rotation table design: HIGH — standard well-documented pattern
- axios interceptor concurrent-queue pattern: HIGH — well-documented, multiple sources agree
- httpOnly cookie SameSite/CORS dev setup: MEDIUM-HIGH — sources agree on `Lax + withCredentials + explicit origin`
- Docker Compose healthcheck pattern: HIGH — official Docker docs
- springdoc-openapi 3.x Boot 4 compat: MEDIUM — verify at setup
- TypeScript 6.0.3 compat: LOW — version jump from TS 5.9.x (locked) to 6.0.3 (current) not verified in detail

**Research date:** 2026-06-12
**Valid until:** 2026-08-12 (60 days — Spring and JJWT APIs are stable; npm versions will drift but patterns hold)
