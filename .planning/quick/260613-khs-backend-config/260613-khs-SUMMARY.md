---
phase: quick-260613-khs
plan: 01
subsystem: backend-config
tags: [backend, config, flyway, jwt, testcontainers]
requires: []
provides:
  - JJWT 0.13.0 + Testcontainers on backend classpath
  - Externalized Spring config (base + docker profile)
  - Flyway V1 schema (users, refresh_tokens) + V2 admin seed
affects:
  - backend/pom.xml
  - backend/src/main/resources
tech-stack:
  added:
    - "io.jsonwebtoken:jjwt-api/impl/jackson 0.13.0"
    - "org.springframework.boot:spring-boot-testcontainers (BOM)"
    - "org.testcontainers:postgresql 1.21.0"
    - "org.testcontainers:junit-jupiter 1.21.0"
  patterns:
    - "Flyway versioned SQL migrations (double-underscore filenames)"
    - "Spring profile override (application-docker.yaml) for Compose hostname"
    - "JWT secret via ${JWT_SECRET} env placeholder (never committed)"
key-files:
  created:
    - backend/src/main/resources/application-docker.yaml
    - backend/src/main/resources/db/migration/V1__create_tables.sql
    - backend/src/main/resources/db/migration/V2__seed_admin.sql
  modified:
    - backend/pom.xml
    - backend/src/main/resources/application.yaml
decisions:
  - "BCrypt admin hash generated fresh via Python bcrypt (strength 10, $2b$ variant) and verified against Admin@123 — no example hash copied"
metrics:
  duration: ~5 min
  completed: 2026-06-13
---

# Phase quick-260613-khs Plan 01: Backend Config Summary

Backend configuration layer only: added JJWT 0.13.0 and Testcontainers to the existing Spring Boot 4.0.7 pom, wrote the full externalized `application.yaml` plus a docker-profile datasource override, and created Flyway V1 (schema) / V2 (admin seed) migrations. No application code (Java) written — strict config-only scope honored.

## What Was Built

- **Task 1 (commit 83d7c91):** Added JJWT (`jjwt-api` compile, `jjwt-impl`/`jjwt-jackson` runtime, all 0.13.0) and Testcontainers (`spring-boot-testcontainers` via Boot BOM, `org.testcontainers:postgresql` and `junit-jupiter` 1.21.0, test scope) to `pom.xml`. This commit also brought the previously-untracked backend scaffold under version control. `./mvnw dependency:resolve` exits 0.
- **Task 2 (commit 8c4b469):** Wrote `application.yaml` (datasource `vdt_webrtc`, `ddl-auto: validate`, Flyway enabled at `classpath:db/migration`, `server.port: 8080`, health actuator, `jwt.secret: ${JWT_SECRET}`, `jwt.access-token-ttl-ms: 900000`) and `application-docker.yaml` (overrides only the datasource URL to `jdbc:postgresql://postgres:5432/vdt_webrtc`).
- **Task 3 (commit c7796ea):** Created `V1__create_tables.sql` (users + refresh_tokens with `password_hash VARCHAR(100)` and both `idx_refresh_tokens_*` indexes) and `V2__seed_admin.sql` (admin user with a freshly generated, verified BCrypt(10) hash of `Admin@123`).

## Decisions Made

- **Fresh BCrypt hash:** Generated with `python -c "import bcrypt; ..."` at strength 10, producing a `$2b$10$` hash. Verified at generation: `checkpw('Admin@123')` → True, `checkpw('wrong')` → False. Spring Security `BCryptPasswordEncoder` accepts the `$2b$` prefix.
- **Profile override merge:** `application-docker.yaml` contains only the datasource URL; all other config inherits from the base `application.yaml` via Spring profile merging.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None encountered.

## Verification

- `./mvnw dependency:resolve` exits 0; `./mvnw compile` exits 0.
- `jjwt-api` present in pom (count 1); no springdoc/Lombok added.
- `ddl-auto: validate` and `JWT_SECRET` present in application.yaml; `postgres:5432` present in application-docker.yaml.
- V1 has exactly 2 `CREATE TABLE` and 1 `VARCHAR(100)` (password_hash) and 2 indexes; both migration filenames use double underscore.
- Zero `.java` files created or modified; no frontend/Docker/Compose files touched.

## Self-Check: PASSED

- FOUND: backend/pom.xml
- FOUND: backend/src/main/resources/application.yaml
- FOUND: backend/src/main/resources/application-docker.yaml
- FOUND: backend/src/main/resources/db/migration/V1__create_tables.sql
- FOUND: backend/src/main/resources/db/migration/V2__seed_admin.sql
- FOUND commit: 83d7c91 (Task 1)
- FOUND commit: 8c4b469 (Task 2)
- FOUND commit: c7796ea (Task 3)
