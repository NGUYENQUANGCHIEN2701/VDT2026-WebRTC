---
phase: quick-260704-sns
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/presentation/SCRIPT.md
  - docs/presentation/DEMO.md
autonomous: true
requirements: [QUICK-SNS-01]

must_haves:
  truths:
    - "docs/presentation/SCRIPT.md tồn tại, viết hoàn toàn bằng tiếng Việt, giọng thuyết trình tự nhiên (văn nói, không phải bullet khô), có thời lượng ước tính từng phần, tổng ~10-15 phút"
    - "SCRIPT.md có ghi chú rõ phần nào cắt được để rút xuống 7-8 phút"
    - "SCRIPT.md có section 'Benchmark so sánh LiveKit / iroh' ở dạng placeholder rỗng với ghi chú TODO — KHÔNG có nội dung benchmark"
    - "docs/presentation/DEMO.md tồn tại với 3 phần: chuẩn bị trước demo, luồng demo chính từng bước, phương án dự phòng khi demo fail"
    - "Kịch bản demo chỉ dùng tính năng đã có thật trong app (ROADMAP 10 phase complete), gồm demo cross-instance 2 browser trên 2 instance và forced-relay TURN"
    - "Không file code, không ROADMAP.md nào bị sửa"
  artifacts:
    - docs/presentation/SCRIPT.md
    - docs/presentation/DEMO.md
  key_links:
    - "Phần Demo trong SCRIPT.md trỏ sang DEMO.md (link tương đối ./DEMO.md) thay vì lặp lại từng bước"
    - "Mọi con số trong SCRIPT.md lấy từ .planning/spikes/MANIFEST.md và STATE.md — không bịa số"
    - "Phần kiến trúc tái sử dụng 5 sơ đồ trong docs/architecture/ (link tương đối ../architecture/README.md) làm visual aid"
---

<objective>
Viết script thuyết trình + kịch bản demo cho dự án VDT WebRTC (đề tài Viettel Digital Talent), đặt tại `docs/presentation/` (QUICK-SNS-01).

Purpose: Người thuyết trình cầm 2 file này là trình bày được trọn vẹn 10-15 phút + chạy demo live không vấp, kể cả khi demo fail giữa chừng.
Output: `docs/presentation/SCRIPT.md` (script theo timeline) + `docs/presentation/DEMO.md` (kịch bản demo từng bước + dự phòng). Toàn bộ bằng tiếng Việt.

Phạm vi loại trừ: KHÔNG viết nội dung benchmark LiveKit/iroh — chỉ chừa section placeholder có ghi chú TODO (user tự bổ sung sau). KHÔNG sửa file code, KHÔNG sửa ROADMAP.md.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/spikes/MANIFEST.md
@docs/architecture/README.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Viết docs/presentation/SCRIPT.md — script thuyết trình theo timeline</name>
  <files>docs/presentation/SCRIPT.md</files>
  <action>
Tạo `docs/presentation/SCRIPT.md` bằng tiếng Việt, giọng văn NÓI tự nhiên như đang đứng thuyết trình (câu hoàn chỉnh, có chuyển tiếp giữa các phần), không phải bullet liệt kê khô. Mỗi section có heading kèm thời lượng ước tính, ví dụ `## 1. Mở bài (≈1 phút)`. Tổng thời lượng mục tiêu 10-15 phút. Đầu file có bảng timeline tóm tắt (section / thời lượng / thời lượng bản rút gọn).

Cấu trúc bắt buộc:

1. **Mở bài (≈1 phút):** giới thiệu đề tài học tập VDT — ứng dụng video call 1-1 realtime theo mô hình peer-to-peer WebRTC, signaling qua WebSocket. Nêu core value: "hai người dùng gọi video 1-1 ổn định, media đi P2P thuần — server chỉ làm signaling, không relay media (trừ TURN fallback)". Stack: Spring Boot (Java 21) + React/TypeScript, PostgreSQL/Redis/RabbitMQ, toàn bộ chạy bằng một lệnh `docker compose up`, đã deploy thật trên EC2 với HTTPS Let's Encrypt.

2. **Demo trực tiếp (≈4-5 phút):** phần này KHÔNG viết lại từng bước demo — chỉ viết lời dẫn chuyển sang demo và chèn link `Xem kịch bản chi tiết: [DEMO.md](./DEMO.md)`. Viết sẵn 2-3 câu "lời bình khi đang demo" cho từng điểm nhấn: (a) presence realtime, (b) cuộc gọi 1-1 kết nối + debug panel hiện ICE candidate type chứng minh media đi P2P (host/srflx) hay relay, (c) cross-instance: 2 browser nối vào 2 backend instance khác nhau vẫn gọi được cho nhau.

3. **Kiến trúc & điểm kỹ thuật cốt lõi (≈3-4 phút):** dẫn theo 5 sơ đồ trong `docs/architecture/README.md` (chèn link tương đối `../architecture/README.md` + tên từng sơ đồ làm visual aid, ghi chú "chiếu sơ đồ X lúc này"). Trình bày 6 điểm kỹ thuật, mỗi điểm 2-4 câu văn nói giải thích VÌ SAO nó khó/đáng giá chứ không chỉ liệt kê:
   - Media đi P2P thuần, server chỉ signaling (đúng đề bài; sơ đồ tổng quan hạ tầng + sequence diagram luồng gọi).
   - Perfect negotiation polite/impolite + ICE candidate buffering (xử lý glare — 2 bên cùng gửi offer; candidate đến trước remoteDescription được đệm lại; sơ đồ vòng đời kết nối).
   - Call state machine server-authoritative trong Redis với CAS/Lua — client chỉ gửi intent và render state, server là nguồn sự thật duy nhất cho ringing/busy/missed/glare/grace-period.
   - Cross-instance routing qua Redis pub/sub: `route:<username>` TTL 60s, instance miss local session thì PUBLISH sang kênh `inst:<instanceId>` của instance đích (sơ đồ Redis routing).
   - TURN với ephemeral HMAC credentials (không bao giờ ship password tĩnh xuống browser) + forced-relay test mode chứng minh TURN hoạt động.
   - Quan sát được: Grafana per-instance metrics (WS sessions, active calls), debug panel in-call hiện codec/bitrate/ICE candidate type.

4. **Con số & load test (≈2 phút):** trình bày như một câu chuyện "tự đi tìm giới hạn của kiến trúc mình xây" — nguồn số liệu DUY NHẤT là `.planning/spikes/MANIFEST.md` và STATE.md, không bịa thêm: 287 commits, 10/10 phase hoàn thành, ~31 file test backend + 10 file test frontend + 1 Playwright E2E spec chạy trong CI. Chuỗi phát hiện k6: (a) điểm gãy 1 instance ~500-1000 WS connection do platform-thread bùng nổ (jvm_threads_peak 8808 trong khi CPU chỉ 6%) → (b) bật virtual threads xoá điểm gãy, ws_connecting giữ <400ms tới 4000 connection, và lộ nghẽn tầng kế: HikariCP pool mặc định 10 → (c) Redis cross-instance routing tăng RTT median ~2× (303ms → 599ms ở 100 cặp/instance, ghi chú trung thực rằng số này có nhiễu do điều kiện đo). Chốt: các phát hiện đã được đưa ngược vào config production (virtual threads + tăng pool Hikari).

5. **Benchmark so sánh LiveKit / iroh (placeholder):** tạo section heading `## 5. Benchmark so sánh LiveKit / iroh` với đúng một dòng ghi chú dạng blockquote: `> TODO: sẽ bổ sung sau — phần benchmark so sánh với LiveKit (SFU) và iroh do người thuyết trình tự thực hiện.` KHÔNG viết bất kỳ nội dung/so sánh/dự đoán benchmark nào.

6. **Kết luận + Q&A dự phòng (≈1-2 phút):** tóm 3 ý mang về (P2P đúng đề bài, state machine server-authoritative, scale ngang có số liệu). Kèm 4-6 câu hỏi Q&A dự đoán + gợi ý trả lời ngắn, ví dụ: "Vì sao không dùng SFU?" (đề bài yêu cầu P2P; mesh cap 4 người + bitrate cap là seam để lên SFU ở v2), "Nhiều hơn 4 người thì sao?" (mesh N×(N-1) connection, upload bùng nổ — giới hạn có chủ đích), "TURN khác STUN thế nào, khi nào media qua server?", "Nếu Redis chết thì sao?", "Vì sao raw WebSocket handler mà không dùng STOMP?" (broker in-memory không scale cross-instance, và mục tiêu học là tự làm routing layer).

**Ghi chú cắt cho bản 7-8 phút:** ngay sau bảng timeline, thêm khối `> **Nếu bị giới hạn 7-8 phút:**` liệt kê rõ: rút demo còn 1-1 call + cross-instance (bỏ forced-relay, screen share, group mesh — chuẩn bị sẵn ảnh/video thay thế), phần kiến trúc chỉ giữ 3 điểm (P2P/signaling, state machine Redis, cross-instance routing), phần con số chỉ giữ chuỗi virtual-threads (a→b), bỏ hẳn mục (c) và Q&A dự phòng chỉ để in kèm không trình bày.

Không dùng emoji. Không chèn code block implementation — chỉ được phép chèn lệnh shell ngắn khi trích lời dẫn demo (ví dụ `docker compose up`).
  </action>
  <verify>
    <automated>test -f docs/presentation/SCRIPT.md && grep -c "phút" docs/presentation/SCRIPT.md | awk '$1>=6' && grep -q "Benchmark so sánh LiveKit / iroh" docs/presentation/SCRIPT.md && grep -q "TODO" docs/presentation/SCRIPT.md && grep -q "DEMO.md" docs/presentation/SCRIPT.md && grep -q "8808" docs/presentation/SCRIPT.md</automated>
  </verify>
  <done>SCRIPT.md tồn tại; mọi section có thời lượng ước tính; tổng 10-15 phút + khối ghi chú cắt xuống 7-8 phút; section benchmark chỉ có blockquote TODO; con số khớp MANIFEST.md/STATE.md (8808 threads, 303→599ms, 4000 connection, 287 commits); phần demo link sang ./DEMO.md; phần kiến trúc link sang ../architecture/README.md.</done>
</task>

<task type="auto">
  <name>Task 2: Viết docs/presentation/DEMO.md — kịch bản demo từng bước + dự phòng</name>
  <files>docs/presentation/DEMO.md</files>
  <action>
Tạo `docs/presentation/DEMO.md` bằng tiếng Việt, cấu trúc 3 phần. Khác SCRIPT.md, file này ĐƯỢC PHÉP dùng checklist/bước đánh số (là runbook thao tác), nhưng mỗi điểm nhấn vẫn kèm 1 câu "nói gì với khán giả lúc này". Chỉ dùng tính năng đã có thật theo ROADMAP (10 phase complete) — không hứa tính năng không tồn tại.

**Phần A — Chuẩn bị trước demo (làm trước giờ G):**
- Khởi động full stack: `docker compose up -d` (dev) hoặc dùng bản EC2 đã deploy sẵn (HTTPS — cần cho getUserMedia trên thiết bị thật); ghi rõ nên ưu tiên phương án nào và vì sao (khuyến nghị: demo local compose làm chính vì kiểm soát được, EC2 làm dự phòng/demo 2 thiết bị thật).
- Kiểm tra health: chờ healthcheck các service; LƯU Ý gotcha đã ghi trong MANIFEST.md — `/actuator/health` tổng có thể DOWN vì Mail health indicator (Gmail bị rate-limit), không có nghĩa backend hỏng; kiểm chứng bằng curl login hoặc readiness riêng.
- Chuẩn bị sẵn 2-3 tài khoản đã verify email (đăng ký + OTP trước giờ demo, không làm luồng OTP live trừ khi muốn khoe Phase 10); ghi username/password vào file này dạng placeholder `<user1>/<password>` cho người thuyết trình tự điền.
- Mở sẵn tab: 2 browser profile/incognito khác nhau (tránh single-session policy đá nhau), Grafana dashboard "VDT WebRTC Overview", RabbitMQ management UI (tuỳ chọn), terminal có sẵn lệnh `docker exec` redis-cli.
- Camera/mic: cắm sẵn thiết bị, cấp quyền trước cho cả 2 browser để không bị popup permission giữa demo.

**Phần B — Luồng demo chính (đánh số bước, kèm thời lượng gộp khớp mục Demo 4-5 phút của SCRIPT.md):**
1. Đăng nhập 2 user trên 2 browser → danh sách online cập nhật realtime không cần refresh (Phase 2). Câu bình: server tự attribute identity từ JWT, client không tự khai `from`.
2. User A gọi User B: màn hình incoming + ringtone, accept → video 2 chiều (Phase 3-4). Mở debug panel: chỉ vào ICE candidate type (host/srflx) → "media đang đi P2P trực tiếp, không qua server". Chỉ network quality indicator.
3. Trong call: mute mic / tắt cam → bên kia thấy indicator; bật screen share → bên kia thấy màn hình (Phase 8). (Đánh dấu bước này là "cắt được nếu thiếu giờ".)
4. Kết thúc call → cả 2 bên thấy end reason; mở trang History → cuộc gọi vừa rồi xuất hiện với direction/duration (pipeline RabbitMQ, Phase 5). Câu bình: realtime path không bao giờ chờ database.
5. **Demo scale cross-instance (điểm đinh):** xác định mỗi browser đang nối instance nào (Grafana per-instance WS sessions tăng, hoặc `docker exec <redis-container> redis-cli GET route:<username>` cho từng user); nếu 2 user tình cờ cùng instance thì reconnect 1 browser tới khi khác instance (nginx round-robin). Gọi thành công giữa 2 user ở 2 instance khác nhau → chỉ vào 2 giá trị `route:` khác nhau trong redis-cli + đồ thị Grafana tách theo instance. Câu bình: signaling đi xuyên instance qua Redis pub/sub, không cần sticky session.
6. **Forced-relay TURN (nếu còn giờ — đánh dấu "tuỳ chọn"):** bật chế độ forced relay (`iceTransportPolicy: 'relay'`) theo cơ chế test mode có sẵn từ Phase 3, gọi lại → debug panel hiện candidate type `relay` → "khi P2P trực tiếp bất khả thi vì NAT, media đi qua coturn với credential HMAC ngắn hạn". (Executor: kiểm tra nhanh trong code frontend xem forced-relay bật bằng cách nào — env/flag/localStorage — và ghi đúng thao tác thật vào bước này; nếu không tra được trong 5 phút thì ghi placeholder `<cách bật forced-relay — người thuyết trình xác nhận lại>` thay vì bịa.)
7. (Tuỳ chọn, chỉ khi dư giờ) Group mesh 4 người (Phase 7) hoặc recording (Phase 8) — ghi 2-3 dòng mỗi mục, đánh dấu rõ là bonus.

**Phần C — Phương án dự phòng khi demo fail:**
- Nguyên tắc chung: KHÔNG debug trước khán giả quá 30 giây; mỗi rủi ro dưới đây có "triệu chứng → hành động thay thế".
- Backup tổng: quay sẵn 1 video demo đầy đủ trước buổi thuyết trình (ghi vào Phần A như một mục chuẩn bị bắt buộc); nếu live fail ở bất kỳ đâu → chiếu video + tiếp tục script.
- Call không kết nối (kẹt connecting): chuyển ngay sang video backup; nói ngắn gọn về ICE/NAT là thứ phụ thuộc mạng hội trường — đây chính là lý do có TURN.
- Cross-instance mãi không rơi vào 2 instance khác nhau: chỉ Grafana per-instance + redis-cli route keys làm bằng chứng thay vì đợi round-robin.
- getUserMedia bị từ chối/không có thiết bị: app đã có luồng retry + audio-only fallback (quick task 260702-r84) — dùng luôn làm điểm cộng "xử lý lỗi thật"; nếu vẫn kẹt, chuyển video backup.
- Grafana/Prometheus chưa có dữ liệu: bỏ qua bước metrics, dùng redis-cli làm bằng chứng cross-instance.
- Mạng hội trường chặn UDP/WebRTC hoàn toàn: đây là kịch bản xấu nhất → video backup toàn phần, demo lại sau buổi trên EC2.

Không dùng emoji.
  </action>
  <verify>
    <automated>test -f docs/presentation/DEMO.md && grep -q "route:" docs/presentation/DEMO.md && grep -qi "relay" docs/presentation/DEMO.md && grep -qi "dự phòng" docs/presentation/DEMO.md && grep -qi "chuẩn bị" docs/presentation/DEMO.md</automated>
  </verify>
  <done>DEMO.md tồn tại với 3 phần (chuẩn bị / luồng chính / dự phòng); luồng chính có bước cross-instance dùng redis-cli route:&lt;username&gt; + Grafana per-instance và bước forced-relay TURN đánh dấu tuỳ chọn; mọi bước bám tính năng thật trong ROADMAP; mỗi rủi ro fail có hành động thay thế cụ thể; video backup được ghi thành mục chuẩn bị bắt buộc.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none) | Task chỉ tạo 2 file tài liệu Markdown trong docs/presentation/ — không chạm code, config, hay dữ liệu runtime |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-QSNS-01 | Information Disclosure | docs/presentation/DEMO.md | low | mitigate | Không ghi credential thật vào DEMO.md — tài khoản demo dùng placeholder `<user1>/<password>` người thuyết trình tự điền; không ghi IP/secret nào ngoài thứ đã public trong repo |
</threat_model>

<verification>
- `test -f docs/presentation/SCRIPT.md && test -f docs/presentation/DEMO.md`
- SCRIPT.md: có bảng timeline, thời lượng từng section, khối ghi chú cắt 7-8 phút, section benchmark chỉ chứa blockquote TODO, link ./DEMO.md và ../architecture/README.md
- DEMO.md: 3 phần A/B/C, bước cross-instance + forced-relay có thật, mục video backup trong phần chuẩn bị
- `git status` không cho thấy thay đổi nào ngoài 2 file trên (+ file planning) — đặc biệt ROADMAP.md và mọi file trong backend/ frontend/ không đổi
- Toàn bộ nội dung tiếng Việt, không emoji
</verification>

<success_criteria>
- Người thuyết trình đọc SCRIPT.md là trình bày được 10-15 phút trôi chảy, biết chỗ cắt khi chỉ có 7-8 phút
- Người thuyết trình cầm DEMO.md chạy được demo live từ chuẩn bị đến kết thúc, có lối thoát cụ thể cho từng kịch bản fail
- Section benchmark LiveKit/iroh tồn tại nhưng rỗng (chỉ TODO) — user tự bổ sung sau
- Mọi con số trích dẫn truy vết được về .planning/spikes/MANIFEST.md hoặc STATE.md
- Commit style: conventional commit mô tả nội dung (ví dụ `docs(presentation): add VDT presentation script and demo runbook`), KHÔNG dùng format `docs(quick-YYMMDD-xxx)`, KHÔNG thêm Co-Authored-By trailer (quy ước repo)
</success_criteria>

<output>
Create `.planning/quick/260704-sns-presentation-script/260704-sns-SUMMARY.md` when done
</output>
