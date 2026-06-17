# Phase 3: 1-1 P2P Call Core & NAT Traversal — Research

**Researched:** 2026-06-17
**Domain:** WebRTC peer connections, signaling protocol, coturn/TURN, mkcert HTTPS, getStats diagnostics
**Confidence:** HIGH (core WebRTC APIs from MDN official docs), MEDIUM (coturn Docker config), HIGH (Java HMAC pattern)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Phase 3 includes call core + accept/reject/cancel basic. NOT doing: ringtone polish, timeout→missed (CALL-04), busy (CALL-05), glare (CALL-06), end-reason taxonomy (CALL-07), Redis state machine (CALL-08) — all Phase 4. Accept/reject/cancel uses simple signaling handshake; Phase 4 tightens.
- **D-02:** Add call messages (call-offer / call-answer / ice-candidate / hang-up / call-reject / call-cancel) to the existing sealed envelope. Server relays SDP/ICE OPAQUELY via `MessageRouter.sendToUser` (implement the Phase 2 stub). Perfect negotiation (polite/impolite) + ICE candidate buffering from commit one.
- **D-03:** STUN first (prove same-network call), THEN coturn (Docker Compose) with ephemeral HMAC credentials via Spring `GET /api/turn-credentials` + forced-relay test (`iceTransportPolicy:'relay'`). Coturn networking per CLAUDE.md (host-mode on Linux demo box / small relay port range).
- **D-04:** HTTPS/WSS via mkcert (locally-trusted CA) for 2-device LAN testing. Tunnel (ngrok/cloudflared) optional.
- **D-05:** Call lives on dedicated `/call` route. Debug panel (codec/bitrate/resolution/ICE candidate type host·srflx·relay) hidden, toggled by button. Quality indicator (RTT/packet loss from getStats) visible in-call.
- **D-06:** Self-view mirrored before call; getUserMedia errors (permission denied, no device, device busy) show actionable messages + audio-only fallback.

### Claude's Discretion

- WebRTC peer manager = plain TS class/module (RTCPeerConnection/MediaStream NOT in Zustand — only serializable derived state).
- Exact name/shape of signaling messages; getStats poll cadence; polite/impolite assignment rule (e.g. compare userId lexicographically).
- Specific coturn config (realm, relay port range, external-ip), TURN credential TTL.

### Deferred Ideas (OUT OF SCOPE)

- Full call lifecycle: ringtone, timeout→missed, busy, glare, end-reason taxonomy, Redis state machine → Phase 4 (CALL-04..08).
- Mute/cam-off, device selection, PiP, call duration → Phase 4/8 (MEDIA-01/03/04/06).
- ICE restart / reconnection grace → Phase 4 (STAB-02).
- Tunnel (ngrok/cloudflared) for cross-network demo → optional.
- Cross-instance signaling routing via Redis pub/sub → Phase 6.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CALL-01 | User can start a video/audio call; media flows P2P via WebRTC (SDP/ICE signaling over WS, perfect negotiation + candidate buffering) | Perfect negotiation pattern (MDN), sealed envelope extension, sendToUser implementation |
| CALL-02 (partial) | Callee sees incoming-call screen; can accept or reject | call-offer / call-accept / call-reject message types; incoming call UI |
| CALL-03 (partial) | Caller can cancel a call while ringing | call-cancel message type; UI cancel button |
| MEDIA-02 | Self-view preview (mirrored) before call | getUserMedia + video element with transform: scaleX(-1) |
| MEDIA-05 | getUserMedia failures show actionable errors with audio-only fallback | Full error taxonomy (NotAllowedError/NotFoundError/NotReadableError/etc.) |
| STAB-03 | Network quality indicator (RTT/packet loss from getStats) | remote-inbound-rtp `roundTripTime` + `fractionLost` |
| STAB-04 | Debug panel: codec, bitrate, resolution, ICE candidate type | outbound-rtp, local-candidate stats reports |
| INFR-01 | Calls work across real NATs via coturn (STUN+TURN), ephemeral HMAC; forced-relay test | coturn Docker + TURN REST API ephemeral credential algorithm |
| INFR-03 | App served over HTTPS/WSS for cross-device demos | mkcert + Vite HTTPS + Spring Boot SSL config |
</phase_requirements>

---

## Summary

Phase 3 delivers the core value of the entire product: a working 1-1 P2P video call. The technical domain spans four distinct sub-systems that must be assembled correctly: (1) a WebRTC peer connection manager implementing perfect negotiation, (2) a signaling protocol layered on the Phase 2 WebSocket envelope, (3) coturn STUN/TURN for NAT traversal, and (4) HTTPS/WSS infrastructure so getUserMedia works on LAN devices. Each sub-system has independent sharp edges; the most dangerous is coturn-in-Docker UDP relay, which is the #1 demo-failure risk noted in STATE.md.

The perfect negotiation pattern (from MDN) eliminates asymmetric caller/callee negotiation code by assigning polite/impolite roles purely for collision resolution, independent of who initiates the call. Modern browser `setLocalDescription()` with no arguments creates an offer or answer implicitly and handles rollback automatically. ICE candidate buffering is required because `addIceCandidate()` throws `InvalidStateError` when `remoteDescription` is null — candidates received before the remote description must be queued and drained after `setRemoteDescription()` completes.

The signaling design is deliberately opaque: the Spring handler reads the `type` field to route the message to the target user via `MessageRouter.sendToUser` (implementing the Phase 2 stub), but never parses the SDP/ICE payload. This keeps the server ignorant of media internals and lets the sealed envelope expand without backend changes. The Jackson 3 / Boot 4 pattern established in Phase 2 (`tools.jackson.*` imports, unchecked `JacksonException`, annotation still from `com.fasterxml`) carries forward identically.

**Primary recommendation:** Build the peer manager as a singleton TS module (not a React component); implement perfect negotiation with an explicit candidate queue; relay signaling opaquely through the existing WS handler; add coturn with `network_mode: host` and a small relay port range; generate HTTPS certs with mkcert and configure Vite + Spring Boot SSL.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WebRTC peer connection lifecycle | Browser/Client (TS module) | — | RTCPeerConnection lives only in the browser; server never touches media |
| SDP/ICE signaling relay | API/Backend (Spring WS handler) | — | Server routes opaquely; never parses SDP content |
| sendToUser 1-1 routing | API/Backend (LocalMessageRouter) | — | Implement Phase 2 stub: look up session by userId from sessions map |
| Sealed envelope extension | API/Backend + Frontend/Client | — | Both sides must add new message types symmetrically |
| TURN credential generation | API/Backend (REST endpoint) | — | Server holds shared secret; browser receives ephemeral credentials |
| getUserMedia + self-view | Browser/Client | — | Media device access is always client-side |
| getStats diagnostics polling | Browser/Client | — | RTCPeerConnection.getStats() is a client API |
| HTTPS/TLS termination (dev) | Frontend Server (Vite dev) + API/Backend (Spring SSL) | — | Both must serve HTTPS; WSS follows automatically |
| ICE/STUN/TURN infrastructure | CDN/Static (coturn in Docker) | — | coturn is infrastructure, not application code |
| Call route + UI | Frontend/Client | — | React Router `/call` route with Zustand derived state |

---

## Standard Stack

### Core (no new dependencies required — existing stack covers all WebRTC APIs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `RTCPeerConnection` | Browser API | Peer connection, SDP, ICE | Web standard; no library wrapping (CLAUDE.md mandate) |
| `navigator.mediaDevices.getUserMedia` | Browser API | Camera + microphone capture | Web standard |
| `RTCPeerConnection.getStats()` | Browser API | Quality metrics (RTT, bitrate, codec) | Web standard |
| Spring `TextWebSocketHandler` | Boot 4 BOM | Signaling relay | Already in place (Phase 2) |
| Jackson 3 (`tools.jackson.*`) | Boot 4 BOM | JSON serialize/deserialize messages | Already in place; Boot 4 gotcha documented in Phase 2 |
| Zustand 5.x | Existing | Call UI derived state (NOT peer connection objects) | Already in place |
| `javax.crypto.Mac` (HmacSHA1) | Java 21 stdlib | TURN ephemeral credential computation | No extra dep needed |

### Supporting (new additions)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| mkcert (CLI tool, not npm) | latest (FiloSottile/mkcert) | Locally-trusted HTTPS certificates | Dev + LAN 2-device testing |
| vite-plugin-mkcert | 2.1.0 (OPTIONAL) | Automates mkcert cert setup in Vite | Use IF manual cert config is unwieldy; otherwise manual is fine |
| coturn/coturn | 4.6 (CLAUDE.md mandate; latest is 4.13) | STUN + TURN server in Docker | NAT traversal |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `RTCPeerConnection` | `simple-peer`, `PeerJS` | REJECTED per CLAUDE.md; both stale/unmaintained; PeerJS replaces signaling server entirely |
| Native `WebSocket` signaling | `socket.io` | REJECTED; different protocol — cannot talk to Spring WS |
| mkcert | ngrok / cloudflared tunnel | mkcert is offline-capable; tunnel adds external dependency; keep as optional for cross-network demo |
| Manual Vite HTTPS config | `vite-plugin-mkcert` | Manual is simpler for a codebase that already knows its cert paths; plugin adds automation |

**Installation (new tooling only):**
```bash
# mkcert — install the CLI (not npm):
# Windows: choco install mkcert   OR   scoop install mkcert
# Linux:   apt install libnss3-tools && curl -sL https://github.com/FiloSottile/mkcert/releases/latest ... 
mkcert -install                                # install local CA into system/browser trust stores
mkcert localhost 127.0.0.1 <LAN-IP>           # generate cert + key for Vite dev server
mkcert -p12-file backend-keystore.p12 -pkcs12 localhost 127.0.0.1 <LAN-IP>  # for Spring Boot

# vite-plugin-mkcert (optional alternative):
npm install --save-dev vite-plugin-mkcert
```

**Version verification:**
```bash
npm view vite-plugin-mkcert version   # 2.1.0 (verified 2026-06-17)
```

---

## Package Legitimacy Audit

> slopcheck runs on PyPI by default. For npm packages, we cross-verified on the npm registry manually (slopcheck is not available as an npm command in this environment). All Node packages confirmed via `npm view`.

| Package | Registry | Age | Downloads/wk | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------|-------------|-----------|-------------|
| vite-plugin-mkcert | npm | ~5 yrs (2021-05-02) | ~662K | github.com/liuweiGL/vite-plugin-mkcert | N/A (npm, not PyPI) | Approved — legitimate, high-traffic, no postinstall script |
| coturn/coturn | Docker Hub / GitHub | ~10 yrs | N/A (Docker image) | github.com/coturn/coturn | N/A | Approved — official image, upstream IETF reference implementation |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck ran in Python mode (PyPI only) — npm packages manually verified via `npm view` on the correct npm registry. No cross-ecosystem confusion detected.*

---

## Architecture Patterns

### System Architecture Diagram

```
Browser A (Caller)                     Browser B (Callee)
┌────────────────────┐                 ┌────────────────────┐
│  PeerManager (TS)  │                 │  PeerManager (TS)  │
│  RTCPeerConnection │◄── P2P media ──►│  RTCPeerConnection │
│  polite=false      │                 │  polite=true       │
└──────┬─────────────┘                 └──────────┬─────────┘
       │ SDP/ICE (call-offer / call-answer /       │
       │ ice-candidate) via WS envelope             │
       ▼                                            ▼
┌──────────────────────────────────────────────────────────┐
│         Spring PresenceWebSocketHandler (or dedicated    │
│         SignalingHandler) + LocalMessageRouter           │
│         sendToUser(targetUserId, msg) — routes opaquely  │
│         sessions map: userId → WebSocketSession          │
└──────┬────────────────────────────────────────┬──────────┘
       │ REST GET /api/turn-credentials          │
       ▼                                         ▼
┌──────────────────┐                  ┌──────────────────────┐
│  TurnController  │                  │  coturn/coturn:4.6   │
│  HMAC-SHA1 creds │  shared secret   │  STUN port 3478      │
│  username=ts:uid │◄────────────────►│  relay 49160-49200   │
└──────────────────┘                  │  network_mode: host  │
                                      └──────────────────────┘
```

**Data flow — call setup (happy path):**
1. Caller fetches `/api/turn-credentials` → builds iceServers config
2. Caller sends `{type:"call-offer", to:"callee"}` over WS → Spring routes to callee session
3. Callee sees incoming-call UI; accepts → sends `{type:"call-accept", to:"caller"}`
4. Caller (impolite): `onnegotiationneeded` fires → `setLocalDescription()` → sends `call-offer` with SDP
5. Callee (polite): receives offer → `setRemoteDescription()` → `setLocalDescription()` → sends `call-answer`
6. Both sides exchange `ice-candidate` messages; server relays opaquely
7. ICE completes; DTLS-SRTP established; media flows P2P (or via TURN relay)

**Note on naming: `call-offer` (signaling message type) vs. SDP offer (RTCSessionDescription.type = "offer") — these are two different things. The signaling envelope `{type:"call-offer"}` is the Phase 3 call invitation; the SDP content sent over it uses a different sub-field (e.g. `sdp: {...}`).**

### Recommended Project Structure

```
backend/src/main/java/com/vdt/webrtc/
├── ws/
│   ├── message/
│   │   ├── ServerMessage.java        # extend sealed + @JsonSubTypes
│   │   ├── ClientMessage.java        # extend sealed + @JsonSubTypes
│   │   ├── CallOffer.java            # new record
│   │   ├── CallAnswer.java           # new record (contains SDP)
│   │   ├── IceCandidate.java         # new record (opaque pass-through)
│   │   ├── HangUp.java               # new record
│   │   ├── CallReject.java           # new record
│   │   └── CallCancel.java           # new record
│   ├── PresenceWebSocketHandler.java # extend handleTextMessage to route call msgs
│   └── LocalMessageRouter.java       # IMPLEMENT sendToUser stub
└── call/
    └── TurnController.java           # GET /api/turn-credentials

frontend/src/
├── realtime/
│   ├── messages.ts           # add call message types to discriminated union
│   └── wsClient.ts           # dispatch call messages to callStore
├── webrtc/
│   └── PeerManager.ts        # RTCPeerConnection wrapper, perfect negotiation
├── store/
│   └── callStore.ts          # Zustand: callState, remoteStream ref (non-serializable kept outside)
└── components/call/
    ├── CallPage.tsx           # /call route: self-view + remote view + debug panel
    ├── IncomingCallBanner.tsx # accept / reject UI
    └── DebugPanel.tsx         # togglable codec/bitrate/resolution/ICE type panel
```

### Pattern 1: Perfect Negotiation (MDN canonical pattern)

**What:** Symmetric negotiation with polite/impolite roles to handle collision. No separate caller/callee branches.
**When to use:** Always — from the first commit of PeerManager.ts.

**Key flags and their purpose:**
- `makingOffer`: true while `setLocalDescription()` is in progress; prevents collision detection race
- `isSettingRemoteAnswerPending`: true while `setRemoteDescription(answer)` is async; allows stable-state check to pass correctly
- `ignoreOffer`: true when impolite peer encounters a collision; also suppresses addIceCandidate errors for that offer's candidates

```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
// Adapted for project's TS class structure

class PeerManager {
  private pc: RTCPeerConnection
  private polite: boolean           // true = polite peer (will rollback)
  private makingOffer = false
  private ignoreOffer = false
  private isSettingRemoteAnswerPending = false
  private pendingCandidates: RTCIceCandidateInit[] = []  // buffer before remoteDescription

  constructor(iceServers: RTCIceServer[], polite: boolean) {
    this.polite = polite
    this.pc = new RTCPeerConnection({ iceServers })
    this.setupHandlers()
  }

  // Called when onnegotiationneeded fires (adding tracks triggers this)
  private async handleNegotiationNeeded() {
    try {
      this.makingOffer = true
      await this.pc.setLocalDescription()          // implicit offer creation + rollback support
      this.sendSignal({ type: 'sdp', sdp: this.pc.localDescription! })
    } finally {
      this.makingOffer = false
    }
  }

  // Called when a signaling message arrives from the remote peer
  async handleSignalingMessage(msg: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
    if (msg.sdp) {
      const readyForOffer =
        !this.makingOffer &&
        (this.pc.signalingState === 'stable' || this.isSettingRemoteAnswerPending)
      const offerCollision = msg.sdp.type === 'offer' && !readyForOffer

      this.ignoreOffer = !this.polite && offerCollision
      if (this.ignoreOffer) return

      this.isSettingRemoteAnswerPending = msg.sdp.type === 'answer'
      await this.pc.setRemoteDescription(msg.sdp)   // implicit rollback if polite peer + collision
      this.isSettingRemoteAnswerPending = false

      // Drain buffered candidates now that remote description is set
      for (const c of this.pendingCandidates) {
        await this.pc.addIceCandidate(c).catch(() => {})
      }
      this.pendingCandidates = []

      if (msg.sdp.type === 'offer') {
        await this.pc.setLocalDescription()         // implicit answer
        this.sendSignal({ type: 'sdp', sdp: this.pc.localDescription! })
      }
    } else if (msg.candidate) {
      if (this.pc.remoteDescription) {
        await this.pc.addIceCandidate(msg.candidate).catch(err => {
          if (!this.ignoreOffer) throw err
        })
      } else {
        this.pendingCandidates.push(msg.candidate)  // buffer until remote description is set
      }
    }
  }
}
```

**Polite/impolite assignment rule (Claude's Discretion — recommendation):**
```typescript
// Compare userId strings lexicographically. Caller is impolite (wins collisions).
// This is deterministic and requires no extra round-trip.
const polite = localUserId > remoteUserId   // impolite if localUserId < remoteUserId
// Alternative: always make callee polite (simpler, no glare in Phase 3's simple handshake)
const polite = isCallee
```
For Phase 3's simple handshake (no glare handling), making the callee always polite is cleaner. Phase 4's state machine will enforce anti-glare at the server level anyway.

### Pattern 2: ICE Candidate Buffering

**What:** Queue incoming ICE candidates before `setRemoteDescription()` completes; drain immediately after.
**Why:** `addIceCandidate()` throws `InvalidStateError` when `remoteDescription` is null (browsers do NOT auto-buffer). [VERIFIED: MDN addIceCandidate docs]

The MDN perfect negotiation example shows a simpler approach: it catches errors on `addIceCandidate()` and suppresses them when `ignoreOffer` is set. However, that does not handle candidates arriving before `setRemoteDescription()` has been called at all (e.g., trickle ICE arriving before the offer is processed). The `pendingCandidates` array in Pattern 1 above handles this correctly.

### Pattern 3: sendToUser Implementation (LocalMessageRouter)

**What:** Implement the Phase 2 stub by maintaining a shared reference to the sessions map.
**Why:** `LocalMessageRouter` needs access to the sessions map held by `PresenceWebSocketHandler`.

```java
// Option A: pass sessions map reference into LocalMessageRouter at construction
// Option B: inject PresenceWebSocketHandler into LocalMessageRouter (circular bean risk)
// Option C (RECOMMENDED): move sessions map into a separate SessionRegistry bean

// SessionRegistry.java
@Component
public class SessionRegistry {
    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    
    public void register(String userId, WebSocketSession session) { sessions.put(userId, session); }
    public void deregister(String userId, WebSocketSession session) { sessions.remove(userId, session); }
    public Optional<WebSocketSession> get(String userId) { return Optional.ofNullable(sessions.get(userId)); }
    public Collection<WebSocketSession> all() { return sessions.values(); }
}

// LocalMessageRouter.java — sendToUser implementation
@Override
public void sendToUser(String userId, ServerMessage message) {
    sessionRegistry.get(userId).ifPresent(session -> {
        String json;
        try { json = mapper.writeValueAsString(message); } 
        catch (JacksonException e) { log.error("serialize failed", e); return; }
        synchronized (session) {
            try { if (session.isOpen()) session.sendMessage(new TextMessage(json)); }
            catch (IOException e) { log.warn("send failed to {}", userId, e); }
        }
    });
}
```

**Alternative (simpler for now):** Keep sessions map in `PresenceWebSocketHandler` and add a `sendToUser(userId, msg)` method there, then call it from `LocalMessageRouter`. This avoids the new bean but creates coupling. Recommend `SessionRegistry` for clean seam (Phase 6 will need to replace with Redis routing anyway).

### Pattern 4: Sealed Envelope Extension

**Adding call messages — backend (Java):**
```java
// ServerMessage.java — add new permit types
@JsonSubTypes({
    // ... existing: PresenceSnapshot, SessionSuperseded, Pong ...
    @JsonSubTypes.Type(value = CallOfferReceived.class, name = "call-offer-received"),
    @JsonSubTypes.Type(value = CallAnswerReceived.class, name = "call-answer-received"),
    @JsonSubTypes.Type(value = IceCandidateReceived.class, name = "ice-candidate"),
    @JsonSubTypes.Type(value = HangUpReceived.class, name = "hang-up"),
    @JsonSubTypes.Type(value = CallRejectReceived.class, name = "call-reject"),
    @JsonSubTypes.Type(value = CallCancelReceived.class, name = "call-cancel"),
})
public sealed interface ServerMessage permits 
    PresenceSnapshot, SessionSuperseded, Pong,
    CallOfferReceived, CallAnswerReceived, IceCandidateReceived,
    HangUpReceived, CallRejectReceived, CallCancelReceived {}

// ClientMessage.java — add client-initiated call messages
@JsonSubTypes({
    @JsonSubTypes.Type(value = Ping.class, name = "ping"),
    @JsonSubTypes.Type(value = CallOffer.class, name = "call-offer"),      // {to, callId}
    @JsonSubTypes.Type(value = CallAccept.class, name = "call-accept"),    // {to, callId}
    @JsonSubTypes.Type(value = CallReject.class, name = "call-reject"),    // {to, callId}
    @JsonSubTypes.Type(value = CallCancel.class, name = "call-cancel"),    // {to, callId}
    @JsonSubTypes.Type(value = HangUp.class, name = "hang-up"),            // {to, callId}
    @JsonSubTypes.Type(value = SdpMessage.class, name = "sdp"),            // {to, callId, sdp: RTCSessionDescriptionInit}
    @JsonSubTypes.Type(value = IceCandidateMessage.class, name = "ice-candidate"), // {to, callId, candidate}
})
public sealed interface ClientMessage permits 
    Ping, CallOffer, CallAccept, CallReject, CallCancel, HangUp, SdpMessage, IceCandidateMessage {}
```

**Design note:** Server relay is opaque — it extracts only `to` (target userId) from the client message and forwards the entire payload as a `ServerMessage` variant. SDP content is treated as an opaque JSON blob. The `from` field is NEVER taken from the client body — it is stamped by the server from the authenticated session principal.

**Frontend (TypeScript) — discriminated union extension:**
```typescript
// messages.ts — extend existing ServerMessage + ClientMessage types
export type ServerMessage =
    | { type: 'presence'; users: OnlineUser[] }
    | { type: 'session-superseded'; reason: string }
    | { type: 'pong' }
    // Phase 3 call messages (server → client):
    | { type: 'call-offer-received'; from: string; callId: string }
    | { type: 'call-answer-received'; from: string; callId: string }
    | { type: 'call-accept'; from: string; callId: string }
    | { type: 'call-reject'; from: string; callId: string }
    | { type: 'call-cancel'; from: string; callId: string }
    | { type: 'hang-up'; from: string; callId: string }
    | { type: 'sdp'; from: string; callId: string; sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate'; from: string; callId: string; candidate: RTCIceCandidateInit }

export type ClientMessage =
    | { type: 'ping' }
    | { type: 'call-offer'; to: string; callId: string }
    | { type: 'call-accept'; to: string; callId: string }
    | { type: 'call-reject'; to: string; callId: string }
    | { type: 'call-cancel'; to: string; callId: string }
    | { type: 'hang-up'; to: string; callId: string }
    | { type: 'sdp'; to: string; callId: string; sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate'; to: string; callId: string; candidate: RTCIceCandidateInit }
```

### Pattern 5: TURN Ephemeral Credentials (Spring Controller)

**What:** Standard TURN REST API — username = `expiry_unix_ts:userId`, credential = `base64(HMAC-SHA1(secret, username))`. [VERIFIED: TURN REST API spec / coturn README]

```java
// Source: TURN REST API spec (draft-ietf-tram-turn-third-party-authz)
// coturn README: https://github.com/coturn/coturn

@RestController
@RequestMapping("/api")
public class TurnController {
    
    @Value("${turn.secret}")
    private String turnSecret;
    
    @Value("${turn.server}")         // e.g. "turn:192.168.1.10:3478"
    private String turnServer;
    
    @Value("${turn.credential-ttl-seconds:86400}")  // 24h default
    private int ttlSeconds;
    
    @GetMapping("/turn-credentials")
    public TurnCredentialsResponse getCredentials(Principal principal) throws Exception {
        long expiry = System.currentTimeMillis() / 1000 + ttlSeconds;
        String username = expiry + ":" + principal.getName();
        String credential = computeHmacSha1(username, turnSecret);
        return new TurnCredentialsResponse(
            List.of("stun:" + turnServer.replace("turn:", ""), turnServer),
            username,
            credential
        );
    }
    
    private String computeHmacSha1(String data, String key) throws Exception {
        SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA1");
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(secretKey);
        return Base64.getEncoder().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }
    
    public record TurnCredentialsResponse(List<String> urls, String username, String credential) {}
}
```

**Frontend — build iceServers from fetched credentials:**
```typescript
// Before creating RTCPeerConnection:
const creds = await api.get<TurnCredentialsResponse>('/api/turn-credentials')
const iceServers: RTCIceServer[] = [
    { urls: creds.data.urls, username: creds.data.username, credential: creds.data.credential }
]
// Forced-relay test (D-03): override iceTransportPolicy
const pc = new RTCPeerConnection({ 
    iceServers,
    iceTransportPolicy: forceRelay ? 'relay' : 'all'
})
```

### Pattern 6: getStats Polling for Quality Metrics

**Recommended poll cadence:** Every 1000ms (1s). [ASSUMED — no official MDN recommendation; 1s is widely used practice for RTCStats deltas]

**RTCStats report types for STAB-03/04:**

| Metric | Report type | Field | Notes |
|--------|------------|-------|-------|
| RTT (ms) | `remote-inbound-rtp` | `roundTripTime` (seconds → ×1000) | Available after first RTCP SR received |
| Packet loss fraction | `remote-inbound-rtp` | `fractionLost` | 0–1 fraction per recent interval |
| Bitrate (kbps) | `outbound-rtp` | `bytesSent` delta | `(Δbytes × 8) / Δtime_ms` |
| Frame resolution | `outbound-rtp` | `frameWidth`, `frameHeight` | Undefined for audio |
| Codec name | `outbound-rtp`.`codecId` → lookup `codec` report | `mimeType` | e.g. `"video/VP8"` |
| ICE candidate type | `local-candidate` (active pair) | `candidateType` | `"host"` / `"srflx"` / `"relay"` |
| Active ICE pair | `transport` | `selectedCandidatePairId` | Cross-reference to `candidate-pair` report |

[VERIFIED: MDN RTCRemoteInboundRtpStreamStats, RTCOutboundRtpStreamStats, RTCIceCandidateStats, RTCIceCandidatePairStats]

```typescript
// getStats polling pattern
let prevBytesSent = 0, prevTimestamp = 0

async function pollStats(pc: RTCPeerConnection): Promise<CallStats> {
    const stats = await pc.getStats()
    const result: Partial<CallStats> = {}
    
    stats.forEach(report => {
        if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
            result.rttMs = (report.roundTripTime ?? 0) * 1000
            result.fractionLost = report.fractionLost ?? 0
        }
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
            const dt = (report.timestamp - prevTimestamp) / 1000
            result.bitrateKbps = dt > 0 ? ((report.bytesSent - prevBytesSent) * 8) / dt / 1000 : 0
            prevBytesSent = report.bytesSent
            prevTimestamp = report.timestamp
            result.frameWidth = report.frameWidth
            result.frameHeight = report.frameHeight
            result.codecId = report.codecId
        }
        if (report.type === 'local-candidate') {
            // Find candidate that matches selectedCandidatePairId via transport report
            // See anti-pattern section for the correct way to identify active candidate type
        }
    })
    return result as CallStats
}
```

**Finding active ICE candidate type:**
```typescript
// Step 1: find transport → get selectedCandidatePairId
// Step 2: find candidate-pair with that id → get localCandidateId
// Step 3: find local-candidate with that id → get candidateType
stats.forEach(report => {
    if (report.type === 'transport') {
        const pairId = report.selectedCandidatePairId
        const pair = stats.get(pairId)
        if (pair) {
            const local = stats.get(pair.localCandidateId)
            if (local) result.iceCandidateType = local.candidateType  // 'host'|'srflx'|'relay'
        }
    }
})
```

### Pattern 7: getUserMedia with Error Handling + Audio-Only Fallback

[VERIFIED: MDN getUserMedia documentation]

```typescript
export type MediaError = 
    | 'permission-denied'   // NotAllowedError: user rejected or insecure context
    | 'no-device'           // NotFoundError: camera/mic not found
    | 'device-busy'         // NotReadableError: hardware occupied by another app
    | 'overconstrained'     // OverconstrainedError: constraints unsatisfiable
    | 'security-error'      // SecurityError: getUserMedia disabled on document
    | 'unknown'

async function acquireMedia(): Promise<{ stream: MediaStream; mode: 'av' | 'audio-only'; error?: MediaError }> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true }, 
            video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        return { stream, mode: 'av' }
    } catch (err: unknown) {
        const name = (err as DOMException).name
        if (name === 'NotFoundError' || name === 'OverconstrainedError') {
            // Camera missing/constrained — try audio-only fallback
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { echoCancellation: true, noiseSuppression: true }
                })
                return { stream, mode: 'audio-only', error: 'no-device' }
            } catch { /* fall through */ }
        }
        const errorType: MediaError = 
            name === 'NotAllowedError' ? 'permission-denied' :
            name === 'NotFoundError' ? 'no-device' :
            name === 'NotReadableError' ? 'device-busy' :
            name === 'OverconstrainedError' ? 'overconstrained' :
            name === 'SecurityError' ? 'security-error' : 'unknown'
        throw Object.assign(new Error(name), { mediaError: errorType })
    }
}
```

**Actionable user messages:**
| Error | Message to show |
|-------|----------------|
| `permission-denied` | "Camera/microphone access blocked. Check your browser permissions and reload." |
| `no-device` | "No camera found. Joining with audio only." (then retry audio-only) |
| `device-busy` | "Camera is in use by another app. Close it and try again." |
| `overconstrained` | "Camera doesn't support the requested quality. Joining with audio only." |
| `security-error` | "This page must be served over HTTPS to access camera and microphone." |

### Pattern 8: HTTPS/WSS Dev Setup

**Dev setup (2 approaches):**

**Approach A — Manual mkcert (recommended, no plugin):**
```bash
mkcert -install                                         # once — installs local CA
mkcert localhost 127.0.0.1 192.168.x.y                 # generates localhost.pem + localhost-key.pem
mkcert -p12-file backend.p12 -pkcs12 localhost 127.0.0.1 192.168.x.y  # for Spring Boot
```

**Vite config (vite.config.ts):**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  plugins: [react()],
  server: {
    https: {
      key: fs.readFileSync('certs/localhost-key.pem'),
      cert: fs.readFileSync('certs/localhost.pem'),
    },
    host: '0.0.0.0',   // bind to LAN interface so second device can reach it
    port: 5173,
  }
})
```

**Spring Boot application.yaml (dev profile):**
```yaml
# application-dev.yaml (or add to application.yaml behind a profile)
server:
  port: 8443
  ssl:
    enabled: true
    key-store: classpath:certs/backend.p12
    key-store-type: PKCS12
    key-store-password: changeit
```

**WebSocketConfig.java** — update allowed origins to include HTTPS origins:
```java
registry.addHandler(handler, "/ws")
    .addInterceptors(new JwtHandshakeInterceptor(jwtService))
    .setAllowedOrigins("https://localhost:5173", "https://192.168.x.y:5173")
```

**Frontend .env update:**
```
VITE_API_URL=https://localhost:8443
VITE_WS_URL=wss://localhost:8443/ws
```

**Approach B — vite-plugin-mkcert:**
```typescript
import mkcert from 'vite-plugin-mkcert'
export default defineConfig({ plugins: [react(), mkcert()], server: { host: '0.0.0.0' } })
```
Installs mkcert CA automatically; still needs the Spring Boot side configured manually.

### Pattern 9: coturn Docker Compose

**Key insight from CLAUDE.md and research:** `network_mode: host` is required on Linux demo boxes. Without it, Docker bridge NAT intercepts UDP relay ports and coturn advertises the wrong IP. On Linux host networking, coturn binds directly to the host's network stack. [MEDIUM confidence on exact config; host-mode is confirmed correct approach]

**turnserver.conf:**
```conf
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=${TURN_SECRET}        # same value as Spring turn.secret
realm=vdt-webrtc.local
external-ip=${HOST_IP}                   # host machine's IP on LAN
min-port=49160
max-port=49200
log-file=stdout
```

**docker-compose.yml addition:**
```yaml
coturn:
  image: coturn/coturn:4.6
  network_mode: host       # required on Linux — bridge mode fails for UDP relay
  volumes:
    - ./coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro
  command: -c /etc/coturn/turnserver.conf
  restart: unless-stopped
```

**Port range note:** 49160–49200 = 40 relay ports. Each active TURN relay session uses 2 ports (one per direction). This supports ~20 simultaneous TURN-relayed calls — sufficient for demo. CLAUDE.md explains that Docker can't map 16K+ ports sanely.

**Windows/Mac dev note:** `network_mode: host` does not work on Docker Desktop for Windows/Mac. On those platforms, explicitly map `3478:3478/udp`, `3478:3478/tcp`, and `49160-49200:49160-49200/udp`, and set `external-ip` to the host IP. Expect that TURN relay may not work correctly without host networking. The authoritative demo environment is Linux.

### Anti-Patterns to Avoid

- **Putting RTCPeerConnection or MediaStream in Zustand:** Non-serializable objects cause devtools errors and re-render storms. Only put derived, serializable state (call status string, remote stream UUID reference, stats numbers) in Zustand. [CLAUDE.md mandate]
- **Not buffering ICE candidates:** `addIceCandidate()` with `remoteDescription === null` throws `InvalidStateError`. Modern browsers do NOT auto-buffer. [VERIFIED: MDN addIceCandidate]
- **Checking signalingState === 'stable' alone for offer collision:** The check must be `signalingState === 'stable' || isSettingRemoteAnswerPending` because `signalingState` changes asynchronously. [VERIFIED: MDN perfect negotiation]
- **Static TURN credentials in frontend bundle:** Credentials would be exposed. Always use ephemeral HMAC via `GET /api/turn-credentials`. [CLAUDE.md mandate]
- **`setAllowedOrigins("*")` in WebSocketConfig for HTTPS:** Must explicitly list HTTPS origins after adding mkcert; wildcard works but is a security anti-pattern.
- **Forgetting to update frontend env vars for WSS:** After adding HTTPS, `VITE_WS_URL` must use `wss://` not `ws://`; mixed content blocks `ws://` on an HTTPS page.
- **coturn with bridge networking on Linux:** UDP relay will fail silently — ICE checks time out, call falls through to error. Use `network_mode: host`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA1 computation | Custom hash implementation | `javax.crypto.Mac` (Java stdlib) | JVM stdlib is vetted, constant-time; custom is error-prone |
| DTLS-SRTP media encryption | Any custom encryption on media streams | Built-in WebRTC DTLS-SRTP | WebRTC mandates DTLS-SRTP; adding your own breaks the stack |
| ICE candidate gathering | Manual STUN binding requests | Native RTCPeerConnection ICE agent | Browser ICE agent handles paced gathering, trickle, retransmits |
| Reconnect-aware peer connection | Hand-rolled state tracker | RTCPeerConnection.iceConnectionState + `onnegotiationneeded` | Browser manages ICE state transitions; track them, don't replicate them |
| SDP parsing/editing | Parsing SDP strings for codec selection | Server relays opaquely; client uses `addTransceiver` direction constraints | SDP is fragile to hand-edit; modern API controls capabilities without touching SDP |

**Key insight:** The browser's RTCPeerConnection ICE agent, DTLS negotiator, and SRTP stack handle the hardest distributed-systems problems in WebRTC. The application layer only needs to relay the SDP/ICE strings opaquely and react to connection state events.

---

## Common Pitfalls

### Pitfall 1: ICE Candidates Arriving Before Remote Description

**What goes wrong:** Trickle ICE candidates arrive via WebSocket before `setRemoteDescription()` completes. `addIceCandidate()` is called on a peer connection with null `remoteDescription` → `InvalidStateError`.
**Why it happens:** Network is faster than expected; signaling is async; trickle ICE sends candidates immediately after offer/answer.
**How to avoid:** Buffer incoming candidates in an array; drain them immediately after `setRemoteDescription()` resolves.
**Warning signs:** "InvalidStateError: Failed to execute 'addIceCandidate'" in console shortly after call setup.

### Pitfall 2: coturn UDP Relay Failure (Docker Bridge)

**What goes wrong:** TURN relay tests fail silently — ICE shows candidate type `relay` in gathering but `selectedCandidatePairId` uses a `host` or `srflx` pair, or ICE connection state hangs at `checking`.
**Why it happens:** Docker bridge NAT mangles UDP packets for the relay port range; coturn reports internal container IP instead of host IP; ICE connectivity checks from remote peer fail.
**How to avoid:** Use `network_mode: host` on Linux; set `external-ip` to actual host LAN IP in turnserver.conf; verify with forced-relay test (`iceTransportPolicy:'relay'`). [MEDIUM confidence — host-mode requirement verified from multiple sources; exact `external-ip` setup is ASSUMED to work]
**Warning signs:** ICE state stuck at `checking` for >10s; no `relay` candidate selected even with `iceTransportPolicy:'relay'`.

### Pitfall 3: getUserMedia Fails on Second Device (HTTP → HTTPS)

**What goes wrong:** `navigator.mediaDevices.getUserMedia` returns undefined or throws `TypeError` on a phone/second PC accessing the Vite dev server over LAN.
**Why it happens:** `getUserMedia` requires a secure context (HTTPS or localhost). Accessing `http://192.168.x.y:5173` is neither. [VERIFIED: MDN getUserMedia security requirements]
**How to avoid:** mkcert + `host: '0.0.0.0'` in Vite config + install mkcert CA on the second device (or use its browser's security exception flow).
**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'getUserMedia')` — `mediaDevices` is undefined on insecure contexts.

### Pitfall 4: Offer Collision / Glare (Phase 3 Scope)

**What goes wrong:** Both peers simultaneously call `addTrack()` (triggering `onnegotiationneeded`) before the signaling exchange completes, causing both to send offers at the same time.
**Why it happens:** The simple Phase 3 handshake (`call-offer` → `call-accept`) fires `onnegotiationneeded` on the caller before the answer arrives.
**How to avoid:** Perfect negotiation with `makingOffer` flag + `ignoreOffer` on impolite peer handles this correctly without any explicit glare detection. For Phase 3's simple handshake (callee polite), the impolite caller wins, polite callee rolls back. Full glare is a Phase 4 concern (CALL-06).
**Warning signs:** Console shows `setLocalDescription` called in wrong state; call setup appears to start but no media flows.

### Pitfall 5: Jackson 3 (Boot 4) — Same Gotcha as Phase 2

**What goes wrong:** New Java code in Phase 3 (`TurnController`, new message records, new handler methods) accidentally imports `com.fasterxml.jackson.databind.ObjectMapper` instead of `tools.jackson.databind.ObjectMapper`.
**Why it happens:** Boot 4 auto-configures Jackson 3 (`tools.jackson`), not Jackson 2. JJWT pulls in Jackson 2 as a transitive dependency, which is available on the classpath.
**How to avoid:** Inject `tools.jackson.databind.ObjectMapper` (the bean Boot 4 auto-configures). Note: `@JsonTypeInfo` and `@JsonSubTypes` annotations are still from `com.fasterxml.jackson.annotation` (annotation jar didn't move). Exception is unchecked `tools.jackson.core.JacksonException`. [VERIFIED: Phase 2 SUMMARY.md — documented lesson]
**Warning signs:** Serialization silently uses wrong mapper; `@JsonTypeInfo` polymorphic dispatch fails at runtime; `type` field missing from JSON output.

### Pitfall 6: Self-View Video Mirroring

**What goes wrong:** Self-view shows the user's face unmirrored (like a camera view, not a mirror). Users find this disorienting.
**Why it happens:** `getUserMedia` streams are not mirrored by default.
**How to avoid:** Apply `transform: scaleX(-1)` CSS to the self-view `<video>` element only (not the remote view). [ASSUMED — standard practice]
**Warning signs:** Self-view shows left-right flipped hand gestures compared to real-world expectation.

### Pitfall 7: Security Context for WebSocket (HTTPS page + ws://)

**What goes wrong:** After adding HTTPS, the frontend loads correctly but WebSocket connection fails with "Mixed Content" error in the browser console.
**Why it happens:** An HTTPS page cannot open `ws://` connections — browsers block mixed content.
**How to avoid:** Update `VITE_WS_URL` to `wss://` when running on HTTPS. [VERIFIED: general browser security model; ASSUMED specifics are standard]
**Warning signs:** Browser console shows "Mixed Content: The page at 'https://...' was loaded over HTTPS, but attempted to connect to the insecure WebSocket endpoint 'ws://...'".

---

## Runtime State Inventory

> Greenfield WebRTC features — no rename/refactor triggers this section. However, Phase 3 adds new config that has runtime state implications.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | No call records stored (Phase 3 has no history — that is Phase 5) | None |
| Live service config | coturn is new — no existing config to migrate | Create turnserver.conf from scratch |
| OS-registered state | None | None |
| Secrets/env vars | `TURN_SECRET` env var must be added to `.env` and `docker-compose.yml`; `JWT_SECRET` already present | Add `TURN_SECRET` to .env.example, application.yaml, Compose env |
| Build artifacts | None | None |

---

## Validation Architecture

> nyquist_validation is enabled in config.json.

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | JUnit 5 + Mockito + AssertJ + Spring Test (via `spring-boot-starter-test`) |
| Backend config | `src/test/java/.../TestcontainersConfiguration.java` (existing) |
| Backend quick run | `./mvnw test -pl backend -Dtest="CallSignalingTest" -q` |
| Backend full suite | `./mvnw verify -pl backend` |
| Frontend framework | Vitest 3.x (existing) |
| Frontend config | `frontend/vite.config.ts` (vitest config embedded or separate) |
| Frontend quick run | `cd frontend && npx vitest run src/webrtc/PeerManager.test.ts` |
| Frontend full suite | `cd frontend && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALL-01 | SDP relay: sender's WS message reaches receiver via sendToUser | Integration (WS) | `./mvnw test -Dtest="CallSignalingTest#testSdpRelay"` | ❌ Wave 0 |
| CALL-01 | PeerManager: onnegotiationneeded → setLocalDescription → emits signal | Unit (Vitest, mock PC) | `npx vitest run src/webrtc/PeerManager.test.ts` | ❌ Wave 0 |
| CALL-01 | Candidate buffering: candidate received before remoteDescription → queued and drained | Unit (Vitest) | `npx vitest run src/webrtc/PeerManager.test.ts` | ❌ Wave 0 |
| CALL-02 | call-offer-received → callee WS receives it | Integration (WS) | `./mvnw test -Dtest="CallSignalingTest#testCallOffer"` | ❌ Wave 0 |
| MEDIA-02 | getUserMedia error taxonomy: mock NotAllowedError → 'permission-denied' | Unit (Vitest) | `npx vitest run src/webrtc/media.test.ts` | ❌ Wave 0 |
| MEDIA-05 | NotFoundError → audio-only fallback path | Unit (Vitest) | `npx vitest run src/webrtc/media.test.ts` | ❌ Wave 0 |
| STAB-03 | getStats → roundTripTime parsed from remote-inbound-rtp report | Unit (Vitest, mock stats) | `npx vitest run src/webrtc/stats.test.ts` | ❌ Wave 0 |
| STAB-04 | getStats → bitrate delta computed correctly | Unit (Vitest, mock stats) | `npx vitest run src/webrtc/stats.test.ts` | ❌ Wave 0 |
| INFR-01 | HMAC-SHA1 credential: username=ts:user, credential=base64(HMAC(secret,username)) | Unit (JUnit) | `./mvnw test -Dtest="TurnControllerTest"` | ❌ Wave 0 |
| INFR-01 | Forced-relay test | Manual | Start coturn, open 2 tabs, toggle relay mode, verify ICE candidate type = 'relay' | Manual |
| INFR-03 | HTTPS/WSS connectivity | Manual | Access from second device via LAN HTTPS URL | Manual |

### Sampling Rate
- **Per task commit:** `./mvnw test -pl backend -Dtest="CallSignalingTest" -q && cd frontend && npx vitest run src/webrtc/ --reporter=dot`
- **Per wave merge:** `./mvnw verify -pl backend && cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `backend/src/test/java/.../ws/CallSignalingTest.java` — extends WsTestSupport; covers sendToUser routing, call-offer relay
- [ ] `frontend/src/webrtc/PeerManager.test.ts` — Vitest; mock RTCPeerConnection; covers onnegotiationneeded, candidate buffering, ignoreOffer
- [ ] `frontend/src/webrtc/media.test.ts` — Vitest; mock getUserMedia; covers error taxonomy + fallback
- [ ] `frontend/src/webrtc/stats.test.ts` — Vitest; mock getStats RTCStatsReport; covers RTT/bitrate/codec parsing
- [ ] `backend/src/test/java/.../call/TurnControllerTest.java` — JUnit; verifies HMAC-SHA1 formula matches coturn expectation

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` in config.json.

### Applicable ASVS Categories (ASVS Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT already enforced; `/api/turn-credentials` requires authenticated principal (Spring Security filter chain) |
| V3 Session Management | yes | WebSocket session validated at handshake (Phase 2 JwtHandshakeInterceptor); no additional session needed |
| V4 Access Control | yes | `sendToUser`: server stamps `from` from principal — client cannot spoof target routing |
| V5 Input Validation | yes | `to` field on ClientMessage: validate that target user exists before routing; reject if not online |
| V6 Cryptography | yes | TURN: ephemeral HMAC-SHA1 via `javax.crypto.Mac` (stdlib, not hand-rolled); JWT already HS256 |

### Known Threat Patterns for WebRTC Signaling

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Caller spoofs `from` field in signaling body | Spoofing | Server overwrites `from` with authenticated principal; never trust client-supplied `from` |
| Attacker relays SDP to wrong user (routing injection) | Tampering | Validate `to` field — only route to authenticated online users; optionally add callId validation |
| Static TURN credentials leaked from bundle | Information Disclosure | Ephemeral HMAC credentials with TTL (24h default); credentials expire automatically |
| TURN server used as open relay | Elevation of Privilege | coturn with `use-auth-secret` requires HMAC validation; no unauthenticated relay |
| ICE candidate injection (forged candidate) | Tampering | WebRTC ICE agent rejects candidates that fail connectivity checks; DTLS fingerprint verification prevents MITM |
| getUserMedia permission abuse | Spoofing (identity) | Browser enforces secure context requirement; permission prompt is browser-controlled |

**INFR-03 / HTTPS enforcement note:** `getUserMedia` on HTTP is `TypeError` (mediaDevices undefined on insecure context). This is a browser-enforced security requirement, not application logic. mkcert satisfies it for development; production will need real TLS.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `createOffer()` / `createAnswer()` explicit + separate caller/callee code | `setLocalDescription()` with no arguments (implicit offer/answer) + perfect negotiation | ~2020 (Chrome 80+) | Half the negotiation code; symmetric implementation |
| `onnegotiationneeded` → `signalingState` check | `onnegotiationneeded` → `makingOffer` flag | ~2020 MDN update | Eliminates race condition with async signalingState |
| RTCSessionDescription constructor | `RTCSessionDescriptionInit` plain object | Deprecated; still works | Cleaner, no constructor needed |
| webrtc-adapter shim | Nothing — modern browsers are spec-compliant | 2022-2023 | Eliminates dependency; Chrome/Firefox/Safari all compliant |
| simple-peer / PeerJS wrappers | Native RTCPeerConnection + perfect negotiation | N/A — CLAUDE.md mandate | Direct API access; no stale abstractions |

**Deprecated/outdated:**
- `webrtc-adapter`: unnecessary in 2026 — all target browsers implement the WebRTC spec. CLAUDE.md explicitly rejects it.
- `simple-peer`: effectively unmaintained; predates perfect negotiation; abstraction leaks on complex state.
- `PeerJS`: bundles its own signaling server — defeats the Phase 3 Spring signaling assignment.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | getStats poll cadence of 1000ms is appropriate for quality metrics display | Pattern 6: getStats | Too frequent = CPU overhead; too slow = stale display. 1s is a safe default used by webrtc-internals. Low risk. |
| A2 | Callee = polite peer assignment rule (simpler than userId comparison) for Phase 3 | Pattern 1 | Phase 3 has no simultaneous call glare (user must be online and idle); either rule works. Low risk. |
| A3 | coturn 4.6 image behaves identically to 4.13 for this use case | Pattern 9: coturn | Minor API difference unlikely; test with `external-ip` verify command. Low risk. |
| A4 | `mkcert -p12-file` generates a valid PKCS12 keystore readable by Spring Boot's SSL layer | Pattern 8 | If keystore format is wrong, Spring Boot fails to start with SSL errors. Easily verified at setup time. |
| A5 | Self-view CSS `transform: scaleX(-1)` is sufficient for mirroring (no WebRTC API needed) | Anti-patterns / getUserMedia | Standard practice; does not affect the stream sent to the remote peer. Very low risk. |
| A6 | `DETECT_EXTERNAL_IP=yes` environment variable works on coturn/coturn:4.6 image | Pattern 9: coturn | If not supported in 4.6, must set external-ip manually. Verify at setup. |

---

## Open Questions

1. **SessionRegistry vs. shared sessions map**
   - What we know: `LocalMessageRouter.sendToUser` is a stub; `PresenceWebSocketHandler` holds the sessions map.
   - What's unclear: Whether to introduce a `SessionRegistry` bean (clean seam) or pass the sessions map reference directly.
   - Recommendation: Introduce `SessionRegistry` — it is already the natural Phase 6 seam (Redis would replace it), and avoids coupling `LocalMessageRouter` to `PresenceWebSocketHandler`.

2. **callId generation — client or server?**
   - What we know: Phase 3 uses a simple signaling handshake without a server-authoritative state machine.
   - What's unclear: Should the caller generate a UUID callId client-side, or should the server generate it?
   - Recommendation: Caller generates a UUID client-side for Phase 3 (simpler, no extra round-trip). Phase 4's Redis state machine will move callId to server-authoritative.

3. **WebSocket URL update for WSS (mkcert path)**
   - What we know: Current `VITE_WS_URL=ws://localhost:8080/ws`; after adding HTTPS, this must become `wss://localhost:8443/ws`.
   - What's unclear: Whether to use a separate dev profile or an environment variable toggle.
   - Recommendation: Use a dev `.env.local` (gitignored) override that sets `VITE_API_URL` and `VITE_WS_URL` to HTTPS/WSS values. The committed `.env.example` stays on HTTP for localhost-only dev convenience.

4. **Vite server `host: '0.0.0.0'` and CORS**
   - What we know: Spring's `setAllowedOrigins` is hardcoded to `http://localhost:5173` currently.
   - What's unclear: Which exact origins to add (HTTPS + LAN IP).
   - Recommendation: Externalize allowed origins to an `app.allowed-origins` config property read from env var; default to `https://localhost:5173`. Add the LAN IP origin via `.env.local`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite dev server + npm | ✓ | v24.14.0 | — |
| npm | Package install | ✓ | 11.9.0 | — |
| mkcert | HTTPS/WSS dev (INFR-03) | ✗ | — | Use HTTP + localhost only (blocks LAN 2-device test) |
| coturn (Docker) | NAT traversal (INFR-01) | ✗ (not yet in Compose) | — | STUN-only (blocks TURN relay test) |
| Docker | coturn service | ✓ (assumed, per existing Compose usage) | — | — |
| Java 21 | Backend | ✓ (assumed from existing Phase 1-2) | 21 LTS (Temurin) | — |

**Missing dependencies with no fallback:**
- mkcert: without it, second device on LAN cannot access getUserMedia (INFR-03 blocked). Must be installed before LAN testing.

**Missing dependencies with fallback:**
- coturn (Docker): STUN-first approach (D-03) means calls on the same network work without coturn; TURN relay test deferred until coturn added.

---

## Sources

### Primary (HIGH confidence)
- MDN: "Establishing a connection: The WebRTC perfect negotiation pattern" — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation — perfect negotiation pattern, polite/impolite roles, makingOffer flag, isSettingRemoteAnswerPending, ignoreOffer, implicit setLocalDescription()
- MDN: RTCRemoteInboundRtpStreamStats — https://developer.mozilla.org/en-US/docs/Web/API/RTCRemoteInboundRtpStreamStats — `roundTripTime`, `fractionLost`, report type `"remote-inbound-rtp"`
- MDN: RTCOutboundRtpStreamStats — https://developer.mozilla.org/en-US/docs/Web/API/RTCOutboundRtpStreamStats — `bytesSent`, `frameWidth`, `frameHeight`, `framesPerSecond`, `codecId`, report type `"outbound-rtp"`
- MDN: RTCIceCandidatePairStats — https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidatePairStats — `currentRoundTripTime`, `selectedCandidatePairId` via transport report
- MDN: RTCIceCandidateStats — https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidateStats — `candidateType` values: `"host"`, `"srflx"`, `"relay"`, report type `"local-candidate"`
- MDN: getUserMedia() — https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia — complete error taxonomy (NotAllowedError, NotFoundError, NotReadableError, OverconstrainedError, SecurityError, AbortError, TypeError)
- MDN: addIceCandidate() — https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addIceCandidate — InvalidStateError when remoteDescription is null; candidates must be added after setRemoteDescription
- coturn README (GitHub) — https://github.com/coturn/coturn — turnserver.conf directives, TURN REST API ephemeral credential algorithm (`username=expiry:userId`, `credential=base64(HMAC-SHA1(secret,username))`)
- FiloSottile/mkcert (GitHub) — https://github.com/FiloSottile/mkcert — official mkcert installation; `-p12-file` for PKCS12 output; `-install` for CA trust
- CLAUDE.md (project) — tech stack mandates (native RTCPeerConnection, perfect negotiation, coturn 4.6, ephemeral HMAC, peer manager as TS class, reject simple-peer/PeerJS/socket.io)
- Phase 2 SUMMARY.md — Jackson 3 / Boot 4 gotcha (`tools.jackson.*` imports); sealed envelope structure; WsTestSupport harness pattern

### Secondary (MEDIUM confidence)
- coturn/coturn Docker Hub — https://hub.docker.com/r/coturn/coturn — latest tag = 4.13.1; `DETECT_EXTERNAL_IP=yes` env var; `network_mode: host` recommendation
- Turnix.io coturn guide — https://turnix.io/guides/setup-coturn-server — host networking pitfall; min-port/max-port recommendation
- WebSearch (Spring Boot TLS + mkcert) — multiple sources confirming `server.ssl.key-store-type=PKCS12` config; `mkcert -pkcs12` flag
- WebSearch (Vitest RTCPeerConnection mocking) — standard approach confirmed: mock `RTCPeerConnection` with a class implementing the events interface

### Tertiary (LOW confidence / assumed)
- getStats poll cadence (1s): widely cited practice; no official recommendation found
- Callee = polite peer assignment: application discretion per MDN; recommendation is researcher's
- CSS self-view mirroring: standard dev practice; no spec reference

---

## Metadata

**Confidence breakdown:**
- Perfect negotiation pattern: HIGH — verified directly from MDN official documentation
- RTCStats fields (RTT, bitrate, codec, ICE type): HIGH — verified from MDN individual stats interface pages
- getUserMedia error taxonomy: HIGH — verified from MDN
- coturn Docker config: MEDIUM — multiple secondary sources agree; host networking requirement confirmed; exact `external-ip` env var support in 4.6 is ASSUMED
- Java HMAC-SHA1 implementation: HIGH — `javax.crypto.Mac` is Java stdlib, formula verified from coturn README
- Spring Boot TLS / mkcert: MEDIUM — verified from multiple web sources; exact PKCS12 generation command is ASSUMED to produce Spring-compatible keystore
- Signaling message design: ASSUMED (Claude's Discretion per CONTEXT.md)

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable APIs; MDN WebRTC APIs are stable; coturn config does not change frequently)
