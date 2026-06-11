# Domain Pitfalls

**Domain:** Realtime P2P WebRTC video calling (Spring Boot signaling, React client, mesh group calls, multi-instance scaling)
**Researched:** 2026-06-11
**Overall confidence:** HIGH for browser/WebRTC API pitfalls (verified against MDN); MEDIUM for coturn/Docker and Spring-specific items (established community knowledge)

## Critical Pitfalls

Mistakes that cause rewrites, demo failures, or "works on my machine, dies in the real demo."

### 1. No TURN (or broken TURN) — calls work on LAN, fail across real NATs

**What goes wrong:** The app is developed on one machine or one LAN where STUN alone suffices, so everything "works." At the real demo across two networks (laptop on WiFi + phone on 4G, two different NATs), ICE never connects: both peers sit at `iceConnectionState: checking` then `failed`. Roughly 10–20% of real-world peer pairs need TURN relay (symmetric NAT, carrier-grade NAT on mobile networks).

**Why it happens:** STUN-only config is the default in every tutorial; TURN requires coturn with credentials and correct public-IP config, so it gets deferred until "later" — and "later" is the demo.

**Prevention:**
- Configure `RTCPeerConnection` with both STUN and TURN URLs from day one of the 1-1 call phase.
- Use coturn's `static-auth-secret` (TURN REST API): backend mints time-limited username/credential pairs — never hardcode shared credentials in the JS bundle.
- Add a forced-relay test mode: `iceTransportPolicy: 'relay'`. If the call still works, TURN is genuinely functional. Pre-demo checklist item.
- Verify TURN independently with the Trickle ICE sample page (webrtc.github.io/samples) — confirm `relay` candidates appear.

**Detection:** No `typ relay` candidates in `chrome://webrtc-internals`; calls work between two tabs but not two networks.

### 2. coturn in Docker: bridge networking + missing external IP = useless relay candidates

**What goes wrong:** Two compounding failures when coturn sits on the default bridge network:
1. **Relay port range:** TURN allocates relay ports from a large UDP range (default 49152–65535). Publishing thousands of UDP ports with `-p` makes compose startup extremely slow/memory-hungry (per-port userland proxy), or developers publish only 3478 and relay allocation silently fails.
2. **Wrong advertised IP:** coturn advertises its container-internal IP (`172.18.0.x`) in relay candidates — unreachable from outside. Behind NAT, coturn must be told its public/host IP via `external-ip=<public>/<private>`.

The failure is silent — coturn starts, answers STUN, looks healthy.

**Prevention:**
- Run coturn with `network_mode: host` (coturn's own Docker docs recommend this). Linux-only — fine for the demo machine.
- If host networking is impossible, restrict the relay range (`min-port`/`max-port`, e.g., ~40 ports is plenty for a 4-person demo) and publish exactly that UDP range plus 3478 udp+tcp.
- Set `external-ip` to the host's LAN/public IP via a compose env var so the demo machine's IP is configurable.
- Enable TCP listener as fallback for restrictive networks.
- Put a coturn smoke test (Trickle ICE page against the demo machine's IP) in the runbook.

**Detection:** Relay candidates contain `172.x` addresses; compose startup takes minutes (port-publishing explosion). *(Confidence: MEDIUM — verify against coturn README during the infra phase.)*

### 3. ICE candidate race: `addIceCandidate` before `setRemoteDescription`

**What goes wrong:** With trickle ICE, candidates arrive over the WebSocket interleaved with (or before) the SDP answer. Calling `pc.addIceCandidate()` before `setRemoteDescription()` throws `InvalidStateError` (or candidates get silently dropped by error-swallowing code). The connection sometimes works, sometimes doesn't — a classic intermittent bug, made worse here by Redis pub/sub fan-out adding latency variance between instances.

**Prevention:**
- Buffer incoming candidates in a per-peer queue; flush after `setRemoteDescription` resolves. ~10 lines; must be in the very first signaling implementation, not retrofitted.
- In the mesh phase the queue must be **per remote peer**, keyed by peerId — a single global queue reintroduces the bug with 3+ participants.

**Detection:** `InvalidStateError: The remote description was null`; failures that disappear on retry.

### 4. Glare / offer collision — no plan for simultaneous offers

**What goes wrong:** Both peers `createOffer` simultaneously (both sides trigger renegotiation, or mesh join ordering collides). Both `setRemoteDescription(offer)` calls fail because signaling state is `have-local-offer`, not `stable`. The call wedges — "the second person to click share breaks the call."

**Prevention (verified against MDN Perfect Negotiation):**
- Implement **perfect negotiation** from the start of the 1-1 phase: assign polite/impolite roles deterministically (e.g., lexicographically smaller userId is polite); use the `makingOffer` flag — not `signalingState`, which updates asynchronously; call `setLocalDescription()` with no arguments; impolite peer ignores colliding offers; polite peer's `setRemoteDescription` auto-rolls-back.
- Also ignore ICE candidates belonging to an ignored offer (`ignoreOffer` flag).
- In mesh: one perfect-negotiation state machine **per peer connection**; politeness per pair (e.g., existing room member impolite, joiner polite).
- Same code runs on both caller and callee — no asymmetric caller/callee negotiation logic.

**Detection:** `InvalidStateError` on `setRemoteDescription`; renegotiation works in only one direction.

### 5. Secure context: `getUserMedia` works on localhost, dies on LAN IP / plain HTTP

**What goes wrong:** Development happens on `http://localhost:3000` where getUserMedia works (localhost is potentially trustworthy). The cross-NAT demo then serves the app at `http://192.168.x.x` — and `navigator.mediaDevices` is `undefined`. Plain HTTP on LAN IPs is **not** a secure context (verified MDN). No camera prompt, just a cryptic TypeError. The second demo device can't even open its camera.

**Prevention:**
- Decide the demo TLS story **early** (infra phase, before the cross-device demo): (a) self-signed cert + accepting warnings per device, (b) mkcert with CA installed on demo devices, (c) real domain + tunnel (ngrok/cloudflared) or VPS with Let's Encrypt, (d) Chrome flag `--unsafely-treat-insecure-origin-as-secure=...` (fragile; unavailable on iOS Safari).
- The WebSocket must also upgrade: `wss://` required from an `https://` page (mixed-content blocking kills `ws://`).
- Guard the UI: if `!window.isSecureContext || !navigator.mediaDevices`, show an explicit "must be served over HTTPS" error.

**Detection:** Camera works on the dev machine but not on the phone/second laptop.

### 6. Multi-instance signaling: messages routed to the wrong instance (or nowhere)

**What goes wrong:** User A's WebSocket lives on instance 1, B's on instance 2. Common mistakes:
- Backend keeps a local `Map<userId, WebSocketSession>` and sends directly — silently fails cross-instance.
- Redis pub/sub added, but every instance handles every message including its own publishes → duplicates or echo loops.
- Session registry / "is B busy" state stored locally → different answers per instance.
- nginx lacks WebSocket upgrade headers or cuts idle sockets at its default 60s `proxy_read_timeout`.

Calls connect only when both users land on the same instance — load-balancer roulette, maddening to debug.

**Prevention:**
- Design the delivery abstraction from phase one: a single `sendToUser(userId, message)` that tries local sessions, else publishes to Redis. Route everything through it even while single-instance.
- Presence and busy/in-call state live in Redis only, tagged with instanceId so dead-instance state can be reaped.
- Deliberate cross-instance test: pin A to instance 1 and B to instance 2 (hit ports directly, bypassing the LB) and place a call. Standing integration scenario.

**Detection:** Calls work intermittently depending on instance assignment; online list differs between two sessions; disconnects at exactly 60s idle.

### 7. Mesh group calls: CPU/bandwidth wall and join-storm renegotiation

**What goes wrong:**
1. **Resource wall:** each client encodes/uploads its stream n−1 times. At 4 people: 3 simultaneous encodes + 3 decodes per laptop, ~3–6 Mbps up, high CPU. Frames drop, audio degrades. (>4 is correctly out of scope.)
2. **Join storm:** "everyone offers to everyone" on join → glare × n, half-joined rooms where some pairs connect and others don't.

**Prevention:**
- Cap room size at 4 **server-side**, not just in UI.
- Constrain media for group calls: lower resolution (e.g., 640×360) and cap per-sender bitrate via `RTCRtpSender.setParameters({encodings:[{maxBitrate}]})` when room size > 2.
- Deterministic join protocol: **new joiner initiates** offers to each existing member (server sends the member list; existing members never offer to the joiner). With per-pair perfect negotiation this eliminates the storm.
- Room state (members, join order) lives in Redis as source of truth; clients rebuild peer sets from server snapshots.
- Surface partial-mesh failure per-peer in the UI (A↔C failed while A↔B, B↔C fine) instead of pretending the room is healthy.
- Demo note: 4 participants as 4 Chrome windows on ONE machine = 12 encodes on one CPU. Use `--use-fake-device-for-media-stream` for some participants or spread across 2 machines.

**Detection:** CPU > 90% at 4 participants; `outbound-rtp` stats show `qualityLimitationReason: cpu/bandwidth`; some pairs never connect after a join.

## Moderate Pitfalls

### 8. WebSocket reconnection: signaling lost, call state desynced

**What goes wrong:** WiFi blip or backend restart drops the socket. Naive clients keep a dead socket for minutes (TCP half-open gives no error), in-flight signaling (ICE candidates, hangup, incoming-call ring) is lost forever, and after reconnect the server no longer knows the user was "in call with X." One side ends up talking to a corpse call.

**Prevention:**
- Client: reconnect with exponential backoff + jitter; on reconnect, re-authenticate and **resynchronize** — fetch presence snapshot and ask "am I in a call?" rather than assuming continuity.
- Server: grace period (~10–15s) keeps the call session alive on reconnect; past it, end the call and notify the peer.
- Application-level heartbeat (ping/pong every ~15–25s) on both ends to detect dead sockets fast.
- Idempotent signaling (re-sent hangup/presence must be safe).
- Scope cut: do **not** resume an in-progress WebRTC negotiation across a signaling reconnect — restart call setup cleanly. Separately, `pc.restartIce()` handles media-path drops on network changes and is worth adding.

### 9. Presence ghost-online: missed disconnects and multi-tab

**What goes wrong:** "Set online on connect, offline on disconnect" breaks three ways:
- Laptop dies / network drops → no close frame → disconnect handler fires minutes late, or the instance itself crashed and its handlers never ran → user online forever.
- Multi-tab: user opens 2 tabs (2 sockets), closes one → marked offline while still connected.
- Multi-instance: presence flags in Redis without TTL survive an instance crash as permanent ghosts.

**Prevention:**
- Presence = Redis keys **with TTL** refreshed by heartbeat (e.g., `presence:{userId}`, TTL 60s, refreshed every 20s). Crash anywhere → key expires → offline within a minute. Single most robust pattern.
- Track **connection count per user** (set of sessionIds), not a boolean: online = count > 0.
- Tag sessions with instanceId; on startup, reap sessions claimed by a previous incarnation of the same instance.

**Detection:** Users online after closing the laptop; user vanishes from the online list while actively in a call (multi-tab bug).

### 10. Screen share via `replaceTrack`: ended-track and mesh fan-out traps

**What goes wrong:**
- User clicks the **browser's own "Stop sharing" bar** (not your UI button). The screen track fires `ended`, the sender now sends nothing, remote sees a frozen frame, your UI still says "sharing." Everyone forgets this path the first time.
- In a mesh there are n−1 peer connections — `replaceTrack` on one sender reaches one peer only; must loop all PCs.
- Camera→screen→camera swaps leak tracks if the old track isn't `stop()`ed — camera light stays on.
- `getDisplayMedia` must be called from a user gesture; calling it after an await chain can throw in some browsers.
- Screen content at camera bitrates looks like mush: set `track.contentHint = 'detail'`, optionally raise maxBitrate while sharing.
- `replaceTrack` avoids renegotiation only for same-kind compatible tracks; simultaneous camera + screen (a second video track) requires renegotiation — keep v1 replace-only, one video at a time.

**Prevention:** Centralize a `setOutgoingVideoTrack(track)` helper that loops every PC's video sender; always attach `track.onended` to revert to camera and update UI; explicitly test the browser-bar stop path.

### 11. MediaRecorder: codec roulette and broken/unseekable files

**What goes wrong (verified MDN):**
- Hardcoded `mimeType: 'video/webm;codecs=vp9'` throws `NotSupportedError` on Safari (Safari prefers MP4/H.264; WebM support absent/partial); even Chrome/Firefox differ in codec strings.
- Recorded WebM has **no duration/seek metadata** (browsers stream-write the container) — file plays but shows ∞/0:00 duration and won't seek. Fix client-side post-processing (`ts-ebml` / `webm-duration-fix`) or accept and document for v1.
- No `timeslice` → one giant in-memory Blob delivered only at `stop()`: a crashed tab loses everything, long calls eat RAM. Use `start(1000)` and accumulate chunks.
- **What to record is a design decision:** MediaRecorder takes one stream. Local-only misses the remote side. Recording the combined call requires compositing: canvas (`captureStream()`) for video + `AudioContext.createMediaStreamDestination()` for mixed audio — a meaningful chunk of work that must be scoped explicitly in the recording phase plan.
- A recorded stream built from cloned tracks won't follow a screen-share `replaceTrack` swap.

**Prevention:** `MediaRecorder.isTypeSupported()` preference ladder (`vp9` → `vp8,opus` → bare `video/webm` → `video/mp4`); timeslice; decide the compositing approach during planning, not mid-implementation.

### 12. JWT over WebSocket: the header browsers can't send

**What goes wrong:** The browser `WebSocket` API **cannot set an Authorization header** on the handshake. Teams discover this after building header-based JWT for REST, then: (a) put the JWT in the query string — leaking into nginx access logs, history, metrics; (b) skip WS auth "for now"; or (c) authenticate only at handshake and never re-check, so a socket opened with a 15-minute token lives for hours — including after an admin locks the account.

Spring-specific: with raw `WebSocketHandler`, the session `Principal` must be wired manually via a `HandshakeInterceptor`.

**Prevention:**
- Pick a pattern deliberately: (1) short-lived one-time **ticket** — client POSTs (with JWT) to `/ws-ticket`, gets a 30s single-use token, opens `wss://...?ticket=...`; a logged ticket is useless. Simplest for raw WebSockets. (2) JWT query param with log scrubbing + short TTL.
- Bind the authenticated userId to the session server-side at handshake; **never trust a `senderId`/`from` field inside signaling messages** — otherwise any user can spoof call signals (a real security hole).
- Handle expiry/lock mid-connection: admin lock should force-disconnect via a Redis-published control event; document the token-lifetime tradeoff.

**Detection:** JWTs in nginx access logs; locked users still online and calling; impersonation possible by editing the `from` field in devtools.

### 13. Call lifecycle state machine: edge cases nobody designs for

**What goes wrong:** "Offer → answer → connected" is the happy path. Reality: caller cancels while ringing (callee rings forever); callee already in a call (no busy handling — second call's signaling corrupts the first PC); simultaneous mutual calls; ring timeout never fires (no "missed call" ever recorded); refresh mid-ring; hangup racing answer. Each is also a **call history** correctness issue: missed/rejected/cancelled/completed need distinct, non-duplicated RabbitMQ events even when an instance dies mid-call.

**Prevention:**
- Define a server-side call session state machine **before** coding the 1-1 phase: states (ringing/active/ended) × events (invite, accept, reject, cancel, timeout, disconnect) × which transitions emit which history events. Active call sessions in Redis (shared across instances).
- Server enforces: one ringing/active call per user (reply "busy"); ring timeout (~30s → missed); cancel vs reject as distinct messages.
- History events emitted only by the server state machine on terminal transitions (single writer); idempotent RabbitMQ consumer keyed by callId.

## Minor Pitfalls

### 14. Autoplay policy: remote video stays black
`videoElement.play()` rejects with `NotAllowedError` without user interaction. Usually masked (user clicked "accept") but bites auto-rejoin/refresh paths. **Prevention:** `autoplay playsinline` attributes; catch `play()` rejection with a "click to start" overlay; local preview `muted` (muted video autoplays freely).

### 15. Testing needs two media endpoints — and one machine fights you
Two tabs in one Chrome profile fight over the camera; manual two-browser clicking makes regression testing painful enough that it stops happening; CI has no camera. **Prevention:** Chrome flags `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (fake camera, auto-granted permission) for dev and Playwright E2E — two browser contexts asserting a full call connects, runnable in CI. Learn `chrome://webrtc-internals` early; it answers 80% of "why is video black." Budget the E2E call test as a real CI-phase task.

### 16. Docker Compose demo gotchas beyond coturn
Frontend WS URL baked at build time (`ws://localhost`) breaks from another device — use same-origin relative `wss://` URLs (cleanest; also dodges CORS) or runtime-injected config. Redis pub/sub is fire-and-forget — fine for signaling, never for must-not-lose data (that's RabbitMQ's job). Backend starting before Redis/RabbitMQ are ready → crash loops: use healthchecks + `depends_on: condition: service_healthy`. Two replicas need distinct names and correct nginx upgrade headers.

### 17. `onnegotiationneeded` firing storms
Adding several tracks fires it multiple times; naive handlers send multiple offers and glare against themselves. **Prevention:** the perfect-negotiation `makingOffer` guard handles it; never call `createOffer` outside the `onnegotiationneeded` handler.

## Phase-Specific Warnings

| Phase topic | Likely pitfall(s) | Bake into the plan |
|---|---|---|
| Foundation / auth | #12 | WS auth pattern (ticket or query param); server-side identity binding |
| Presence & online list | #9, #8 | Redis TTL heartbeat presence, connection counting, reconnect resync |
| 1-1 call (core) | #3, #4, #13, #1 | Perfect negotiation + candidate queue from first commit; server call state machine designed first; STUN+TURN day one |
| Call UX (ring/reject/missed) | #13, #14 | Enumerate cancel/busy/timeout flows as explicit requirements |
| Call history (RabbitMQ) | #13 | Single-writer event emission; idempotent consumer keyed by callId |
| Screen sharing | #10, #4 | `onended` revert; all-senders helper; browser-bar stop test |
| Recording | #11 | `isTypeSupported` ladder, timeslice, compositing decision scoped explicitly |
| Group mesh | #7, #3/#4 per-peer | Joiner-initiates protocol, server-side cap of 4, bitrate caps, per-peer negotiation state |
| Scale-out (2 instances) | #6, #9 | `sendToUser` abstraction from phase one; Redis-only shared state; pinned-instance test |
| Infra / coturn / compose | #2, #16 | Host networking + `external-ip` + narrow relay range; runtime frontend config |
| Demo across real NAT | #5, #1/#2 | HTTPS/WSS story decided early (mkcert/tunnel/VPS); relay-only smoke test from a phone on 4G |
| CI/CD & testing | #15 | Playwright + fake media flags E2E call test |

## Pre-Demo Checklist (derived)

1. Call succeeds with `iceTransportPolicy: 'relay'` (TURN truly works).
2. Camera opens on a second physical device over HTTPS (secure context off-localhost).
3. Call succeeds with users pinned to different backend instances.
4. Stop screen share from the **browser bar**, not the app button.
5. Kill one user's WiFi mid-call — peer notified within grace period; history correct.
6. Phone on mobile data ↔ laptop on WiFi (real NAT path).

## Confidence Assessment

| Area | Level | Reason |
|---|---|---|
| Perfect negotiation / glare (#4, #17) | HIGH | Verified MDN Perfect Negotiation 2026-06-11 |
| Secure context (#5) | HIGH | Verified MDN Secure Contexts 2026-06-11 |
| MediaRecorder (#11) | HIGH | Verified MDN MediaRecorder 2026-06-11; duration bug is long-documented |
| ICE/TURN, candidate race, mesh limits (#1, #3, #7) | HIGH/MEDIUM | Inherent WebRTC mechanics; exact percentages/bitrates MEDIUM |
| coturn Docker (#2) | MEDIUM | Established coturn README guidance; verify in infra phase |
| Spring WS auth, Redis routing, presence (#6, #9, #12) | MEDIUM/HIGH | Established architecture knowledge; browser WS header limitation is HIGH |

## Open Questions

- Exact coturn flags for the chosen image version (verify `external-ip`, `min/max-port`, `static-auth-secret` against the coturn README during the infra phase).
- Which TLS approach for the cross-device demo (mkcert vs tunnel vs VPS) — needs a decision in the infra phase, affects demo logistics.
- Recording scope (local-only vs composited both-sides) — design decision for the recording phase, with real implementation-effort implications.

## Sources

- [MDN Perfect Negotiation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation) — HIGH
- [MDN Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) — HIGH
- [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) — HIGH
