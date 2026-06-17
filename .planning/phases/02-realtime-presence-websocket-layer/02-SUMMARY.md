# Phase 2 — Realtime Presence & WebSocket Layer — SUMMARY

**Trạng thái:** ✅ Code hoàn tất (BE + FE), đã commit. PRES-01 verified (2 trình duyệt), PRES-02 verified (integration test `PresenceSweeperTest`).
**Ngày:** 2026-06-17

## Mục tiêu phase
Xây tầng WebSocket có xác thực + presence (ai đang online) realtime, theo mô hình server-owned identity và single-session. Đây là nền cho signaling cuộc gọi ở Phase 3. Không thêm Redis/RabbitMQ — presence chạy in-memory sau các interface "scale-seam" để Phase 6 thay bằng Redis mà không sửa caller.

## Yêu cầu & trạng thái
| Req | Mô tả | Trạng thái |
|-----|-------|-----------|
| AUTH-04 | Handshake WS xác thực JWT; danh tính do server sở hữu (không tin body `from`) | ✅ |
| PRES-01 | Danh sách online realtime, cập nhật không cần F5, full-snapshot | ✅ |
| PRES-02 | Crash/mất mạng → offline tự động trong ~60-70s (TTL heartbeat + sweeper) | ✅ |
| PRES-03 | Một phiên/user — đăng nhập nơi khác đá phiên cũ (notice + redirect) | ✅ |

## Kiến trúc (2 đầu của đường dây)

```
Browser ──ws?token──► JwtHandshakeInterceptor (xác thực, đóng dấu username vào session)
                          │
                          ▼
                  PresenceWebSocketHandler  ⇄  PresenceService (LocalPresenceService, ConcurrentHashMap)
                  (lifecycle, supersede,        MessageRouter   (LocalMessageRouter, synchronized send)
                   ping/pong)                    PresenceSweeper (@Scheduled, TTL 60s, quét mỗi 15s)
                          │
                  ══ JSON envelope (sealed) ══
                          │
                  wsClient.ts (FE) ──► presenceStore (Zustand) ──► components (list/indicator/kick)
```

`PresenceWebSocketHandler.java` (BE) và `wsClient.ts` (FE) là hai đầu của đường dây — hiểu 2 file này là hiểu cả hệ thống.

## Backend đã làm
- **Envelope sealed** `ws/message/` — `ServerMessage` (presence / session-superseded / pong) + `ClientMessage` (ping) với `@JsonTypeInfo`, `@JsonIgnoreProperties(ignoreUnknown=true)` để bỏ qua field giả mạo.
- **Scale-seam interfaces** `presence/PresenceService` + `ws/MessageRouter` — bản local `ConcurrentHashMap` + `synchronized` send; `evictStaleBefore` dùng CAS `remove(key,value)` (race-safe).
- **`JwtHandshakeInterceptor`** — lấy `?token=`, tái dùng `JwtService`, đóng dấu `username` vào handshake attributes; không log token.
- **`PresenceWebSocketHandler`** — supersede (CloseStatus 4001), value-checked `sessions.remove(user,session)`, ping→heartbeat+pong, broadcast snapshot.
- **`PresenceSweeper`** — `@Scheduled(fixedDelay=15s)`, cutoff = now−60s → broadcast khi có thay đổi.
- **`WebSocketConfig`** (`@EnableWebSocket` + `@EnableScheduling`, `/ws` + interceptor + allowedOrigins) + `SecurityConfig` `/ws/**` permitAll (interceptor là cổng thật).
- **Single-session HTTP** — `AuthService.login()` revoke mọi refresh token active của user trước khi tạo mới → 1 phiên HTTP/user (mở rộng PRES-03 sang lớp auth).

## Frontend đã làm (7 flow)
- `realtime/messages.ts` — discriminated union khớp envelope BE.
- `store/presenceStore.ts` — Zustand: `onlineUsers`, `connectionState`, `kicked`.
- `realtime/wsClient.ts` — wrapper WebSocket thuần: connect (token), heartbeat 25s, reconnect backoff+jitter (trần 30s), **không reconnect sau kick**, disconnect sạch.
- `components/presence/` — StatusBadge, ConnectionIndicator, OnlineUserRow, OnlineUsersList (loading/empty/populated/reconnecting, tự loại bản thân), SessionKickNotice (redirect 2s).
- Wiring — `App.tsx` connect khi đăng nhập (ref-guard StrictMode), `HomePage.tsx` render presence + kick, `useLogout` đóng WS.

## Test
- Backend: 5 integration test WS GREEN (`WsHandshakeAuthTest`, `WsIdentityTest`, `SingleSessionTest`, `PresenceBroadcastTest`, `PresenceSweeperTest`). Cô lập bằng `@AfterEach` (đóng session + chờ presence rỗng) + polling tới khi state hội tụ.
- Frontend: `wsClient.test.ts` 3/3 GREEN (snapshot→store, kick→no-reconnect, close→reconnect). `tsc`/`vitest`/`build` xanh.

## Quyết định & bài học đáng nhớ
- **Jackson 3 (Boot 4):** Boot 4 auto-config `tools.jackson.databind.ObjectMapper` (Jackson 3), KHÔNG phải `com.fasterxml` (Jackson 2 do jjwt kéo vào). WS code phải import `tools.jackson.*`, exception là unchecked `tools.jackson.core.JacksonException`. Annotation vẫn ở `com.fasterxml.jackson.annotation`.
- **Token qua query param** (`?token=`) vì WebSocket API trình duyệt không set được header. Rủi ro lộ token trong log → chấp nhận v1, siết v2 (STAB-05).
- **Full-snapshot eventually-consistent:** test phải poll tới khi hội tụ, không assert đúng 1 frame.
- **Hai nguồn sự thật của "kicked":** biến module trong wsClient (chặn reconnect) vs cờ store (UI) — phải reset cờ store trong `connectWs` để tránh lặp khi login lại.
- **Crash ≠ cần sweeper:** OS vẫn gửi FIN khi tab crash → server xóa ngay qua `afterConnectionClosed`. Sweeper chỉ cần cho mất-mạng-thật (không FIN).

## Commits chính
- `cd5af98` envelope · `6ff7312` presence+router · `2906499` interceptor+handler · `e8dbee7` wiring+Jackson3 · `c833071` test isolation · `7835619` FE presence UI · `423b6b7` single-session HTTP.

## Nợ kỹ thuật / để Phase sau
- `MessageRouter.sendToUser` là stub — dùng cho signaling Phase 3.
- `IN_CALL` (PresenceStatus) build sẵn, kích hoạt Phase 4.
- Presence/Router chuyển Redis ở Phase 6 (interface đã là seam).
- `setAllowedOrigins` hardcode origin dev — đẩy ra config khi lên prod.
