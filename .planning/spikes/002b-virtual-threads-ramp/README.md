---
spike: 002b
name: virtual-threads-ramp
type: comparison
validates: "Given the breaking point found in spike 002 (platform threads, ~500-1000 connections), when the same ramp runs against backend-1 with SPRING_THREADS_VIRTUAL_ENABLED=true, then determine whether virtual threads move the breaking point"
verdict: PARTIAL
related: [002]
tags: [websocket, k6, capacity, jvm-threads, virtual-threads, hikari, comparison]
---

# Spike 002b: Virtual Threads — Does It Move the Breaking Point?

## What This Validates

Given spike 002 found the concurrency ceiling for 1-1 call signaling on a single backend instance was driven by a JVM thread explosion (8808 peak threads, not CPU/heap), when the exact same ramp (`run-ramp.sh`, 100/500/1000/2000/4000 connections) runs against `backend-1` recreated with `SPRING_THREADS_VIRTUAL_ENABLED=true`, then compare head-to-head whether virtual threads change the outcome.

## Research

No new library/tool — this is a config-only comparison. `spring.threads.virtual.enabled=true` is a Spring Boot 4 / Spring Framework 7 property (Boot's `Threading` autoconfiguration switches the embedded Tomcat's protocol handler executor to `Executors.newVirtualThreadPerTaskExecutor()`). Set via env var override (`SPRING_THREADS_VIRTUAL_ENABLED=true`, relaxed-binds to the property) in a scoped `docker-compose.override.yml`, no source change. Confirmed active by grep'ing backend-1 logs for `java.lang.VirtualThread.run` in request-handling stack traces (Tomcat's `NioEndpoint$SocketProcessor` running on a `VirtualThread`).

## How to Run

```bash
# 1. Recreate backend-1 with virtual threads on:
docker compose --env-file .env.local -f docker-compose.yml \
  -f .planning/spikes/002b-virtual-threads-ramp/docker-compose.override.yml \
  up -d --force-recreate --no-deps backend-1

# 2. Same ramp as spike 002 (users already seeded by spike 002):
sh .planning/spikes/002b-virtual-threads-ramp/run-ramp.sh
```

## What to Expect

- `ws_connecting` (pure WS handshake time) should stay flat/low across all 5 steps if virtual threads fix the thread-per-connection ceiling from spike 002.
- A *different* bottleneck may appear further out (this spike found one — see below).

## Investigation Trail

### Head-to-head: `ws_connecting` (the metric spike 002 showed collapsing hardest)

| Connections | Platform threads (002) | Virtual threads (002b) | Speedup |
|---|---|---|---|
| 100 | avg 11ms | avg 18.7ms | (noise, both trivial) |
| 500 | avg 1.39s | avg **89.6ms** | ~15x |
| 1000 | avg 8.34s | avg **233ms** | ~36x |
| 2000 | avg 33.1s (p95 capped at 60s) | avg **375ms** | ~88x |
| 4000 | avg 50.8s (p95 capped at 60s) | avg **316ms** | ~160x |

This is unambiguous: **virtual threads eliminate the WebSocket connection-establishment bottleneck found in spike 002.** Connections that got through login stayed fast to establish even at 4000 concurrent.

### `calls_completed` / `calls_failed`

| Connections | Platform threads (002) | Virtual threads (002b) |
|---|---|---|
| 100 | 250 / 0 | 250 / 0 |
| 500 | 503 / 1072 | 618 / 866 (better) |
| 1000 | 527 / 2889 | 333 / 3046 (**worse**) |
| 2000 | 82 / 6525 | 120 / 8898 |
| 4000 | 58 / 6279 | 1 / 11748 |

Completion counts do **not** cleanly improve with virtual threads past 500 connections, which looks contradictory at first — resolved below (a different bottleneck, not the WS layer, now dominates).

### A new bottleneck surfaces: HikariCP connection pool

At the 4000-connection step, `http_req_failed` (the `/api/auth/login` HTTP call, not WS) jumped to **50.97%** (2039/4000) — something spike 002 never saw (`http_req_failed` was 0.00% at every step, every time, with platform threads). Backend-1 logs from this run confirm the cause directly:

```
org.hibernate.exception.JDBCConnectionException: Unable to acquire JDBC Connection
  [HikariPool-1 - Connection is not available, request timed out after 30353ms
   (total=10, active=10, idle=0, waiting=96)]
```

`application.yaml` has no explicit `spring.datasource.hikari.*` config, so it runs on **Boot's default pool size of 10 connections**. With virtual threads removing the WS/Tomcat-thread ceiling, thousands of VUs now reach the `login()` call (which does an `AuthenticationManager` DB lookup) at effectively the same time — and 10 DB connections cannot serve that queue. Requests pile up (`waiting=96` observed) and start timing out at Hikari's default 30s `connectionTimeout`, well before k6's own request timeout.

This also explains the `1000`-step's counterintuitive numbers (333 completed, worse than platform threads' 527): the DB pool was **already** queueing logins at 1000 concurrent connections, just not badly enough to hit the 30s timeout — it was merely *delaying* each VU's login by enough seconds to eat into its fixed 60s total budget (`(CYCLES+1)*10s` safety valve), leaving fewer of its 5 call-cycles time to complete. The bottleneck moved from "can't open the WebSocket" (spike 002) to "can't even finish logging in fast enough" (this spike) — virtual threads didn't remove a bottleneck, they **relocated** it one layer down the stack.

### Known instrumentation artifact (transparency, not swept under the rug)

`call_setup_rtt_ms` at the 1000/2000-connection steps shows nonsensical values (`avg=1487h21m32s`, `max=495290h19m49s`) — clearly corrupted, not real latencies. Two plausible causes, not fully isolated here:
1. The test script's `inviteSentAt` is a single shared variable per VU, not indexed by `callId` — a late server message for an already-abandoned call could theoretically be misattributed to a newer cycle's start time.
2. k6's own VU/timer scheduler under extreme contention (thousands of chained `setTimeout` callbacks queued simultaneously) producing clock-drift artifacts.

This is a **methodology gap to fix before trusting RTT numbers at extreme concurrency** (track `inviteSentAt` per `callId` in a map, ignore state changes for calls not currently being waited on). It does not affect `ws_connecting`, `calls_completed/failed`, JVM thread counts, or the HikariCP finding, which come from independent k6/Prometheus/log sources.

## Results

**Verdict: PARTIAL** — validates that virtual threads solve the *specific* problem found in spike 002 (WS/connection-thread ceiling), but invalidates the implicit assumption that this alone raises the *overall* system's concurrency ceiling — a new, different bottleneck (HikariCP pool) takes over almost immediately once the first one is removed.

**What virtual threads fixed:** WebSocket connection handshake time stayed under ~400ms even at 4000 concurrent connections (vs 30-50+ *seconds* with platform threads) — an 90-160x improvement exactly where spike 002 found the JVM thread explosion.

**What virtual threads exposed:** Boot's default HikariCP pool (10 connections) cannot serve a burst of thousands of simultaneous logins — a real, previously-invisible constraint, confirmed via a `HikariPool-1 ... request timed out after 30353ms (waiting=96)` exception in the logs, not speculation.

**Caveat on this specific bottleneck:** the login burst here is an artifact of the test harness (every VU logs in fresh at test start), not how real users behave (they log in once, reconnect occasionally). It's still a legitimate finding about default pool sizing being too small for *any* burst scenario (e.g. a mass client reconnect after a server restart), but should not be read as "the app can only handle 10 concurrent users."

**Impact / next steps:**
- If pursuing this further: bump `spring.datasource.hikari.maximum-pool-size` (Postgres can comfortably handle more than 10 for this workload) and re-run this exact ramp to see if the ceiling moves again, or whether a third bottleneck appears.
- **Recommendation for the real codebase:** `spring.threads.virtual.enabled=true` looks like a safe, high-value change worth adopting outside of this benchmarking exercise — it removed a severe, evidenced bottleneck with a one-line config change and no code change. The Hikari pool size is a separate, independent tuning question.
- Spike 003 (Redis cross-instance overhead) should stay at the previously-recommended safe concurrency (~100-300 connections/instance) regardless of these findings — neither bottleneck found here is anywhere near that level.
