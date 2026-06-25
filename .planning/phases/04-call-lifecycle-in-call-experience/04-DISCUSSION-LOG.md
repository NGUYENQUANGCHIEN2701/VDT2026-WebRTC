# Phase 4: Call Lifecycle & In-Call Experience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 04-call-lifecycle-in-call-experience
**Areas discussed:** Glare & Busy, Trải nghiệm kết thúc cuộc gọi, Reconnect & grace-period, Điều khiển & bố cục in-call

---

## Glare & Busy

| Option | Description | Selected |
|--------|-------------|----------|
| userId nhỏ hơn thắng | Tất định, dễ test, không phụ thuộc độ trễ mạng | ✓ |
| Ai ghi Redis CAS trước thắng | Đúng thứ tự tới server; phụ thuộc timing | |
| Cả hai fail + thử lại | Đơn giản nhất nhưng UX kém | |

**User's choice:** userId nhỏ hơn thắng

| Option | Description | Selected |
|--------|-------------|----------|
| Tự động nhận cuộc của bên thắng | Bên thua bỏ offer, nối liền thành 1 cuộc | ✓ |
| Hủy cả hai, báo 'thử lại' | Phải gọi lại thủ công | |

**User's choice:** Tự động nhận cuộc của bên thắng

| Option | Description | Selected |
|--------|-------------|----------|
| Toast 'X đang bận', không vào /call | Server từ chối ngay, caller ở lại Home | ✓ |
| Vào /call hiện 'Máy bận' rồi tự đóng | Tốn 1 bước điều hướng | |

**User's choice:** Toast 'X đang bận', không vào /call

| Option | Description | Selected |
|--------|-------------|----------|
| Busy ≠ missed | Người bận không bị làm phiền, không lưu/badge | ✓ |
| Busy cũng tính missed | Đánh dấu nhỡ cho Phase 5 | |

**User's choice:** Busy ≠ missed
**Notes:** User hỏi định nghĩa rõ. Chốt: missed = đã reo không bắt (callee rảnh, timeout ~30s); busy = callee đã có call active (kể cả đang ở màn incoming), từ chối ngay, không reo, không tính nhỡ.

---

## Trải nghiệm kết thúc cuộc gọi

| Option | Description | Selected |
|--------|-------------|----------|
| Màn tóm tắt ngắn rồi tự về Home | Thời lượng + lý do, ~3s, nút 'Về ngay' | ✓ |
| Toast nhỏ + về Home ngay | Gọn nhất | |
| Chỉ về Home | Không hiển thị gì | |

**User's choice:** Màn tóm tắt ngắn rồi tự về Home

| Option | Description | Selected |
|--------|-------------|----------|
| Cùng 1 khung, đổi text theo lý do | Component chung, map theo end-reason | ✓ |
| Mỗi lý do một UI riêng | Nhiều code, dễ lệch | |

**User's choice:** Cùng 1 khung, đổi text theo lý do

| Option | Description | Selected |
|--------|-------------|----------|
| dropped dạng cảnh báo | 'Mất kết nối' màu cảnh báo; completed trung tính | ✓ |
| Giống nhau | Mọi kết thúc trung tính | |

**User's choice:** Có — dropped dạng cảnh báo

| Option | Description | Selected |
|--------|-------------|----------|
| Toast tạm thời lúc xảy ra | 'Bạn đã nhỡ cuộc gọi từ X'; chưa lưu | ✓ |
| Chưa hiển thị gì ở Phase 4 | Để dành Phase 5 | |

**User's choice:** Toast tạm thời lúc xảy ra

---

## Reconnect & grace-period

| Option | Description | Selected |
|--------|-------------|----------|
| Overlay '⟳ Đang kết nối lại…' + đóng băng khung cuối | Phủ mờ, tắt tiếng tạm | ✓ |
| Spinner toàn màn, ẩn video | Mất ngữ cảnh khuôn mặt | |
| Chỉ badge nhỏ ở góc | Dễ bỏ sót | |

**User's choice:** Overlay '⟳ Đang kết nối lại…' + đóng băng khung cuối

| Option | Description | Selected |
|--------|-------------|----------|
| Server (state machine) sở hữu timer grace | Hết grace server chuyển 'dropped', báo cả hai | ✓ |
| Peer còn sống phát hiện & báo cúp | Client-driven, dễ lệch | |

**User's choice:** Server (state machine) sở hữu

| Option | Description | Selected |
|--------|-------------|----------|
| 'failed' HOẶC 'disconnected' kéo dài vài giây | Phục hồi nhanh hơn | ✓ |
| Chỉ khi 'failed' | Bảo thủ, chậm hơn | |
| Để researcher chọn ngưỡng | | |

**User's choice:** 'failed' HOẶC 'disconnected' kéo dài vài giây

| Option | Description | Selected |
|--------|-------------|----------|
| 15s, cấu hình được | Đủ cho refresh + đàm phán lại media | ✓ |
| 10s cố định | Kết thúc sớm hơn | |

**User's choice:** 15s, cấu hình được

---

## Điều khiển & bố cục in-call

| Option | Description | Selected |
|--------|-------------|----------|
| Avatar/chữ cái đầu trên nền tối + icon | Biết ngay ai đang tắt cam | ✓ |
| Màn đen + icon cam-off | Tối giản | |

**User's choice:** Avatar/chữ cái đầu trên nền tối + icon

| Option | Description | Selected |
|--------|-------------|----------|
| Kênh signaling nhẹ điểm-điểm (relay) | Server không lưu vào state machine | ✓ |
| Qua state machine (server lưu) | Phình state, ghi Redis nhiều hơn | |

**User's choice:** Kênh signaling nhẹ điểm-điểm (relay)

| Option | Description | Selected |
|--------|-------------|----------|
| Cố định góc dưới-phải | Đơn giản, đủ dùng 1-1 | ✓ |
| Kéo-thả được quanh màn | Thêm code drag | |

**User's choice:** Cố định góc dưới-phải

| Option | Description | Selected |
|--------|-------------|----------|
| 'connected' (media thông thật) | Khớp số liệu Phase 5 | ✓ |
| 'accepted' (lúc bấm Nhận) | Tính cả ~1-2s bắt tay | |

**User's choice:** 'connected' (media thông thật)

---

## Claude's Discretion

- Tập state + sơ đồ chuyển chính xác của state machine.
- Cơ chế CAS Redis (Lua `EVAL` atomic vs WATCH/MULTI/EXEC optimistic), key shape, TTL.
- Shape/tên message intent vs message state authoritative.
- Ngưỡng "disconnected kéo dài vài giây" trước ICE restart; đường cong backoff WS.
- Asset ringtone, animation overlay reconnect, layout chính xác màn tóm tắt.

## Deferred Ideas

- Cross-instance routing qua Redis pub/sub → Phase 6 (SCAL-01/02).
- Lưu lịch sử cuộc gọi + badge nhỡ bền vững + RabbitMQ → Phase 5 (HIST-*).
- Migrate presence sang Redis TTL → Phase 6.
- Chọn camera/mic/loa, mid-call switch → Phase 8 (MEDIA-03/04).
- Tunnel khác mạng (ngrok/cloudflared) → tùy chọn demo.
