---
spike: 001
name: k6-ws-baseline
type: standard
validates: "Given backend chạy 1 instance + JWT hợp lệ, when k6 mở N cặp VU và trao đổi đúng envelope signaling qua /ws?token=, then đo được round-trip latency P50/P95/P99 ở tải thấp"
verdict: VALIDATED
related: []
tags: [websocket, k6, signaling, baseline, redis-routing]
---

# Spike 001: k6 WS Baseline Signaling Latency

## What This Validates

Given backend-1 chạy đơn lẻ (không LB, không backend-2) với user đã đăng nhập (JWT hợp lệ), when k6 mở N cặp WebSocket VU và thực hiện đúng flow gọi thật (`call-invite` → `call-state-changed{ringing}` → `call-accept` → `call-state-changed{active}` → `hang-up`), then đo được round-trip latency thật của lớp signaling, và xác nhận k6 (`k6/ws`) có thể drive được protocol thật của app (không phải WS echo giả lập).

## Research

| Approach | Tool | Pros | Cons | Status |
|----------|------|------|------|--------|
| `k6/ws` (classic, stable) | k6 built-in | Blocking callback model đơn giản, ổn định, đủ cho 1 connection/VU | Không hỗ trợ nhiều connection đồng thời trong 1 VU | **Chosen** |
| `k6/experimental/websockets` | k6 built-in | Event-loop, giống browser WebSocket, hỗ trợ nhiều socket/VU | Chưa cần thiết — kiến trúc pairing 2-VU (1 caller + 1 callee) giải quyết đủ mà không cần multi-socket/VU | Rejected (không cần) |
| Gatling | JVM-based | Tích hợp report đẹp, hợp Java stack | Cần viết Scala DSL, chậm hơn để thử nghiệm | Rejected (k6 nhanh hơn để spike) |

**Chosen approach:** `k6/ws` (module ổn định, không phải experimental), chạy qua Docker image `grafana/k6` join vào network compose (`vdt2026-webrtc_default`), gọi thẳng `backend-1:8080` bằng service name — không qua nginx/LB (đó là câu hỏi của spike 003).

**Gotchas phát hiện khi research + build:**
- `/api/auth/register` bị rate-limit 5 req/15min/IP (`RateLimitService`) → không dùng được để seed nhiều user test. Giải pháp: seed thẳng bằng SQL (`seed-users.sql`), dùng `pgcrypto.crypt()` để tạo bcrypt hash tương thích với `BCryptPasswordEncoder`, cột `email_verified` mặc định `TRUE` (V5 migration) nên bỏ qua được luồng OTP.
- `/api/auth/login` KHÔNG bị rate-limit — an toàn để gọi từ mọi VU.
- Client message `call-offer`/`call-accept-received` (kiểu cũ, có trong `ClientMessage`/`ServerMessage` sealed interface) **không được wire trong `PresenceWebSocketHandler.handleTextMessage`** — flow gọi thật dùng `call-invite` → `CallService.handleInvite` → broadcast `CallStateChanged`. Ban đầu định dùng `call-offer`, phải đổi sang `call-invite` sau khi đọc dispatcher thật.
- Trên Windows Docker Desktop, `--network host` không hoạt động (đã ghi chú sẵn trong `docker-compose.yml` cho coturn) → phải join k6 container vào network compose bằng tên (`vdt2026-webrtc_default`) và gọi service theo tên (`backend-1:8080`), không dùng host port mapping cho phần đo latency (host port `8081:8080` trong `docker-compose.override.yml` chỉ để tiện curl/debug thủ công từ host).
- Git Bash (MSYS) tự động convert path Unix-style trong tham số `docker run` (`/spike/call-latency.js` → `C:/Program Files/Git/spike/...`) → phải set `MSYS_NO_PATHCONV=1`.

## How to Run

```bash
# 1. Stack tối thiểu: postgres, redis, rabbitmq, backend-1 (host port 8081 để debug thủ công)
docker compose --env-file .env.local -f docker-compose.yml \
  -f .planning/spikes/001-k6-ws-baseline/docker-compose.override.yml \
  up -d postgres redis rabbitmq backend-1

# 2. Seed 200 test user (bypass rate-limit của /register)
docker compose exec -T postgres psql -U root -d vdt_webrtc \
  < .planning/spikes/001-k6-ws-baseline/seed-users.sql

# 3. Chạy k6 (join network compose, gọi thẳng backend-1 bằng service name)
MSYS_NO_PATHCONV=1 docker run --rm -i --network vdt2026-webrtc_default \
  -e BASE_HTTP=http://backend-1:8080 -e BASE_WS=ws://backend-1:8080 \
  -e PAIRS=50 -e CYCLES=10 -e COOLDOWN_MS=200 \
  -v "$(pwd)/.planning/spikes/001-k6-ws-baseline:/spike" \
  grafana/k6 run /spike/call-latency.js
```

Biến môi trường: `PAIRS` (số cặp gọi, mặc định 50 = 100 VU), `CYCLES` (số chu kỳ gọi/cặp), `COOLDOWN_MS` (nghỉ giữa hangup và invite tiếp theo).

## What to Expect

- `calls_failed` = 0 (đã seed đủ user, đã bật heartbeat).
- `call_setup_rtt_ms` (Trend, đo từ lúc gửi `call-invite` đến lúc nhận `call-state-changed{active}`): số liệu single-digit tới low-hundred ms tùy tải.
- Console k6 in bảng percentile mặc định (`avg/med/p90/p95/max`) cho mọi Trend/Counter.

## Investigation Trail

1. **Smoke test (2 cặp, 3 chu kỳ):** 6/6 thành công, `call_setup_rtt_ms` avg=22ms, med=6ms, p95=57ms. Xác nhận script drive đúng protocol thật (login → WS handshake → call-invite/accept/hangup qua `CallService`).

2. **Baseline 50 cặp / 10 chu kỳ / cooldown 200ms:** 450/500 thành công (10% fail), `call_setup_rtt_ms` avg=165.82ms, med=87.5ms, p95=607ms — tăng mạnh so với smoke test và có tỷ lệ fail đáng ngờ. Tổng thời gian chạy 55.7s (gần sát mốc 60s).

3. **Giả thuyết 1 — "gọi dồn quá nhanh gây glare/busy":** chạy lại 50 cặp / 5 chu kỳ / cooldown **2000ms** (giãn cadence 10x). Kết quả: latency cho case thành công cực tốt (avg=3.26ms, med=2ms, p95=9ms — gần như tức thời!) nhưng tỷ lệ fail **cao hơn tương đối** (100/300 theo cách đếm cả hai phía). → Giả thuyết 1 bị bác bỏ: không phải do cadence gọi quá nhanh, vì giãn cadence không hết fail, thậm chí tệ hơn về mặt tỷ lệ.

4. **Đào log backend** (`docker compose logs backend-1`): phát hiện `WARN ... RedisMessageRouter : User k6userXX không có route — offline?` — đúng vào khoảng cuối các lần chạy. Đây là log từ `router.sendToUser()` khi Redis key `route:<username>` không tồn tại/hết hạn, dù WebSocket session của user đó **vẫn đang mở thật**.

5. **Root cause xác nhận trong code** (`PresenceWebSocketHandler.java:54,94,109`): `route:<username>` được set với TTL **60 giây** lúc connect, và **chỉ được refresh khi client gửi `ping`** (`redisTemplate.expire(...)` nằm trong nhánh `instanceof Ping`). Script k6 ban đầu **không hề gửi ping** — chỉ trao đổi call-invite/accept/hangup. Với run kéo dài ≥60s (baseline 55.7s suýt chạm ngưỡng) hoặc do độ trễ ramp-up VU, một số route hết hạn giữa chừng → `router.sendToUser()` âm thầm drop message, không có lỗi nào trả về phía caller → caller "treo" đến khi timeout an toàn 8s của script tự bail.

6. **Fix + xác nhận:** thêm `socket.setInterval(() => send(ping), 15000)` vào script (mô phỏng đúng hành vi client thật — frontend đã có heartbeat, chỉ có script test là thiếu). Chạy lại đúng cấu hình ở bước 2 (50 cặp / 10 chu kỳ / cooldown 200ms): **500/500 thành công, 0 fail**, tổng thời gian giảm từ 55.7s xuống 5.1s (không còn cycle nào phải chờ hết 8s timeout).

## Results

**Verdict: VALIDATED** — k6 (`k6/ws`) drive được đúng protocol signaling thật của app (JWT handshake, `call-invite`/`call-accept`/`hang-up`/`call-state-changed`), và cho ra con số round-trip latency thật, đáng tin cậy.

**Baseline numbers (50 cặp / 100 WS connection đồng thời, 1 backend instance, Docker Desktop local, heartbeat bật):**

| Metric | Value |
|---|---|
| calls_completed | 500 / 500 (0 fail) |
| call_setup_rtt_ms avg | 66.69 ms |
| call_setup_rtt_ms median | 44.5 ms |
| call_setup_rtt_ms p90 | 168 ms |
| call_setup_rtt_ms p95 | 208 ms |
| call_setup_rtt_ms max | 377 ms |
| ws_connecting avg | 12.23 ms |

**Phát hiện quan trọng ngoài dự kiến (surprise, không chỉ là con số benchmark):**

Client **phải** gửi `ping` định kỳ (< 60s) để giữ `route:<username>` sống trong Redis, nếu không:
- Message định tuyến tới user đó (bất kỳ loại nào qua `router.sendToUser`, không riêng call-invite) **bị drop âm thầm** — chỉ có 1 dòng `WARN` phía server, **không có lỗi nào trả về phía người gửi**.
- Người gọi sẽ chỉ thấy "không có phản hồi" vô thời hạn (không phải "missed call" — ring-timeout của `CallService` chỉ chạy khi cuộc gọi đã tạo state `ringing` thành công; nếu chính bản thân invite bị drop do callee mất route, không có state nào được tạo để timeout).
- Frontend hiện tại (theo stack đã build) có heartbeat nên không gặp vấn đề này trong vận hành bình thường — nhưng đây là một **failure mode chưa có test/alerting**: nếu tab bị browser throttle (background tab, mobile suspend) khiến heartbeat JS timer bị trễ >60s, cuộc gọi đến sẽ im lặng biến mất, không có tín hiệu lỗi nào cho người gọi lẫn người nhận.

**Impact on remaining spikes:**
- Spike 002 (capacity ramp) **phải** bật heartbeat trong script dùng chung — nếu không, kết quả ramp sẽ lẫn giữa "giới hạn concurrency thật" và "route hết hạn do thiếu ping", làm sai lệch kết luận.
- Đáng cân nhắc thêm một spike/backlog item riêng (ngoài lộ trình benchmark): "chuyện gì xảy ra khi heartbeat client bị trễ giữa 1 cuộc gọi đang active — cuộc gọi có tự rớt không, có tín hiệu nào cho client không?" — đây là câu hỏi về độ tin cậy (reliability), không phải hiệu năng, nhưng phát sinh trực tiếp từ finding này.
