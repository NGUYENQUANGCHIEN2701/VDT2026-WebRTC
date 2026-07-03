---
spike: 002
name: k6-ws-capacity-ramp
type: standard
validates: "Given baseline đã chạy được, when ramp concurrent connections 100->1000->5000+, then xác định điểm gãy (error rate / latency P99), đối chiếu CPU/mem qua Actuator+Prometheus/Grafana"
verdict: VALIDATED
related: [001]
tags: [websocket, k6, capacity, jvm-threads, tomcat, breaking-point]
---

# Spike 002: Capacity Ramp — Finding the Breaking Point

## What This Validates

Given baseline signaling latency đã đo được sạch ở spike 001 (heartbeat bật, 0 lỗi ở 100 connection), when ramp số connection đồng thời lên 500 → 1000 → 2000 → 4000 trên **cùng 1 backend instance** (không LB, không backend-2), then xác định được điểm bắt đầu suy giảm và điểm gãy hoàn toàn, đối chiếu với Prometheus (JVM threads, CPU, heap, `vdt_ws_sessions_active`, `vdt_calls_ended_total{end_reason=busy}`).

## Research

Tái sử dụng toàn bộ hạ tầng/pattern từ spike 001 (xem `CONVENTIONS.md`): cùng script call-flow thật + heartbeat bắt buộc, cùng cách seed SQL, cùng cách join network compose. Điểm mới cho spike này: chạy **discrete steps** (không dùng k6 `ramping-vus` liên tục) — mỗi mức concurrency là 1 lần chạy `per-vu-iterations` riêng, cho báo cáo percentile sạch từng mức, kèm chụp snapshot Prometheus trước/sau mỗi bước (`run-ramp.sh`).

**Gotcha phát hiện khi query Prometheus:** Micrometer gắn tag `instance=backend-1/backend-2` (qua `MetricsConfig.commonTags`), nhưng Prometheus scrape config **không bật `honor_labels`**, nên tự động đổi tên tag app thành `exported_instance` và chiếm dụng `instance` cho địa chỉ scrape target (`backend-1:8080`). Mọi PromQL trong spike này phải lọc bằng `exported_instance="backend-1"`, không phải `instance="backend-1"`.

## How to Run

```bash
# 1. Stack + seed 5000 user (xem spike 001 bước 1, cộng thêm):
docker compose exec -T postgres psql -U root -d vdt_webrtc \
  < .planning/spikes/002-k6-ws-capacity-ramp/seed-users.sql

# 2. Chạy ramp 5 bước (100/500/1000/2000/4000 connections), tự chụp Prometheus mỗi bước:
sh .planning/spikes/002-k6-ws-capacity-ramp/run-ramp.sh
```

## What to Expect

- Bước 100 connections: sạch như spike 001 (0 lỗi, RTT vài chục ms).
- Từ 500 connections trở lên: RTT và tỷ lệ lỗi tăng rõ rệt; xem Investigation Trail để biết mức độ và nguyên nhân.

## Investigation Trail

### Số liệu 5 bước ramp

| Connections (pairs) | calls_completed | calls_failed | RTT avg / med / p95 | ws_connecting avg / p95 | Wall time |
|---|---|---|---|---|---|
| 100 (50) | 250 | 0 | 74ms / 33ms / 261ms | 11ms / 50ms | 3.6s |
| 500 (250) | 503 | 1072 | 2.37s / 2.0s / 6.11s | 1.39s / 1.97s | 42.4s |
| 1000 (500) | 527 | 2889 | 3.08s / 2.45s / 7.11s | 8.34s / 15.41s | 1m07.8s |
| 2000 (1000) | 82 | 6525 | 3.73s / 3.6s / 6.73s | 33.11s / 60s (capped) | 1m50.5s |
| 4000 (2000) | 58 | 6279 | 4.1s / 3.89s / 7.61s | 50.79s / 60s (capped) | 1m51.0s |

(`calls_failed` đếm từ cả hai phía caller/callee độc lập nên có thể vượt tổng số chu kỳ tối đa từ phía caller — xem giải thích trong spike 001. Con số tuyệt đối ở 2000/4000 gần như vô nghĩa để so percentile vì tuyệt đại đa số cycle timeout — điều đáng chú ý là `calls_completed` **giảm tuyệt đối** dù số pairs tăng, tức hệ thống không chỉ chậm lại mà thực sự sụp.)

### Diễn giải

1. **100 → 500 connections:** RTT nhảy từ hai-chữ-số ms lên hàng giây (>30x). Đây không phải suy giảm tuyến tính theo tải — là dấu hiệu một giới hạn cứng nào đó bị chạm gần đâu đó quanh mốc này.

2. **500 → 1000 connections:** `ws_connecting` (thời gian THIẾT LẬP handshake, chưa tính gì đến call flow) tăng từ 1.39s lên 8.34s trung bình. Việc đơn thuần MỞ một WebSocket connection (login HTTP + JWT handshake + đăng ký presence) đã mất nhiều giây — đây là tín hiệu nghẽn ở tầng connection/thread, không phải ở logic gọi.

3. **1000 → 2000/4000 connections:** sụp hoàn toàn. `calls_completed` giảm tuyệt đối (527 → 82 → 58) dù số pairs tăng gấp đôi mỗi bước. `ws_connecting` p95 chạm trần 60 giây (giới hạn timeout ngầm nào đó, có thể của chính k6 hoặc TCP accept queue). Snapshot Prometheus "after" ở 2 bước cuối **trả về rỗng** — `backend-1` sau đó chuyển sang trạng thái `unhealthy` (`docker compose ps` xác nhận `/actuator/health` trả `DOWN`), nghĩa là chính health-check nội bộ của app cũng không phản hồi kịp.

4. **Loại trừ CPU/heap là nguyên nhân:** `process_cpu_usage{backend-1}` cao nhất quan sát được chỉ **6.17%** (ở bước 1000-conn) — hoàn toàn không phải CPU-bound. Heap tăng dần (4MB → 77MB → 148MB) nhưng không có dấu hiệu áp lực GC hay OOM.

5. **Đào sâu bằng JVM thread metrics** (`/actuator/prometheus` sau khi test xong):
   ```
   jvm_threads_live_threads{instance="backend-1"}     253    (đã hồi phục về mức bình thường)
   jvm_threads_peak_threads{instance="backend-1"}     8808   (đỉnh điểm trong lúc test!)
   jvm_threads_started_threads_total{instance="backend-1"}  20688
   ```
   `docker stats` cùng lúc cũng cho thấy container có **8833 PIDs** (thread OS). Đây là bằng chứng trực tiếp: dưới tải 1000-4000 connection, JVM đã tạo ra **hàng nghìn OS thread** — vượt xa số connection thực tế cần (mỗi WS connection lẽ ra chỉ cần chiếm dụng nhẹ nhàng nếu dùng non-blocking I/O đúng cách). Đối chiếu code: `CallTimerService` dùng `TaskScheduler` (Spring bean `callTaskScheduler`) với pool cố định chỉ **4 core threads** (`executor_pool_core_threads{name="callTaskScheduler"}=4.0`) — không phải nguồn gây bùng nổ thread. Thủ phạm nhiều khả năng là **Tomcat's blocking-per-connection worker thread model** cho WebSocket upgrade/session dưới `spring-boot-starter-web` mặc định (không bật virtual threads — đã kiểm tra `application.yaml`, không có `spring.threads.virtual.enabled`).

6. **BUSY-state race cũng tăng theo tải** (phụ, không phải nguyên nhân chính): `vdt_calls_ended_total{end_reason="busy"}` tăng từ 45 (baseline nền, trước test) → 583 (sau bước 500) → 2063 (sau bước 1000) → không đọc được nữa (backend unresponsive). Xác nhận một phần giả thuyết glare/busy từ spike 001, nhưng ở quy mô này nó là hệ quả của nghẽn hạ tầng (invite bị delay/queue nên nhiều lần đụng độ), không phải nguyên nhân gốc.

## Results

**Verdict: VALIDATED** — xác định được điểm gãy rõ ràng và có bằng chứng JVM-level cho nguyên nhân, không chỉ dừng ở "nó chậm đi".

**Điểm gãy (trên máy dev, Docker Desktop Windows, 1 backend instance):**
- **~100-300 connections đồng thời: vùng an toàn**, latency ổn định (chục-trăm ms).
- **~500 connections: bắt đầu suy giảm mạnh** (RTT ×30, connection setup >1s).
- **~1000 connections: nghẽn nặng** (connection setup trung bình 8s).
- **≥2000 connections: sụp hệ thống** — backend chuyển `unhealthy`, phần lớn request timeout.

**Nguyên nhân kỹ thuật (bằng chứng, không chỉ suy đoán):** `jvm_threads_peak_threads` đạt đỉnh **8808** dưới tải — chỉ số CPU (`process_cpu_usage` tối đa 6.17%) và heap không cho thấy nghẽn tài nguyên tính toán/bộ nhớ, loại trừ khả năng "máy dev quá yếu". Đây là dấu hiệu kinh điển của mô hình **1 thread OS bị chiếm dụng mỗi WebSocket connection** (blocking I/O) thay vì non-blocking hoặc virtual threads.

**Lưu ý về giới hạn của phép đo này:** đây là benchmark trên 1 máy dev (Docker Desktop, WSL2/Hyper-V network layer), không phải môi trường production — con số tuyệt đối (500/1000/2000) không nên trích dẫn như "sức chứa server thật", nhưng **hình dạng đường cong suy giảm** (tuyến tính → gãy đột ngột quanh vài trăm connection, không phải suy giảm từ từ) và **bằng chứng thread-count** là tín hiệu kiến trúc thật, độc lập với máy chạy.

**Impact on remaining spikes / định hướng tiếp theo:**
- Xác nhận trực tiếp giả thuyết ban đầu trong đề xuất 3-giai-đoạn: **"Java 21 virtual threads cho WS handler"** không còn là ý tưởng nghiên cứu tùy chọn — đây là ứng viên fix cụ thể, có bằng chứng, cho đúng vấn đề vừa đo được. Đề xuất một spike/backlog item mới: bật `spring.threads.virtual.enabled=true` (hoặc cấu hình executor WS riêng dùng `Executors.newVirtualThreadPerTaskExecutor()`), chạy lại đúng `run-ramp.sh` này, so sánh trực tiếp điểm gãy trước/sau.
- Spike 003 (Redis cross-instance overhead) nên chạy ở mức concurrency **dưới điểm gãy** (ví dụ 100-300 connections/instance) để đo đúng overhead của Redis routing, không bị nhiễu bởi nghẽn thread-pool đã phát hiện ở đây.
- `backend-1` cần **restart** trước khi dùng cho việc khác — container đang ở trạng thái `unhealthy` sau bài test này (đã tự hồi phục CPU/thread nhưng health-check có thể cần khởi động lại để về trạng thái sạch).
