# Phase 4: Call Lifecycle & In-Call Experience - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Biến cuộc gọi 1-1 *chạy được nhưng mong manh* của Phase 3 thành **sản phẩm thật** ở mọi cạnh vòng đời:
**reo (ringtone/incoming) → bận (busy) → nhỡ (missed) → glare → kết thúc sạch (6 end-reason) → phục hồi
sau blip mạng**. Toàn bộ vòng đời do **state machine server-authoritative trong Redis với CAS** sở hữu —
client gửi **intent**, render **trạng thái** server trả về. Kèm **trải nghiệm in-call** đầy đủ: mute/cam-off
(không renegotiation), chỉ báo trạng thái bên kia, PiP self-view, đồng hồ thời lượng, EC/NS bật mặc định.

Requirements: **CALL-02, CALL-03, CALL-04, CALL-05, CALL-06, CALL-07, CALL-08, MEDIA-01, MEDIA-06,
STAB-01, STAB-02**.

**In scope:** màn incoming + ringtone, accept/reject/cancel chặt qua state machine, timeout→missed (~30s),
busy server-enforced, glare resolution, end-reason taxonomy đầy đủ (completed/rejected/cancelled/missed/
busy/dropped), **state machine Redis + CAS (CALL-08)**, **wiring Redis lần đầu vào backend + docker-compose**,
mute mic / tắt cam qua `track.enabled` + chỉ báo cho bên kia, PiP + duration + connection status, WS
reconnect backoff + resync state (STAB-01), ICE restart + grace period (~15s) cho refresh/drop (STAB-02).

**Out of scope:**
- Cross-instance routing qua Redis pub/sub (SCAL-01/02) → **Phase 6**. Phase 4 chạy **single-instance**,
  `MessageRouter` giữ local.
- Lưu lịch sử cuộc gọi / RabbitMQ / badge nhỡ bền vững (HIST-01/02/03, ADMN-02) → **Phase 5**.
- Chọn camera/mic/loa, mid-call device switch (MEDIA-03/04) → **Phase 8**.
- Screen share, recording, group mesh (ADV-01/02/03) → Phase 7/8.
- Migrate presence sang Redis: **chỉ wiring Redis cho call-state ở Phase 4**; presence giữ
  `LocalPresenceService` hiện tại (Redis presence để dành Phase 6 — xem D-13).
</domain>

<decisions>
## Implementation Decisions

### Mô hình điều khiển (control plane vs media plane)
- **D-01:** Tách hai mặt phẳng rõ ràng. **Lifecycle intent** (invite/accept/reject/cancel/hangup +
  busy/glare/timeout/dropped do server quyết) đi **qua state machine server-authoritative**: client gửi
  intent, server validate + CAS trên Redis, rồi **broadcast trạng thái authoritative** cho cả hai để render.
  **SDP/ICE giữ nguyên opaque relay** như Phase 3 (server không parse media). Đây là siết chặt handshake
  "đơn giản" của Phase 3 (D-01 Phase 3) thành hợp đồng có server làm nguồn sự thật → planner cần refactor
  luồng `callStore` client-driven hiện tại sang render-state.

### State machine & Redis (CALL-08)
- **D-02:** **Server-authoritative state machine trong Redis với CAS** là trái tim phase. Phase 4 **wiring
  Redis lần đầu** vào backend (thêm `spring-boot-starter-data-redis` / Lettuce vào `pom.xml`, thêm service
  `redis:7-alpine` vào docker-compose theo CLAUDE.md). Mọi chuyển trạng thái phải qua **compare-and-set** để
  chống race (glare, double-accept, hangup đồng thời). *Cách CAS cụ thể* (Lua script atomic vs WATCH/MULTI/
  EXEC optimistic), **key shape**, và **tập state + sơ đồ chuyển** chính xác → researcher/planner quyết (gợi
  ý khung: `ringing → active → ended{reason}`, cộng nhánh busy/glare/missed/dropped). Server là chủ timer
  (ring timeout, grace) — xem D-08, D-11.

### Glare (CALL-06)
- **D-03:** Phân xử **tất định: userId nhỏ hơn thắng** (không phụ thuộc độ trễ mạng → dễ test/reproduce).
- **D-04:** Bên **thua** glare **tự động chuyển thành nhận cuộc của bên thắng** (bỏ offer của mình, coi như
  đang ở màn incoming của bên thắng) → hai người vẫn nối được **một** cuộc, không phải gọi lại.

### Busy (CALL-05) & phân biệt với Missed (CALL-04)
- **D-05:** Gọi người **đang có call active** (đang nói chuyện, HOẶC đang ở màn incoming/outgoing chưa kết
  thúc) → server **từ chối ngay, callee KHÔNG reo**. Caller thấy **toast "X đang bận"** và **ở lại Home**
  (không điều hướng vào `/call`).
- **D-06:** **Busy ≠ Missed.** `missed` = callee **rảnh**, máy **đã reo thật** nhưng không bấm Nhận trong
  **~30s** (server-owned timeout). `busy` = callee đang kẹt, **chưa từng reo** → **không tính nhỡ**, không
  badge, không lưu. (Edge: callee đang ở màn incoming của cuộc A mà cuộc B tới → cuộc B nhận `busy`.)

### End-reason taxonomy & trải nghiệm kết thúc (CALL-07)
- **D-07:** Đủ 6 lý do: `completed / rejected / cancelled / missed / busy / dropped`. Cả hai bên được báo
  end-reason. UI kết thúc dùng **một component chung**, đổi nội dung theo reason (nhất quán, ít code).
- **D-08:** Khi kết thúc → **màn tóm tắt ngắn** (thời lượng + lý do) rồi **tự về Home sau ~3s** (có nút "Về
  ngay"). **`dropped`** (rớt quá grace) hiển thị **dạng cảnh báo "Mất kết nối"** (màu cảnh báo); các reason
  còn lại trung tính.
- **D-09:** `missed` cho callee ở Phase 4: **toast tạm thời "Bạn đã nhỡ cuộc gọi từ X"** hiện lúc timeout nếu
  callee đang mở app. **Chưa lưu** — badge/lịch sử bền vững để dành Phase 5.

### Reconnect & grace period (STAB-01, STAB-02)
- **D-10:** Trong lúc blip (chưa nối lại): **overlay "⟳ Đang kết nối lại…" phủ lên video, đóng băng khung
  hình cuối, tắt tiếng tạm**.
- **D-11:** **Server (state machine) sở hữu timer grace.** Hết grace chưa phục hồi → server chuyển `dropped`
  và báo cả hai (chống hai bên lệch trạng thái). **Grace = 15s, cấu hình qua env.**
- **D-12:** **Refresh/drop trong grace KHÔNG kết thúc cuộc gọi** (tiêu chí #5, đã khóa). `callId` sống trong
  Redis + lưu client (sessionStorage) để rejoin; media phải **đàm phán lại** (offer/answer mới — chấp nhận
  màn đen ~1-2s) vì RTCPeerConnection mất khi reload. **WS reconnect dùng backoff** rồi **resync state**
  (snapshot presence + cuộc gọi hiện tại). **ICE restart** kích hoạt khi `connectionState` = `failed`
  **hoặc** `disconnected` kéo dài vài giây.

### In-call controls & layout (MEDIA-01, MEDIA-06)
- **D-13:** **Mute mic / tắt cam qua `track.enabled`** (không renegotiation — CLAUDE.md). Khi bên kia tắt
  cam → khung họ hiện **avatar/chữ cái đầu trên nền tối + icon cam-off**.
- **D-14:** Trạng thái mute/cam-off báo cho bên kia qua **kênh signaling nhẹ điểm-điểm (relay như sdp/ice),
  server KHÔNG lưu vào state machine** (đây không phải lifecycle → không phình Redis state).
- **D-15:** **PiP self-view cố định góc dưới-phải.** **Đồng hồ thời lượng tính từ `'connected'`** (media
  thông thật, không tính ~1-2s bắt tay) → khớp số liệu Phase 5 sau này. **EC/NS bật mặc định** trong
  `getUserMedia` constraints. In-call UI hiện duration + connection status.

### Claude's Discretion
- Tập state + sơ đồ chuyển chính xác của state machine; cơ chế CAS (Lua vs WATCH/MULTI); key shape Redis;
  TTL key call-state.
- Shape/tên cụ thể các message intent (vd `call-invite`) vs message state authoritative server đẩy về.
- Ngưỡng thời gian cụ thể của "disconnected kéo dài vài giây" trước ICE restart; đường cong backoff WS.
- Asset ringtone, chi tiết animation overlay reconnect, layout chính xác màn tóm tắt.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` (Phase 4 section) — goal + 5 success criteria + `Mode: mvp` + `Depends on: Phase 3`
- `.planning/REQUIREMENTS.md` — CALL-02..08, MEDIA-01, MEDIA-06, STAB-01, STAB-02

### Tech-stack decisions (locked)
- `CLAUDE.md` — Redis 7 + Lettuce (Boot default, KHÔNG Jedis/Redisson) cho shared state; `track.enabled` cho
  mute/cam (no renegotiation); peer manager là TS module ngoài Zustand (chỉ state serializable dẫn xuất);
  EC/NS qua `getUserMedia` constraints; perfect negotiation đã có từ Phase 3

### Carry-forward (Phase 3 — nền tảng trực tiếp)
- `.planning/phases/03-1-1-p2p-call-core-nat-traversal/03-CONTEXT.md` — D-01 (ranh giới Phase 3↔4: accept/
  reject/cancel "đơn giản" sẽ siết lại ở đây), D-02 (sealed envelope + perfect negotiation + candidate buffering)
- `.planning/phases/03-1-1-p2p-call-core-nat-traversal/03-SUMMARY.md` — cấu trúc PeerManager/callStore/CallPage đã dựng
- `.planning/phases/02-realtime-presence-websocket-layer/02-CONTEXT.md` — seam `MessageRouter.sendToUser`, server-owns-identity

### External (verify khi setup)
- MDN "Perfect negotiation" + ICE restart: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
- `RTCPeerConnection.restartIce()` / `connectionState` — MDN WebRTC API
- Redis CAS patterns: WATCH/MULTI/EXEC vs Lua `EVAL` (atomicity) — redis.io docs
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/.../ws/PresenceWebSocketHandler.java` — hiện relay opaque các Call* message; Phase 4 chèn
  state machine validate/CAS giữa nhận intent và `router.sendToUser` (hoặc tách `CallSignalingHandler`).
- `backend/.../ws/message/ClientMessage.java` + `ServerMessage.java` (sealed) — thêm record intent
  (vd `CallInvite`) + record state authoritative server đẩy về; relay mute/cam là message nhẹ riêng.
- `backend/.../ws/MessageRouter.java` `sendToUser` — local, dùng để đẩy state event tới đúng user (giữ local, Phase 6 mới Redis pub/sub).
- `backend/.../presence/PresenceStatus.java` — enum đã có `ONLINE, IN_CALL`; state machine cập nhật khi vào/rời cuộc.
- `frontend/src/store/callStore.ts` — FSM client hiện có (idle/outgoing/incoming/connecting/connected/
  reconnecting/failed); cần mở rộng: mute/cam state, end-reason, duration, và **render theo state server** (D-01).
- `frontend/src/webrtc/PeerManager.ts` — thêm `restartIce()`, replace-track-free mute (`track.enabled`), grace/reconnect hooks.
- `frontend/src/realtime/wsClient.ts` / `callActions.ts` / `messages.ts` — mở rộng dispatch + backoff reconnect + resync.
- `frontend/src/components/call/` (CallLayer, IncomingCallCard, CallButtons) + `pages/CallPage.tsx` — mở rộng cho ringtone, mute/cam UI, PiP, summary, reconnect overlay.

### Established Patterns
- Feature-package BE: thêm logic vào package `call/` (hiện có TurnController) — nơi đặt `CallStateMachine`/`CallService` + Redis repo.
- Module-level service ngoài React: PeerManager + wsClient là module TS, gọi vào Zustand cho state dẫn xuất.
- Server-owns-identity: caller/callee từ principal (`username` trong session attributes), KHÔNG tin body.

### Integration Points
- **Redis mới**: thêm dependency + docker-compose service + config connection (Lettuce). Đây là điểm hạ tầng lớn nhất phase.
- Signaling đi trên WS đã xác thực Phase 2; intent → state machine → state event broadcast; sdp/ice/mute-cam relay opaque.
- Single-instance: state machine + timer chạy in-process + Redis; KHÔNG cần pub/sub cross-instance (Phase 6).
</code_context>

<specifics>
## Specific Ideas

- Glare tất định bằng so sánh userId (lower wins) — ưu tiên reproduce được khi test hơn là "đúng timing".
- Bên thua glare nối liền thành 1 cuộc (auto-accept bên thắng) — không bắt người dùng gọi lại.
- Server là chủ mọi timer vòng đời (ring 30s, grace 15s) — client chỉ render, chống lệch trạng thái.
- Mute/cam là "ngoài lifecycle" → relay nhẹ, không ghi Redis state machine.
- Duration tính từ 'connected' để số liệu khớp với Call History (Phase 5).
- Grace 15s + cấu hình env để demo điều chỉnh được.
</specifics>

<deferred>
## Deferred Ideas

- Cross-instance routing (caller/callee khác instance) qua Redis pub/sub → **Phase 6** (SCAL-01/02).
- Lưu lịch sử cuộc gọi bền vững + badge nhỡ + RabbitMQ async → **Phase 5** (HIST-*).
- Migrate presence sang Redis TTL → **Phase 6** (Phase 4 chỉ wiring Redis cho call-state).
- Chọn camera/mic/loa, mid-call switch (replaceTrack) → **Phase 8** (MEDIA-03/04).
- Tunnel khác mạng (ngrok/cloudflared) — tùy chọn demo, không thuộc phase.

Không có scope creep — thảo luận giữ trong phạm vi phase.
</deferred>

---

*Phase: 04-call-lifecycle-in-call-experience*
*Context gathered: 2026-06-25*
