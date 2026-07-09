# VDT WebRTC — Realtime Video Call

Ứng dụng gọi video realtime theo mô hình peer-to-peer (WebRTC), signaling qua WebSocket. Dự án được thực hiện trong khuôn khổ chương trình học tập VDT, với mục tiêu vừa xây dựng sản phẩm hoàn chỉnh vừa đi sâu vào WebRTC, kiến trúc realtime, và thiết kế hệ thống có khả năng mở rộng ngang.

**Nguyên tắc cốt lõi:** Media phải đi peer-to-peer — server chỉ làm signaling, không relay media (ngoại trừ TURN fallback khi NAT chặn). Nếu mọi tính năng khác gặp sự cố, cuộc gọi 1-1 giữa hai người vẫn phải hoạt động ổn định.

---

## Mục lục

1. [Tech Stack](#1-tech-stack)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Tiến độ tổng quan](#3-tiến-độ-tổng-quan)
4. [Chi tiết từng phase đã hoàn thành](#4-chi-tiết-từng-phase-đã-hoàn-thành)
5. [Các luồng chính](#5-các-luồng-chính)
6. [Cấu trúc repository](#6-cấu-trúc-repository)
7. [Hướng dẫn chạy thử](#7-hướng-dẫn-chạy-thử)
8. [Kiểm thử](#8-kiểm-thử)
9. [Tài liệu quy trình](#9-tài-liệu-quy-trình)

---

## 1. Tech Stack

| Lớp | Công nghệ |
|-----|-----------|
| Backend | Java 21, Spring Boot 4.0, Spring Security 7 (JWT), Spring Data JPA, Spring WebSocket |
| Database | PostgreSQL 17, Flyway (versioned migration) |
| Realtime | WebSocket (signaling), WebRTC `RTCPeerConnection` (perfect negotiation pattern) |
| State & Messaging | Redis 7 (call state machine + TTL presence), RabbitMQ 4.1 (async history pipeline) |
| NAT Traversal | coturn 4.6 (STUN/TURN, ephemeral HMAC-SHA1 credentials), HTTPS/WSS |
| Frontend | React 19, TypeScript 5, Vite 7, Zustand 5, TanStack Query 5, React Router 7 |
| Infrastructure | Docker Compose (nginx load balancer, 2 backend instances, PostgreSQL, Redis, RabbitMQ, coturn) |
| Testing | JUnit 5, Testcontainers 1.21 (PostgreSQL/Redis/RabbitMQ), Awaitility, Vitest 3, Playwright (E2E 1-1 call) |
| Monitoring | Prometheus (scrape per-instance `/actuator/prometheus`) + Grafana (dashboard `VDT WebRTC Overview`, auto-provisioned) |
| CI/CD | GitHub Actions — 4 job song song: backend (`mvn verify`), frontend (lint/test/build), docker-build, e2e (Playwright) |

---

## 2. Kiến trúc hệ thống

```
Browser A                nginx (LB)           Redis
    |                      |                    |
    |--- WSS /ws -------> [backend-1] <-------> |  (pub/sub cross-instance routing)
    |                      |                    |
    |                   [backend-2] <---------> |
    |                                           |
    |<--- SDP/ICE (relayed opaquely) ---------> Browser B
    |                                           |
    |<=================== Media (P2P) =========>|
              (TURN relay chỉ khi NAT chặn)
```

**Nguyên tắc thiết kế:**

- **Signaling trung lập:** Server WebSocket chuyển tiếp SDP/ICE dưới dạng opaque payload, không đọc hay xử lý nội dung media. Toàn bộ negotiation diễn ra giữa hai browser.
- **Tách realtime khỏi lưu trữ:** Trạng thái cuộc gọi sống trong Redis với TTL; lịch sử ghi bất đồng bộ qua RabbitMQ. Đường realtime không bao giờ chờ database.
- **Server-authoritative state machine:** Client gửi ý định (intent), server quyết định và broadcast kết quả. Client chỉ render trạng thái nhận được — không client nào tự thay đổi trạng thái cuộc gọi.
- **Scale-seam architecture:** `PresenceService` và `MessageRouter` là interface. Phase 2 dùng in-memory; Phase 6 swap sang Redis pub/sub mà không sửa caller code.

<p align="center">
  <a href="docs/architecture/vdt_webrtc_architecture.svg"><img src="docs/architecture/vdt_webrtc_architecture.svg" alt="Kiến trúc tổng quan" width="640"></a>
</p>

4 sơ đồ chi tiết khác (luồng signaling 1 cuộc gọi, vòng đời kết nối WebRTC/perfect negotiation, Redis cross-instance routing, deployment dev vs prod): [docs/architecture/README.md](docs/architecture/README.md)

---

## 3. Tiến độ tổng quan

| # | Phase | Trạng thái | Kế hoạch (waves) |
|---|-------|-----------|-----------------|
| 1 | Foundation — Auth, Roles & Project Skeleton | Hoàn tất | 4/4 |
| 2 | Realtime Presence & WebSocket Layer | Hoàn tất | 3/3 |
| 3 | 1-1 P2P Call Core & NAT Traversal | Hoàn tất | 5/5 |
| 4 | Call Lifecycle & In-Call Experience | Hoàn tất | 7/7 |
| 5 | Call History & Admin | Hoàn tất | 4/4 |
| 6 | Horizontal Scaling | Hoàn tất | 4/4 |
| 7 | Group Mesh Calls | Hoàn tất | 5/5 |
| 8 | Screen Share, Recording & Device Control | Hoàn tất | 5/5 |
| 9 | Monitoring, CI/CD & Full Delivery | Đang thực hiện | 4/5 |

**Tiến độ tổng thể:** 41/42 kế hoạch hoàn thành (~98%).

**Trạng thái hiện tại (Phase 9):** 4 plan đầu (metrics Micrometer, Prometheus/Grafana + Docker Compose 9 service, GitHub Actions CI 3 job, Playwright E2E 1-1 call trong CI) đã xong và commit. Plan cuối (09-05 — full suite gate) đã hoàn thành Task 1 (chạy toàn bộ test suite backend/frontend/E2E) và Task 2 (cập nhật `docs/setup.md`), đang tạm dừng ở Task 2b — checkpoint xác minh thủ công (`docker compose up --build` toàn bộ 9 service + xem dashboard Grafana render dữ liệu live khi gọi thật), chờ người thực hiện thao tác tay.

Ghi chú về xác minh: Phase 1–8 đã hoàn thiện ở mức code, kiểm thử tự động (Testcontainers) và validation checklist thủ công (xem `.planning/phases/0X-*/0X-VALIDATION.md`). Phase 9 đã có Playwright E2E chạy trong CI; bước xác minh thủ công cuối cùng (Docker Compose + Grafana) là hạng mục duy nhất còn lại của toàn bộ milestone v1.

---

## 4. Chi tiết từng phase đã hoàn thành

### Phase 1 — Foundation: Auth, Roles & Project Skeleton

**Mục tiêu:** Người dùng tạo tài khoản, đăng nhập và truy cập vào bộ khung ứng dụng có phân quyền. Toàn bộ stack khởi động bằng một lệnh Docker Compose.

**Những gì đã xây dựng:**

- Đăng ký / đăng nhập bằng JWT (HS512). Phân quyền Admin / User, kiểm tra quyền phía server.
- **Refresh token rotation:** Hash SHA-256 lưu trong database; mỗi lần refresh xoay token mới; dùng atomic compare-and-set để chống tái sử dụng token cũ (token reuse detection).
- **Chiến lược lưu token:** Access token lưu in-memory (không lưu localStorage), refresh token lưu trong cookie `httpOnly` — loại bỏ nguy cơ XSS đánh cắp token.
- Đăng xuất phía server: thu hồi refresh token trong database và xóa cookie, idempotent.
- Endpoint `GET /api/users/me` trả về profile của người dùng hiện tại (username, role).
- PostgreSQL 17 + Flyway migration (`V1__create_tables.sql`, `V2__seed_admin.sql`).
- Docker Compose (postgres + backend) với healthcheck.
- Integration test (Testcontainers + PostgreSQL): rotation, reuse-rejection, logout — đã qua code review và sửa các điểm phát hiện.

### Phase 2 — Realtime Presence & WebSocket Layer

**Mục tiêu:** Người dùng đăng nhập thấy danh sách online realtime qua WebSocket được server xác thực và sở hữu danh tính.

**Những gì đã xây dựng:**

- Endpoint `/ws` xác thực JWT **ngay tại handshake** (`JwtHandshakeInterceptor`). Danh tính do server gán — client không bao giờ tự khai báo trường `from`.
- **Sealed interface + Jackson `@JsonTypeInfo`** cho message envelope: server/client message phân biệt rõ ràng, type-safe.
- **Scale-seam:** `PresenceService` và `MessageRouter` là interface từ đầu. Phase 2 dùng `LocalMessageRouter` (in-memory); Phase 6 swap sang `RedisMessageRouter` mà không sửa handler.
- **Single-session policy:** Đăng nhập nơi khác đẩy phiên cũ ra (server push `session-superseded` rồi đóng WebSocket). Áp dụng cả HTTP lẫn WebSocket.
- **Auto-offline:** Heartbeat ping/pong 25s + TTL sweeper `@Scheduled` ~60s.
- **Frontend:** Native `WebSocket` wrapper tự viết (reconnect exponential backoff + jitter, heartbeat 25s), Zustand `presenceStore`, danh sách online cập nhật realtime, màn hình thông báo bị đẩy phiên.
- 5 integration test WebSocket (Testcontainers + `StandardWebSocketClient`) và unit test frontend đều xanh.

### Phase 3 — 1-1 P2P Call Core & NAT Traversal

**Mục tiêu:** Hai người ở hai mạng khác nhau gọi video/audio cho nhau, media đi peer-to-peer, hiển thị chất lượng kết nối.

**Những gì đã xây dựng:**

- **Backend signaling:** Sealed envelope các bản ghi cuộc gọi, `SessionRegistry` tra cứu WebSocket session theo userId, định tuyến SDP/ICE **trung lập** (server chuyển opaque payload không đọc nội dung).
- **TURN ephemeral credentials:** Endpoint `GET /api/turn-credentials` tạo `username = timestamp:userId`, `credential = base64(HMAC-SHA1(secret, username))` theo chuẩn TURN REST API — không nhúng mật khẩu TURN tĩnh vào frontend.
- **Frontend call core:** `getUserMedia` với fallback audio-only, `PeerManager` triển khai **perfect negotiation** (polite/impolite peer) + ICE candidate buffering từ bản đầu tiên, Zustand `callStore`, UI cuộc gọi (route `/call`, self-view soi gương, card cuộc gọi đến, nút kết thúc).
- Xử lý lỗi `getUserMedia`: từ chối quyền, không có thiết bị, thiết bị bận — mỗi trường hợp có thông báo actionable.
- **Chẩn đoán chất lượng:** `stats.ts` dùng `RTCPeerConnection.getStats()` — chỉ báo RTT/packet loss, panel debug (codec, bitrate, độ phân giải, loại ICE candidate host/srflx/relay).
- **NAT traversal:** coturn service + `turnserver.conf`, chế độ ép relay (`iceTransportPolicy: 'relay'`) để chứng minh TURN relay hoạt động; phục vụ qua HTTPS/WSS.

### Phase 4 — Call Lifecycle & In-Call Experience

**Mục tiêu:** Cuộc gọi hành xử như sản phẩm thật qua mọi tình huống biên — đổ chuông, máy bận, nhỡ, gọi chéo (glare), kết thúc sạch, phục hồi sau gián đoạn mạng.

**Những gì đã xây dựng:**

- **State machine cuộc gọi do server làm chủ, lưu trong Redis.** Chuyển trạng thái bằng CAS (Lua script atomic) — client gửi intent, server quyết định, broadcast `CallStateChanged`.
- **Vòng đời đầy đủ:**
  - Đổ chuông → chấp nhận / từ chối / hủy.
  - Timeout không trả lời (~30s): ghi nhận missed, thông báo cả hai phía.
  - Máy bận: trả về tức thì mà không ring callee.
  - **Glare resolution:** Hai bên gọi nhau đồng thời — server dùng tiebreaker (lexicographic userId) để một bên trở thành callee, hội tụ sạch mà không treo.
- **Lý do kết thúc rõ ràng:** `completed` / `rejected` / `cancelled` / `missed` / `busy` / `dropped` — cả hai phía đều nhận được đúng lý do.
- **Trải nghiệm trong cuộc gọi:** Tắt/bật mic và camera không cần renegotiation (`track.enabled` + relay chỉ báo), chỉ báo mute/tắt cam phía đối phương, self-view PiP, đồng hồ thời lượng, echo cancellation / noise suppression bật sẵn.
- **Phục hồi:** WebSocket reconnect với exponential backoff → resync trạng thái; media phục hồi qua ICE restart; reload trang hoặc rớt mạng trong khoảng ân hạn (~10–15s, lưu qua `sessionStorage`) không làm kết thúc cuộc gọi.
- Đã qua code review; sửa CR-01 (refresh Redis TTL để không chết sau ring timeout), CR-03 (hủy grace timer khi hang-up).

### Phase 5 — Call History & Admin

**Mục tiêu:** Mọi cuộc gọi được ghi lại bền vững mà không chạm vào đường realtime; admin quản lý người dùng và quan sát hệ thống.

**Những gì đã xây dựng:**

- **Pipeline lịch sử bất đồng bộ (RabbitMQ):** Sự kiện vòng đời cuộc gọi được publish khi chuyển trạng thái (fire-and-forget — đường realtime không chờ DB). Consumer ghi database **idempotent** (khóa theo `callId` + loại sự kiện). **DLQ** (Dead Letter Queue) cho message lỗi.
- Flyway `V3__call_history.sql`, entity/repository JPA, các lớp domain trong package `history`.
- Integration test pipeline bất đồng bộ + idempotency (Testcontainers RabbitMQ + Awaitility).
- **API `GET /api/history`:** Phân trang theo cursor, phân tách quyền truy cập (mỗi user chỉ thấy lịch sử của mình).
- **Trang lịch sử `/history`:** Nhóm theo ngày, infinite scroll (TanStack Query `useInfiniteQuery`), liên kết từ trang chủ.
- **Quản trị người dùng:** Admin khóa/mở khóa, đổi vai trò người dùng; tự bảo vệ (admin không tự khóa/hạ quyền chính mình); user bị khóa bị **ngắt kết nối WebSocket ngay lập tức**.
- **Admin dashboard:** Chỉ số cuộc gọi (`CallMetrics` — AtomicLong + reset hàng ngày), `GET /api/admin/dashboard` (online users / active calls / thống kê theo ngày, poll 5s), `GET /api/admin/history` (lịch sử toàn hệ thống, lọc theo username).

### Phase 6 — Horizontal Scaling

**Mục tiêu:** Hai backend instance hoạt động song song, cuộc gọi giữa hai người kết nối vào các instance khác nhau vẫn hoạt động bình thường.

**Những gì đã xây dựng:**

- **Redis pub/sub cross-instance routing:** `RedisMessageRouter` thay thế `LocalMessageRouter`. Mỗi instance subscribe một channel riêng (`ws-route:{instanceId}`); khi cần gửi đến userId không có session cục bộ, tra Redis để biết instance nào đang giữ session đó và publish vào channel tương ứng.
- **nginx load balancer** với `upstream` round-robin qua hai backend, hỗ trợ WebSocket (`proxy_http_version 1.1`, header `Upgrade`/`Connection`). Instance affinity không cần thiết — Redis routing làm cho việc phân phối ngẫu nhiên hoạt động đúng.
- **Presence qua Redis:** TTL key `presence:{userId}` được refresh bởi heartbeat, pub/sub cho presence snapshot cross-instance.
- Docker Compose cập nhật: `backend-1`, `backend-2` (không expose port trực tiếp), nginx là entry point duy nhất trên port 8080.
- Integration test: hai `StandardWebSocketClient` kết nối vào hai instance khác nhau, gọi nhau — SDP/ICE relay thành công cross-instance.

### Phase 7 — Group Mesh Calls

**Mục tiêu:** Tối đa 4 người trong một phòng gọi video/audio theo mô hình mesh (mỗi cặp có một `RTCPeerConnection` riêng), với giới hạn phòng được server enforcement.

**Những gì đã xây dựng:**

- **Backend room state (Redis):** `RoomService` + `RoomRepository` quản lý phòng trong Redis. Giới hạn 4 người được enforce server-side — người thứ 5 nhận `RoomFull` ngay lập tức.
- **Signaling mesh:** Khi thành viên mới join, server broadcast `ParticipantJoined` đến tất cả thành viên hiện tại; mỗi thành viên cũ khởi tạo `RTCPeerConnection` với thành viên mới. Khi leave, broadcast `ParticipantLeft`, các peer connection tương ứng được đóng.
- **Message types mới:** `GroupInvite`, `CancelGroupInvite`, `DeclineRoomInvite`, `JoinRoom`, `LeaveRoom`, `RoomInvite`, `RoomJoined`, `ParticipantJoined`, `ParticipantLeft`, `RoomFull`, `RoomInviteCancelled`, `RoomInviteDeclined`.
- **Frontend `MeshManager`:** Map `userId -> PeerManager`. Mỗi `PeerManager` là một instance độc lập với perfect negotiation. `MeshManager` điều phối join/leave và dọn dẹp khi phòng tan.
- **`GroupCallPage`:** Grid layout tự động co giãn theo số người (1–4), chỉ báo mute/tắt cam từng participant, nút leave phòng.
- Bảo vệ luồng 1-1: `CallService` và `RoomService` hoạt động trên hai code path độc lập — thêm mesh không ảnh hưởng cuộc gọi 1-1.
- Kiểm thử 5 wave: RED test scaffolding, backend room state, frontend mesh core, UX, full verification.

### Phase 8 — Screen Share, Recording & Device Control

**Mục tiêu:** Người dùng kiểm soát trọn vẹn nội dung chia sẻ và thiết bị dùng trong cuộc gọi — chia sẻ màn hình, chọn camera/mic/loa giữa cuộc gọi, ghi hình phía client cho cuộc gọi 1-1.

**Những gì đã xây dựng:**

- **Chia sẻ màn hình:** `getDisplayMedia` + `RTCRtpSender.replaceTrack()` (không renegotiation). Dừng từ nút trong app hoặc từ thanh công cụ trình duyệt đều tự động khôi phục camera, kể cả khi đang tắt cam.
- **Ghi hình phía client (1-1 only):** `MediaRecorder` ghi bản compositing canvas (remote làm nền, self-view PiP overlay) + mixer audio hai chiều. Tải file `.webm` theo tên `call-{callId}-{timestamp}.webm`. Không đụng đến media trên server (đúng nguyên tắc P2P).
- **Chuyển thiết bị giữa cuộc gọi:** Camera/microphone dùng `replaceTrack`, giữ nguyên trạng thái mute/tắt cam sau khi đổi. Chọn loa qua `setSinkId` (ẩn khi trình duyệt không hỗ trợ, ví dụ Firefox/Safari).
- **Áp dụng cho cả 1-1 và group mesh:** Đổi thiết bị, chia sẻ màn hình hoạt động đồng nhất ở cả hai luồng; ghi hình chỉ có ở 1-1.
- Kiểm thử 5 wave (RED scaffolding → foundation → recording engine → polish → full verification); validation checklist thủ công 100% PASS trên Chrome (`.planning/phases/08-screen-share-recording-device-control/08-VALIDATION.md`).

### Phase 9 — Monitoring, CI/CD & Full Delivery *(đang thực hiện, 4/5 plan)*

**Mục tiêu:** Quan sát được hệ thống qua từng instance, tự động hóa kiểm thử/build qua CI, và khởi động toàn bộ stack bằng một lệnh Docker Compose.

**Những gì đã xây dựng (4 plan đầu, đã commit):**

- **Metrics Micrometer thật (thay AtomicLong cũ):** `CallMetrics` dùng `Counter`/`Gauge` đăng ký vào `MeterRegistry`, gắn tag `instance` (theo backend replica) và `call_type`/`end_reason`. Expose tại `/actuator/prometheus`. Mọi kết cục cuộc gọi (completed/rejected/cancelled/missed/busy/dropped, cả 1-1 lẫn group) đều được đếm — không sót.
- **Prometheus + Grafana trong Docker Compose:** `prometheus.yml` scrape trực tiếp `backend-1:8080` và `backend-2:8080` (không qua nginx). Grafana auto-provision datasource + dashboard `VDT WebRTC Overview` — không cần thao tác tay. `docker-compose up --build` giờ khởi động đủ 9 service: postgres, backend-1, backend-2, nginx (serve frontend build + proxy `/api`/`/ws`), redis, rabbitmq, coturn, prometheus, grafana.
- **GitHub Actions CI (`.github/workflows/ci.yml`):** 3 job song song chạy trên mọi push/PR vào `main` — `backend` (`mvn verify`, gồm cả Testcontainers integration test), `frontend` (lint + vitest + build), `docker-build` (build cả 2 image, không push).
- **Playwright E2E (job thứ 4 trong CI):** Đặt một cuộc gọi 1-1 thật giữa hai Chromium context độc lập dùng fake media device, assert `<video>` phía remote thực sự nhận frame (`videoWidth/videoHeight > 0`). Chạy trực tiếp trên backend+frontend process trong CI (không cần coturn/nginx vì hai context cùng host negotiate ICE không cần TURN).

---

## 5. Các luồng chính

### Luồng 1 — Xác thực và giữ phiên

```
Browser                         Backend
  |                               |
  |-- POST /api/auth/register --> |-- validate, hash password, lưu DB
  |-- POST /api/auth/login -----> |-- issue access token (15m) + refresh token (7d)
  |<-- { accessToken } ----------|-- set cookie: refresh_token=<hash_ref> httpOnly
  |                               |
  |-- GET /api/users/me --------> |-- JwtAuthFilter: verify access token
  |<-- { username, role } --------|
  |                               |
  |  (access token hết hạn)       |
  |-- POST /api/auth/refresh ----> |-- verify cookie, CAS rotate refresh token
  |<-- { newAccessToken } ---------|
  |                               |
  |-- POST /api/auth/logout -----> |-- revoke refresh token in DB, clear cookie
```

### Luồng 2 — Kết nối WebSocket và presence

```
Browser                         Backend (Spring WebSocket)
  |                               |
  |-- WS Upgrade /ws?token=... -> |-- JwtHandshakeInterceptor: verify JWT
  |                               |   -> reject nếu invalid (401)
  |<-- 101 Switching Protocols ---|   -> gán principal, lưu vào SessionRegistry
  |                               |   -> publish PresenceSnapshot (online list)
  |<-- { type: "presence_snapshot", users: [...] }
  |                               |
  |  (mỗi 25s)                    |
  |-- { type: "ping" } ---------> |-- cập nhật TTL Redis, trả pong
  |<-- { type: "pong" } ----------|
  |                               |
  |  (user offline / timeout)     |
  |                               |-- TTL sweeper @Scheduled xóa presence
  |<-- { type: "presence_update", userId, status: "offline" } -- broadcast
```

### Luồng 3 — Cuộc gọi 1-1 (happy path)

```
Alice (Caller)              Backend (Redis SM)            Bob (Callee)
  |                               |                           |
  |-- CallInvite(to: Bob) ------> |-- CAS: IDLE -> RINGING    |
  |                               |-- publish CallStateChanged |
  |<-- CallStateChanged(RINGING) -|                           |
  |                               |-- route CallOfferReceived->|
  |                               |                           |<-- CallOfferReceived
  |                               |                           |
  |   (Bob accept)                |                           |
  |                               |<-- CallAccept(callId) ----|
  |                               |-- CAS: RINGING -> ACTIVE  |
  |<-- CallAcceptReceived --------|-- route to Alice          |
  |                               |-- CallStateChanged(ACTIVE)->|
  |                               |                           |
  |--- SDP Offer (via WS) ------> |-- route opaque payload -> |
  |<-- SDP Answer (via WS) -------|<-- route opaque payload --|
  |--- ICE candidates (via WS) -> |-- route -----------------> |
  |<-- ICE candidates (via WS) ---|<-- route -----------------|
  |                               |                           |
  |<====== Media P2P (WebRTC) =============================>  |
  |                               |                           |
  |-- HangUp ------------------>  |-- CAS: ACTIVE -> ENDED    |
  |                               |-- publish to RabbitMQ --->|--- DB (async)
  |<-- HangUpReceived ------------|-- route to Bob            |
  |<-- CallStateChanged(ENDED) ---|                           |
```

### Luồng 4 — Pipeline lịch sử bất đồng bộ

```
CallService (Redis SM)      RabbitMQ              CallHistoryConsumer
  |                           |                           |
  |-- publish event --------> |                           |
  |   (fire-and-forget)       |-- deliver message ------> |
  |                           |                           |-- check idempotency key
  |                           |                           |   (callId + eventType)
  |                           |                           |-- lưu DB nếu chưa tồn tại
  |                           |                           |
  |                           |  (nếu consumer throw)     |
  |                           |<-- nack ------------------|
  |                           |-- retry (backoff) ------> |
  |                           |-- DLQ (nếu hết retry) --> |--- alert / manual review
```

### Luồng 5 — Cross-instance WebSocket routing (Phase 6)

```
Alice (backend-1)           Redis                    Bob (backend-2)
  |                           |                           |
  |-- gửi SDP Offer           |                           |
  |                           |                           |
  |  RedisMessageRouter       |                           |
  |  tra instanceId của Bob   |                           |
  |  -> "backend-2"           |                           |
  |                           |                           |
  |-- PUBLISH ws-route:backend-2  { payload } ----------> |
  |                           |                           |
  |                           |   RoutingMessageListener  |
  |                           |   deserialize + forward ->|-- WS session Bob
```

### Luồng 6 — Group mesh call (Phase 7)

```
Alice (host)      Backend (RoomService)     Bob            Carol
  |                    |                     |               |
  |-- JoinRoom(roomId)->|-- create/join room  |               |
  |                    |-- broadcast RoomJoined              |
  |                    |-- invite Bob, Carol  |               |
  |                    |                     |               |
  |                    |<-- JoinRoom(Bob) ----|               |
  |                    |-- ParticipantJoined(Bob) ----------->| Alice
  |<-- ParticipantJoined(Bob)                |               |
  |  Alice initiates PeerConnection to Bob   |               |
  |--- SDP Offer (to Bob, via WS) ---------->|               |
  |<-- SDP Answer (from Bob) ----------------|               |
  |<====== Media P2P (Alice <-> Bob) =======>|               |
  |                    |                     |               |
  |                    |<-- JoinRoom(Carol) ------------------|
  |                    |-- ParticipantJoined(Carol) --------> Alice, Bob
  |  Alice + Bob each initiate PeerConnection to Carol ...   |
```

---

## 6. Cấu trúc repository

```
VDT2026-WebRTC/
├── backend/
│   └── src/main/
│       ├── java/com/vdt/webrtc/
│       │   ├── auth/                   # Đăng ký, đăng nhập, JWT, refresh token rotation
│       │   │   ├── AuthController.java
│       │   │   ├── AuthService.java
│       │   │   ├── RefreshToken.java
│       │   │   └── dto/
│       │   ├── user/                   # User entity, /api/users/me
│       │   │   ├── User.java
│       │   │   ├── UserController.java
│       │   │   └── UserService.java
│       │   ├── admin/                  # Khóa/mở khóa, đổi vai trò, dashboard
│       │   │   ├── AdminController.java
│       │   │   ├── AdminService.java
│       │   │   └── dto/
│       │   ├── presence/               # Scale-seam: interface + 2 implementations
│       │   │   ├── PresenceService.java        # Interface
│       │   │   ├── LocalPresenceService.java   # Phase 2: in-memory
│       │   │   ├── RedisPresenceService.java   # Phase 6: Redis TTL
│       │   │   └── PresenceSweeper.java        # @Scheduled auto-offline
│       │   ├── ws/                     # WebSocket layer
│       │   │   ├── PresenceWebSocketHandler.java   # Main handler
│       │   │   ├── JwtHandshakeInterceptor.java    # Auth tại handshake
│       │   │   ├── MessageRouter.java              # Interface (scale-seam)
│       │   │   ├── LocalMessageRouter.java         # Phase 2: in-memory
│       │   │   ├── RedisMessageRouter.java         # Phase 6: pub/sub
│       │   │   ├── SessionRegistry.java            # userId -> WS session
│       │   │   └── message/                        # 39 message types (sealed interface)
│       │   │       ├── ClientMessage.java
│       │   │       ├── ServerMessage.java
│       │   │       └── (SdpMessage, IceCandidateMessage, CallInvite, ...)
│       │   ├── call/                   # State machine cuộc gọi 1-1
│       │   │   ├── CallService.java            # Điều phối intents
│       │   │   ├── CallStateMachine.java        # CAS transitions (Lua script)
│       │   │   ├── CallStateRepository.java     # Redis operations
│       │   │   ├── CallTimerService.java        # Ring timeout, grace timer
│       │   │   └── TurnController.java          # Ephemeral HMAC credentials
│       │   ├── room/                   # Group call room state (Phase 7)
│       │   │   ├── RoomService.java
│       │   │   └── RoomRepository.java         # Redis, giới hạn 4 người
│       │   ├── history/                # Async pipeline lịch sử
│       │   │   ├── CallHistoryPublisher.java    # Fire-and-forget to RabbitMQ
│       │   │   ├── CallHistoryConsumer.java     # Idempotent write + DLQ
│       │   │   ├── HistoryController.java       # GET /api/history (cursor paging)
│       │   │   └── dto/
│       │   ├── metrics/                # CallMetrics (AtomicLong, daily reset)
│       │   ├── config/                 # Security, WebSocket, Redis, RabbitMQ
│       │   └── common/                 # GlobalExceptionHandler, custom exceptions
│       └── resources/db/migration/
│           ├── V1__create_tables.sql   # users, refresh_tokens
│           ├── V2__seed_admin.sql      # admin mặc định
│           └── V3__call_history.sql    # call_history
│
├── frontend/src/
│   ├── api/                        # Axios client, JWT interceptor (refresh-on-401)
│   │   ├── axios.ts
│   │   ├── admin.ts
│   │   ├── history.ts
│   │   └── turn.ts
│   ├── realtime/                   # WebSocket wrapper + actions
│   │   ├── wsClient.ts             # Native WS + reconnect backoff + heartbeat
│   │   ├── callActions.ts          # Gửi call intents qua WS
│   │   ├── mediaControls.ts        # Mute/cam relay
│   │   └── roomActions.ts          # Group call actions
│   ├── webrtc/                     # WebRTC core
│   │   ├── PeerManager.ts          # RTCPeerConnection + perfect negotiation
│   │   ├── MeshManager.ts          # Map<userId, PeerManager> cho group call
│   │   ├── media.ts                # getUserMedia, EC/NS constraints
│   │   ├── mediaDevices.ts         # Camera/mic/speaker selection
│   │   └── stats.ts                # getStats() — RTT, loss, codec, bitrate
│   ├── store/                      # Zustand stores
│   │   ├── authStore.ts
│   │   ├── callStore.ts            # Call state machine (client render state)
│   │   ├── presenceStore.ts        # Online users
│   │   └── roomStore.ts            # Group call room state
│   ├── components/
│   │   ├── call/                   # IncomingCallCard, QualityIndicator, DebugPanel, ...
│   │   ├── presence/               # OnlineUsersList, SessionKickNotice, ...
│   │   ├── history/                # CallHistoryRow, DayGroup
│   │   └── admin/                  # DashboardCards, AdminUserTable, SystemHistoryTable, ...
│   ├── pages/
│   │   ├── LoginPage.tsx / RegisterPage.tsx
│   │   ├── HomePage.tsx            # Danh sách online, khởi tạo cuộc gọi
│   │   ├── CallPage.tsx            # 1-1 call (PiP, quality, debug panel)
│   │   ├── GroupCallPage.tsx       # Group call (dynamic grid)
│   │   ├── HistoryPage.tsx         # Infinite scroll, nhóm theo ngày
│   │   └── AdminPage.tsx           # User mgmt + dashboard + system history
│   └── routes/
│       └── ProtectedRoute.tsx
│
├── coturn/
│   └── turnserver.conf
├── nginx/
│   └── conf.d/                     # Load balancer + WebSocket proxy config
├── docs/
│   └── setup.md
├── docker-compose.yml               # Full stack: 2 backends, nginx, postgres, redis, rabbitmq, coturn
├── docker-compose.prod.yml          # Override PROD (AWS EC2): TLS 443, mount cert Let's Encrypt
├── .env.local.example               # Template credentials cho local dev (copy -> .env.local)
├── .env.prod.example                # Template credentials cho production (copy -> .env.prod)
├── .env.example                      # Superseded bởi 2 file trên — giữ lại để tham khảo
└── .planning/                       # Artifact quy trình: ROADMAP, plan/summary/review từng phase
```

---

## 7. Hướng dẫn chạy thử

**Yêu cầu:** Docker Desktop, Node.js 22.

Từ bản này, credentials được tách riêng theo môi trường: `.env.local` (dev) và `.env.prod`
(production, AWS EC2) — thay cho file `.env` dùng chung trước đây (`.env.example` vẫn còn
trong repo để tham khảo nhưng đã superseded bởi 2 template mới).

### Chạy local dev

```bash
# 1. Cấu hình credentials
cp .env.local.example .env.local
# Điền vào .env.local:
#   POSTGRES_PASSWORD=<mật khẩu DB>
#   JWT_SECRET=<chuỗi ngẫu nhiên >= 32 ký tự>
#   TURN_SECRET=<chuỗi ngẫu nhiên>
#   HOST_IP=<IP máy host, dùng cho coturn external-ip>

# 2. Khởi động toàn bộ stack (9 service: postgres, backend-1, backend-2, nginx+frontend,
#    redis, rabbitmq, coturn, prometheus, grafana)
docker compose --env-file .env.local up --build

# 3. (Tùy chọn) Chạy frontend dev server hot-reload thay vì dùng bản build trong nginx
cd frontend
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| App (qua nginx, đủ tính năng) | http://localhost:8080 |
| Frontend (dev hot-reload) | http://localhost:5173 |
| Backend API (qua nginx) | http://localhost:8080/api |
| RabbitMQ Management UI | http://localhost:15672 (guest / guest) |
| Prometheus | http://localhost:9090 |
| Grafana (`admin` / `GRAFANA_ADMIN_PASSWORD`) | http://localhost:3000 |
| Redis | localhost:6379 |

**Tài khoản demo:** `admin` / `Admin@123` — đổi trước khi triển khai thật.

### Chạy production

```bash
# 1. Cấu hình credentials thật (không commit file này)
cp .env.prod.example .env.prod
# Điền vào .env.prod: mật khẩu DB, JWT_SECRET, TURN_SECRET mạnh, HOST_IP (IP public EC2), ...
# PASSWORD_RESET_EXPOSE_TOKEN phải là false (đã đặt sẵn trong template).

# 2. Khởi động stack với override TLS/cert (nginx mở thêm 80/443, mount Let's Encrypt)
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Hướng dẫn chi tiết (HTTPS/WSS, TURN, hai thiết bị): [docs/setup.md](docs/setup.md)

---

## 8. Kiểm thử

```bash
# Backend: JUnit 5 + Testcontainers (PostgreSQL, Redis, RabbitMQ tự spin up)
cd backend && ./mvnw verify

# Frontend: Vitest
cd frontend && npm run test

# Frontend: Playwright E2E (đặt cuộc gọi 1-1 thật giữa 2 Chromium context, fake media)
cd frontend && npm run e2e
```

**Phạm vi kiểm thử hiện tại:**

| Lớp | Test cases |
|-----|-----------|
| Auth (backend) | Rotation, token reuse rejection, logout revocation |
| WebSocket presence (backend) | 5 integration test: connect/auth, heartbeat, single-session kick, offline sweep, cross-client presence |
| Call signaling (backend) | SDP/ICE routing, TURN credential generation |
| Call state machine (backend) | CAS transitions, glare resolution, grace timer |
| History pipeline (backend) | Async consumer write, idempotency (duplicate message), DLQ |
| History API (backend) | Pagination, access scoping, ordering |
| Admin (backend) | Lock/unlock, role change, self-protection, force-disconnect |
| PeerManager (frontend) | Perfect negotiation, ICE buffering, renegotiation |
| MeshManager (frontend) | Join/leave mesh, multiple peer cleanup |
| media.ts (frontend) | getUserMedia, constraints, fallback |
| stats.ts (frontend) | getStats parsing, quality metrics |
| recording.ts (frontend) | Canvas compositor, audio mixer, download naming |
| E2E (Playwright, CI) | Cuộc gọi 1-1 thật giữa 2 browser context, assert remote `<video>` nhận frame |

---

## 9. Tài liệu quy trình

| Tài liệu | Mô tả |
|----------|-------|
| [docs/architecture/README.md](docs/architecture/README.md) | Sơ đồ kiến trúc (tổng quan hạ tầng, luồng signaling, WebRTC lifecycle, Redis routing, deployment dev/prod) |
| [.planning/ROADMAP.md](.planning/ROADMAP.md) | Roadmap 9 phase đầy đủ với success criteria từng phase |
| [.planning/STATE.md](.planning/STATE.md) | Trạng thái hiện tại, velocity, accumulated decisions |
| [.planning/REQUIREMENTS.md](.planning/REQUIREMENTS.md) | Yêu cầu chi tiết toàn dự án |
| `.planning/phases/0X-*/0X-NN-PLAN.md` | Kế hoạch chi tiết từng wave (37 file) |
| `.planning/phases/0X-*/0X-NN-SUMMARY.md` | Tổng kết sau khi hoàn thành wave |
| `.planning/phases/0X-*/0X-REVIEW.md` | Code review log và các điểm đã sửa |
| `.planning/phases/0X-*/0X-VALIDATION.md` | Checklist xác minh thủ công |
