# Phase 3 — Discussion Log

**Date:** 2026-06-17 · Mode: discuss (interactive)

Tài liệu này chỉ để người tham khảo (audit/retro), không được agent downstream đọc. Quyết định chính thức ở `03-CONTEXT.md`.

## Mảng đã chọn bàn
Người dùng chọn cả 4: Ranh giới call Phase 3↔4, HTTPS/WSS & test 2 thiết bị, coturn/TURN, Self-view + lỗi media + debug UI.

## Quyết định

### 1. Ranh giới call Phase 3↔4
- Options: Auto-accept (chỉ media) / Accept tối thiểu / (làm rõ thêm) Core+accept/reject/cancel cơ bản / Kéo toàn bộ lifecycle.
- Người dùng ban đầu: "phải có màn hình gọi, nhận/từ chối, đầy đủ yêu cầu" → làm rõ ranh giới (lifecycle đầy đủ là Phase 4).
- **Chốt:** Core + accept/reject/cancel cơ bản (→ D-01). Ringtone polish, timeout→missed, busy, glare, end-reason đầy đủ, state machine Redis để Phase 4.

### 2. HTTPS/WSS & test 2 thiết bị
- Options: mkcert / tunnel (cloudflared/ngrok) / self-signed+nginx.
- **Chốt:** mkcert (CA local tin cậy) → D-04. Tunnel để dành (deferred).

### 3. coturn / TURN
- Options: STUN public trước → coturn+HMAC sau / dựng coturn đầy đủ ngay.
- **Chốt:** STUN-first → coturn + ephemeral HMAC + forced-relay sau → D-03.

### 4. Cấu trúc UI cuộc gọi + debug
- Options: /call route + debug toggle / overlay Home + debug luôn hiện.
- **Chốt:** route `/call` riêng, debug panel toggle → D-05.

## Deferred ideas
- Lifecycle đầy đủ (CALL-04..08) → Phase 4; mute/device/PiP → Phase 4/8; ICE restart → Phase 4; tunnel → tùy chọn; Redis routing → Phase 6.

## Lưu ý
- D-01 kéo một phần CALL-02/CALL-03 vào Phase 3 (mở rộng nhẹ so với roadmap "CALL-01 only") — planner/roadmap nên phản ánh.
