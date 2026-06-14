# VDT WebRTC — Realtime Video Call

Ứng dụng video call realtime 1-1 theo mô hình **peer-to-peer (WebRTC)**, signaling qua WebSocket.
Đề tài học tập VDT — vừa xây sản phẩm hoàn chỉnh, vừa học sâu WebRTC, kiến trúc realtime và scale ngang.

> **Core value:** Hai người dùng gọi video 1-1 ổn định, realtime, đúng mô hình P2P — nếu mọi thứ khác hỏng, cuộc gọi 1-1 vẫn phải hoạt động.

## Tech stack

| Lớp | Công nghệ |
|-----|-----------|
| Backend | Java 21, Spring Boot 4, Spring Security (JWT), Spring Data JPA |
| Database | PostgreSQL 17, Flyway |
| Frontend | React 19, TypeScript, Vite, Zustand, TanStack Query, React Router |
| Realtime | WebSocket (signaling), WebRTC (`RTCPeerConnection`), coturn *(phase sau)* |
| Hạ tầng | Docker Compose, Redis + RabbitMQ *(phase sau)*, Prometheus + Grafana *(phase sau)* |
| Test | JUnit 5, MockMvc, Testcontainers, Vitest, Playwright *(phase sau)* |

## 📊 Tiến độ (Progress)

> **Đang ở:** Phase 1 hoàn tất — chuẩn bị sang Phase 2.

| # | Phase | Trạng thái |
|---|-------|-----------|
| 1 | **Foundation — Auth, Roles & Skeleton** | ✅ **Hoàn tất** |
| 2 | Realtime Presence & WebSocket Layer | ⬜ Chưa bắt đầu *(kế tiếp)* |
| 3 | 1-1 P2P Call Core & NAT Traversal | ⬜ Chưa bắt đầu |
| 4 | Call Lifecycle & In-Call Experience | ⬜ Chưa bắt đầu |
| 5 | Call History & Admin | ⬜ Chưa bắt đầu |
| 6 | Horizontal Scaling | ⬜ Chưa bắt đầu |
| 7 | Group Mesh Calls | ⬜ Chưa bắt đầu |
| 8 | Screen Share, Recording & Device Control | ⬜ Chưa bắt đầu |
| 9 | Monitoring, CI/CD & Full Delivery | ⬜ Chưa bắt đầu |

### Phase 1 — đã làm gì (chi tiết)

- ✅ Đăng ký / đăng nhập, JWT (HS512), RBAC Admin/User (enforce server-side)
- ✅ **Refresh token rotation** — hash SHA-256 trong DB, xoay mỗi lần refresh, atomic CAS chống reuse
- ✅ Phiên giữ qua F5 — access token in-memory + refresh token httpOnly cookie
- ✅ Logout server-side (thu hồi token + xoá cookie), idempotent
- ✅ `GET /users/me`, admin user listing
- ✅ PostgreSQL + Flyway migrations, Docker Compose (postgres + backend)
- ✅ Integration test (Testcontainers): rotation, reuse→401, logout
- ✅ Code review + fix (cookie secure config-driven, exception handling)

## 🚀 Quick start

```bash
cp .env.example .env          # điền POSTGRES_PASSWORD, JWT_SECRET
docker compose up --build     # postgres + backend (http://localhost:8080)

cd frontend && npm install && npm run dev   # http://localhost:5173
```

Tài khoản demo admin: `admin` / `Admin@123` (đổi trước khi lên prod).

👉 Chi tiết: [docs/setup.md](docs/setup.md)

## 📁 Cấu trúc repo

```
backend/        Spring Boot — auth, security, JPA, Flyway
frontend/       React + TS — auth slice, protected routes
docs/           Tài liệu setup
.planning/      Artifacts GSD — ROADMAP, PHASE plans, STATE, code review
docker-compose.yml
```

## 📌 Trạng thái & kế hoạch

- Roadmap đầy đủ: [.planning/ROADMAP.md](.planning/ROADMAP.md)
- Trạng thái hiện tại: [.planning/STATE.md](.planning/STATE.md)
- Review code Phase 1: [.planning/phases/01-foundation-auth-roles-project-skeleton/01-REVIEW.md](.planning/phases/01-foundation-auth-roles-project-skeleton/01-REVIEW.md)
