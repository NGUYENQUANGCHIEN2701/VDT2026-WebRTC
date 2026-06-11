# Feature Landscape

**Domain:** Realtime P2P WebRTC video call application (directory-based 1-1 + small-group calling — simplified Google Meet/Zoom)
**Researched:** 2026-06-11
**Overall confidence:** MEDIUM-HIGH (API capabilities verified against MDN; product-feature norms from stable, well-established domain knowledge of Meet/Zoom/Teams/Jitsi/Discord)

---

## Product Model Note (read first)

This project is a **directory-call model** (like Zalo/Messenger/Discord DM calls): logged-in users see who's online and call them directly. It is *not* a **meeting model** (like Meet/Zoom: anonymous join via link, scheduling, waiting rooms). This distinction drives categorization — meeting-model features (links, lobbies for guests, calendar integration) are anti-features here, while call-model features (ringing, busy state, missed calls) are table stakes.

---

## Table Stakes

Features users expect. Missing = product feels broken or incomplete.

### Already in project scope ✅

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Register/login + roles | Account-based directory calling requires identity | Low | JWT + Admin/User already planned |
| Online user list + realtime presence | Core of directory-call model — can't call who you can't see | Medium | Presence must survive refresh/disconnect (heartbeat + TTL in Redis) |
| 1-1 audio/video call (P2P) | The product | High | Core value; everything else orbits this |
| Incoming call ringing + accept/reject | Universal phone-call mental model | Medium | Needs ringtone audio (watch browser autoplay policy — play after user gesture) |
| Missed call state | Users expect unanswered calls recorded as missed | Low | Requires explicit **call timeout** (see gaps below) |
| Mute mic / camera off toggles | In every video product since 2010 | Low | Use `track.enabled = false`, not stop() — renegotiation-free |
| Connection status display | Users need "connecting / connected / failed" | Low-Medium | Drive from `connectionstatechange` / `iceconnectionstatechange` (verified MDN) |
| Call history (own) | Standard in every calling app | Medium | Async write via RabbitMQ already planned |
| Hang-up with both sides notified | Call must end cleanly for both peers, with reason (ended/rejected/busy/timeout) | Low | Define end-reasons in signaling protocol up front |
| Screen sharing | Expected in any desktop video product (Meet, Zoom, Teams, Discord, Jitsi all have it) | Medium | `getDisplayMedia()` (verified MDN); needs renegotiation or `replaceTrack`; handle "user stopped via browser UI" event |
| TURN fallback (coturn) | Calls must work across real NATs; ~10-20% of pairs can't connect without relay | Medium | Already planned. Without it, demo works on LAN and fails in the real world |

### MISSING from project scope — flag for requirements ⚠️

Universally expected; absence is the #1 thing that makes a WebRTC demo feel like a toy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Pre-call device preview** (self-view before/while ringing) | Every major product shows self-view + device check; users won't appear on camera blind | Medium | "Lobby lite": local preview in accept-call dialog and/or settings page |
| **Device selection (camera/mic)** — before AND during call | Headset/external-webcam users expect a picker; wrong-default-mic is the most common call complaint | Medium | `enumerateDevices()` + `replaceTrack()` for mid-call switch (no renegotiation). Verified MDN |
| **Audio output (speaker) selection** | Headset vs speakers switching expected on desktop | Low-Medium | `setSinkId()` (verified MDN). Chrome/Edge/Firefox 116+; **Safari unsupported** — hide picker there. HTTPS required |
| **getUserMedia failure handling** (permission denied, no camera, device busy) | First-run users frequently deny permission; silent failure = abandonment | Low | Handle `NotAllowedError`, `NotFoundError`, `NotReadableError` with actionable UI. Allow **audio-only fallback** |
| **Busy state handling** | Calling someone in a call must return "busy", not ring forever or corrupt their call | Low-Medium | Server-side call-state machine: max one active call per user; auto-reject with reason `busy`. Cheap now, painful retrofit |
| **Call timeout + caller cancel** | Unanswered call must stop ringing (~30-60s → missed); caller can hang up while ringing | Low | Server-side timer + `cancel` signaling message. Feeds "missed" history |
| **Reconnection handling** | WiFi blips happen in every demo; call dying on a 2s hiccup feels broken | High | Two layers: (1) WebSocket reconnect with backoff + state resync, (2) ICE restart on `failed` (`disconnected` often self-heals — wait first). Hardest table-stakes item; flag phase for deep research |
| **Network quality indicator** | Meet/Zoom/Teams all show bars; users need "it's my network, not the app" | Medium | Poll `getStats()` (verified MDN): RTT, packet loss, jitter. 3-level indicator is enough |
| **Remote mute indicator** | "Is he muted or is my audio broken?" | Low | Signal mute/camera state over WebSocket or DataChannel; mic-off icon on remote tile |
| **In-call basics: duration timer, mirrored self-view, local-video PiP overlay** | Standard visual grammar; absence reads as unfinished | Low | Mirror local video with CSS `scaleX(-1)`; do NOT mirror sent stream |
| **Glare handling** (both call each other simultaneously) | Will happen on demo day one | Low-Medium | Simplest: server rejects second call as `busy`. Decide in protocol design |
| **Multi-tab / multi-session policy** | Two tabs → presence and ringing break confusingly | Medium | Recommend: single active session per user (kick old) for v1 |
| **Audio processing constraints on by default** | Echo = unusable | Low | `audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }` — near-free |

---

## Differentiators

Not strictly expected at this scope; these set the project apart (and demonstrate engineering depth for VDT).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Group mesh calls (~4)** | Beyond the 1-1 brief; demonstrates room architecture + N×N signaling | High | Mesh = N-1 uplinks per peer. **Cap per-peer bitrate/resolution** (`RTCRtpSender.setParameters` maxBitrate, e.g. 360p in 4-way) or laptops melt. Active-speaker highlight becomes near-table-stakes inside group calls |
| **Client-side recording** | Consumer apps gate recording behind paid tiers | Medium-High | MediaRecorder verified (MDN): webm, check `isTypeSupported()`. **1-1 recording is easy; group recording needs canvas + AudioContext compositing — scope to 1-1 first.** Show "recording" consent indicator to remote party |
| **Admin dashboard (live: online users, active calls)** | Rare in demo projects; shows operational thinking | Medium | Depends on Redis presence + authoritative server-side call state |
| **Admin user management (lock/unlock, role change)** | Enterprise expectation; demonstrates RBAC | Low-Medium | Locked user must be force-disconnected from WebSocket, not just blocked at next login |
| **System-wide call history (admin)** | Operational visibility | Low | Same pipeline as user history |
| **Horizontal scaling (2+ signaling instances via Redis pub/sub)** | Standout engineering differentiator — almost no student demos do this | High | Caller and callee on different instances must still ring — that *is* the demo |
| **Monitoring (Prometheus/Grafana) + CI/CD** | Professional delivery quality | Medium | Custom metrics: active WS sessions, active calls, call setup success rate |
| **Detailed stats/debug panel** (codec, bitrate, resolution, candidate type host/srflx/relay) | Superb for the demo ("look, it's going through TURN") | Low-Medium | Pure `getStats()` rendering; cheap win once quality indicator exists |

---

## Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Virtual backgrounds / blur | ML segmentation, heavy CPU — disastrous with mesh; zero WebRTC-core learning | Plain video; "future work" |
| Server-side recording | Media touches server → violates P2P constraint; needs SFU | Client-side MediaRecorder (planned) |
| SFU / >4 group calls | Already out of scope — correct. Mesh beyond 4 collapses | Room architecture documents SFU as v2 path |
| Meeting model: shareable links, scheduling, guest join, waiting rooms | Different product; forks auth/presence/signaling design | Stay directory-call model |
| Text chat | Already out of scope — correct; persistence/unread/history is its own project | If ever needed: ephemeral DataChannel chat only |
| Calling offline users / push notifications | Web Push + SW wake-up for calls is hard and flaky | Offline = disabled call button |
| PSTN dial-in, SIP interop | Telephony rabbit hole | No |
| Custom E2EE (insertable streams) | Already out of scope — correct; DTLS-SRTP is default | Document DTLS-SRTP as the security story |
| Captions/transcription, reactions, hand-raise, polls | Meeting-product polish, irrelevant to learning goals | Skip |
| Manual video quality settings UI | Users don't want it; adaptation should be automatic | Sane defaults; fixed caps in mesh |
| Granular RBAC (custom permissions) | Over-engineering for 2 roles | Keep Admin/User flat |

---

## Feature Dependencies

```
Auth (JWT) ──► WebSocket session ──► Presence (Redis) ──► Online user list
                                  │
                                  ▼
                    Signaling protocol + server-side CALL STATE MACHINE
                    (ring / accept / reject / cancel / timeout / busy / end-reason)
                                  │
        ┌─────────────────────────┼──────────────────────────────┐
        ▼                         ▼                              ▼
  1-1 P2P call ──► In-call UX (mute, camera, indicators)   Call lifecycle events
        │                         │                              │
        │                         ▼                              ▼
        │              Network quality indicator          Call history (RabbitMQ)
        │              (getStats)                                │
        ▼                                                        ▼
  Reconnection (WS resync + ICE restart)            Admin history + dashboard
        │                                           (also needs Presence)
        ├──► Screen sharing (replaceTrack/renegotiation on working 1-1)
        ├──► Recording (MediaRecorder on working 1-1; group needs compositing)
        └──► Group mesh (room model generalizes 1-1; needs bitrate caps)

Horizontal scaling (Redis pub/sub) cuts across Presence + Signaling: design
signaling routing through an abstraction from day one, even on 1 instance.

Device selection/preview is independent of signaling — buildable anytime after
getUserMedia handling exists; preview UX belongs with the call-accept flow.
```

**Critical dependency insights:**

1. **The call state machine is the keystone.** Busy, timeout, cancel, glare, missed, and history end-reasons are all states of one server-side machine. Design it completely before writing signaling code — retrofitting `busy`/`cancel` into ad-hoc messages causes the classic rewrite.
2. **Mute/camera state signaling and connection-status events reuse the same channel** — design an extensible message envelope (type + payload), not one-off messages.
3. **Recording and screen share both touch track management** — build after 1-1 track handling is solid.
4. **Group mesh should reuse 1-1 PeerConnection management as a per-pair unit** — encapsulate one class per peer connection in the 1-1 phase or mesh forces the refactor.

---

## MVP Recommendation

Prioritize (in order):

1. **Auth + presence + online list** — foundation, low risk
2. **1-1 call with the FULL state machine** (ring/accept/reject/cancel/timeout/busy/end) — never ship happy-path-only calling
3. **getUserMedia error handling + device preview/selection** — the difference between toy and product
4. **In-call UX**: mute/camera with remote indicators, duration, connection status
5. **Reconnection (WS + ICE restart) + network quality indicator** — stability before features
6. **Call history pipeline** (RabbitMQ)
7. Differentiators: **screen share → admin panel → group mesh → recording → scaling demo → monitoring polish** (scaling abstraction designed day one, demonstrated late)

Defer within v1:
- **Group-call recording** (compositing) — record 1-1 only; document limitation
- **Speaker selection on Safari** — hide control (API unsupported)
- **Active-speaker detection** — only matters once group mesh lands

---

## Sources

- MDN WebRTC API overview — connection states, getStats, RTCRtpSender/Receiver, perfect negotiation (HIGH) — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- MDN `HTMLMediaElement.setSinkId()` — output selection, HTTPS, permission model (HIGH; Safari non-support MEDIUM) — https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId
- MDN `MediaRecorder` — client recording, format checks, chunked recording (HIGH) — https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- Feature norms of Google Meet, Zoom, Teams, Discord, Jitsi Meet (training data; stable domain — MEDIUM)
- Mesh limits (~4 peers), TURN relay rates (~10-20%) — widely-reported WebRTC community figures (MEDIUM)

*Note: WebSearch and non-MDN WebFetch were unavailable during research; product-norm claims rest on training data for an exceptionally stable domain and are flagged MEDIUM accordingly.*
