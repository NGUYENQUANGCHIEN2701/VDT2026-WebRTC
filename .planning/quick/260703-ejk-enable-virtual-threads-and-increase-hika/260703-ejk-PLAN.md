---
phase: quick-260703-ejk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/main/resources/application.yaml
autonomous: true
requirements: []

must_haves:
  truths:
    - "application.yaml has `spring.threads.virtual.enabled: true`, switching Spring Boot 4's Tomcat request executor to Java 21 virtual threads — per spike 002b, this keeps `ws_connecting` under ~400ms up to 4000 concurrent connections, versus 30-50s of stalling on platform threads (spike 002)."
    - "application.yaml has a new `spring.datasource.hikari.maximum-pool-size` set to 20 (not left at Boot's undocumented default of 10) — per spike 002b, the default pool exhausted with `HikariPool-1 ... timed out after 30353ms (waiting=96)` once virtual threads removed the upstream WS/Tomcat thread ceiling and let thousands of logins reach the DB layer at once."
    - "`./mvnw test` run from backend/ after the change produces the same pass/fail outcome it would have produced before the change — any failures traceable to the two pre-existing, already-uncommitted deletions in backend/src/test/resources/ (unrelated to this task) are called out separately in the SUMMARY, not conflated with a regression from this config change."
    - "application-dev.yaml and application-docker.yaml are untouched — both profiles still layer cleanly over the two new base keys (neither profile currently overrides threads.* or datasource.hikari.*, confirmed by inspection before this plan was written)."
  artifacts:
    - path: "backend/src/main/resources/application.yaml"
      provides: "spring.threads.virtual.enabled: true (new key, under spring:) and spring.datasource.hikari.maximum-pool-size: 20 (new sub-key, under spring.datasource:)"
      contains: "spring.threads.virtual.enabled"
  key_links:
    - "spring.threads.virtual.enabled: true -> Spring Boot 4 / Framework 7 Threading autoconfiguration -> embedded Tomcat's protocol handler executor -> Executors.newVirtualThreadPerTaskExecutor() — Boot-internal wiring, no application code changes required; this is the exact mechanism spike 002b confirmed active via `java.lang.VirtualThread.run` in backend-1's request-handling stack traces."
    - "spring.datasource.hikari.maximum-pool-size -> HikariCP -> the single shared PostgreSQL connection pool behind every JPA repository call in the app (login/auth lookups, presence, call history, admin) — once the Tomcat thread ceiling is removed by the first key, this number becomes the system's primary concurrency backpressure point, per spike 002b's own conclusion that virtual threads 'relocated' the bottleneck rather than removing it."
---

<objective>
Apply two evidence-backed Spring Boot config changes to `backend/src/main/resources/application.yaml`, based on benchmark findings in `.planning/spikes/002-k6-ws-capacity-ramp/` and `.planning/spikes/002b-virtual-threads-ramp/`:

1. Enable Spring Boot 4's virtual-threads mode (`spring.threads.virtual.enabled: true`) — spike 002 found the WebSocket signaling layer's concurrency ceiling was a JVM platform-thread explosion (8808 peak threads); spike 002b proved virtual threads eliminate it (`ws_connecting` avg dropped from 30-50s to <400ms at 4000 concurrent connections, a 90-160x improvement) with a one-line config change and zero code change.
2. Raise HikariCP's connection pool ceiling (`spring.datasource.hikari.maximum-pool-size: 20`) — spike 002b's own ramp exposed that Boot's undocumented default pool size (10) becomes the *new* bottleneck the moment the Tomcat ceiling above is removed: a `HikariPool-1 ... timed out after 30353ms (waiting=96)` exception fired once thousands of virtual-thread-backed logins reached the DB layer simultaneously. 20 doubles the default and stays well under PostgreSQL's default `max_connections=100` even with both `backend-1`/`backend-2` Compose replicas active (2 x 20 = 40).

Purpose: Turn two spike-validated findings into the actual running configuration, closing the loop from "benchmarked and recommended" to "shipped," without re-running the k6 ramp or touching any other subsystem.
Output: Updated `backend/src/main/resources/application.yaml` with both new keys; a green (or baseline-equivalent) `./mvnw test` run confirming no regression.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@D:/VDTWebRTC/VDT2026-WebRTC/.planning/STATE.md
@D:/VDTWebRTC/VDT2026-WebRTC/CLAUDE.md
@D:/VDTWebRTC/VDT2026-WebRTC/.planning/spikes/002-k6-ws-capacity-ramp/README.md
@D:/VDTWebRTC/VDT2026-WebRTC/.planning/spikes/002b-virtual-threads-ramp/README.md
@D:/VDTWebRTC/VDT2026-WebRTC/backend/src/main/resources/application.yaml
@D:/VDTWebRTC/VDT2026-WebRTC/backend/pom.xml
</context>

<constraints_critical>
**Scope is config-only, one file.** The ONLY file this plan touches is `backend/src/main/resources/application.yaml`. Do NOT edit `application-dev.yaml`, `application-docker.yaml`, `docker-compose.yml`, or any `.java` file — both profile files were inspected before writing this plan and neither overrides `spring.threads.*` or `spring.datasource.hikari.*`, so the two new base keys apply cleanly to every profile (dev, docker, default/test) without conflict.

**Pre-existing uncommitted working-tree state — do NOT touch, do NOT restore:** `git status` currently shows two deleted-but-uncommitted files unrelated to this task: `backend/src/test/resources/application-test.yaml` and `backend/src/test/resources/application.properties` (both previously duplicated the same `test`-profile rate-limit override — `app.rate-limit.otp-max-requests`/`otp-window-seconds` — before being removed in an earlier, separate session). Leave this working-tree state exactly as-is:
- Do NOT `git checkout`/restore either file.
- Do NOT stage them in this plan's commit (only stage `backend/src/main/resources/application.yaml`, per `files_modified` above).
- If `./mvnw test` in Task 3 shows failures related to OTP/rate-limit assertions in the `test` profile, treat that as a **pre-existing, unrelated condition** to document in the SUMMARY — not something to fix here, and not evidence of a regression from this plan's two config keys.

**Commit message — hard requirement (per repo convention in MEMORY.md):** Do NOT use the GSD default `docs(quick-260703-ejk): ...` format. Use a descriptive conventional commit instead, e.g. `perf(backend): enable virtual threads and raise HikariCP pool size`. Do NOT add a `Co-Authored-By: Claude` trailer.
</constraints_critical>

<tasks>

<task type="auto">
  <name>Task 1: Enable Spring Boot virtual threads</name>
  <files>backend/src/main/resources/application.yaml</files>
  <action>
    Edit the `spring:` root block of `backend/src/main/resources/application.yaml`. Add a new `threads.virtual.enabled: true` key as a sibling of the existing `application:` and `data:` keys (place it directly after the `application:` block, before `data:`, to keep related top-level Boot behavior settings grouped near the top of the file). Add a single trailing inline comment on the `enabled: true` line citing the spike finding in one sentence (spike 002b: removes the WS/Tomcat thread-per-connection ceiling; `ws_connecting` stayed under ~400ms to 4000 connections vs 30-50s on platform threads) so a future reader understands why this is on without re-reading the spike. Do not wrap the boolean in an env-var placeholder — this is an unconditional engineering decision (not an environment-specific tunable like a secret or a timeout), consistent with other hardcoded booleans already in the file (`flyway.enabled: true`, `show-sql: false`). Preserve the file's existing 2-space indentation exactly; do not reformat any other part of the file.
  </action>
  <verify>
    <automated>cd backend && grep -A1 "threads:" src/main/resources/application.yaml | grep -q "virtual:" && grep -A2 "virtual:" src/main/resources/application.yaml | grep -c "enabled: true"</automated>
  </verify>
  <done>application.yaml contains a `spring.threads.virtual.enabled: true` key nested under `spring:`/`threads:`/`virtual:`; the rest of the file's existing keys and indentation are unchanged (confirm with `git diff backend/src/main/resources/application.yaml` showing only additive lines).</done>
</task>

<task type="auto">
  <name>Task 2: Raise HikariCP maximum pool size</name>
  <files>backend/src/main/resources/application.yaml</files>
  <action>
    Edit the existing `spring.datasource:` block (the one with `url`, `username`, `password` — currently no `hikari:` sub-key exists, so this is a new addition, not an override of any existing explicit value). Add a `hikari.maximum-pool-size` sub-key set to `20`, wrapped in an env-var placeholder following the file's existing convention for tunable values (e.g. `${DB_HIKARI_MAX_POOL_SIZE:20}`), so it can be re-tuned per-deployment without a rebuild — matching how `CALL_RING_TIMEOUT_SECONDS`, `RATE_LIMIT_OTP_MAX_REQUESTS`, etc. are already externalized elsewhere in this same file. Add a trailing inline comment explaining the reasoning in one sentence: Boot's undocumented default of 10 exhausted under a login burst once virtual threads removed the upstream WS ceiling (spike 002b: `HikariPool-1 ... timed out after 30353ms, waiting=96`); 20 is double the default and still leaves headroom under PostgreSQL's default `max_connections=100` with both `backend-1`/`backend-2` Compose replicas active (2 x 20 = 40). Place the new `hikari:` sub-key directly under `datasource:`, after `password`, before the sibling `rabbitmq:` key. Do not add any other Hikari property (no `minimum-idle`, no `connection-timeout` override) — only `maximum-pool-size` was asked for.
  </action>
  <verify>
    <automated>cd backend && grep -A1 "hikari:" src/main/resources/application.yaml | grep -q "maximum-pool-size" && grep -c "DB_HIKARI_MAX_POOL_SIZE:20" src/main/resources/application.yaml</automated>
  </verify>
  <done>application.yaml's `spring.datasource:` block has a new `hikari.maximum-pool-size` key defaulting to 20 via an env-var placeholder; `url`/`username`/`password` lines are unchanged; no other Hikari property was added; `application-dev.yaml`/`application-docker.yaml` remain untouched.</done>
</task>

<task type="auto">
  <name>Task 3: Run the backend test suite to confirm no regression</name>
  <files></files>
  <action>
    Run the full backend test suite from the `backend/` directory (`./mvnw test`; this exercises JUnit 5 + Mockito + AssertJ unit tests and the Testcontainers-backed integration tests — Postgres, RabbitMQ — since no separate Failsafe/`verify` phase is configured in `pom.xml`, `test` already runs everything Surefire picks up). This is a config-only change (Tomcat threading model + connection pool ceiling) so no test code should need modification; the goal is purely to confirm the two new keys don't break application context startup or existing behavior. Expect this run to take several minutes (three Testcontainers: Postgres, RabbitMQ, plus Redis via `spring-boot-starter-data-redis` if wired into tests) — do not cut it short. If failures appear, distinguish: (a) failures already present before this plan's two-line change (e.g., anything tied to OTP/rate-limit assertions in the `test` profile, given the pre-existing deleted `application-test.yaml`/`application.properties` files noted in `<constraints_critical>` — these are OUT OF SCOPE, do not fix them here) versus (b) any NEW failure that only appears after Task 1/2's edits (these WOULD be a real regression and must be investigated — most likely cause would be a connection-pool-related timing issue in a test that assumes the old default pool size, or a YAML indentation error breaking config binding).
  </action>
  <verify>
    <automated>cd backend && ./mvnw test</automated>
  </verify>
  <done>Test run completes (exit code and pass/fail counts recorded in the SUMMARY); zero NEW failures attributable to `spring.threads.virtual.enabled` or `spring.datasource.hikari.maximum-pool-size`; any pre-existing/unrelated failures (from the already-deleted test-resource files) are explicitly named and separated from this task's verdict in the SUMMARY.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| Client (browser) → backend REST/WS | Untrusted concurrent connection volume no longer gets throttled by Tomcat's platform-thread ceiling once virtual threads are enabled |
| Backend JVM → PostgreSQL (HikariCP) | Single shared, finite connection pool sits behind every JPA-backed request path (auth, presence, call history, admin) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-Q-01 | Denial of Service | `spring.threads.virtual.enabled` (Tomcat request executor) | high | mitigate | Removing the platform-thread ceiling means Tomcat itself no longer naturally throttles concurrent request bursts; Task 2's bounded HikariCP pool becomes the system's primary backpressure point instead, and the existing per-endpoint rate limiter (`app.rate-limit.otp-*`, unchanged by this plan) still guards abuse-prone auth endpoints specifically. |
| T-Q-02 | Denial of Service | `spring.datasource.hikari.maximum-pool-size` | medium | mitigate | Set to a bounded 20, not unlimited or unbounded-default-left-as-is — evidenced by spike 002b's HikariPool exhaustion at Boot's default of 10; 20 x 2 backend replicas (`backend-1`+`backend-2`) = 40 total connections, comfortably under PostgreSQL's default `max_connections=100`, leaving headroom for Flyway/admin/monitoring connections. |
| T-Q-03 | Denial of Service | Virtual-thread carrier-pinning on blocking JDBC calls | low | accept | Known JVM caveat: a `synchronized` block pins a virtual thread to its carrier thread, eroding scalability gains. Spike 002b's ramp already exercised the full login→WS→call path (which goes through HikariCP/pgjdbc) at up to 4000 concurrent connections with no pinning-related symptoms beyond the pool-exhaustion finding already mitigated by T-Q-02; accepted without further code change for this quick task. |
</threat_model>

<verification>
1. `git diff backend/src/main/resources/application.yaml` shows only two additive blocks: `spring.threads.virtual.enabled: true` and `spring.datasource.hikari.maximum-pool-size` — no other line changed.
2. `grep -c "enabled: true" backend/src/main/resources/application.yaml` (scoped under the `virtual:` block per Task 1's verify) confirms the key exists.
3. `grep -c "DB_HIKARI_MAX_POOL_SIZE:20" backend/src/main/resources/application.yaml` confirms the Hikari key exists with the reasoned default.
4. `cd backend && ./mvnw test` completes; no NEW failures versus the pre-existing baseline (the two already-deleted test-resource files are a known, separate, out-of-scope condition).
5. `application-dev.yaml` and `application-docker.yaml` are unmodified (`git status` shows no changes to either).
</verification>

<success_criteria>
- `spring.threads.virtual.enabled: true` is live in `application.yaml`, applying to every Spring profile (default/dev/docker) since neither profile overrides it.
- `spring.datasource.hikari.maximum-pool-size` is live at 20 (env-var overridable via `DB_HIKARI_MAX_POOL_SIZE`), replacing Boot's undocumented default of 10.
- Backend test suite shows no new regression introduced by these two changes.
- Commit uses a descriptive conventional message (not `docs(quick-...)`), no Claude co-author trailer, and stages only `backend/src/main/resources/application.yaml`.
</success_criteria>

<output>
Create `.planning/quick/260703-ejk-enable-virtual-threads-and-increase-hika/260703-ejk-SUMMARY.md` when done
</output>
