---
phase: quick-260613-khs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/pom.xml
  - backend/src/main/resources/application.yaml
  - backend/src/main/resources/application-docker.yaml
  - backend/src/main/resources/db/migration/V1__create_tables.sql
  - backend/src/main/resources/db/migration/V2__seed_admin.sql
autonomous: true
requirements:
  - INFR-07

must_haves:
  truths:
    - "`./mvnw compile` exits 0 with JJWT 0.13.0 and Testcontainers on the classpath"
    - "application.yaml configures datasource (vdt_webrtc), ddl-auto: validate, Flyway enabled, JWT secret + access-token TTL"
    - "application-docker.yaml overrides only the datasource URL to the Compose `postgres` host"
    - "Flyway V1 and V2 migrations exist with mandatory double underscore in filenames"
    - "V2 seed admin uses a FRESHLY generated BCrypt(strength 10) hash of Admin@123 (not a copied example)"
  artifacts:
    - path: "backend/pom.xml"
      provides: "JJWT 0.13.0 (api/impl/jackson) + Testcontainers (postgresql/junit-jupiter) added to existing Boot 4.0.7 pom"
      contains: "jjwt-api"
    - path: "backend/src/main/resources/application.yaml"
      provides: "Full datasource/JPA/Flyway/JWT/server/management config"
      contains: "ddl-auto: validate"
    - path: "backend/src/main/resources/application-docker.yaml"
      provides: "Docker profile datasource override"
      contains: "postgres:5432"
    - path: "backend/src/main/resources/db/migration/V1__create_tables.sql"
      provides: "users + refresh_tokens schema"
      contains: "CREATE TABLE users"
    - path: "backend/src/main/resources/db/migration/V2__seed_admin.sql"
      provides: "admin seed record"
      contains: "INSERT INTO users"
  key_links:
    - from: "application-docker.yaml"
      to: "postgres Compose service"
      via: "jdbc:postgresql://postgres:5432/vdt_webrtc"
      pattern: "postgres:5432"
    - from: "application.yaml jwt.secret"
      to: "JWT_SECRET env var"
      via: "property placeholder"
      pattern: "\\$\\{JWT_SECRET"
---

<objective>
Provide the backend CONFIGURATION layer only: add the two missing dependency groups to `pom.xml` (JJWT, Testcontainers), write the full `application.yaml` + `application-docker.yaml` Spring config, and create the Flyway V1/V2 migrations. This unblocks later Java work (which is explicitly OUT OF SCOPE here) without writing any business logic.

Purpose: The user requested ONLY backend config ("làm config cho backend cho tôi. Không được code các cái khác"). After this plan the backend resolves all dependencies, has a complete externalized config, and Flyway has a versioned schema + admin seed to apply.
Output: Updated pom.xml, application.yaml, application-docker.yaml, V1__create_tables.sql, V2__seed_admin.sql.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@D:/VDTWebRTC/VDT2026-WebRTC/.planning/STATE.md
@D:/VDTWebRTC/VDT2026-WebRTC/CLAUDE.md
@D:/VDTWebRTC/VDT2026-WebRTC/.planning/phases/01-foundation-auth-roles-project-skeleton/01-01-PLAN.md
@D:/VDTWebRTC/VDT2026-WebRTC/backend/pom.xml
@D:/VDTWebRTC/VDT2026-WebRTC/backend/src/main/resources/application.yaml
</context>

<scope_guardrails>
HARD CONSTRAINT — config files ONLY. The user said "Không được code các cái khác" (do not code anything else).

ALLOWED deliverables (the ONLY files you may create or edit):
- `backend/pom.xml` (add missing deps only)
- `backend/src/main/resources/application.yaml`
- `backend/src/main/resources/application-docker.yaml`
- `backend/src/main/resources/db/migration/V1__create_tables.sql`
- `backend/src/main/resources/db/migration/V2__seed_admin.sql`

FORBIDDEN — do NOT create or modify ANY of these, even though the parent phase plan mentions them:
- Any `.java` file (controllers, services, entities, repositories, DTOs, JWT util, SecurityConfig, test classes)
- `WebrtcApplication.java` / the main class — it already exists, leave it untouched
- Any frontend file, Dockerfile, docker-compose*.yml, nginx.conf, Maven wrapper scripts, springdoc
- Do NOT add springdoc-openapi (it would tempt downstream Java config) — out of scope for pure config

Do NOT remove or rename any dependency already present in pom.xml. The current pom uses Spring Boot 4.0's restructured starter names (`spring-boot-starter-webmvc`, `spring-boot-starter-flyway`, `*-test` variants) — these are CORRECT for Boot 4.0.7; keep them as-is.

Keep the config file extension `.yaml` (the existing file is `application.yaml`). Do NOT introduce a parallel `application.yml` — having both causes confusing precedence.
</scope_guardrails>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add missing dependencies to pom.xml (JJWT + Testcontainers)</name>
  <files>backend/pom.xml</files>
  <action>
    Edit `backend/pom.xml`. The pom already has Boot 4.0.7 parent, Java 21, and starters for actuator/data-jpa/flyway/security/validation/webmvc plus postgresql runtime and the Boot `*-test` starters. Do NOT touch any of those.

    Add ONLY the following missing dependencies inside the existing `<dependencies>` block (do not create a second block):

    JJWT (auth token lib, locked to 0.13.0 per parent phase plan Task 1):
    - `io.jsonwebtoken:jjwt-api` version `0.13.0` (compile scope)
    - `io.jsonwebtoken:jjwt-impl` version `0.13.0`, `<scope>runtime</scope>`
    - `io.jsonwebtoken:jjwt-jackson` version `0.13.0`, `<scope>runtime</scope>`

    Testcontainers (integration test infra, test scope):
    - `org.springframework.boot:spring-boot-testcontainers` `<scope>test</scope>` (version via Boot BOM — no explicit version)
    - `org.testcontainers:postgresql` version `1.21.0`, `<scope>test</scope>`
    - `org.testcontainers:junit-jupiter` version `1.21.0`, `<scope>test</scope>`

    Do NOT add springdoc, Lombok, or any other dependency. Do NOT change the build/plugins section.
  </action>
  <verify>
    <automated>cd D:/VDTWebRTC/VDT2026-WebRTC/backend && ./mvnw -q dependency:resolve 2>&1 | tail -5 && grep -c "jjwt-api" pom.xml</automated>
  </verify>
  <done>
    `./mvnw dependency:resolve` exits 0 (all artifacts resolved). `pom.xml` contains `jjwt-api` version `0.13.0`, `jjwt-impl`, `jjwt-jackson`, `spring-boot-testcontainers`, `org.testcontainers:postgresql`, and `org.testcontainers:junit-jupiter`. All pre-existing dependencies remain unchanged. No springdoc/Lombok added.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Write application.yaml + application-docker.yaml</name>
  <files>backend/src/main/resources/application.yaml, backend/src/main/resources/application-docker.yaml</files>
  <action>
    Replace the contents of `backend/src/main/resources/application.yaml` (currently only `spring.application.name: webrtc`) with the full config. Keep `spring.application.name: webrtc`. Add:

    - `spring.datasource.url: jdbc:postgresql://localhost:5432/vdt_webrtc`
    - `spring.datasource.username: vdt`
    - `spring.datasource.password: vdt_pass`
    - `spring.jpa.hibernate.ddl-auto: validate` (NEVER create/update — Flyway owns the schema)
    - `spring.jpa.show-sql: false`
    - `spring.flyway.enabled: true`
    - `spring.flyway.locations: classpath:db/migration`
    - `spring.flyway.baseline-on-migrate: false`
    - `server.port: 8080`
    - `management.endpoints.web.exposure.include: health`
    - `jwt.secret: ${JWT_SECRET}` (custom property — read by future Java config, NOT defined here)
    - `jwt.access-token-ttl-ms: 900000`

    Create `backend/src/main/resources/application-docker.yaml` (the `docker` Spring profile, activated by `SPRING_PROFILES_ACTIVE=docker`). It must override ONLY the datasource URL to point at the Compose service hostname:
    - `spring.datasource.url: jdbc:postgresql://postgres:5432/vdt_webrtc`
    Do not duplicate the rest of the config — profile overrides merge over the base `application.yaml`.

    Note: `jwt.secret: ${JWT_SECRET}` is a property placeholder only. Do NOT write any Java that reads it (out of scope). It will fail to start only if a future Java config injects it without the env var being set — that is a later phase's concern.
  </action>
  <verify>
    <automated>cd D:/VDTWebRTC/VDT2026-WebRTC && grep "ddl-auto: validate" backend/src/main/resources/application.yaml && grep "postgres:5432" backend/src/main/resources/application-docker.yaml && grep -q "JWT_SECRET" backend/src/main/resources/application.yaml && echo OK</automated>
  </verify>
  <done>
    `application.yaml` contains `ddl-auto: validate`, `flyway.enabled: true`, `server.port: 8080`, `jwt.secret: ${JWT_SECRET}`, and `jwt.access-token-ttl-ms: 900000`. `application-docker.yaml` exists and overrides the datasource URL to `jdbc:postgresql://postgres:5432/vdt_webrtc`. No `application.yml` (single underscore-free `.yaml` extension kept) duplicate created. No Java touched.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Write Flyway V1 (schema) + V2 (admin seed) migrations</name>
  <files>backend/src/main/resources/db/migration/V1__create_tables.sql, backend/src/main/resources/db/migration/V2__seed_admin.sql</files>
  <action>
    Create the migration directory and two files. Double underscore (`V1__`, `V2__`) is MANDATORY — a single underscore makes Flyway silently ignore the file.

    `V1__create_tables.sql` — create two tables (mirror parent phase plan Task 1 spec exactly):
    - `users`: `id BIGSERIAL PRIMARY KEY`, `username VARCHAR(50) NOT NULL UNIQUE`, `email VARCHAR(255) NOT NULL UNIQUE`, `password_hash VARCHAR(100) NOT NULL` (100 chars — BCrypt is 60 but leave headroom per parent Pitfall 5), `role VARCHAR(20) NOT NULL DEFAULT 'USER'`, `locked BOOLEAN NOT NULL DEFAULT FALSE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
    - `refresh_tokens`: `id BIGSERIAL PRIMARY KEY`, `user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `token_hash VARCHAR(64) NOT NULL UNIQUE`, `expires_at TIMESTAMPTZ NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `revoked BOOLEAN NOT NULL DEFAULT FALSE`.
    - Indexes: `idx_refresh_tokens_user_id` on `refresh_tokens(user_id)` and `idx_refresh_tokens_token_hash` on `refresh_tokens(token_hash)`.

    `V2__seed_admin.sql` — insert the admin user. You MUST generate a FRESH BCrypt hash (strength 10) of the plaintext `Admin@123`. Do NOT copy any `$2a$10$...` hash from documentation, examples, or this plan (parent Pitfall 9). Generate the real hash at execution time — e.g. run a one-off command such as `python -c "import bcrypt; print(bcrypt.hashpw(b'Admin@123', bcrypt.gensalt(10)).decode())"` (or any available bcrypt tool: Node `bcryptjs`, `htpasswd -bnBC 10 "" Admin@123`, or a throwaway Java line) and inline the produced hash. The hash MUST verify against `Admin@123`. Then:
    `INSERT INTO users (username, email, password_hash, role) VALUES ('admin', 'admin@vdt.local', '<freshly-generated-hash>', 'ADMIN');`

    Generating the hash via a CLI bcrypt tool is configuration data generation, NOT writing application code — it stays within the config-only scope.
  </action>
  <verify>
    <automated>cd D:/VDTWebRTC/VDT2026-WebRTC && grep -c "CREATE TABLE" backend/src/main/resources/db/migration/V1__create_tables.sql && grep "INSERT INTO users" backend/src/main/resources/db/migration/V2__seed_admin.sql && ls backend/src/main/resources/db/migration/ | grep -E "V[12]__"</automated>
  </verify>
  <done>
    `V1__create_tables.sql` contains exactly 2 `CREATE TABLE` statements (users + refresh_tokens), `password_hash VARCHAR(100)`, and both `idx_refresh_tokens_*` indexes. `V2__seed_admin.sql` contains one `INSERT INTO users` with a freshly generated BCrypt `$2a$10$` (or `$2b$10$`) hash that verifies against `Admin@123`. Both filenames use double underscore. No `.java` files created.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Developer machine → backend config | `JWT_SECRET` is an env-var placeholder, never hardcoded in committed config |
| Migration files → PostgreSQL | V1/V2 SQL is trusted server-side; must avoid reusing a known example BCrypt hash |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-Q-01 | Spoofing | V2__seed_admin.sql admin password | mitigate | Generate a FRESH BCrypt(10) hash at execution time; never copy a documented example hash (parent Pitfall 9). |
| T-Q-02 | Information Disclosure | jwt.secret in application.yaml | mitigate | Use `${JWT_SECRET}` placeholder only — no secret value committed to the repo. |
| T-Q-03 | Tampering | npm/Maven package installs | accept | Only JJWT 0.13.0 (well-known, parent Package Legitimacy Audit = Approved) and Testcontainers 1.21.0 added; both from trusted Maven Central coordinates pre-vetted in parent RESEARCH.md. |
</threat_model>

<verification>
1. `cd backend && ./mvnw dependency:resolve` exits 0
2. `grep -c "jjwt-api" backend/pom.xml` returns >= 1
3. `grep "ddl-auto: validate" backend/src/main/resources/application.yaml` matches
4. `grep "postgres:5432" backend/src/main/resources/application-docker.yaml` matches
5. `grep -c "CREATE TABLE" backend/src/main/resources/db/migration/V1__create_tables.sql` returns 2
6. `grep -v '^--' backend/src/main/resources/db/migration/V1__create_tables.sql | grep -c "VARCHAR(100)"` returns 1 (password_hash)
7. `ls backend/src/main/resources/db/migration/` shows both files with double underscore
8. No new `.java` files created (config-only scope honored)
</verification>

<success_criteria>
- pom.xml resolves with JJWT 0.13.0 (api/impl/jackson) and Testcontainers (postgresql + junit-jupiter) added; no pre-existing dep removed; no springdoc/Lombok added
- application.yaml has full datasource/JPA(`ddl-auto: validate`)/Flyway/server/management/jwt config; extension kept as `.yaml`
- application-docker.yaml overrides only the datasource URL to the `postgres` Compose host
- V1 and V2 migrations exist with mandatory double underscore filenames
- V2 admin seed uses a freshly generated BCrypt(10) hash of Admin@123 (verifiable, not copied)
- Zero Java files, zero frontend files, zero Docker/Compose files created or modified
</success_criteria>

<output>
Create `D:/VDTWebRTC/VDT2026-WebRTC/.planning/quick/260613-khs-backend-config/260613-khs-SUMMARY.md` when done
</output>
