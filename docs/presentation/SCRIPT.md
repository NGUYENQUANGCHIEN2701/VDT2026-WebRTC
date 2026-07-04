# Script thuyết trình — VDT WebRTC: Realtime Video Call

Script này viết theo văn nói, đọc theo là trình bày được. Tổng thời lượng mục tiêu: **10-15 phút** (chưa tính Q&A). Kịch bản demo chi tiết nằm riêng ở [DEMO.md](./DEMO.md).

## Bảng timeline

| Phần | Bản đầy đủ (10-15 phút) | Bản rút gọn (7-8 phút) |
|------|--------------------------|-------------------------|
| 1. Mở bài | ≈1 phút | ≈1 phút |
| 2. Demo trực tiếp | ≈4-5 phút | ≈3 phút (cắt bớt, xem ghi chú dưới) |
| 3. Kiến trúc & điểm kỹ thuật cốt lõi | ≈3-4 phút | ≈2 phút (giữ 3/6 điểm) |
| 4. Con số & load test | ≈2 phút | ≈1 phút (chỉ giữ chuỗi virtual threads) |
| 5. Benchmark LiveKit / iroh | (TODO — chưa tính giờ) | (TODO) |
| 6. Kết luận + Q&A dự phòng | ≈1-2 phút | ≈1 phút (Q&A chỉ in kèm) |
| **Tổng** | **≈11-14 phút** | **≈7-8 phút** |

> **Nếu bị giới hạn 7-8 phút:**
> - **Demo:** chỉ giữ 2 điểm đinh là cuộc gọi 1-1 (kèm debug panel chứng minh P2P) và cross-instance. Bỏ forced-relay TURN, screen share, group mesh — thay bằng ảnh chụp/video quay sẵn chèn vào slide, chỉ nói lướt 1 câu mỗi thứ.
> - **Kiến trúc:** chỉ trình bày 3 điểm: (1) media P2P thuần / server chỉ signaling, (2) call state machine server-authoritative trong Redis, (3) cross-instance routing qua Redis pub/sub. Ba điểm còn lại (perfect negotiation, TURN ephemeral, observability) chỉ điểm tên trong 1 câu.
> - **Con số:** chỉ kể chuỗi (a) → (b) của phần load test (điểm gãy platform thread → virtual threads xoá điểm gãy). Bỏ hẳn mục (c) so sánh cross-instance RTT.
> - **Q&A dự phòng:** không trình bày, chỉ in kèm mang theo để trả lời khi được hỏi.

---

## 1. Mở bài (≈1 phút)

Xin chào thầy cô và các bạn. Em xin trình bày đề tài của em trong chương trình Viettel Digital Talent: **ứng dụng video call realtime 1-1 theo mô hình peer-to-peer WebRTC, signaling qua WebSocket**.

Ý tưởng cốt lõi của đề tài nằm gọn trong một câu: **hai người dùng gọi video 1-1 cho nhau ổn định, media đi P2P thuần — server chỉ làm signaling, không relay media**, trừ trường hợp bất khả kháng phải fallback qua TURN. Trong suốt quá trình làm, mọi quyết định kỹ thuật của em đều xoay quanh việc giữ đúng nguyên tắc này.

Về công nghệ: backend là **Spring Boot chạy Java 21**, frontend **React + TypeScript**, dữ liệu dùng **PostgreSQL**, cộng thêm **Redis** cho presence và định tuyến, **RabbitMQ** cho lịch sử cuộc gọi bất đồng bộ. Toàn bộ hệ thống — từ 2 instance backend, nginx cân bằng tải, cho tới Prometheus, Grafana, coturn — khởi động bằng đúng một lệnh `docker compose up`. Hệ thống cũng đã được deploy thật lên EC2 với HTTPS Let's Encrypt, nên có thể gọi thử từ điện thoại ngay bây giờ.

Bây giờ, thay vì nói lý thuyết trước, em xin demo trực tiếp luôn để mọi người thấy sản phẩm chạy thật.

## 2. Demo trực tiếp (≈4-5 phút)

*(Phần này không lặp lại từng bước thao tác — kịch bản demo chi tiết, kể cả phương án dự phòng khi demo trục trặc, xem [DEMO.md](./DEMO.md). Dưới đây là lời bình nói với khán giả tại từng điểm nhấn.)*

**Lời dẫn chuyển sang demo:** "Em sẽ mở hai trình duyệt, đóng vai hai người dùng khác nhau, và mọi người sẽ thấy toàn bộ vòng đời một cuộc gọi — từ lúc thấy nhau online cho đến lúc cúp máy và cuộc gọi nằm trong lịch sử."

**(a) Khi demo presence realtime:** "Mọi người để ý: em vừa đăng nhập ở trình duyệt thứ hai, thì bên trình duyệt thứ nhất danh sách online cập nhật ngay lập tức, không cần bấm refresh. Điểm quan trọng về bảo mật ở đây là danh tính do server tự xác định từ JWT lúc bắt tay WebSocket — client không bao giờ được tự khai mình là ai, nên không thể giả mạo người khác."

**(b) Khi cuộc gọi 1-1 kết nối và mở debug panel:** "Cuộc gọi đã kết nối, hai bên thấy và nghe nhau. Giờ em mở debug panel — chỗ này là bằng chứng cho đúng đề bài: ICE candidate type đang là host hoặc srflx, nghĩa là luồng media đang chạy **trực tiếp giữa hai máy**, hoàn toàn không đi qua server. Server chỉ tham gia đúng một việc là chuyển tiếp tin nhắn báo hiệu lúc thiết lập. Nếu candidate type mà hiện relay thì mới là đang đi qua TURN."

**(c) Khi demo cross-instance:** "Đây là phần em tâm đắc nhất: hai trình duyệt này đang kết nối vào **hai instance backend khác nhau** sau nginx — em chứng minh bằng khóa route trong Redis và đồ thị Grafana tách theo từng instance. Vậy mà cuộc gọi vẫn thiết lập bình thường, vì tin nhắn báo hiệu được chuyển xuyên instance qua Redis pub/sub. Không cần sticky session, muốn thêm instance thứ ba chỉ việc thêm vào compose."

**Lời dẫn thoát khỏi demo:** "Demo đến đây là đủ để thấy sản phẩm hoạt động. Giờ em xin đi vào phần vì sao nó chạy được như vậy — kiến trúc bên dưới."

## 3. Kiến trúc & điểm kỹ thuật cốt lõi (≈3-4 phút)

*(Visual aid: dùng 5 sơ đồ có sẵn trong [docs/architecture/README.md](../architecture/README.md). Ghi chú "chiếu sơ đồ nào" đặt trước từng ý.)*

**(Chiếu sơ đồ 1 — Tổng quan hạ tầng.)** Đây là bức tranh toàn cảnh. Điểm đầu tiên và quan trọng nhất: **media đi P2P thuần, server chỉ làm signaling** — đúng yêu cầu đề bài. Cái khó của lựa chọn này là server không nhìn thấy media, nên mọi thứ về chất lượng, kết nối, NAT đều phải giải quyết ở phía client, còn server phải làm thật tốt đúng một việc là chuyển tin báo hiệu nhanh và đúng địa chỉ. **(Chiếu tiếp sơ đồ 2 — Luồng signaling 1 cuộc gọi)** — đây là trình tự đầy đủ của một cuộc gọi: invite, ringing, accept, trao đổi SDP và trickle ICE, rồi media tự chảy trực tiếp giữa hai client.

**(Vẫn ở sơ đồ 3 — Vòng đời kết nối phía client.)** Điểm thứ hai là **perfect negotiation** — mẫu chuẩn của W3C/MDN để xử lý "glare", tức là tình huống hai bên cùng gửi offer một lúc. Em phân vai polite và impolite: bên polite sẵn sàng rollback offer của mình để nhận offer đối phương, bên impolite thì bỏ qua offer đến. Kèm theo đó là **ICE candidate buffering**: candidate nào đến trước khi remoteDescription được set thì được đệm lại, xả ra sau — thiếu cái đệm này thì cuộc gọi thi thoảng sẽ hỏng một cách rất khó tái hiện.

Điểm thứ ba: **call state machine server-authoritative đặt trong Redis, chuyển trạng thái bằng CAS qua Lua script**. Client chỉ gửi ý định — gọi, nghe, cúp — còn server là nguồn sự thật duy nhất quyết định ringing, busy, missed, glare, hay grace period khi rớt mạng. Nhờ vậy hai client không bao giờ cãi nhau về trạng thái cuộc gọi, và mọi ca biên như hai người gọi cho nhau cùng lúc đều được phân xử ở một chỗ duy nhất.

**(Chiếu sơ đồ 4 — Redis cross-instance routing.)** Điểm thứ tư là phần scale ngang: mỗi instance chỉ giữ session WebSocket của chính nó trong bộ nhớ; khi user kết nối, instance ghi khóa `route:<username>` vào Redis với TTL 60 giây, giữ sống bằng heartbeat. Khi cần gửi tin cho một user không có session cục bộ, instance tra khóa route rồi PUBLISH message sang kênh `inst:<instanceId>` của instance đích. Vậy là cuộc gọi xuyên instance chạy được mà không cần sticky session.

Điểm thứ năm: **TURN với ephemeral HMAC credentials**. Nguyên tắc là không bao giờ ship password TURN tĩnh xuống browser — backend cấp credential ngắn hạn ký bằng HMAC theo đúng chuẩn TURN REST API. Kèm theo có chế độ **forced-relay** ép toàn bộ media đi qua coturn, dùng để chứng minh đường fallback TURN thật sự hoạt động chứ không phải cấu hình cho có.

Điểm cuối: **hệ thống quan sát được**. Grafana hiển thị metrics tách theo từng instance — số session WebSocket, số cuộc gọi đang diễn ra — nên demo scale nhìn thấy được bằng đồ thị chứ không phải nói suông. Còn trong cuộc gọi thì debug panel hiện codec, bitrate, ICE candidate type ngay trên UI. **(Sơ đồ 5 — Deployment dev vs prod** — chiếu lướt nếu còn giờ: khác biệt duy nhất giữa chạy local và bản EC2 là lớp nginx TLS, mọi service khác giữ nguyên.)

## 4. Con số & load test (≈2 phút)

Sau khi xong 10 phase tính năng, em không dừng ở "chạy được" mà tự đặt câu hỏi: **kiến trúc mình xây chịu được đến đâu?** Em dùng k6 viết script drive đúng protocol WebSocket thật của app — handshake bằng JWT, đúng envelope JSON của luồng gọi thật chứ không phải ping-pong — và tìm ra một chuỗi phát hiện khá thú vị.

Trước hết vài con số tổng quan của dự án: **287 commit**, **10/10 phase hoàn thành** với 42 plan, và bộ test gồm **31 file test backend, 10 file test frontend, cùng 1 Playwright E2E spec** thực hiện một cuộc gọi thật giữa hai browser context bằng fake media — tất cả chạy trong CI trên GitHub Actions.

Còn đây là câu chuyện load test. **Phát hiện thứ nhất:** một instance backend gãy ở khoảng **500-1000 kết nối WebSocket đồng thời**. Điều bất ngờ là thủ phạm không phải CPU hay memory — CPU lúc đó mới chỉ hơn 6% — mà là **bùng nổ platform thread: jvm_threads_peak lên tới 8808 thread**. Mỗi kết nối chiếm thread theo kiểu cũ của Java là không ổn.

**Phát hiện thứ hai:** bật đúng một dòng cấu hình virtual threads của Java 21 — điểm gãy đó **biến mất**: thời gian bắt tay WebSocket giữ dưới 400 mili giây cho tới tận **4000 kết nối**, thay vì 30-50 giây như trước. Nhưng gỡ được nút nghẽn này thì lộ ra nút nghẽn ở tầng kế tiếp: pool kết nối database HikariCP mặc định chỉ có 10, hàng nghìn user login đồng thời là timeout thật, có exception làm bằng chứng.

**Phát hiện thứ ba:** đo overhead của chính lớp scale ngang — khi hai người ở hai instance khác nhau, RTT signaling median tăng khoảng gấp đôi, từ **303 lên 599 mili giây** ở mức 100 cặp mỗi instance. Em cũng xin nói trung thực là con số này còn nhiễu — thứ tự chạy cố định và instance thứ hai chưa warm-up — nên nó là ước lượng xu hướng chứ chưa phải con số chuẩn.

Điều em thấy giá trị nhất: các phát hiện này **không nằm lại trong báo cáo** — cấu hình production hiện tại đã bật virtual threads và tăng pool Hikari, đúng theo bằng chứng đo được.

## 5. Benchmark so sánh LiveKit / iroh

> TODO: sẽ bổ sung sau — phần benchmark so sánh với LiveKit (SFU) và iroh do người thuyết trình tự thực hiện.

## 6. Kết luận + Q&A dự phòng (≈1-2 phút)

Ba điều em muốn mọi người mang về sau buổi hôm nay. **Một**, sản phẩm giải đúng đề bài: media đi P2P thuần, server chỉ signaling, và điều đó được chứng minh ngay trên debug panel chứ không phải cam kết miệng. **Hai**, phần khó nhất của video call không phải là lúc gọi được, mà là mọi ca biên — glare, busy, missed, rớt mạng — và em giải quyết chúng bằng một state machine server-authoritative duy nhất trong Redis. **Ba**, hệ thống scale ngang thật sự — hai instance, cuộc gọi xuyên instance — và giới hạn của nó được đo bằng số liệu thật, số liệu đó đã quay ngược lại cải thiện cấu hình production.

Em xin cảm ơn và sẵn sàng nhận câu hỏi.

### Q&A dự đoán (in kèm, trả lời khi được hỏi)

1. **"Vì sao không dùng SFU như Jitsi/LiveKit?"** — Đề bài yêu cầu media đi P2P, server không relay. Mesh nhóm bị giới hạn chủ đích ở 4 người kèm bitrate cap; abstraction phòng (room) chính là chỗ nối sẵn để lên SFU ở phiên bản sau nếu cần đông người hơn.
2. **"Nhiều hơn 4 người thì sao?"** — Mesh cần N×(N-1) kết nối và mỗi máy phải upload cho từng người xem, băng thông upload bùng nổ theo số người. 4 là giới hạn có chủ đích, server từ chối người thứ 5 chứ không phải client tự giấu nút.
3. **"TURN khác STUN thế nào, khi nào media đi qua server?"** — STUN chỉ giúp client tự biết địa chỉ công khai của mình, media vẫn P2P. TURN là relay: khi NAT hai bên khắt khe đến mức không đục lỗ được, media buộc phải chạy qua coturn. Đó là fallback duy nhất mà media chạm hạ tầng của em, và có chế độ forced-relay để chứng minh đường này hoạt động.
4. **"Nếu Redis chết thì sao?"** — Redis là điểm phụ thuộc của signaling: presence, route map, call state đều nằm đó, nên cuộc gọi mới sẽ không thiết lập được cho đến khi Redis quay lại. Nhưng cuộc gọi đang diễn ra thì media là P2P nên vẫn chạy tiếp. Muốn chịu lỗi cao hơn thì bước tiếp theo là Redis replica/sentinel — nằm ngoài phạm vi demo một máy.
5. **"Vì sao dùng raw WebSocket handler mà không dùng STOMP?"** — Simple broker của STOMP là in-memory, không scale qua nhiều instance; còn đường scale chính thống của nó xung đột với thiết kế Redis pub/sub đã chọn. Quan trọng hơn, mục tiêu học tập là tự xây lớp routing để hiểu tận gốc — dùng broker có sẵn thì lớp đó thành hộp đen.
6. **"Vì sao lịch sử cuộc gọi phải đi qua RabbitMQ?"** — Nguyên tắc là đường realtime không bao giờ chờ database. Sự kiện cuộc gọi được publish sang RabbitMQ rồi consumer ghi DB bất đồng bộ, có idempotency theo callId và DLQ cho message hỏng — cuộc gọi không chậm đi chỉ vì DB chậm.
