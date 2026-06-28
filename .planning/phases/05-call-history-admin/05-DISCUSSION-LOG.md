# Phase 5: Call History & Admin - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-28
**Phase:** 5-call-history-admin
**Areas discussed:** Call history display, What gets recorded, Admin user management, Live dashboard (+ follow-ups: history deletion, lock-mid-call, admin history filter, daily-stats window)

---

## Call history display

| Option | Description | Selected |
|--------|-------------|----------|
| Đầy đủ | peer + direction + duration + timestamp + outcome | ✓ |
| Gọn | peer + direction + timestamp only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Phẳng mới→cũ | single time-descending list | |
| Nhóm theo ngày | Hôm nay / Hôm qua / date headers | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Infinite scroll, giữ tất cả | useInfiniteQuery, keep all | ✓ |
| Giới hạn N gần nhất | cap to ~50, no pagination | |

**Notes:** Modeled on a familiar phone call-log.

---

## What gets recorded

| Option | Description | Selected |
|--------|-------------|----------|
| Tất cả trừ busy | log completed/missed/rejected/cancelled/dropped, not busy | ✓ |
| Tất cả 6 reason | log busy too | |
| Chỉ connected + missed | drop rejected/cancelled/busy | |

| Option | Description | Selected |
|--------|-------------|----------|
| Nhãn riêng mỗi phía | per-side perspective (caller vs callee) | ✓ |
| Cùng 1 nhãn cho cả 2 | same label both sides | |

| Option | Description | Selected |
|--------|-------------|----------|
| Có, miễn đã connected | any active call = completed, real duration | ✓ |
| Bỏ nếu dưới ngưỡng | drop calls < ~1s | |

**Notes:** Consistent with Phase 4 D-06 (busy ≠ missed, never logged).

---

## Admin user management

| Option | Description | Selected |
|--------|-------------|----------|
| Inline trong bảng | per-row lock/role controls | ✓ |
| Trang chi tiết mỗi user | separate detail page | |

| Option | Description | Selected |
|--------|-------------|----------|
| Có xác nhận | confirm on lock + role change | ✓ |
| Làm ngay, không hỏi | no confirmation | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chặn tự lock/giáng cấp mình | self-protection (BE + FE) | ✓ |
| Cho phép | no restriction | |

---

## Live dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Online + active + thống kê ngày | full ADMN-03 metrics | ✓ |
| Chỉ online + active | minimal | |

| Option | Description | Selected |
|--------|-------------|----------|
| Poll ~5s REST | refetchInterval | ✓ |
| Push realtime qua WS | dedicated WS channel | |
| Refresh tay | manual button | |

| Option | Description | Selected |
|--------|-------------|----------|
| Thẻ số (stat cards) | big numbers | ✓ |
| Thẻ số + biểu đồ nhỏ | add charts | |

---

## Follow-up decisions

| Question | Choice |
|----------|--------|
| User delete/clear history? | Chỉ xem, không xóa (read-only MVP) |
| Lock a user mid-active-call? | Đá ngay, cuộc kết thúc (peer sees dropped via grace) |
| Admin system history filtering? | Danh sách + lọc theo username |
| "Daily stats" window? | Theo ngày server, reset 00:00 |

---

## Claude's Discretion

- RabbitMQ topology, DLQ, publisher confirms, retry/backoff (locked by stack + success criteria)
- Idempotency mechanism (callId + event type)
- call_history schema, JPA entity, Flyway migration
- Exact CallService event trigger points (one logical entry per call)
- Dashboard count sources (Redis vs DB aggregate vs Micrometer)

## Deferred Ideas

- Delete/clear history (future phase)
- WS-pushed realtime dashboard (revisit if poll feels laggy)
- Dashboard charts / daily trend
- Busy analytics
- Phase 4 backlog: CR-02(a), CR-04, WR-01/02/09 (future polish pass)
