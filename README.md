# VDT WebRTC — Realtime Video Call

Ứng dụng gọi video 1-1 theo mô hình **peer-to-peer (WebRTC)**, signaling qua WebSocket. Đề tài học tập VDT: vừa xây sản phẩm hoàn chỉnh, vừa đi sâu vào WebRTC, kiến trúc realtime và khả năng scale ngang.

**Core value:** Hai người dùng gọi video 1-1 ổn định, realtime, đúng mô hình peer-to-peer — nếu mọi thành phần khác hỏng, cuộc gọi 1-1 vẫn phải hoạt động.

---

## 1. Tech stack

| Lớp | Công nghệ |
|-----|-----------|
| Backend | Java 21, Spring Boot 4, Spring Security (JWT), Spring Data JPA, Spring WebSocket |
| Database | PostgreSQL 17, Flyway (migration versioned) |
| Realtime | WebSocket (signaling), WebRTC `RTCPeerConnection` (perfect negotiation) |
| State & messaging | Redis (call state machine + TTL presence), RabbitMQ (pipeline lịch sử bất đồng bộ) |
| NAT traversal | coturn (STUN/TURN, ephemeral HMAC credentials), HTTPS/WSS |
| Frontend | React 19, TypeScript, Vite, Zustand, TanStack Query, React Router |
| Hạ tầng | Docker Compose |
| Kiểm thử | JUnit 5, MockMvc, Testcontainers (Postgres/Redis/RabbitMQ), Vitest |
| Monitoring | Prometheus + Grafana *(Phase 9)* |

---

## 2. Tiến độ tổng quan

Trạng thái hiện tại: **đang thực hiện Phase 5 (Call History & Admin)** — phần lịch sử cuộc gọi và quản trị người dùng đã xong; còn lại bảng điều khiển (dashboard) admin.

| # | Phase | Trạng thái |
|---|-------|-----------|
| 1 | Foundation — Auth, Roles & Project Skeleton | Hoàn tất |
| 2 | Realtime Presence & WebSocket Layer | Hoàn tất |
| 3 | 1-1 P2P Call Core & NAT Traversal | Hoàn tất |
| 4 | Call Lifecycle & In-Call Experience | Hoàn tất |
| 5 | Call History & Admin | Đang thực hiện (3/4 phần) |
| 6 | Horizontal Scaling | Chưa bắt đầu |
| 7 | Group Mesh Calls | Chưa bắt đầu |
| 8 | Screen Share, Recording & Device Control | Chưa bắt đầu |
| 9 | Monitoring, CI/CD & Full Delivery | Chưa bắt đầu |

Ghi chú: các phase 1–4 đã hoàn thiện ở mức code và kiểm thử tự động; phần còn lại là xác minh thủ công 2 thiết bị thật (HTTPS + TURN relay) — không ảnh hưởng luồng phát triển.

---

## 3. Chi tiết từng phase đã hoàn thành

### Phase 1 — Foundation: Auth, Roles & Project Skeleton

Mục tiêu: người dùng tạo tài khoản và truy cập an toàn vào bộ khung ứng dụng, đóng gói tái lập được bằng Docker.

- Đăng ký / đăng nhập bằng JWT (HS512); phân quyền Admin/User, kiểm tra quyền phía server.
- **Refresh token rotation**: lưu hash SHA-256 trong DB, xoay token mỗi lần refresh, dùng atomic compare-and-set để chống tái sử dụng token cũ.
- Giữ phiên qua khi tải lại trang: access token lưu in-memory, refresh token đặt trong cookie httpOnly.
- Đăng xuất phía server (thu hồi token + xoá cookie), idempotent.
- Endpoint `GET /users/me`, danh sách user cho admin.
- PostgreSQL + Flyway migration (`V1__create_tables`, `V2__seed_admin`); Docker Compose (postgres + backend).
- Integration test (Testcontainers): rotation, reuse → 401, logout. Đã qua review code và sửa các điểm phát hiện.

### Phase 2 — Realtime Presence & WebSocket Layer

Mục tiêu: người dùng đăng nhập thấy danh sách online realtime qua một WebSocket được server xác thực và sở hữu danh tính.

- Endpoint `/ws` xác thực JWT **ngay tại handshake** (`JwtHandshakeInterceptor`); danh tính do server gán, client không bao giờ tự khai báo `from`.
- Envelope dạng sealed interface + Jackson `@JsonTypeInfo` (presence / session-superseded / ping / pong).
- Presence in-memory đặt sau lớp trừu tượng **scale-seam** (`PresenceService` / `MessageRouter`) — Phase 6 thay bằng Redis pub/sub mà không sửa caller.
- **Single-session**: đăng nhập ở nơi khác sẽ đẩy phiên cũ ra (thông báo + đóng kết nối), áp dụng cả ở WebSocket lẫn HTTP.
- **Auto-offline** trong ~60s qua heartbeat + sweeper TTL (`@Scheduled`).
- Frontend: wrapper WebSocket tự viết (reconnect backoff + jitter, heartbeat 25s), Zustand `presenceStore`, danh sách online cập nhật realtime không cần tải lại, màn hình thông báo khi bị đẩy phiên.
- 5 integration test WebSocket (Testcontainers + `StandardWebSocketClient`) và unit test frontend đều xanh.

### Phase 3 — 1-1 P2P Call Core & NAT Traversal

Mục tiêu: hai người ở hai mạng khác nhau gọi video/audio cho nhau, media đi peer-to-peer, hiển thị chất lượng kết nối.

- Backend signaling: các bản ghi message cuộc gọi + sealed envelope, `SessionRegistry`, định tuyến SDP/ICE **trung lập** (server chuyển tiếp opaque, không đọc nội dung media).
- Endpoint cấp **TURN credential tạm thời** theo chuẩn TURN REST API (HMAC-SHA1, hết hạn theo timestamp) — không nhúng mật khẩu TURN tĩnh vào frontend.
- Frontend call core: lấy media (`getUserMedia`), `PeerManager` triển khai **perfect negotiation + candidate buffering** ngay từ bản đầu, `callStore`, UI cuộc gọi (route `/call`, self-view soi gương, card cuộc gọi đến, nút kết thúc).
- Xử lý lỗi getUserMedia (từ chối quyền, không có thiết bị, thiết bị bận) kèm fallback audio-only.
- Chẩn đoán chất lượng: `stats.ts` (qua `getStats`), chỉ báo chất lượng mạng (RTT/packet loss) và panel debug (codec, bitrate, độ phân giải, loại ICE candidate host/srflx/relay).
- NAT traversal: dịch vụ coturn + `turnserver.conf`, chế độ ép relay (`iceTransportPolicy: 'relay'`) để chứng minh TURN hoạt động; phục vụ qua HTTPS/WSS để getUserMedia chạy trên thiết bị ngoài localhost.

### Phase 4 — Call Lifecycle & In-Call Experience

Mục tiêu: cuộc gọi hành xử như sản phẩm thật qua mọi tình huống biên — đổ chuông, máy bận, nhỡ, gọi chéo (glare), kết thúc sạch và phục hồi sau gián đoạn mạng.

- **State machine cuộc gọi do server làm chủ, đặt trong Redis**, chuyển trạng thái bằng CAS (script Lua) — client gửi ý định, server quyết định, client chỉ render trạng thái.
- Vòng đời đầy đủ: đổ chuông, chấp nhận/từ chối/huỷ, timeout không trả lời (~30s, ghi nhận là nhỡ), máy bận trả về tức thì, xử lý glare (hai bên gọi nhau cùng lúc) hội tụ sạch.
- Lý do kết thúc rõ ràng cho cả hai phía: completed / rejected / cancelled / missed / busy / dropped.
- Trải nghiệm trong cuộc gọi: tắt/bật mic và camera không cần renegotiation (`track.enabled` + relay chỉ báo), chỉ báo mute/tắt cam phía đối phương, self-view PiP, đồng hồ thời lượng, bật sẵn echo cancellation / noise suppression.
- **Phục hồi**: WebSocket reconnect có backoff rồi resync trạng thái; media phục hồi qua ICE restart; tải lại trang hoặc rớt mạng trong khoảng ân hạn (~10–15s) không làm kết thúc cuộc gọi.
- Đã qua review code; sửa các điểm CR-01 (refresh TTL để cuộc gọi không chết sau ring timeout) và CR-03 (huỷ grace timer khi hang-up).

### Phase 5 — Call History & Admin (đang thực hiện)

Mục tiêu: mọi cuộc gọi được ghi lại bền vững mà không chạm vào đường realtime; admin quản lý người dùng và quan sát hệ thống.

Đã hoàn thành:

- **Pipeline lịch sử bất đồng bộ qua RabbitMQ**: sự kiện vòng đời cuộc gọi được publish khi chuyển trạng thái (fire-and-forget — đường realtime không chờ DB); consumer ghi DB **idempotent** (khoá theo `callId` + loại sự kiện) và có **DLQ** cho message lỗi.
- Flyway `V3__call_history` (schema lịch sử), entity/repository JPA, các lớp domain trong package `history`.
- Integration test pipeline bất đồng bộ + idempotency (Testcontainers RabbitMQ) và unit test publisher (fire-and-forget, loại trừ trạng thái busy).
- API `GET /api/history`: phân trang theo cursor, phân tách quyền truy cập (mỗi user chỉ thấy lịch sử của mình), kiểm thử thứ tự + phân trang + access scoping.
- Trang lịch sử người dùng `/history`: nhóm theo ngày, cuộn vô hạn (infinite scroll), liên kết điều hướng từ trang chủ.
- **Quản trị người dùng** (`ADMN-01`): admin khoá/mở khoá, đổi vai trò người dùng, kèm self-protection (admin không tự khoá/hạ quyền chính mình); user bị khoá bị **ngắt kết nối WebSocket ngay lập tức**.

Đang làm tiếp (phần còn lại của phase):

- Bảng điều khiển admin: chỉ số cuộc gọi (`CallMetrics`), `GET /api/admin/dashboard` (online users / cuộc gọi đang diễn ra / thống kê theo ngày, poll ~5s) và `GET /api/admin/history` (lịch sử toàn hệ thống, lọc theo username).

---

## 4. Kiến trúc tóm tắt

- **Signaling trung lập**: server WebSocket chỉ chuyển tiếp SDP/ICE giữa hai peer, không relay media (đúng ràng buộc P2P; TURN chỉ là fallback khi NAT chặn).
- **Tách realtime khỏi lưu trữ**: trạng thái cuộc gọi sống trong Redis; lịch sử ghi bất đồng bộ qua RabbitMQ để đường gọi không bao giờ chờ database.
- **Thiết kế sẵn cho scale**: presence và routing nằm sau interface `PresenceService` / `MessageRouter`; Phase 6 chuyển sang Redis pub/sub đa instance mà không sửa tầng gọi.

---

## 5. Cấu trúc repository

```
backend/
  src/main/java/com/vdt/webrtc/
    auth/        Đăng ký, đăng nhập, JWT, refresh token rotation
    user/        User entity, repository, /users/me
    admin/       Quản trị: liệt kê user, khoá/mở khoá, đổi vai trò
    presence/    Presence service + scale-seam
    ws/          WebSocket handler, handshake interceptor, message envelope
    call/        State machine cuộc gọi (Redis CAS), routing signaling
    history/     Pipeline lịch sử RabbitMQ: publisher, consumer, API
    config/      Cấu hình Security, WebSocket, Redis, RabbitMQ
    common/      Xử lý exception toàn cục, tiện ích dùng chung
  src/main/resources/db/migration/   Flyway V1, V2, V3

frontend/
  src/
    api/         Axios client, interceptor JWT
    realtime/    Wrapper WebSocket (reconnect, heartbeat)
    webrtc/      PeerManager (perfect negotiation), media, stats
    store/       Zustand: presenceStore, callStore
    pages/       Login, Register, Home, Call, History, Admin
    components/   call/, presence/, history/
    routes/      Route được bảo vệ theo phiên

coturn/          turnserver.conf
docs/            Tài liệu setup
docker-compose.yml
.planning/       Artifact quy trình: ROADMAP, plan + summary từng phase, review
```

---

## 6. Chạy thử

```bash
cp .env.example .env          # điền POSTGRES_PASSWORD, JWT_SECRET, TURN secret
docker compose up --build     # postgres, backend, redis, rabbitmq, coturn

cd frontend
npm install
npm run dev                   # http://localhost:5173
```

- Backend: `http://localhost:8080`
- Tài khoản admin demo: `admin` / `Admin@123` (đổi trước khi triển khai thật).
- Hướng dẫn chi tiết: [docs/setup.md](docs/setup.md)

---

## 7. Kiểm thử

```bash
cd backend && ./mvnw verify   # JUnit + integration test (Testcontainers)
cd frontend && npm run test   # Vitest
```

Độ phủ kiểm thử tự động hiện tại: auth (rotation/reuse/logout), WebSocket presence (5 ca), signaling cuộc gọi, phục hồi grace-period, pipeline lịch sử RabbitMQ (bất đồng bộ + idempotency), API lịch sử.

---

## 8. Tài liệu quy trình

- Roadmap đầy đủ 9 phase: [.planning/ROADMAP.md](.planning/ROADMAP.md)
- Trạng thái hiện tại: [.planning/STATE.md](.planning/STATE.md)
- Tổng kết Phase 2: [.planning/phases/02-realtime-presence-websocket-layer/02-SUMMARY.md](.planning/phases/02-realtime-presence-websocket-layer/02-SUMMARY.md)
- Review code Phase 1 / Phase 4 nằm trong thư mục phase tương ứng dưới `.planning/phases/`.
</content>
</invoke>
