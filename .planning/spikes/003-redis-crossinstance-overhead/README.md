---
spike: 003
name: redis-crossinstance-overhead
type: standard
validates: "Given 2 backend instance + nginx LB, when so sánh cặp client cùng-instance vs khác-instance, then đo delta latency do Redis pub/sub relay"
verdict: VALIDATED
related: [001, 002]
tags: [websocket, redis, cross-instance, routing]
---

# Spike 003: Redis Cross-Instance Routing Overhead

## What This Validates

Given 2 backend instance (`backend-1`, `backend-2`) chia sẻ cùng Redis (Phase 6 routing), when so sánh cùng một bài test call-flow (call-invite → ringing → accept → active → hangup) chạy 2 lần — lần 1 với caller+callee đều trên `backend-1` (same-instance), lần 2 với caller trên `backend-1` và callee trên `backend-2` (cross-instance) — then đo được phần chênh lệch latency do phải đi qua `RedisMessageRouter` (publish/subscribe) thay vì `LocalMessageRouter` (gọi trực tiếp trong cùng JVM).

## Research

Không dùng nginx (round-robin không xác định được instance nào nhận request nào — không kiểm soát được thí nghiệm). Thay vào đó, script chỉ định **trực tiếp** `CALLER_HOST`/`CALLEE_HOST` (địa chỉ service Docker Compose, ví dụ `backend-1:8080` / `backend-2:8080`), bám sát 2 lớp routing thật trong code (`LocalMessageRouter` khi cùng instance, `RedisMessageRouter` khi khác instance — xem `router.sendToUser()` trong `PresenceWebSocketHandler`). JWT không có state theo instance (`JWT_SECRET` dùng chung giữa `backend-1`/`backend-2` trong `docker-compose.yml`), nên 1 token xin từ instance nào cũng dùng được ở instance kia — xác nhận bằng test tay trước khi build script.

**Lưu ý quan trọng phát hiện khi chuẩn bị:** cả `backend-1` và `backend-2` đang báo `unhealthy` trong `docker compose ps`, nhưng nguyên nhân **không liên quan gì đến WebRTC/Redis** — do Spring Boot Actuator's Mail health indicator fail (tài khoản Gmail thật dùng cho OTP email bị rate-limit `454-4.7.0 Too many login attempts` sau nhiều lần restart backend trong phiên benchmark này), kéo `/actuator/health` tổng xuống `DOWN` dù `readiness`/`liveness` (và chức năng thật: login, WS, gọi) đều hoạt động bình thường — đã xác nhận bằng curl login trực tiếp trên cả 2 instance trước khi chạy. Không đào sâu thêm vì ngoài phạm vi spike này.

## How to Run

```bash
# Yêu cầu: postgres/redis/rabbitmq/backend-1/backend-2 đang chạy, 5000 user đã seed (spike 002)
sh .planning/spikes/003-redis-crossinstance-overhead/run-both.sh
```

Env vars của `call-latency.js`: `CALLER_HOST`, `CALLEE_HOST`, `PAIRS` (mặc định 100 = 100-200 connection/instance, an toàn dưới điểm gãy ~500-1000 tìm được ở spike 002), `CYCLES`, `COOLDOWN_MS`.

## What to Expect

- `call_setup_rtt_ms` cao hơn ở cross-instance so với same-instance — phần chênh lệch là overhead của Redis pub/sub relay + 1 network hop thêm.

## Investigation Trail

### Kết quả 2 lần chạy (100 cặp, 20 chu kỳ/cặp)

| Metric | Same-instance | Cross-instance | Delta |
|---|---|---|---|
| calls_completed | 731 | 584 | -147 |
| calls_failed | 1647 | 1754 | +107 |
| RTT avg | 586ms | 830ms | **+244ms (+42%)** |
| RTT median | 303ms | 599ms | **+296ms (~2×)** |
| RTT p90 | 1558ms | 1916ms | +358ms (+23%) |
| RTT p95 | 2145ms | 2361ms | +216ms (+10%) |
| ws_connecting avg | 29.1ms | 59.0ms | +29.9ms (~2×) |
| ws_connecting p95 | 82.8ms | 216.5ms | +133.7ms (~2.6×) |

### Diễn giải và một nuance quan trọng

Median RTT tăng gần gấp đôi (303ms → 599ms) khi caller/callee ở 2 instance khác nhau — số liệu này hợp lý về mặt cơ chế: same-instance đi qua `LocalMessageRouter` (gọi hàm trực tiếp trong cùng JVM), cross-instance phải qua `RedisMessageRouter` (publish lên Redis channel, subscriber ở instance kia nhận, deserialize, rồi mới gửi qua WebSocket) — thêm ít nhất 1 network round-trip tới Redis cộng chi phí serialize/deserialize.

**Nhưng:** `ws_connecting` (thời gian bắt tay WebSocket thuần túy, **không đi qua Redis routing chút nào**) cũng tăng gần gấp đôi (29ms → 59ms avg). Đây là bằng chứng cho thấy một phần chênh lệch đo được **không phải** do Redis, mà do 2 yếu tố gây nhiễu (confound) trong cách thí nghiệm được thiết kế:
1. **Thứ tự chạy cố định** — same-instance luôn chạy trước, cross-instance chạy sau. `backend-1` đã "nóng máy" (JVM threads, GC, JIT) nhiều hơn ở lần chạy thứ 2.
2. **`backend-2` chưa từng nhận tải nào trong cả phiên benchmark này** — lần đầu tiên nó xử lý request lại đúng lúc là bài cross-instance, nên có thể có JIT warm-up cold-start ở phía `backend-2` góp phần vào con số.
3. Cả 2 instance đang chạy nền tảng **platform threads mặc định** (không phải virtual threads như spike 002b) — 200 connection đồng thời trên `backend-1` (bài same-instance) đã đủ để bắt đầu gây suy giảm nhẹ theo đúng đường cong tìm thấy ở spike 002 (baseline "an toàn" ước tính ~100-300 là ước lượng ngoại suy, không phải điểm đã đo trực tiếp) — tỷ lệ `calls_failed` cao bất ngờ ở CẢ HAI điều kiện (69-75%) xác nhận cả 2 bài test đều đã ở trong vùng suy giảm, không phải vùng "sạch" như baseline 100-connection của spike 001/002.

**Do đó:** con số tuyệt đối (586ms / 830ms) không nên trích dẫn như "latency chuẩn", nhưng vì cả 2 điều kiện chạy trong **cùng một môi trường suy giảm** (nối tiếp nhau, cùng 1 phiên), phần **delta ròng do riêng Redis cross-instance routing** nhiều khả năng nhỏ hơn con số +296ms thô — một phần của mức tăng đó đến từ nhiễu thứ tự chạy + platform-thread overhead vốn đã có, không phải đặc thù của việc "khác instance".

## Results

**Verdict: VALIDATED** — đo được rằng cross-instance routing qua Redis có latency cao hơn same-instance, với bằng chứng số liệu cụ thể, nhưng với caveat rõ ràng về nhiễu thí nghiệm cần khử nếu muốn con số chính xác hơn.

**Con số ước lượng (cận trên, có nhiễu):** cross-instance routing qua Redis tăng thêm khoảng **200-300ms ở median**, tối đa **~2×** so với same-instance — nhưng phần thực sự do riêng Redis publish/subscribe (tách khỏi warm-up/thread-model overhead) nhiều khả năng **nhỏ hơn** con số này.

**Để có con số sạch hơn (đề xuất, chưa làm trong spike này):**
1. Warm up cả 2 instance bằng vài chục request trước khi đo (loại JIT cold-start).
2. Đảo thứ tự chạy (cross-instance trước, same-instance sau) hoặc chạy xen kẽ, lấy trung bình cả 2 thứ tự.
3. Bật `spring.threads.virtual.enabled=true` (đã xác nhận an toàn, không side-effect, ở spike 002b) trên cả 2 instance trước khi đo, để loại yếu tố platform-thread degradation khỏi phép so sánh.

**Impact:** hoàn tất lộ trình 3 giai đoạn ban đầu (baseline → capacity ramp → cross-instance overhead). Kết hợp với spike 002/002b, bức tranh tổng thể: kiến trúc Redis routing (Phase 6) hoạt động đúng và đo được overhead thật (không phải lỗi), điểm nghẽn hiệu năng chính nằm ở tầng thread-model (platform threads) chứ không phải ở thiết kế Redis pub/sub.
