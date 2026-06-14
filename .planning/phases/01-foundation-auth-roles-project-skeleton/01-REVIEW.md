---
phase: 01-foundation-auth-roles-project-skeleton
reviewed: 2026-06-14T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - backend/src/main/java/com/vdt/webrtc/auth/AuthController.java
  - backend/src/main/java/com/vdt/webrtc/auth/AuthService.java
  - backend/src/main/java/com/vdt/webrtc/auth/LoginResult.java
  - backend/src/main/java/com/vdt/webrtc/auth/RefreshToken.java
  - backend/src/main/java/com/vdt/webrtc/auth/RefreshTokenRepository.java
  - backend/src/main/java/com/vdt/webrtc/common/GlobalExceptionHandler.java
  - backend/src/main/java/com/vdt/webrtc/common/InvalidRefreshTokenException.java
  - backend/src/main/java/com/vdt/webrtc/user/UserController.java
  - backend/src/main/java/com/vdt/webrtc/user/UserRepository.java
  - backend/src/main/java/com/vdt/webrtc/user/UserService.java
  - backend/src/main/java/com/vdt/webrtc/user/dto/UserProfile.java
  - frontend/src/App.tsx
  - frontend/src/api/axios.ts
  - frontend/src/hooks/useLogout.ts
  - frontend/src/pages/HomePage.tsx
  - frontend/src/routes/ProtectedRoute.tsx
  - frontend/src/store/authStore.ts
findings:
  critical: 2
  warning: 7
  info: 3
  total: 12
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-14
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Reviewed the refresh-token-rotation auth slice across Spring Boot backend and React/TS frontend. The core design intent largely holds: refresh tokens are stored as SHA-256 hashes, rotated on `/refresh` via an atomic CAS update (`revokeActiveByHash`), the access token stays in memory on the client, and `/users/me` does not leak `passwordHash`. The CAS-based rotation is correct under READ_COMMITTED (the second concurrent refresh blocks on the row lock and then sees 0 rows updated), and logout is idempotent.

However, several real defects exist: the refresh cookie hardcodes `secure(false)` (token transmitted over plaintext in any non-localhost deployment), a default admin with a publicly documented password is seeded with no forced rotation, rotated/expired refresh tokens are never cleaned up and reuse of a stolen-then-rotated token is not treated as a breach (no token-family revocation), and `/users/me` surfaces a raw `RuntimeException` that the global handler maps to a 500. Frontend auth flow is mostly sound but `login()` lacks transactional boundaries and a couple of robustness gaps remain.

Note: several referenced files outside the review scope (`SecurityConfig`, `CorsConfig`, `JwtService`, `JwtAuthFilter`, V2 seed migration) were read for context; findings touching them are reported where they materially affect the auth feature under review.

## Critical Issues

### CR-01: Refresh cookie hardcodes `secure(false)` — token sent over plaintext HTTP

**File:** `backend/src/main/java/com/vdt/webrtc/auth/AuthController.java:79-87`
**Issue:** `buildRefreshCookie` sets `.secure(false)` unconditionally. The refresh token is the long-lived (7-day) credential of the whole rotation scheme; with `secure(false)` the browser will transmit it over plaintext HTTP, exposing it to network sniffing the moment this is deployed anywhere but `localhost`. This contradicts the stated design intent (httpOnly cookie as the secure store) and is a credential-disclosure vulnerability in production.
**Fix:** Drive `secure` from configuration/profile so it is `true` in any non-local environment:
```java
@Value("${app.cookie.secure:true}")
private boolean cookieSecure;

private ResponseCookie buildRefreshCookie(String rawToken, Duration maxAge) {
    return ResponseCookie.from("refreshToken", rawToken)
            .httpOnly(true)
            .secure(cookieSecure)        // true in prod, false only for local dev profile
            .sameSite("Lax")
            .path("/api/auth")
            .maxAge(maxAge)
            .build();
}
```

### CR-02: Default admin seeded with a publicly documented password, no forced change

**File:** `backend/src/main/resources/db/migration/V2__seed_admin.sql:1-5`
**Issue:** Migration V2 seeds `admin / admin@vdt.local` with the BCrypt hash of plaintext `Admin@123`, and the plaintext is written in the comment in the repo. Anyone with repo access (or who guesses the conventional default) can authenticate as ADMIN against any deployed instance, since nothing forces a password change on first login. This is an authentication/authorization bypass for the highest-privilege role.
**Fix:** Do not ship a known plaintext. Options: (a) seed the admin with a random hash and require an out-of-band password reset, (b) source the initial admin password from an environment variable injected at deploy time rather than committing it, and (c) add a `must_change_password` flag enforced at login. At minimum, remove the plaintext from the comment and document that the seed is dev-only and must be rotated before any non-local deployment.

## Warnings

### WR-01: No refresh-token reuse detection / token-family revocation

**File:** `backend/src/main/java/com/vdt/webrtc/auth/AuthService.java:84-114`
**Issue:** Rotation revokes the presented token and issues a new one, but if an already-rotated (revoked) token is replayed, the code only throws `InvalidRefreshTokenException` (line 90 / 106). In rotation schemes, replay of a revoked token is the canonical signal that a token was stolen; best practice is to revoke the entire token family (all of that user's active refresh tokens) so both the attacker and the legitimate user are forced to re-authenticate. As written, an attacker who steals a refresh token and uses it before the victim simply takes over the session silently while the victim is logged out with no alarm.
**Fix:** On detecting a presented-but-revoked hash that previously existed, revoke all active refresh tokens for that user (e.g. `revokeAllByUserId(userId)`) and surface/log a security event, rather than treating it as a generic invalid token.

### WR-02: Rotated/expired refresh tokens are never deleted — and `token_hash UNIQUE` can break future inserts

**File:** `backend/src/main/java/com/vdt/webrtc/auth/AuthService.java:125-132`, `backend/src/main/resources/db/migration/V1__create_tables.sql:13-19`
**Issue:** Every login and every refresh inserts a new `refresh_tokens` row; revoked and expired rows are never purged. Beyond unbounded growth, `token_hash` has a `UNIQUE` constraint — because hashes are deterministic SHA-256 of a random 256-bit token, collisions are effectively impossible, so this is not a correctness blocker, but combined with no cleanup it means the table only ever grows. There is also no scheduled job to expire stale rows.
**Fix:** Add a cleanup path: either a scheduled task deleting `WHERE revoked = true OR expires_at < now()` past a grace window, or delete prior tokens for the user on rotation. Keep the row long enough to support reuse detection (WR-01) if implemented.

### WR-03: `/users/me` throws raw `RuntimeException` → 500 instead of a clean error

**File:** `backend/src/main/java/com/vdt/webrtc/user/UserService.java:16-17`
**Issue:** `findUserProfileByUsername` throws `new RuntimeException("User not found")`. The `GlobalExceptionHandler` has no handler for this, so it falls to `handleGeneralException` and returns HTTP 500. A user who was authenticated (valid JWT) but whose account was deleted/renamed would get an opaque 500 rather than a 401/404, and the generic 500 path logs it as an "Unhandled exception", polluting error monitoring with an expected condition.
**Fix:** Throw a domain exception mapped to the right status, e.g. a `ResourceNotFoundException` handled as 404, or treat a missing user behind a valid token as 401:
```java
.orElseThrow(() -> new ResourceNotFoundException("User not found: " + username));
```

### WR-04: `login()` is not `@Transactional` — multi-statement write outside a transaction

**File:** `backend/src/main/java/com/vdt/webrtc/auth/AuthService.java:67-82`
**Issue:** Unlike `refreshToken` and `logout`, `login` carries no `@Transactional`. It performs an authentication, a read (`findByUsername`), and a write (`storeRefreshTokenHash` → `save`). The persistence happens in its own auto-commit, so there is no atomic boundary around the read-then-write, and any lazy access on `user` outside the repository call would risk a `LazyInitializationException`. Today the save works because `save` opens its own transaction, but the method is inconsistent with the rest of the service and fragile to extension.
**Fix:** Annotate `login` with `@Transactional` for a consistent, atomic boundary around the read and the refresh-token insert.

### WR-05: CORS allows credentials with a hardcoded single origin

**File:** `backend/src/main/java/com/vdt/webrtc/config/CorsConfig.java:17-20`
**Issue:** `allowCredentials(true)` is combined with a hardcoded `http://localhost:5173` origin. Functionally fine for local dev, but the allowed origin is not configurable, so any deployed frontend will be blocked, and there is a temptation to "fix" it by widening the origin — `allowCredentials(true)` with a wildcard or an over-broad origin is a CSRF/credential-exposure hazard given the httpOnly refresh cookie. CSRF is also disabled in `SecurityConfig` (`csrf.disable()`), so the cookie-based refresh endpoint relies entirely on SameSite=Lax + CORS for cross-site protection.
**Fix:** Externalize the allowed origin list to configuration (per-profile), and keep it to an explicit allow-list. Confirm SameSite=Lax on the refresh cookie is sufficient for your deployment topology, or add a CSRF defense for the cookie-authenticated `/refresh` and `/logout` endpoints.

### WR-06: Frontend restore bypasses the axios instance, silently coupling to a second client

**File:** `frontend/src/App.tsx:25-35`
**Issue:** The mount-time session restore calls the bare `axios.post(...)` (line 25) instead of the configured `api` instance, then switches to `api.get('/api/users/me')` (line 33). Using two different clients means the manual `VITE_API_URL` interpolation and `withCredentials` must be kept in sync by hand, and the restore refresh does not benefit from (nor is it intentionally excluded from, in a documented way) the interceptor logic. If `VITE_API_URL` is undefined the template string silently becomes `undefined/api/auth/refresh`. This is intentional to avoid the interceptor refresh loop, but the coupling is implicit and brittle.
**Fix:** Use the shared `api` instance for the restore call too (the interceptor already special-cases `/auth/refresh` to avoid loops), or extract a single dedicated refresh function used by both `App.tsx` and the interceptor so the URL/credentials logic lives in one place.

### WR-07: `useLogout` swallows all errors with an empty catch

**File:** `frontend/src/hooks/useLogout.ts:12-13`
**Issue:** `catch {}` is empty. Logout-on-server is best-effort and clearing local state in `finally` is the right idea, but an empty catch hides genuine failures (e.g. network down, server 500) with zero diagnostics. If the server-side revoke fails, the refresh-token cookie may persist while the client believes it logged out.
**Fix:** Log the error for observability and consider clearing the cookie client-side regardless:
```js
} catch (e) {
    console.warn('logout request failed; clearing local session anyway', e)
}
```

## Info

### IN-01: `JwtService.isTokenValid` is dead code

**File:** `backend/src/main/java/com/vdt/webrtc/config/JwtService.java:63-70`
**Issue:** `isTokenValid` is never called; `JwtAuthFilter` relies on `extractUsername` throwing to detect invalid tokens. Dead code that implies validation happens where it does not.
**Fix:** Remove it, or wire it into `JwtAuthFilter` so token validity is checked explicitly before loading user details.

### IN-02: `RefreshToken.tokenHash` length vs SHA-256 hex output

**File:** `backend/src/main/java/com/vdt/webrtc/auth/RefreshToken.java:38`, `V1__create_tables.sql:16`
**Issue:** Both the JPA column (`length=64`) and the SQL (`VARCHAR(64)`) are exactly 64 chars, which matches SHA-256 hex output (32 bytes = 64 hex chars) with zero slack. Correct today, but any change to a longer hash or an encoding with separators would silently truncate/fail. Worth a comment documenting the invariant.
**Fix:** Add a comment noting `64 = SHA-256 hex length`, or size to a small margin.

### IN-03: Inconsistent error-handling style for missing handlers

**File:** `backend/src/main/java/com/vdt/webrtc/common/GlobalExceptionHandler.java:49-55`
**Issue:** The catch-all `handleGeneralException` maps every unhandled exception to 500 and logs at ERROR. Combined with WR-03, expected domain conditions (missing user) become ERROR-level 500s. Not a bug in itself, but it makes the absence of specific handlers (e.g. for 404/validation of path) silently degrade to noisy 500s.
**Fix:** Add domain-specific handlers (e.g. `ResourceNotFoundException` → 404) so the catch-all only fires for genuinely unexpected failures.

---

_Reviewed: 2026-06-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
