# Phase 1: Foundation — Auth, Roles & Project Skeleton - Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 28 new files (greenfield — no existing application code)
**Analogs found:** 0 / 28 (repo is greenfield; all patterns sourced from RESEARCH.md and .planning/research/)

> **Greenfield notice:** This repo contains no application source code yet. There are no in-repo analogs to map.
> This document records the canonical patterns that Phase 1 ESTABLISHES. Every pattern here
> becomes the convention for all nine subsequent phases. Downstream executors MUST copy
> code from the excerpts below rather than from tutorials (which use removed APIs).

---

## File Classification

| New File | Role | Data Flow | Canonical Pattern Source | Notes |
|----------|------|-----------|--------------------------|-------|
| `backend/pom.xml` | config | — | RESEARCH.md §Standard Stack | Spring Boot 4.1.0 BOM, JJWT 0.13.0, Flyway, Testcontainers |
| `backend/src/main/resources/application.yml` | config | — | RESEARCH.md Pattern 7 | `ddl-auto: validate`, Flyway config, JWT secret env var |
| `backend/src/main/resources/application-docker.yml` | config | — | RESEARCH.md Pattern 7 | Compose profile: postgres hostname override |
| `backend/src/main/resources/db/migration/V1__create_tables.sql` | migration | batch | RESEARCH.md Pattern 3 | `users` + `refresh_tokens` tables; double-underscore naming mandatory |
| `backend/src/main/resources/db/migration/V2__seed_admin.sql` | migration | batch | RESEARCH.md Pattern 3 | BCrypt-hashed admin password; regenerate hash, never reuse example |
| `backend/src/main/java/.../config/SecurityConfig.java` | config | request-response | RESEARCH.md Pattern 1 | Lambda DSL only; no removed Spring Security 6 APIs |
| `backend/src/main/java/.../config/JwtAuthFilter.java` | middleware | request-response | RESEARCH.md §Code Examples (JWT Auth Filter) | `OncePerRequestFilter`; Bearer extraction; JJWT 0.13 parse |
| `backend/src/main/java/.../config/JwtService.java` | service | request-response | RESEARCH.md Pattern 2 | JJWT 0.13 build + parse API; `Jwts.parser()` not `parserBuilder()` |
| `backend/src/main/java/.../config/CorsConfig.java` | config | request-response | RESEARCH.md Pattern 4 | explicit origins; `allowCredentials(true)`; never wildcard + credentials |
| `backend/src/main/java/.../user/User.java` | model | CRUD | RESEARCH.md Pattern 3 (schema) | `@Entity`; fields: id, username, email, password_hash, role, locked, created_at |
| `backend/src/main/java/.../user/Role.java` | model | — | RESEARCH.md §Architecture Patterns | `enum Role { USER, ADMIN }` |
| `backend/src/main/java/.../user/UserRepository.java` | service | CRUD | Spring Data JPA convention | `findByUsername`, `findByEmail`, `existsByEmail` |
| `backend/src/main/java/.../user/UserDetailsServiceImpl.java` | service | request-response | RESEARCH.md §Code Examples | `loadUserByUsername`; wraps `User` entity into `UserDetails` |
| `backend/src/main/java/.../auth/AuthController.java` | controller | request-response | RESEARCH.md Pattern 4 (cookie building) | POST register/login/refresh/logout; `ResponseCookie` for httpOnly |
| `backend/src/main/java/.../auth/AuthService.java` | service | CRUD | RESEARCH.md Pattern 3 (rotation logic) | BCrypt encode; JJWT issue; SHA-256 hash of refresh token; rotation |
| `backend/src/main/java/.../auth/RefreshToken.java` | model | CRUD | RESEARCH.md Pattern 3 | `@Entity`; fields: id, user_id FK, token_hash, expires_at, created_at, revoked |
| `backend/src/main/java/.../auth/RefreshTokenRepository.java` | service | CRUD | Spring Data JPA convention | `findByTokenHashAndRevokedFalse`; `deleteByUser` |
| `backend/src/main/java/.../auth/dto/RegisterRequest.java` | model | request-response | RESEARCH.md §Claude's Discretion | Java record; `@NotBlank`, `@Email`, `@Size(min=8)` |
| `backend/src/main/java/.../auth/dto/LoginRequest.java` | model | request-response | RESEARCH.md §Claude's Discretion | Java record; `@NotBlank` |
| `backend/src/main/java/.../auth/dto/AuthResponse.java` | model | request-response | RESEARCH.md §Architecture Patterns | Java record; `{ String accessToken }` |
| `backend/src/main/java/.../common/GlobalExceptionHandler.java` | middleware | request-response | RESEARCH.md §Security Domain (V7) | `@ControllerAdvice`; generic auth error "incorrect username or password" |
| `backend/src/main/java/.../common/ApiError.java` | model | — | RESEARCH.md §Security Domain | Java record; `{ int status, String message, Instant timestamp }` |
| `frontend/package.json` | config | — | RESEARCH.md §Standard Stack (frontend) | React 19.2.7, Vite 8.0.16, axios 1.17.0, react-router 7.17.0, Zustand 5 |
| `frontend/vite.config.ts` | config | — | RESEARCH.md Pattern 4 (Vite proxy) | proxy `/api` → `localhost:8080`; eliminates dev CORS cookie issues |
| `frontend/src/api/axiosInstance.ts` | service | request-response | RESEARCH.md Pattern 5 | In-memory token; `isRefreshing` + `failedQueue` concurrent 401 queue |
| `frontend/src/api/auth.ts` | service | request-response | RESEARCH.md §Code Examples (AuthContext) | register/login/logout/refresh API calls via `axiosInstance` |
| `frontend/src/auth/AuthContext.tsx` | provider | event-driven | RESEARCH.md §Code Examples (Auth Context) | React Context; mount effect calls `/auth/refresh` to restore session |
| `frontend/src/auth/useAuth.ts` | hook | — | RESEARCH.md §Code Examples | `useContext(AuthContext)` with null-guard |
| `frontend/src/auth/ProtectedRoute.tsx` | component | request-response | RESEARCH.md Pattern 6 | `<Navigate>` on !user; `<Navigate to="/">` on role mismatch; `<Outlet>` |
| `frontend/src/pages/LoginPage.tsx` | component | request-response | RESEARCH.md §Decisions (D-08) | Form → `useAuth().login()`; generic error message on failure |
| `frontend/src/pages/RegisterPage.tsx` | component | request-response | RESEARCH.md §Decisions (D-08) | Form → `api.post('/auth/register')`; redirect to `/login` on success |
| `frontend/src/pages/HomePage.tsx` | component | request-response | RESEARCH.md §Decisions (D-08) | "Xin chào {username}" + role badge + logout button |
| `frontend/src/pages/AdminPage.tsx` | component | request-response | RESEARCH.md §Decisions (D-08) | Placeholder "Trang quản trị — chỉ Admin"; protected by `ProtectedRoute requiredRole="ADMIN"` |
| `frontend/src/App.tsx` | component | — | RESEARCH.md Pattern 6 | `createBrowserRouter` with nested `ProtectedRoute` wrappers |
| `backend/Dockerfile` | config | — | RESEARCH.md Pattern 8 | Multi-stage: `maven:3.9-eclipse-temurin-21` build → `eclipse-temurin:21-jre-alpine` run |
| `frontend/Dockerfile` | config | — | RESEARCH.md Pattern 8 | Multi-stage: `node:22-alpine` build → `nginx:1.27-alpine` serve |
| `frontend/nginx.conf` | config | — | RESEARCH.md Pattern 8 | SPA fallback `try_files $uri /index.html`; proxy `/api/` → `backend:8080` |
| `docker-compose.yml` | config | — | RESEARCH.md Pattern 8 | healthcheck `service_healthy`; backend `depends_on: postgres: condition: service_healthy` |
| `docker-compose.dev.yml` | config | — | RESEARCH.md §Decisions (D-06) | postgres-only override for local dev hot-reload |
| `docs/setup.md` | config | — | RESEARCH.md §Phase Requirements (INFR-07) | Setup documentation deliverable |

---

## Pattern Assignments

### `backend/src/main/java/.../config/SecurityConfig.java` (config, request-response)

**Canonical source:** RESEARCH.md §Architecture Patterns — Pattern 1

**CRITICAL: Spring Security 7 uses lambda DSL only. The following methods are REMOVED and will not compile:**
- `authorizeRequests()` → use `authorizeHttpRequests()`
- `AntPathRequestMatcher` / `MvcRequestMatcher` → use string literals in `requestMatchers()`
- `.and()` on `HttpSecurity` → use separate lambda calls
- `WebSecurityConfigurerAdapter` → use `SecurityFilterChain` `@Bean`

**Full pattern:**
```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity   // enables @PreAuthorize on AdminController
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

---

### `backend/src/main/java/.../config/JwtService.java` (service, request-response)

**Canonical source:** RESEARCH.md §Architecture Patterns — Pattern 2

**CRITICAL: JJWT 0.12+ API changes. The following are REMOVED/DEPRECATED:**

| Old (tutorials, pre-0.12) | New (0.13 — use this) |
|---------------------------|----------------------|
| `Jwts.parserBuilder()` | `Jwts.parser()` |
| `.setSigningKey(key)` | `.verifyWith(key)` |
| `.parseClaimsJws(token)` | `.parseSignedClaims(token)` |
| `.getBody()` | `.getPayload()` |
| `.setSubject()` / `.setExpiration()` / `.setIssuedAt()` | `.subject()` / `.expiration()` / `.issuedAt()` |

**Full pattern:**
```java
@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.access-token-ttl-ms:900000}")  // default 15 min
    private long accessTokenTtlMs;

    private SecretKey getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(secret);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateAccessToken(String username, String role) {
        return Jwts.builder()
            .subject(username)
            .claim("role", role)
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + accessTokenTtlMs))
            .signWith(getSigningKey())   // HS256 auto-selected by key size
            .compact();
    }

    public Claims extractAllClaims(String token) {
        return Jwts.parser()                    // NOT parserBuilder()
            .verifyWith(getSigningKey())         // NOT setSigningKey()
            .build()
            .parseSignedClaims(token)           // NOT parseClaimsJws()
            .getPayload();                      // NOT getBody()
    }

    public String extractUsername(String token) {
        return extractAllClaims(token).getSubject();
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        try {
            String username = extractUsername(token);
            return username.equals(userDetails.getUsername());
        } catch (JwtException e) {
            return false;
        }
    }
}
```

---

### `backend/src/main/java/.../config/JwtAuthFilter.java` (middleware, request-response)

**Canonical source:** RESEARCH.md §Code Examples — JWT Auth Filter (OncePerRequestFilter)

**Pattern:**
```java
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;

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
            if (username != null
                    && SecurityContextHolder.getContext().getAuthentication() == null) {
                UserDetails userDetails =
                    userDetailsService.loadUserByUsername(username);
                UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(
                        userDetails, null, userDetails.getAuthorities());
                authToken.setDetails(
                    new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        } catch (JwtException e) {
            // Invalid/expired token — don't set auth; let chain produce 401
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        chain.doFilter(request, response);
    }
}
```

---

### `backend/src/main/java/.../config/CorsConfig.java` (config, request-response)

**Canonical source:** RESEARCH.md Pattern 4

**CRITICAL:** `allowCredentials(true)` + wildcard `allowedOrigins("*")` is rejected by browsers. Always list origins explicitly.

```java
@Configuration
public class CorsConfig {

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("http://localhost:5173")); // Vite dev
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);  // REQUIRED for httpOnly cookies over CORS
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
```

---

### `backend/src/main/java/.../auth/AuthController.java` (controller, request-response)

**Canonical source:** RESEARCH.md Pattern 4 (httpOnly cookie building)

**Cookie building pattern — use `ResponseCookie`, never `HttpServletResponse.addHeader("Set-Cookie", ...)`:**
```java
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<Void> register(@Valid @RequestBody RegisterRequest request) {
        authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request,
            HttpServletResponse response) {
        AuthService.LoginResult result = authService.login(request);
        response.addHeader(HttpHeaders.SET_COOKIE,
            buildRefreshCookie(result.rawRefreshToken(),
                Duration.ofDays(7).getSeconds()).toString());
        return ResponseEntity.ok(new AuthResponse(result.accessToken()));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            @CookieValue(name = "refreshToken", required = false) String rawToken,
            HttpServletResponse response) {
        if (rawToken == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        AuthService.LoginResult result = authService.refresh(rawToken);
        response.addHeader(HttpHeaders.SET_COOKIE,
            buildRefreshCookie(result.rawRefreshToken(),
                Duration.ofDays(7).getSeconds()).toString());
        return ResponseEntity.ok(new AuthResponse(result.accessToken()));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = "refreshToken", required = false) String rawToken,
            HttpServletResponse response) {
        if (rawToken != null) authService.logout(rawToken);
        response.addHeader(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString());
        return ResponseEntity.noContent().build();
    }

    private ResponseCookie buildRefreshCookie(String token, long maxAgeSeconds) {
        return ResponseCookie.from("refreshToken", token)
            .httpOnly(true)
            .secure(false)       // false for HTTP localhost dev; set true in Phase 3 HTTPS
            .sameSite("Lax")     // Lax + Vite proxy = no CORS cookie issues in dev
            .path("/api/auth")   // scope to auth endpoints only — Pitfall 7
            .maxAge(Duration.ofSeconds(maxAgeSeconds))
            .build();
    }

    private ResponseCookie clearRefreshCookie() {
        return ResponseCookie.from("refreshToken", "")
            .httpOnly(true)
            .secure(false)
            .sameSite("Lax")
            .path("/api/auth")
            .maxAge(0)           // maxAge=0 deletes cookie
            .build();
    }
}
```

---

### `backend/src/main/java/.../auth/AuthService.java` (service, CRUD)

**Canonical source:** RESEARCH.md Pattern 3 — Refresh Token Rotation Logic

**Rotation flow (copy exactly — prevents race conditions and instant-revocation gap):**
```java
@Service
@Transactional
@RequiredArgsConstructor
public class AuthService {

    // record returned to controller
    public record LoginResult(String accessToken, String rawRefreshToken) {}

    public LoginResult login(LoginRequest request) {
        // 1. Load user; verify not locked
        User user = userRepository.findByUsername(request.username())
            .orElseThrow(() -> new BadCredentialsException("incorrect username or password"));
        if (user.isLocked()) throw new LockedException("account locked");
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash()))
            throw new BadCredentialsException("incorrect username or password");

        // 2. Issue access JWT
        String accessToken = jwtService.generateAccessToken(
            user.getUsername(), user.getRole().name());

        // 3. Generate raw refresh token → store SHA-256 hash
        String rawToken = generateRawRefreshToken();
        storeRefreshTokenHash(user, rawToken);

        return new LoginResult(accessToken, rawToken);
    }

    public LoginResult refresh(String rawToken) {
        // 1. Hash raw token; look up
        String hash = DigestUtils.sha256Hex(rawToken);
        RefreshToken stored = refreshTokenRepository
            .findByTokenHashAndRevokedFalse(hash)
            .orElseThrow(() -> new AccessDeniedException("invalid refresh token"));

        // 2. Check expiry and user lock
        if (stored.getExpiresAt().isBefore(Instant.now()))
            throw new AccessDeniedException("refresh token expired");
        User user = stored.getUser();
        if (user.isLocked()) throw new LockedException("account locked");

        // 3. Rotate: revoke old, issue new
        stored.setRevoked(true);
        String newRaw = generateRawRefreshToken();
        storeRefreshTokenHash(user, newRaw);
        String accessToken = jwtService.generateAccessToken(
            user.getUsername(), user.getRole().name());

        return new LoginResult(accessToken, newRaw);
    }

    public void logout(String rawToken) {
        String hash = DigestUtils.sha256Hex(rawToken);
        refreshTokenRepository.findByTokenHashAndRevokedFalse(hash)
            .ifPresent(t -> t.setRevoked(true));
    }

    private String generateRawRefreshToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private void storeRefreshTokenHash(User user, String rawToken) {
        RefreshToken token = new RefreshToken();
        token.setUser(user);
        token.setTokenHash(DigestUtils.sha256Hex(rawToken));
        token.setExpiresAt(Instant.now().plus(Duration.ofDays(7)));
        refreshTokenRepository.save(token);
    }
}
```

---

### `backend/src/main/resources/db/migration/V1__create_tables.sql` (migration, batch)

**Canonical source:** RESEARCH.md Pattern 3

**Double-underscore in `V1__create_tables.sql` is MANDATORY — single underscore is not recognized by Flyway.**

```sql
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,  -- BCrypt = 60 chars; 100 for safety (Pitfall 5)
    role          VARCHAR(20)  NOT NULL DEFAULT 'USER',
    locked        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,  -- SHA-256 hex = exactly 64 chars
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    revoked     BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_refresh_tokens_user_id   ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
```

---

### `backend/src/main/resources/db/migration/V2__seed_admin.sql` (migration, batch)

**Canonical source:** RESEARCH.md Pattern 3 + Pitfall 9

**CRITICAL (Pitfall 9): NEVER reuse the example hash below. Generate a fresh hash:**
```bash
# Run once locally before committing:
# new BCryptPasswordEncoder().encode("your-chosen-password")
# Or via Spring shell / a one-off test
```

```sql
-- V2__seed_admin.sql
-- Replace the hash below with a freshly generated BCrypt hash BEFORE committing.
-- Document the default seed password in docs/setup.md (it is dev-only, not production).
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@vdt.local',
        '$2a$10$REPLACE_WITH_FRESHLY_GENERATED_BCRYPT_HASH_HERE_______', 'ADMIN');
```

---

### `backend/src/main/resources/application.yml` (config)

**Canonical source:** RESEARCH.md Pattern 7

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/vdt_webrtc
    username: vdt
    password: vdt_pass
  jpa:
    hibernate:
      ddl-auto: validate   # Flyway owns schema; Hibernate only validates — NEVER use create/update
    show-sql: false
    properties:
      hibernate:
        format_sql: false
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: false

jwt:
  secret: ${JWT_SECRET}   # base64-encoded 256-bit key; min 32 ASCII chars before encoding
  access-token-ttl-ms: 900000   # 15 minutes

server:
  port: 8080

management:
  endpoints:
    web:
      exposure:
        include: health
```

---

### `backend/src/main/resources/application-docker.yml` (config)

**Canonical source:** RESEARCH.md Pattern 7

```yaml
# Activated via SPRING_PROFILES_ACTIVE=docker in docker-compose.yml
spring:
  datasource:
    url: jdbc:postgresql://postgres:5432/vdt_webrtc  # 'postgres' = Compose service name
```

---

### `frontend/vite.config.ts` (config)

**Canonical source:** RESEARCH.md Pattern 4 (Vite proxy)

Using Vite proxy makes ALL `/api` requests same-origin from the browser's perspective.
The httpOnly refresh cookie is set on `localhost:5173`, and the proxy forwards it automatically.
This is cleaner than explicit CORS config for dev.

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // Proxy makes requests same-origin → httpOnly cookie works without CORS config
      }
    }
  }
})
```

---

### `frontend/src/api/axiosInstance.ts` (service, request-response)

**Canonical source:** RESEARCH.md Pattern 5

**CRITICAL (Pitfall 4): Without the `isRefreshing` + `failedQueue` queue, concurrent 401s each trigger a separate refresh call, causing rotation collisions and unexpected logouts.**

```typescript
import axios, { AxiosError, AxiosRequestConfig } from 'axios'

// In-memory access token — module-level variable (NOT localStorage, NOT React state — D-03)
let accessToken: string | null = null

export const setAccessToken = (token: string | null) => { accessToken = token }
export const getAccessToken = () => accessToken

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token!))
  failedQueue = []
}

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,  // REQUIRED: sends httpOnly refreshToken cookie
})

// Request interceptor: attach access token
api.interceptors.request.use(config => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// Response interceptor: retry on 401 with concurrent-request queue
api.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token) => {
              originalRequest.headers!.Authorization = `Bearer ${token}`
              resolve(api(originalRequest))
            },
            reject,
          })
        })
      }
      originalRequest._retry = true
      isRefreshing = true
      try {
        const { data } = await api.post<{ accessToken: string }>('/auth/refresh')
        setAccessToken(data.accessToken)
        processQueue(null, data.accessToken)
        originalRequest.headers!.Authorization = `Bearer ${data.accessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        setAccessToken(null)
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

export default api
```

---

### `frontend/src/auth/AuthContext.tsx` (provider, event-driven)

**Canonical source:** RESEARCH.md §Code Examples — Auth Context in React 19

**Session restore on browser refresh:** mount `useEffect` calls `/auth/refresh` — the httpOnly cookie is sent automatically, returning a new access token without user action.

```typescript
import { createContext, useState, useEffect, useContext } from 'react'
import api, { setAccessToken } from '../api/axiosInstance'

interface User { username: string; role: 'USER' | 'ADMIN' }
interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore session on page refresh — httpOnly cookie auto-sent by browser
  useEffect(() => {
    api.post<{ accessToken: string }>('/auth/refresh')
      .then(({ data }) => {
        setAccessToken(data.accessToken)
        return api.get<User>('/users/me')
      })
      .then(({ data }) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (username: string, password: string) => {
    const { data } = await api.post<{ accessToken: string }>('/auth/login',
      { username, password })
    setAccessToken(data.accessToken)
    const { data: me } = await api.get<User>('/users/me')
    setUser(me)
  }

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {})  // best-effort
    setAccessToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
```

---

### `frontend/src/auth/ProtectedRoute.tsx` (component, request-response)

**Canonical source:** RESEARCH.md Pattern 6 — React Router v7 Protected Route

```typescript
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'

interface ProtectedRouteProps {
  requiredRole?: 'ADMIN' | 'USER'
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole }) => {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <div>Loading...</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (requiredRole && user.role !== requiredRole) return <Navigate to="/" replace />

  return <Outlet />  // React Router v7 library mode — renders child routes
}
```

---

### `frontend/src/App.tsx` (component)

**Canonical source:** RESEARCH.md Pattern 6 — createBrowserRouter with nested ProtectedRoute

```typescript
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <ProtectedRoute />,        // any authenticated user
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
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
```

---

### `docker-compose.yml` (config)

**Canonical source:** RESEARCH.md Pattern 8

**CRITICAL (Pitfall 10):** `depends_on: postgres` alone only waits for container start, NOT for Postgres to accept connections. Must use `condition: service_healthy` with a `healthcheck`.

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: vdt_webrtc
      POSTGRES_USER: vdt
      POSTGRES_PASSWORD: vdt_pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
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
      JWT_SECRET: ${JWT_SECRET:-change-this-in-production-min-32-chars-base64}
    depends_on:
      postgres:
        condition: service_healthy   # wait for Postgres to be ready, not just started
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8080/actuator/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
    expose:
      - "8080"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "80:80"

volumes:
  postgres_data:
```

---

### `backend/Dockerfile` and `frontend/Dockerfile` (config)

**Canonical source:** RESEARCH.md Pattern 8

**Backend Dockerfile:**
```dockerfile
# Stage 1: Build
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B    # cache dependency layer separately
COPY src ./src
RUN mvn package -DskipTests -B

# Stage 2: Run
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**Frontend Dockerfile:**
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

**frontend/nginx.conf:**
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
        try_files $uri /index.html;   # SPA fallback for React Router client-side routing
    }
}
```

---

### Admin-only endpoint pattern (AdminController) (controller, request-response)

**Canonical source:** RESEARCH.md §Code Examples — Admin-Only Endpoint with `@PreAuthorize`

```java
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")  // requires @EnableMethodSecurity on SecurityConfig
public class AdminController {

    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, String>> dashboard() {
        return ResponseEntity.ok(Map.of("status", "Admin placeholder — Phase 1"));
    }
}
```

---

## Shared Patterns

### Error Handling (generic auth errors — no information leakage)

**Source:** RESEARCH.md §Security Domain — V7 Error Handling, Pitfall references
**Apply to:** `GlobalExceptionHandler.java`, `AuthService.java`, all auth endpoints

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    // Generic credential error — never reveal whether username or password was wrong (V7)
    @ExceptionHandler({BadCredentialsException.class, UsernameNotFoundException.class})
    public ResponseEntity<ApiError> handleBadCredentials(Exception e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(new ApiError(401, "incorrect username or password", Instant.now()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(new ApiError(403, "access denied", Instant.now()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
            .map(f -> f.getField() + ": " + f.getDefaultMessage())
            .collect(Collectors.joining("; "));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(new ApiError(400, msg, Instant.now()));
    }
}

// ApiError.java
public record ApiError(int status, String message, Instant timestamp) {}
```

---

### DTO Validation (all register/login DTOs)

**Source:** RESEARCH.md §Claude's Discretion, CONTEXT.md §Claude's Discretion
**Apply to:** `RegisterRequest.java`, `LoginRequest.java`, all future request DTOs

```java
// RegisterRequest.java
public record RegisterRequest(
    @NotBlank String username,
    @NotBlank @Email String email,
    @NotBlank @Size(min = 8, message = "must be at least 8 characters") String password
) {}

// LoginRequest.java
public record LoginRequest(
    @NotBlank String username,
    @NotBlank String password
) {}
```

Controller usage:
```java
public ResponseEntity<Void> register(@Valid @RequestBody RegisterRequest request)
//                                    ^^^^^^ triggers MethodArgumentNotValidException on failure
```

---

### Flyway Migration Naming Convention

**Source:** RESEARCH.md Pattern 7
**Apply to:** Every SQL migration file across all 9 phases

```
db/migration/
  V1__create_tables.sql       ← double underscore is MANDATORY
  V2__seed_admin.sql
  V3__add_column_example.sql  ← future phases follow same pattern
```

Rules:
- Prefix: `V` (uppercase)
- Version: integer or dotted (`V1`, `V1.1`, `V2`)
- Separator: DOUBLE underscore `__`
- Description: lowercase words separated by single underscore
- Extension: `.sql`

`application.yml` must have `spring.jpa.hibernate.ddl-auto: validate` — Flyway owns the schema, Hibernate only validates.

---

### Package-by-Feature Layout (Spring backend)

**Source:** CONTEXT.md §Decisions D-07, RESEARCH.md §Recommended Project Structure
**Apply to:** All backend Java packages

```
com.vdt.webrtc/
  auth/           ← feature: register, login, refresh, logout, refresh token entity
  user/           ← feature: User entity, Role enum, UserRepository, UserDetailsServiceImpl
  config/         ← cross-cutting: SecurityConfig, JwtAuthFilter, JwtService, CorsConfig
  common/         ← shared: GlobalExceptionHandler, ApiError
  # Future phases add: signaling/, call/, presence/, history/, admin/
```

Do NOT use layer-based layout (`controllers/`, `services/`, `repositories/`) — package by feature per D-07.

---

### httpOnly Cookie Policy

**Source:** RESEARCH.md Pattern 4, Pitfalls 3, 7, 8
**Apply to:** All methods in `AuthController` that set or clear the refresh token cookie

| Property | Value | Reason |
|----------|-------|--------|
| `httpOnly` | `true` | Prevents JS from reading token (D-01) |
| `secure` | `false` (Phase 1) | HTTP localhost dev; change to `true` in Phase 3 (HTTPS) |
| `sameSite` | `"Lax"` | `Strict` blocks cross-origin POST; `None` requires `Secure=true` |
| `path` | `"/api/auth"` | Scope to auth endpoints only; prevents token in all requests (Pitfall 7) |
| `maxAge` | `Duration.ofDays(7)` | On login/refresh; `0` on logout |

---

### In-Memory Access Token Policy (frontend)

**Source:** RESEARCH.md §Decisions (D-03), Pattern 5
**Apply to:** `axiosInstance.ts`, `AuthContext.tsx`, all frontend auth code

```typescript
// DO: module-level variable — cleared on page unload (safe)
let accessToken: string | null = null

// DO NOT: localStorage.setItem('accessToken', ...) — XSS risk (D-03)
// DO NOT: sessionStorage.setItem('accessToken', ...) — same origin sharing risk
// DO NOT: React state (useState) — causes re-renders on every request; leaks across DevTools
```

---

## No Analog Found

All files in this phase are new (greenfield repo). The patterns above ARE the analogs — they become the convention for phases 2–9.

| File | Role | Data Flow | Pattern Source |
|------|------|-----------|----------------|
| All 40 files listed above | various | various | RESEARCH.md patterns 1–8 + ARCHITECTURE.md + PITFALLS.md |

---

## Critical Anti-Patterns (Executor Checklist)

These are compile/runtime errors that WILL occur if tutorials are followed blindly:

| Anti-Pattern | Symptom | Correct Alternative |
|--------------|---------|---------------------|
| `authorizeRequests()` | Compile error: method not found | `authorizeHttpRequests()` |
| `AntPathRequestMatcher` / `MvcRequestMatcher` | Compile error: class not found | String literals in `requestMatchers()` |
| `.and()` on `HttpSecurity` | Compile error: method not found | Separate lambda calls |
| `WebSecurityConfigurerAdapter` extends | Compile error: class not found | `SecurityFilterChain @Bean` |
| `Jwts.parserBuilder()` | `NoSuchMethodError` at runtime | `Jwts.parser()` |
| `.parseClaimsJws(token)` | Deprecation warnings / errors | `.parseSignedClaims(token)` |
| `.getBody()` on Jws | Deprecation warnings / errors | `.getPayload()` |
| `ddl-auto: create` or `update` | Schema conflicts / silent data loss | `ddl-auto: validate` |
| `localStorage.setItem('accessToken')` | XSS token theft | Module-level variable |
| `allowedOrigins("*") + allowCredentials(true)` | Browser rejects with CORS error | Explicit origin list |
| Single refresh call without queue | Rotation collision → unexpected logouts | `isRefreshing + failedQueue` pattern |
| `depends_on: postgres` (no healthcheck) | Spring crash-loop on start | `condition: service_healthy` + postgres `healthcheck` |
| Reusing example BCrypt hash from docs | Known credential in production | Generate fresh with `BCryptPasswordEncoder().encode(...)` |
| Single underscore in migration: `V1_create.sql` | Flyway ignores file silently | Double underscore: `V1__create.sql` |
| Cookie `path: "/"` | Refresh token sent on every API call | `path: "/api/auth"` |

---

## Metadata

**Analog search scope:** Entire repo (greenfield — no application source code found)
**Files scanned:** 0 application source files (only `.planning/` artifacts exist)
**Patterns sourced from:**
- `01-RESEARCH.md` — Patterns 1–8, Code Examples, Anti-Patterns, Common Pitfalls
- `.planning/research/ARCHITECTURE.md` — Package-by-feature rationale, component boundaries
- `.planning/research/PITFALLS.md` — Critical pitfalls cross-referenced with pattern choices
- `CLAUDE.md` — Stack versions, project constraints
**Pattern extraction date:** 2026-06-12
**Valid until:** 2026-08-12 (Spring Security 7 and JJWT 0.13 APIs are stable; npm versions will drift but patterns hold)
