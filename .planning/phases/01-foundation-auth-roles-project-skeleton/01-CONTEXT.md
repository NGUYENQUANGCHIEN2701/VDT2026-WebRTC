# Phase 1: Foundation — Auth, Roles & Project Skeleton - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase nền tảng, triển khai theo **MVP / Walking Skeleton** (lát cắt dọc mỏng nhất chạy được end-to-end). Người dùng có thể **đăng ký**, **đăng nhập** (access token ngắn hạn + refresh token rotation), nhận **role Admin/User**, và **đăng xuất** — trên một skeleton chạy được gồm **Spring Boot + React + PostgreSQL**, đóng gói qua **Docker Compose**, schema quản lý bằng **Flyway migrations** kèm tài liệu setup.

**Trong phạm vi (Phase 1):** AUTH-01 (register), AUTH-02 (access + refresh token rotation, auto-renew qua axios 401 interceptor, persist qua refresh trang), AUTH-03 (RBAC Admin/User trên REST), AUTH-05 (logout), INFR-07 (Flyway migrations + setup docs). Cộng yêu cầu Walking Skeleton: scaffold backend+frontend, routing, một thao tác đọc/ghi DB thật, một tương tác UI thật, dev deploy qua Compose.

**Ngoài phạm vi (sang phase sau):** WebSocket/presence và RBAC trên WS (AUTH-04 → Phase 2); toàn bộ call, media, history, admin user-management, scaling, monitoring. KHÔNG làm email verification, password reset, OAuth social login ở Phase 1.

</domain>

<decisions>
## Implementation Decisions

### Refresh token & lưu trữ session
- **D-01:** Refresh token đặt trong **cookie httpOnly** (chống XSS đánh cắp token), không để JS đọc được.
- **D-02:** Refresh token được **theo dõi server-side** — lưu **hash** trong bảng DB để hỗ trợ **rotation** (mỗi lần refresh cấp token mới, vô hiệu token cũ) và **thu hồi tức thì** khi admin khóa user (đáp ứng yêu cầu "admin lock thu hồi nhanh" ở PROJECT.md). KHÔNG dùng refresh token stateless.
- **D-03:** Access token (JWT HS256, ngắn hạn 15-30 phút) giữ **in-memory** phía client (biến JS / state), không lưu localStorage. Auto-renew bằng axios interceptor bắt 401 → gọi endpoint refresh.

### Tạo Admin đầu tiên (bootstrap)
- **D-04:** Tài khoản Admin đầu tiên được **seed bằng Flyway migration** (vd `V2__seed_admin.sql`) với mật khẩu đã hash sẵn (BCrypt). Reproducible, nằm trong deliverable "database script", không cần code khởi tạo đặc biệt. KHÔNG dùng cơ chế "user đăng ký đầu tiên = admin".

### Cấu trúc repo & luồng dev
- **D-05:** **Monorepo**: `backend/` (Spring Boot) + `frontend/` (React+Vite) trong cùng repo.
- **D-06:** Luồng dev hàng ngày = **hot-reload local**: chạy `./mvnw spring-boot:run` và `vite dev` trực tiếp trên máy, **chỉ PostgreSQL chạy trong Docker** (vòng lặp dev nhanh). Vẫn duy trì `docker-compose.yml` đầy đủ (backend + frontend + Postgres) để demo/bàn giao — bắt buộc bởi success criteria #4 của phase.
- **D-07:** Chia package Spring **theo feature** (vd `auth/`, `user/`, `config/`, `common/`) thay vì theo layer thuần — phù hợp định hướng học tập & module hóa cho các phase sau.

### Màn hình sau đăng nhập (điểm kết của lát cắt dọc)
- **D-08:** Sau login hiển thị **trang home tối giản** ("Xin chào {username}" + badge role + nút logout) **và một trang `/admin`** chỉ Admin truy cập được (User bị chặn cả ở UI route guard lẫn server-side). Mục tiêu: chứng minh walking skeleton + RBAC AUTH-03 chạy thông end-to-end ngay ở Phase 1.

### Claude's Discretion (tự quyết theo mặc định hợp lý)
- Hash mật khẩu bằng **BCrypt** (mặc định Spring Security `PasswordEncoder`).
- Validation DTO qua `spring-boot-starter-validation` (`@Valid`, `@NotBlank`, `@Email`, độ dài mật khẩu tối thiểu).
- Cấu trúc bảng `users` (id, username, email unique, password_hash, role, locked, created_at) và bảng `refresh_tokens` — chi tiết để planner/researcher chốt theo pattern chuẩn.
- Xử lý lỗi đăng nhập/đăng ký trên UI: thông báo lỗi rõ ràng, không lộ thông tin nhạy cảm (vd "sai tài khoản hoặc mật khẩu" chung).
- Cấu hình Spring Security `SecurityFilterChain` lambda DSL, stateless session, `OncePerRequestFilter` cho JWT trên REST.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & versions (đã chốt)
- `CLAUDE.md` §Technology Stack — phiên bản và lý do: Java 21 Temurin, Spring Boot 4.0.x, Maven wrapper, JJWT 0.12.6+ (HS256), Flyway (`flyway-database-postgresql`), Spring Security 7, React 19, Vite 7, PostgreSQL 17, Docker base images (`maven:3.9-eclipse-temurin-21`, `eclipse-temurin:21-jre-alpine`, `postgres:17-alpine`, `node:22-alpine`, `nginx:1.27-alpine`).
- `.planning/research/STACK.md` — chi tiết starter, BOM, và checklist verify version lúc setup.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §Authentication & Authorization — AUTH-01, AUTH-02, AUTH-03, AUTH-05 (đặc tả đầy đủ token TTL, rotation, RBAC).
- `.planning/REQUIREMENTS.md` §Scaling & Infrastructure — INFR-07 (Flyway migrations + setup docs).
- `.planning/ROADMAP.md` §"Phase 1" — Goal, Success Criteria (4 tiêu chí), Requirements mapping.

### Project decisions
- `.planning/PROJECT.md` §Key Decisions — đã lock: "Access token ngắn hạn + refresh token (rotation)", "2 role Admin/User (RBAC đơn giản)", "Docker Compose full stack".

### Kiến trúc & cạm bẫy (tham khảo khi research)
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Repo greenfield — chưa có code. Phase 1 dựng nền cho toàn bộ project.

### Established Patterns
- Chưa có. Các quy ước (package-by-feature, security config, migration naming `V{n}__desc.sql`) được thiết lập trong chính phase này và trở thành chuẩn cho 9 phase.

### Integration Points
- Bảng `users` + `refresh_tokens` (Flyway V1/V2) là nền cho presence (Phase 2), call history (Phase 5), admin user-management (Phase 5).
- `SecurityFilterChain` + JWT filter ở Phase 1 sẽ được mở rộng cho WebSocket handshake auth ở Phase 2 (AUTH-04).

</code_context>

<specifics>
## Specific Ideas

- Trang `/admin` ở Phase 1 chỉ cần là placeholder có bảo vệ (vd "Trang quản trị — chỉ Admin") — đủ để chứng minh RBAC, nội dung quản trị thực thuộc Phase 5.
- Forced-relay/TURN, HTTPS/WSS KHÔNG thuộc Phase 1 (HTTP local + Compose là đủ); HTTPS đến từ Phase 3.

</specifics>

<deferred>
## Deferred Ideas

- Email verification, password reset, OAuth/social login — không thuộc đề bài v1 (xem PROJECT.md Out of Scope); không đưa vào roadmap trừ khi yêu cầu mới.
- One-time WebSocket ticket auth hardening — đã nằm ở v2 (STAB-05), thay cho JWT qua query param.

None khác — thảo luận giữ trong phạm vi phase.

</deferred>

---

*Phase: 01-foundation-auth-roles-project-skeleton*
*Context gathered: 2026-06-12*
