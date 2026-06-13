---
phase: 01
slug: foundation-auth-roles-project-skeleton
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Backend framework** | JUnit 5 (Jupiter) via `spring-boot-starter-test` |
| **Frontend framework** | Vitest 4.1.8 with React Testing Library 16.3.2 |
| **Backend config file** | none needed — Spring Boot auto-discovers `@SpringBootTest` |
| **Frontend config file** | `frontend/vitest.config.ts` — Wave 0 gap (created in Plan 01 Task 3) |
| **Backend quick run** | `./backend/mvnw test -pl backend` |
| **Backend full suite** | `./backend/mvnw verify -pl backend` |
| **Frontend quick run** | `cd frontend && npx vitest run` |
| **Frontend full suite** | `cd frontend && npx vitest run --coverage` |
| **Estimated runtime** | ~60-90 seconds (Testcontainers postgres spin-up adds ~30s on first run) |

---

## Sampling Rate

- **After every task commit:** Run `./backend/mvnw test -pl backend -Dtest=AuthControllerTest` + `cd frontend && npx vitest run`
- **After every plan wave:** Run `./backend/mvnw verify -pl backend` + `cd frontend && npx vitest run --coverage`
- **Before `/gsd-verify-work`:** Full suite must be green. SC4 (Docker Compose smoke) requires manual check.
- **Max feedback latency:** ~90 seconds (backend integration tests with Testcontainers)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01 | 1 | INFR-07 | T-01-01 | BCrypt hash freshly generated (not example) | manual compile | `./backend/mvnw compile -q` | ❌ W0 | ⬜ pending |
| 01-01-T2 | 01 | 1 | INFR-07 | T-01-02 | JWT_SECRET placeholder visible in docker-compose.yml | build verify | `cd frontend && npm run build` | ❌ W0 | ⬜ pending |
| 01-01-T3 | 01 | 1 | INFR-07 | T-01-03 | Flyway applies 2 migrations; schema_history has exactly 2 rows | backend integration | `./backend/mvnw test -pl backend -Dtest=FlywayMigrationTest` | ❌ W0 | ⬜ pending |
| 01-02-T1a | 02 | 2 | AUTH-01, AUTH-02 | T-02-02 | JwtService uses parseSignedClaims (not deprecated parseClaimsJws) | backend compile | `./backend/mvnw compile -q` | ❌ W0 | ⬜ pending |
| 01-02-T1b | 02 | 2 | AUTH-01 | T-02-01 | POST /register duplicate → 409; invalid DTO → 400; valid → 201 | backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#register_*` | ❌ W0 | ⬜ pending |
| 01-02-T1b | 02 | 2 | AUTH-02 | T-02-05 | POST /login → Set-Cookie refreshToken httpOnly; access token in response body | backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#login_*` | ❌ W0 | ⬜ pending |
| 01-02-T2 | 02 | 2 | AUTH-02 | T-02-04, T-02-08 | Access token in module-level var (not localStorage); axios withCredentials; isRefreshing queue | frontend component | `cd frontend && npx vitest run src/auth/` | ❌ W0 | ⬜ pending |
| 01-03-T1 | 03 | 3 | AUTH-02, AUTH-05 | T-03-01 | Refresh rotates old token to revoked=true; reuse returns 401 | backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#refresh_*` | ❌ W0 | ⬜ pending |
| 01-03-T1 | 03 | 3 | AUTH-05 | T-03-01 | Logout marks token revoked; subsequent refresh returns 401 | backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#logout_*` | ❌ W0 | ⬜ pending |
| 01-03-T2 | 03 | 3 | AUTH-02 | T-03-03 | 3 concurrent 401s → exactly 1 refresh call → all 3 retry with new token | frontend unit | `cd frontend && npx vitest run src/api/axiosInstance.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-T2 | 03 | 3 | AUTH-02 | T-03-04 | AuthContext mount calls /auth/refresh; user set on success; null on failure | frontend component | `cd frontend && npx vitest run src/auth/AuthContext.test.tsx` | ❌ W0 | ⬜ pending |
| 01-04-T1 | 04 | 4 | AUTH-03 | T-04-01 | GET /api/admin/dashboard: ADMIN → 200; USER → 403; no token → 401 | backend integration | `./backend/mvnw test -pl backend -Dtest=SecurityConfigTest` | ❌ W0 | ⬜ pending |
| 01-04-T1 | 04 | 4 | INFR-07 | T-01-03 | V2 seed admin exists with ADMIN role in users table | backend integration | `./backend/mvnw test -pl backend -Dtest=FlywayMigrationTest#seed_admin_exists_in_users` | ❌ W0 | ⬜ pending |
| 01-04-T2 | 04 | 4 | AUTH-03 | T-04-02 | UI /admin route: USER redirected to /; ADMIN sees content | frontend component | `cd frontend && npx vitest run src/auth/ProtectedRoute.test.tsx` | ❌ W0 | ⬜ pending |
| 01-04-T3 | 04 | 4 | INFR-07 | T-04-03 | Full Compose stack starts; curl localhost/actuator/health returns UP | manual smoke | human verify (docker compose up) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 stubs are created in Plan 01 Task 3. All stub files must exist and pass trivially before Plans 02-04 run:

- [ ] `backend/src/test/java/com/vdt/webrtc/auth/AuthControllerTest.java` — stubs for AUTH-01 register/login/refresh/logout (@Disabled); uses @SpringBootTest + Testcontainers PostgreSQL + @ServiceConnection
- [ ] `backend/src/test/java/com/vdt/webrtc/config/SecurityConfigTest.java` — stubs for AUTH-03 RBAC (403 for USER on admin endpoint); all @Disabled
- [ ] `backend/src/test/java/com/vdt/webrtc/FlywayMigrationTest.java` — `flyway_migrations_apply_cleanly` ACTIVE (not disabled); `seed_admin_exists_in_users` @Disabled
- [ ] `frontend/src/api/axiosInstance.test.ts` — it.todo for AUTH-02 concurrent 401 queue test
- [ ] `frontend/src/auth/AuthContext.test.tsx` — it.todo for AUTH-02 session restore test
- [ ] `frontend/src/auth/ProtectedRoute.test.tsx` — it.todo for AUTH-03 ADMIN redirect test
- [ ] `frontend/vitest.config.ts` — jsdom environment, globals: true, setupFiles pointing to src/test/setup.ts

Wave 0 verify: `./backend/mvnw test -pl backend -Dtest=FlywayMigrationTest` PASSES + `cd frontend && npx vitest run` exits 0.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `docker compose up` starts all 3 services with passing healthchecks | INFR-07 (SC4) | Requires Docker daemon + full image build; not suitable for CI unit test | See Plan 04 Task 3 checkpoint: run `docker compose up --build`, verify all services healthy, curl localhost/actuator/health, browser test full auth flow |
| Browser refresh restores user session without re-login | AUTH-02 (SC1) | Cross-tab browser behavior not testable in jsdom | After automated tests pass: login via browser, close tab, open new tab at http://localhost:5173 — home page loads (session from cookie) |
| Logout redirects to /login and blocks back-navigation | AUTH-05 (SC2) | Browser history behavior; jsdom cannot fully replicate | After automated tests pass: login, click Dang xuat, confirm /login shown, press back — should stay on /login |

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | POST `/api/auth/register` creates user, returns 201, BCrypt-encodes password | Backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#register_success_returns_201` | ❌ Wave 0 |
| AUTH-01 | Duplicate email/username returns 409 | Backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#register_duplicate_*` | ❌ Wave 0 |
| AUTH-01 | Invalid DTO (blank username, short password) returns 400 | Backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#register_invalid_dto_returns_400` | ❌ Wave 0 |
| AUTH-02 | POST `/api/auth/login` with valid creds returns accessToken + sets httpOnly cookie | Backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#login_valid_credentials_returns_access_token_and_cookie` | ❌ Wave 0 |
| AUTH-02 | POST `/api/auth/refresh` with valid cookie returns new accessToken, rotates refresh token | Backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#refresh_valid_cookie_rotates_token` | ❌ Wave 0 |
| AUTH-02 | Axios interceptor calls refresh on 401, retries original request; concurrent 401s → 1 refresh call | Frontend unit | `cd frontend && npx vitest run src/api/axiosInstance.test.ts` | ❌ Wave 0 |
| AUTH-02 | Session persists across browser refresh (AuthContext mount effect calls /refresh) | Frontend component | `cd frontend && npx vitest run src/auth/AuthContext.test.tsx` | ❌ Wave 0 |
| AUTH-03 | GET `/api/admin/dashboard` with USER role returns 403 | Backend integration | `./backend/mvnw test -pl backend -Dtest=SecurityConfigTest#admin_endpoint_with_user_role_returns_403` | ❌ Wave 0 |
| AUTH-03 | GET `/api/admin/dashboard` with ADMIN role returns 200 | Backend integration | `./backend/mvnw test -pl backend -Dtest=SecurityConfigTest#admin_endpoint_with_admin_role_returns_200` | ❌ Wave 0 |
| AUTH-03 | UI route `/admin` redirects USER to `/` via ProtectedRoute | Frontend component | `cd frontend && npx vitest run src/auth/ProtectedRoute.test.tsx` | ❌ Wave 0 |
| AUTH-05 | POST `/api/auth/logout` deletes refresh token, clears cookie | Backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#logout_clears_cookie_and_revokes_token` | ❌ Wave 0 |
| AUTH-05 | After logout, old refresh token rejected on POST `/api/auth/refresh` | Backend integration | `./backend/mvnw test -pl backend -Dtest=AuthControllerTest#after_logout_refresh_returns_401` | ❌ Wave 0 |
| INFR-07 | Flyway migrations run cleanly on fresh DB; `flyway_schema_history` has 2 entries | Backend integration | `./backend/mvnw test -pl backend -Dtest=FlywayMigrationTest#flyway_migrations_apply_cleanly` | ❌ Wave 0 |
| INFR-07 | Admin seed user (V2 migration) can log in with documented default password | Backend integration | `./backend/mvnw test -pl backend -Dtest=FlywayMigrationTest#seed_admin_exists_in_users` + SecurityConfigTest login as admin | ❌ Wave 0 |

---

## Success Criteria Observability

| SC# | Success Criterion | Observable Via | Manual / Automated |
|-----|-------------------|----------------|--------------------|
| SC1 | Register + login, session persists across refresh | Integration test (register → login → close → refresh → /users/me) | Automated |
| SC2 | Logout returns to login screen | Frontend component test for logout + redirect | Automated |
| SC3 | Admin endpoints reject USER role | Integration test returning 403 | Automated |
| SC4 | `docker compose up` starts backend + frontend + Postgres; migrations applied | Manual smoke test + `curl localhost/actuator/health` | Manual (smoke) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (all commands use `vitest run` not `vitest`, `mvnw test` not `mvnw test:watch`)
- [ ] Feedback latency < 90s (Testcontainers cold start included)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
