# Phase 3: 1-1 P2P Call Core & NAT Traversal - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Hai user đã online gọi **video/audio 1-1** cho nhau với **media đi thẳng P2P** (WebRTC). Server chỉ
**relay SDP/ICE opaque** qua WebSocket (tái dùng seam `MessageRouter.sendToUser` của Phase 2), không
đụng media. Vượt NAT thật qua **coturn** (STUN+TURN, ephemeral HMAC), phục vụ **HTTPS/WSS**, và hiển
thị **chất lượng kết nối** (RTT/loss + debug panel).

Requirements: CALL-01, MEDIA-02, MEDIA-05, STAB-03, STAB-04, INFR-01, INFR-03 — **cộng** một phần
nhẹ của CALL-02/CALL-03 (xem D-01).

**In scope:** signaling cuộc gọi qua WS, perfect negotiation + candidate buffering, getUserMedia +
self-view, accept/reject/cancel cơ bản, coturn + forced-relay, HTTPS/WSS (mkcert), quality + debug panel.
**Out of scope (→ Phase 4):** ringtone polish, timeout→missed, busy (server-enforced), glare resolution,
end-reason taxonomy đầy đủ, **state machine Redis server-authoritative**, mute/cam-off, device selection,
ICE restart/reconnection grace.
</domain>

<decisions>
## Implementation Decisions

### Ranh giới call Phase 3↔4
- **D-01:** Phase 3 gồm **lõi cuộc gọi + accept/reject/cancel cơ bản**: màn hình gọi đi, màn hình cuộc
  gọi đến (Nhận/Từ chối), Hủy khi đang gọi, và khi Nhận → media kết nối P2P. **KHÔNG** làm (để Phase 4):
  ringtone polish, timeout→missed (CALL-04), busy (CALL-05), glare (CALL-06), end-reason đầy đủ (CALL-07),
  **state machine Redis (CALL-08)**. Đây là một phần CALL-02/CALL-03 được kéo vào Phase 3 (mở rộng nhẹ so
  với roadmap "CALL-01 only") để cuộc gọi *dùng được*. Vì chưa có state machine Phase 4, accept/reject/cancel
  dùng handshake signaling **đơn giản**; Phase 4 sẽ làm chặt lại. → roadmap/planner cần phản ánh điểm này.

### Signaling (tái dùng seam Phase 2)
- **D-02:** Thêm message cuộc gọi (call-offer / call-answer / ice-candidate / hang-up / call-reject /
  call-cancel) vào **sealed envelope** sẵn có; server relay SDP/ICE **opaque** (không parse media), route
  qua `MessageRouter.sendToUser` (hiện thực hóa stub Phase 2). **Perfect negotiation (polite/impolite) +
  ICE candidate buffering ngay từ commit đầu** (CLAUDE.md mandate, không retrofit).

### Thứ tự dựng NAT traversal (INFR-01)
- **D-03:** **STUN trước → TURN sau.** Cho cuộc gọi cùng mạng chạy với STUN public (Google) để chứng minh
  signaling + media P2P, RỒI thêm coturn (Docker Compose) với **ephemeral HMAC credentials** qua endpoint
  Spring `GET /api/turn-credentials` + chế độ **forced-relay** (`iceTransportPolicy:'relay'`) để chứng minh
  TURN. Networking coturn theo CLAUDE.md (host-mode trên Linux demo box / dải relay port nhỏ).

### Secure context cho dev & test 2 thiết bị (INFR-03)
- **D-04:** Phục vụ HTTPS/WSS bằng **mkcert** (CA local được trình duyệt tin) để getUserMedia chạy trên
  thiết bị thứ 2 qua IP LAN, không cảnh báo. Tunnel (ngrok/cloudflared) để dành (tùy chọn cho demo khác mạng).

### Cấu trúc UI cuộc gọi
- **D-05:** Cuộc gọi là **route riêng `/call`** (không overlay trên Home). **Debug panel** (codec / bitrate /
  resolution / ICE candidate type host·srflx·relay) **ẩn, toggle bằng nút**. **Quality indicator** (RTT /
  packet loss từ `getStats`) hiển thị trong call.

### Self-view & lỗi media (MEDIA-02/05)
- **D-06:** Self-view **mirror** trước khi vào call; lỗi getUserMedia (từ chối quyền / không thiết bị / thiết
  bị bận) hiện thông báo actionable + **fallback audio-only**.

### Claude's Discretion
- WebRTC peer manager là **TS class/module thường** (RTCPeerConnection/MediaStream KHÔNG nằm trong Zustand —
  chỉ lưu state serializable dẫn xuất), theo CLAUDE.md.
- Tên/shape chính xác của message signaling; chu kỳ poll `getStats`; quy tắc gán polite/impolite (vd so sánh
  userId) — researcher/planner.
- Config coturn cụ thể (realm, dải relay port, external-ip), TTL của TURN credential.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` (Phase 3 section) — goal + 5 success criteria
- `.planning/REQUIREMENTS.md` — CALL-01, MEDIA-02, MEDIA-05, STAB-03, STAB-04, INFR-01, INFR-03; CALL-02/CALL-03 (một phần, theo D-01)

### Tech-stack decisions (locked)
- `CLAUDE.md` — native `RTCPeerConnection` + **perfect negotiation**, `getUserMedia`/`getDisplayMedia`,
  coturn 4.6 + **ephemeral HMAC** (TURN REST API), `iceServers` dựng từ `/api/turn-credentials`, peer
  manager là TS class (KHÔNG để trong Zustand), reject simple-peer/PeerJS

### Carry-forward (Phase 2)
- `.planning/phases/02-realtime-presence-websocket-layer/02-CONTEXT.md` — D-01 (`MessageRouter.sendToUser` seam), sealed envelope, server-owns-identity
- `.planning/phases/02-realtime-presence-websocket-layer/02-SUMMARY.md` — cấu trúc `wsClient`/`presenceStore`/handler để mở rộng

### External (verify khi setup)
- MDN "Perfect negotiation": https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
- coturn: https://github.com/coturn/coturn — TURN REST API ephemeral credentials (`username=expiry:userId`, `credential=base64(HMAC-SHA1(secret, username))`)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/.../ws/MessageRouter.java` `sendToUser` (stub) → hiện thực hóa để route signaling 1-1.
- `backend/.../ws/message/` sealed envelope → thêm các record message cuộc gọi.
- `backend/.../ws/PresenceWebSocketHandler.java` → route message cuộc gọi (hoặc tách handler signaling).
- `frontend/src/realtime/wsClient.ts` → mở rộng `onmessage` để dispatch message cuộc gọi.
- `frontend/src/realtime/messages.ts` → thêm type TS cho message cuộc gọi.
- `frontend/src/store/authStore.ts` → user hiện tại (xác định caller/callee).

### Established Patterns
- Feature-package → thêm package `call/` (BE) + `realtime`/`components/call` (FE).
- Module-level service ngoài React (`wsClient`) → WebRTC peer manager là module TS song song, gọi vào Zustand store cho state dẫn xuất.
- Server-owns-identity → caller/callee xác định từ principal, không tin body.

### Integration Points
- Signaling đi trên WS đã xác thực của Phase 2; `iceServers` lấy qua REST (`/api/turn-credentials`).
- `/call` route mới trong React Router (ProtectedRoute).
</code_context>

<specifics>
## Specific Ideas

- Perfect negotiation + candidate buffering **ngay commit đầu**, không vá sau.
- Forced-relay test mode (`iceTransportPolicy:'relay'`) để chứng minh TURN thật sự relay.
- mkcert cho HTTPS local tin cậy (test 2 thiết bị cùng LAN qua IP).
- STUN-first để tách bạch lỗi signaling vs lỗi NAT khi debug.
</specifics>

<deferred>
## Deferred Ideas

- Call lifecycle đầy đủ: ringtone, timeout→missed, busy, glare, end-reason taxonomy, **state machine Redis** → Phase 4 (CALL-04..08).
- Mute/cam-off, chọn camera/mic/loa, PiP, call duration → Phase 4/8 (MEDIA-01/03/04/06).
- ICE restart / reconnection grace (~10-15s) → Phase 4 (STAB-02).
- Tunnel (ngrok/cloudflared) cho demo khác mạng → tùy chọn nếu cùng-LAN không đủ.
- Routing signaling cross-instance qua Redis pub/sub → Phase 6.

None ngoài các mục trên — thảo luận giữ trong phạm vi phase.
</deferred>

---

*Phase: 03-1-1-p2p-call-core-nat-traversal*
*Context gathered: 2026-06-17*
