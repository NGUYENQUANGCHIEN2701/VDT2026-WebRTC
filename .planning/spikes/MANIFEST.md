# Spike Manifest

## Idea

Đào sâu kỹ thuật vào lớp signaling WebSocket / WebRTC của VDT WebRTC thay vì tiếp tục mở rộng tính năng theo chiều ngang. Mục tiêu: có con số cụ thể (latency, concurrency ceiling, overhead) bằng công cụ load test thật, dùng để hiểu giới hạn của kiến trúc hiện tại (raw `TextWebSocketHandler` + Redis pub/sub cross-instance routing, Phase 6) và định hướng cải tiến tiếp theo.

## Requirements

- Load test phải drive đúng protocol WS thật của app (handshake `/ws?token=<jwt>` qua `JwtHandshakeInterceptor`, JSON envelope `type`-discriminated theo `ClientMessage`/`ServerMessage`), không phải một WS echo giả lập.
- Round-trip latency đo qua flow thật `call-invite` → `call-state-changed{ringing}` → `call-accept` → `call-state-changed{active}` → `hang-up` (xác nhận trong `PresenceWebSocketHandler`/`CallService`), không phải `ping`/`pong` heartbeat (heartbeat không đi qua `CallService`/relay logic nên không đại diện cho signaling latency thật).
- **`/api/auth/register` bị rate-limit 5 req / 15 phút / IP** (`RateLimitService`, key `ratelimit:register:<ip>`) — không thể seed nhiều user qua endpoint này từ một máy k6. **`/api/auth/login` KHÔNG bị rate-limit.**
- Seed user test bằng SQL trực tiếp vào bảng `users` (bcrypt hash dùng chung 1 password, cột `email_verified` mặc định `TRUE` từ V5 migration nên không cần qua luồng OTP) — không dùng `/api/auth/register`.
- Dùng Docker (`grafana/k6` image, module `k6/ws` — stable, không phải `k6/experimental/websockets`) để chạy k6 thay vì cài binary cục bộ, nhất quán với toàn bộ hạ tầng compose sẵn có.
- **Client WS phải gửi `ping` định kỳ (<60s)** để giữ `route:<username>` sống trong Redis (`PresenceWebSocketHandler`, TTL 60s, chỉ refresh khi nhận `ping`) — thiếu heartbeat làm message bị drop âm thầm không lỗi. Mọi script load-test WS từ giờ về sau phải bật heartbeat, nếu không kết quả sẽ lẫn "giới hạn thật" với "route hết hạn do thiếu ping" (phát hiện từ spike 001, xem Investigation Trail).
- **Điểm gãy concurrency trên 1 backend instance (máy dev) nằm quanh 500-1000 connection**, nguyên nhân là JVM thread bùng nổ (`jvm_threads_peak_threads` đạt 8808, không phải CPU/heap — CPU cao nhất chỉ 6.17%). App hiện KHÔNG bật `spring.threads.virtual.enabled`. Spike 003 nên chạy dưới ngưỡng này (~100-300 connection/instance) để không bị nhiễu bởi nghẽn thread-pool khi đo overhead Redis cross-instance (phát hiện từ spike 002).
- **`spring.threads.virtual.enabled=true` xoá bỏ điểm gãy WS ở trên** (ws_connecting giữ dưới ~400ms tới tận 4000 connection, thay vì 30-50s) nhưng **lộ ra nghẽn tầng kế tiếp: HikariCP pool mặc định chỉ 10 connection** — xác nhận bằng exception thật `HikariPool-1 ... request timed out after 30353ms (waiting=96)` khi hàng nghìn user login đồng thời (phát hiện từ spike 002b). Đây là 2 tuning riêng biệt, độc lập với nhau.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | k6-ws-baseline | standard | Given backend chạy 1 instance + JWT hợp lệ, when k6 mở N cặp VU và trao đổi đúng envelope signaling qua `/ws?token=`, then đo được round-trip latency P50/P95/P99 ở tải thấp | VALIDATED | websocket, k6, signaling, baseline |
| 002 | k6-ws-capacity-ramp | standard | Given baseline đã chạy được, when ramp concurrent connections 100→1000→5000+, then xác định điểm gãy (error rate / latency P99) | VALIDATED | websocket, k6, capacity, jvm-threads |
| 002b | virtual-threads-ramp | comparison | Given điểm gãy tìm được ở spike 002, when chạy lại đúng ramp với `SPRING_THREADS_VIRTUAL_ENABLED=true`, then xác định virtual threads có dịch chuyển điểm gãy không | PARTIAL | websocket, k6, capacity, virtual-threads, hikari |
| 003 | k6-ws-redis-crossinstance-overhead | standard | Given 2 backend instance + nginx LB, when so sánh cặp client cùng-instance vs khác-instance, then đo delta latency do Redis pub/sub relay | NOT STARTED | websocket, redis, cross-instance |
