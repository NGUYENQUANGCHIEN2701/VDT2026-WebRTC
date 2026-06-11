# VDT WebRTC — Realtime Video Call

## What This Is

Ứng dụng video call realtime cho phép 2 người dùng gọi video trực tiếp theo mô hình peer-to-peer bằng WebRTC, signaling qua WebSocket. Đây là đề tài project học tập (VDT) — mục tiêu vừa xây sản phẩm hoàn chỉnh vừa học sâu về WebRTC, kiến trúc realtime, và hệ thống scale ngang. Người dùng đăng ký/đăng nhập, thấy danh sách user online, và gọi video/audio 1-1; admin quản trị hệ thống.

## Core Value

Hai người dùng gọi video 1-1 cho nhau ổn định, realtime, theo đúng mô hình peer-to-peer WebRTC — nếu mọi thứ khác hỏng, cuộc gọi 1-1 vẫn phải hoạt động.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Đăng ký, đăng nhập bằng JWT; phân quyền 2 role Admin/User
- [ ] Quản lý trạng thái online/offline của user, hiển thị danh sách user online realtime
- [ ] Gọi video/audio 1-1 P2P qua WebRTC; signaling SDP/ICE qua WebSocket
- [ ] Trải nghiệm cuộc gọi đầy đủ: chuông báo cuộc gọi đến, chấp nhận/từ chối/nhỡ, mute mic, tắt camera, trạng thái kết nối
- [ ] Lịch sử cuộc gọi: user xem của mình; ghi nhận bất đồng bộ qua RabbitMQ
- [ ] Admin: quản lý user (khóa/mở khóa, đổi role), xem call history toàn hệ thống, dashboard thống kê (user online, cuộc gọi đang diễn ra)
- [ ] Screen sharing trong cuộc gọi
- [ ] Recording cuộc gọi (MediaRecorder phía client)
- [ ] Gọi nhóm P2P mesh (~4 người), kiến trúc theo room
- [ ] Scale ngang: 2+ instance signaling server, route message giữa instance qua Redis pub/sub, presence trên Redis
- [ ] Monitoring: Prometheus + Grafana, health check
- [ ] CI/CD: GitHub Actions build + test + đóng gói Docker image
- [ ] Toàn bộ hệ thống chạy bằng `docker compose up` (backend x2, React, PostgreSQL, Redis, RabbitMQ, coturn, monitoring)

### Out of Scope

- SFU media server (Jitsi/mediasoup/Janus) — v1 dùng mesh; kiến trúc room chừa chỗ nâng cấp SFU ở v2
- Gọi nhóm >4 người — mesh không chịu được, cần SFU
- Mobile app — web-first
- Chat/nhắn tin text — không thuộc đề bài, tập trung video call
- E2E encryption tùy chỉnh — DTLS-SRTP mặc định của WebRTC là đủ

## Context

- Đề tài project học tập (VDT - Viettel Digital Talent), yêu cầu bàn giao: source code đầy đủ, database script, tài liệu setup, demo hoạt động thực tế.
- Người làm muốn vừa làm vừa học, cải thiện code và tư duy — chất lượng code, kiến trúc, và hiểu sâu cơ chế quan trọng hơn tốc độ hoàn thành.
- "Xịn nhất" được định nghĩa: code sạch có test, trải nghiệm cuộc gọi đầy đủ, monitoring, CI/CD.
- Không có deadline gấp — làm đến đâu chắc đến đó.
- Repo greenfield, chưa có code.

## Constraints

- **Tech stack**: Backend Java Spring Boot, Frontend React + TypeScript, PostgreSQL — lựa chọn đã chốt theo định hướng học tập và môi trường doanh nghiệp VN
- **Mô hình**: Media phải đi peer-to-peer (đúng đề bài) — server chỉ làm signaling, không relay media (trừ TURN fallback)
- **Hạ tầng**: Toàn bộ demo chạy được bằng Docker Compose trên 1 máy, bao gồm demo scale 2+ instance
- **Bàn giao**: Source code, database script, tài liệu setup, demo thực tế

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Spring Boot cho signaling + API | Phổ biến trong doanh nghiệp VN, học Spring WebSocket | — Pending |
| React + TypeScript cho frontend | Phổ biến nhất, nhiều tài liệu WebRTC | — Pending |
| PostgreSQL | Chuẩn công nghiệp, chạy tốt trong Docker | — Pending |
| Gọi nhóm bằng P2P mesh, chừa chỗ SFU ở v2 | Đúng đề bài P2P, ≤4 người đủ demo, hiểu sâu WebRTC hơn dùng SFU có sẵn | — Pending |
| Redis pub/sub cho cross-instance signaling + presence | Demo scale ngang là yêu cầu; presence cần shared state | — Pending |
| RabbitMQ cho ghi call history bất đồng bộ | Học message queue với use case thực tế, tách write path khỏi realtime path | — Pending |
| 2 role Admin/User (RBAC đơn giản) | Đủ demo phân quyền tử tế, không over-engineer | — Pending |
| Access token ngắn hạn + refresh token (rotation) | Chuẩn production; TTL ngắn giảm rủi ro lộ token qua WS query param; admin khóa user thu hồi nhanh | — Pending |
| Docker Compose full stack + coturn | Demo scale ngay trên 1 máy, TURN sẵn sàng cho NAT thật | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-11 after initialization*
