# Kịch bản demo — VDT WebRTC

Runbook thao tác cho phần demo trực tiếp (≈4-5 phút, khớp mục 2 của [SCRIPT.md](./SCRIPT.md)). Gồm 3 phần: **A — Chuẩn bị trước demo**, **B — Luồng demo chính**, **C — Phương án dự phòng khi demo fail**. Mọi bước dưới đây chỉ dùng tính năng đã có thật trong app (10 phase hoàn thành theo ROADMAP).

---

## Phần A — Chuẩn bị trước demo (làm trước giờ G)

- [ ] **Chọn môi trường demo.** Khuyến nghị: **demo chính bằng compose local** (kiểm soát được hoàn toàn, không phụ thuộc mạng hội trường ra internet), **bản EC2 làm dự phòng** và dành riêng cho màn gọi bằng 2 thiết bị thật (điện thoại cần HTTPS để `getUserMedia` hoạt động — bản EC2 đã có Let's Encrypt).
  - Local (dev): `docker compose up -d` → app tại `http://localhost:8080`, Grafana `http://localhost:3000`, RabbitMQ UI `http://localhost:15672`.
  - EC2 (prod): đã deploy sẵn, mở `<https://domain-hoặc-IP-EC2>` (người thuyết trình tự điền).
- [ ] **Kiểm tra health đúng cách.** Chờ các service healthy. **Gotcha đã ghi nhận trong quá trình load test:** `/actuator/health` tổng có thể báo `DOWN` (Docker báo `unhealthy`) chỉ vì Mail health indicator — tài khoản Gmail dùng gửi OTP bị rate-limit sau nhiều lần restart — hoàn toàn không có nghĩa backend hỏng. Kiểm chứng bằng chức năng thật: curl thử `POST /api/auth/login` hoặc xem readiness/liveness riêng, đừng vội kết luận theo health tổng.
- [ ] **Chuẩn bị sẵn 2-3 tài khoản đã verify email.** Đăng ký + nhập OTP **trước giờ demo** (không làm luồng OTP live trừ khi chủ đích muốn khoe Phase 10). Ghi lại để điền nhanh:
  - Tài khoản 1: `<user1>` / `<password>`
  - Tài khoản 2: `<user2>` / `<password>`
  - Tài khoản dự phòng: `<user3>` / `<password>`
- [ ] **Mở sẵn các tab:**
  - 2 cửa sổ browser bằng **2 profile khác nhau hoặc 1 thường + 1 incognito** (bắt buộc — app có single-session policy, cùng user mở tab mới sẽ đá phiên cũ; mỗi user một profile riêng để cookie/localStorage không dẫm nhau).
  - Grafana dashboard **"VDT WebRTC Overview"** (`http://localhost:3000`).
  - RabbitMQ management UI (`http://localhost:15672`) — tuỳ chọn, chỉ mở nếu định chỉ vào queue lịch sử.
  - 1 terminal gõ sẵn lệnh (chưa Enter): `docker compose exec redis redis-cli GET route:<user1>`
- [ ] **Camera/mic:** cắm sẵn thiết bị; vào app cấp quyền camera/mic trước cho **cả 2 browser profile** để không bị popup permission chen giữa demo.
- [ ] **BẮT BUỘC — quay sẵn video backup.** Trước buổi thuyết trình, tự chạy trọn luồng demo ở Phần B một lần và quay màn hình lại (đủ tiếng). Đây là lối thoát cho mọi kịch bản fail ở Phần C. Không có video backup thì không lên sân khấu.

---

## Phần B — Luồng demo chính (≈4-5 phút)

1. **Đăng nhập 2 user trên 2 browser → presence realtime.** Đăng nhập `<user1>` ở browser 1, rồi `<user2>` ở browser 2. Danh sách online bên browser 1 hiện `<user2>` ngay lập tức, không refresh (Phase 2).
   - *Nói với khán giả:* "Danh tính do server tự xác định từ JWT lúc bắt tay WebSocket — client không tự khai mình là ai, nên không giả mạo được."

2. **Gọi 1-1 + chứng minh P2P.** `<user1>` bấm gọi `<user2>` → browser 2 hiện màn hình cuộc gọi đến kèm ringtone → Accept → video 2 chiều (Phase 3-4). Mở **debug panel**, chỉ vào **ICE candidate type = `host` hoặc `srflx`**, và chỉ luôn network quality indicator.
   - *Nói với khán giả:* "Candidate type host/srflx nghĩa là media đang đi P2P trực tiếp giữa hai máy, không qua server — đúng đề bài."

3. **Điều khiển trong cuộc gọi** *(cắt được nếu thiếu giờ)*. Mute mic rồi tắt cam → browser bên kia hiện indicator tương ứng. Bật screen share → bên kia thấy màn hình được chia sẻ (Phase 8).
   - *Nói với khán giả:* "Mute và tắt cam không cần đàm phán lại kết nối; screen share thay track tại chỗ bằng replaceTrack."

4. **Kết thúc + lịch sử.** Một bên bấm cúp máy → cả 2 bên thấy màn hình kết thúc kèm lý do (completed). Mở trang **History** → cuộc gọi vừa rồi xuất hiện với chiều gọi (incoming/outgoing) và thời lượng (Phase 5).
   - *Nói với khán giả:* "Sự kiện cuộc gọi đi qua RabbitMQ rồi mới ghi database bất đồng bộ — đường realtime không bao giờ ngồi chờ database."

5. **Demo scale cross-instance (điểm đinh).** Xác định mỗi browser đang nối instance nào bằng một trong hai cách: (a) chạy lệnh đã gõ sẵn `docker compose exec redis redis-cli GET route:<user1>` và tương tự cho `<user2>` — giá trị trả về là instance ID; (b) nhìn Grafana "VDT WebRTC Overview": đồ thị WS sessions tách theo instance nhích lên ở instance tương ứng. **Nếu 2 user tình cờ cùng instance:** logout/login lại (hoặc reload) 1 browser vài lần tới khi rơi vào instance khác — nginx round-robin nên thường chỉ cần 1 lần. Sau đó gọi lại giữa 2 user → cuộc gọi kết nối bình thường dù 2 người ở 2 instance khác nhau. Chỉ vào 2 giá trị `route:` khác nhau trong redis-cli + đồ thị Grafana tách instance làm bằng chứng.
   - *Nói với khán giả:* "Tin báo hiệu đang đi xuyên instance qua Redis pub/sub — không cần sticky session, thêm instance là thêm dòng vào compose."

6. **Forced-relay TURN** *(tuỳ chọn — chỉ làm nếu còn giờ)*. Cách bật thật trong code (Phase 3): thêm query param **`?relay=1`** vào URL của app rồi Enter để tải lại trang (ví dụ `http://localhost:8080/?relay=1`), đăng nhập lại nếu bị văng, và **giữ nguyên `?relay=1` trên URL lúc bấm gọi** — frontend đọc param này khi tạo kết nối và ép `iceTransportPolicy: 'relay'`. Gọi lại giữa 2 user (chỉ cần 1 bên bật relay là đủ thấy) → mở debug panel: candidate type giờ là **`relay`**.
   - *Nói với khán giả:* "Khi NAT khắt khe tới mức P2P trực tiếp bất khả thi, media fallback qua coturn — và credential TURN là loại ngắn hạn ký HMAC, không bao giờ ship password tĩnh xuống browser."

7. **Bonus** *(chỉ khi dư giờ)*:
   - **Group mesh 4 người** (Phase 7): mở thêm 2 profile browser, mời vào group call — mỗi người thấy cả 3 người còn lại; người thứ 5 bị server từ chối.
   - **Recording** (Phase 8): trong cuộc gọi 1-1, bật ghi hình → bên kia thấy indicator đang ghi → dừng → tải file webm về mở ngay.

---

## Phần C — Phương án dự phòng khi demo fail

**Nguyên tắc chung: KHÔNG debug trước khán giả quá 30 giây.** Mỗi rủi ro dưới đây có sẵn "triệu chứng → hành động thay thế". Lối thoát cuối cùng của mọi nhánh là **video backup** đã quay ở Phần A: chiếu video và tiếp tục nói theo [SCRIPT.md](./SCRIPT.md) như không có gì xảy ra.

| Triệu chứng | Hành động thay thế |
|-------------|--------------------|
| Cuộc gọi kẹt ở "connecting", không kết nối được | Chuyển ngay sang video backup. Nói ngắn gọn: "ICE/NAT phụ thuộc mạng hội trường — đây chính xác là lý do hệ thống có TURN fallback", rồi đi tiếp script. |
| Cross-instance mãi không rơi vào 2 instance khác nhau (round-robin không chiều lòng) | Đừng đứng reload mãi. Chuyển sang chứng minh bằng bằng chứng tĩnh: chỉ đồ thị Grafana per-instance + 2 khóa `route:` trong redis-cli của phiên trước đó (hoặc trong video backup). |
| `getUserMedia` bị từ chối / không tìm thấy thiết bị | App đã có sẵn luồng xử lý: nút thử lại + tiếp tục audio-only. **Biến sự cố thành điểm cộng**: "đây là xử lý lỗi thật của app". Nếu vẫn kẹt → video backup. |
| Grafana/Prometheus chưa có dữ liệu (mới khởi động, chưa scrape kịp) | Bỏ qua bước metrics, dùng redis-cli `route:` làm bằng chứng cross-instance duy nhất. Không đứng chờ đồ thị. |
| `/actuator/health` báo DOWN trước giờ demo | Bình tĩnh — gần như chắc chắn là Mail indicator (xem Phần A). Curl thử login; nếu login được thì backend sống, cứ demo. |
| Mạng hội trường chặn UDP/WebRTC hoàn toàn | Kịch bản xấu nhất → video backup toàn phần cho mọi phần demo. Mời khán giả gọi thử sau buổi trên bản EC2 (mạng 4G điện thoại thường không bị chặn). |

Ghi nhớ cuối: nếu buộc phải chuyển sang video backup giữa chừng, đừng xin lỗi dài dòng — một câu "để tiết kiệm thời gian, em chiếu bản chạy đã quay sẵn, hệ thống thật vẫn đang chạy và mọi người có thể thử sau buổi" là đủ, rồi đi tiếp đúng nhịp script.
