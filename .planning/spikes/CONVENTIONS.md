# Spike Conventions

Patterns and stack choices established across spike sessions (WebSocket/WebRTC deep-dive benchmarking). New spikes follow these unless the question requires otherwise.

## Stack

- **Load test tool:** k6, module `k6/ws` (classic, stable) — not `k6/experimental/websockets`. Reason: pairing 2 VUs (1 caller + 1 callee) as separate WebSocket connections covers every signaling scenario so far; no need for multiple concurrent sockets inside one VU.
- **Runner:** official `grafana/k6` Docker image, joined onto the compose project's network (`vdt2026-webrtc_default`) via `--network`, addressing services by compose service name (`backend-1:8080`, not a host-mapped port). `--network host` does NOT work on Windows/Mac Docker Desktop (already noted for coturn in `docker-compose.yml`).
- **Windows/Git Bash gotcha:** prefix `docker run` invocations that pass Unix-style container paths (e.g. `/spike/script.js`) with `MSYS_NO_PATHCONV=1`, otherwise MSYS auto-converts the path to a bogus Windows path.

## Structure

- Each spike that needs an isolated single backend instance uses a scoped `docker-compose.override.yml` inside its own spike folder, adding only what that spike needs (e.g. a temporary host port mapping for manual debugging). Bring up only the services required (`postgres redis rabbitmq backend-1`), not the full stack, to keep the measurement scoped to what the spike is actually testing.
- Test users are seeded directly via SQL (`seed-users.sql` per spike, or shared), never through `/api/auth/register` (rate-limited 5 req/15min/IP — unusable for seeding N test accounts from one IP). Use `pgcrypto`'s `crypt(password, gen_salt('bf', 10))` for a bcrypt hash compatible with Spring's `BCryptPasswordEncoder`. `email_verified` defaults to `TRUE` (V5 migration), so seeded rows skip the OTP flow entirely.
- `/api/auth/login` is NOT rate-limited — safe to call from every VU/setup step.

## Patterns

- **Real protocol only.** Every WS load-test script drives the actual message envelope (`{"type": "...", ...}` matching `ClientMessage`/`ServerMessage` sealed interfaces) and the actual call flow: `call-invite` → `call-state-changed{ringing}` → `call-accept` → `call-state-changed{active}` → `hang-up` → `call-state-changed{ended}`. The `call-offer`/`call-accept-received` message types exist in the sealed interfaces but are **not wired** in `PresenceWebSocketHandler` — don't use them.
- **Heartbeat is mandatory.** Every WS test script must send `{"type":"ping"}` on an interval under 60s (`socket.setInterval(..., 15000)` works well). `route:<username>` in Redis has a 60s TTL refreshed only on `ping`; without it, `router.sendToUser()` silently drops messages to that user with only a server-side `WARN` log ("không có route — offline?") and zero error signal to the sender. Skipping heartbeat in a test script produces a bogus "capacity ceiling" that's actually just route expiry — confirmed the hard way in spike 001.
- **Pairing via stable VU index.** Use the `per-vu-iterations` executor (not the default shared-iterations) so `__VU` is stable for the whole run and can be used to deterministically derive username/pairing/role (e.g. odd `__VU` = caller, even = callee, paired usernames `k6user{v}`/`k6user{v+1}`).
- **RTT via `Trend` metric.** Custom round-trip measurements use `k6/metrics` `Trend` (e.g. `call_setup_rtt_ms`), timestamped from the triggering `send()` to the matching response in `socket.on('message')`. k6's default summary prints avg/med/p90/p95/max automatically — no custom `handleSummary` needed for this.
- **Discrete steps over continuous ramp.** For "find the breaking point" questions, run one `per-vu-iterations` invocation per concurrency level (e.g. 100/500/1000/2000/4000) rather than a single k6 `ramping-vus` scenario. Each step gets its own clean percentile report and its own before/after Prometheus snapshot — much easier to read than one continuous stage-tagged run. See `002-k6-ws-capacity-ramp/run-ramp.sh`.
- **Prometheus label gotcha.** `MetricsConfig.commonTags()` tags every app metric with `instance=backend-1/backend-2`, but `prometheus/prometheus.yml` does not set `honor_labels: true`, so Prometheus's own scrape-target `instance` label (`backend-1:8080`) wins the collision and the app's tag is renamed `exported_instance`. Always filter PromQL with `exported_instance="backend-1"`, not `instance="backend-1"`.
- **When RTT and error rate blow up together, check JVM thread count before blaming CPU.** `process_cpu_usage` and heap can look completely fine (single-digit % CPU) while `jvm_threads_peak_threads` (from `/actuator/prometheus`) reveals a thread explosion — a much better signal for "this is a thread-per-connection/blocking-I/O ceiling" than CPU or memory graphs. Confirmed in spike 002 (8808 peak threads at 1000-2000 connections, 6% CPU max).

## Tools & Libraries

- `grafana/k6` (latest tag pulled at spike time) — no version pin needed for a throwaway spike.
- Postgres `pgcrypto` extension (`CREATE EXTENSION IF NOT EXISTS pgcrypto;`) — ships with `postgres:17-alpine`, no extra install.
