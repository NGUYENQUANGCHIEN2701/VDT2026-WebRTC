# Phase 1: Foundation — Auth, Roles & Project Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 1-foundation-auth-roles-project-skeleton
**Areas discussed:** Refresh token storage, First Admin bootstrap, Repo layout & dev loop, Post-login screen
**Language:** Tiếng Việt (theo yêu cầu của user trong lúc thảo luận)

---

## Lưu trữ refresh token

| Option | Description | Selected |
|--------|-------------|----------|
| Cookie httpOnly + DB | Refresh token trong cookie httpOnly (chống XSS), lưu hash trong DB để rotation + thu hồi khi admin khóa user; access token in-memory | ✓ |
| localStorage + DB | Refresh token trong localStorage, có bảng DB; đơn giản hơn nhưng dễ bị XSS | |
| Stateless không DB | Không lưu DB, chỉ dựa vào chữ ký; không thu hồi được — mâu thuẫn yêu cầu admin lock | |

**User's choice:** Cookie httpOnly + DB
**Notes:** Khớp AUTH-02 (rotation) và yêu cầu admin khóa user thu hồi nhanh ở PROJECT.md.

---

## Tạo Admin đầu tiên

| Option | Description | Selected |
|--------|-------------|----------|
| Seed qua Flyway | Migration tạo sẵn admin với mật khẩu hash; reproducible, nằm trong deliverable DB script | ✓ |
| Env lúc khởi động | ApplicationRunner đọc biến môi trường tạo admin nếu chưa có | |
| User đầu tiên = admin | Người đăng ký đầu tiên tự thành admin; tiện nhưng rủi ro/không rõ ràng | |

**User's choice:** Seed qua Flyway
**Notes:** Mật khẩu hash sẵn bằng BCrypt trong migration (vd V2__seed_admin.sql).

---

## Cấu trúc repo & luồng dev

| Option | Description | Selected |
|--------|-------------|----------|
| Hot-reload local | mvnw spring-boot:run + vite dev trên máy, chỉ Postgres trong Docker; vẫn có compose full cho demo | ✓ |
| Toàn bộ trong Compose | Dev cũng chạy mọi thứ qua Docker Compose; sát production nhưng rebuild chậm | |

**User's choice:** Hot-reload local
**Notes:** Monorepo backend/ + frontend/; docker-compose.yml đầy đủ vẫn bắt buộc bởi INFR-02 / success criteria #4.

---

## Màn hình sau login

| Option | Description | Selected |
|--------|-------------|----------|
| Home + trang Admin | Home tối giản (Xin chào {user} + badge role + logout) và trang /admin chặn User; chứng minh RBAC end-to-end | ✓ |
| Chỉ home tối giản | Chỉ Xin chào {user} + logout, chưa có trang admin; RBAC chưa thể hiện ở UI | |
| Khung dashboard stub | Dựng sẵn layout/sidebar; đẹp nhưng tốn công, lệch trọng tâm phase | |

**User's choice:** Home + trang Admin

---

## Claude's Discretion

- Hash mật khẩu bằng BCrypt (mặc định Spring Security).
- Validation DTO qua spring-boot-starter-validation.
- Cấu trúc bảng `users` / `refresh_tokens` chi tiết để planner/researcher chốt.
- Xử lý/thông báo lỗi đăng nhập-đăng ký trên UI.
- Chia package Spring theo feature (auth/, user/, config/, common/).

## Deferred Ideas

- Email verification, password reset, OAuth/social login — ngoài phạm vi v1.
- One-time WebSocket ticket auth hardening — v2 (STAB-05).
