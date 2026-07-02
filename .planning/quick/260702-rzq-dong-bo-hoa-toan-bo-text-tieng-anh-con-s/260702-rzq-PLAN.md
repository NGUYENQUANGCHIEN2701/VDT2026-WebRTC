---
phase: quick-260702-rzq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/realtime/callActions.ts
  - frontend/src/realtime/roomActions.ts
  - frontend/src/realtime/callActions.recordingError.test.ts
  - frontend/src/realtime/roomActions.recordingError.test.ts
  - frontend/src/webrtc/recording.ts
  - frontend/src/components/call/RecordingPreviewModal.tsx
  - frontend/src/components/call/RecordingPreviewModal.logic.test.ts
  - frontend/src/pages/CallPage.tsx
  - frontend/src/pages/GroupCallPage.tsx
  - frontend/src/components/call/CallButtons.tsx
  - frontend/src/components/call/MorePanel.tsx
  - frontend/src/components/call/ParticipantTile.tsx
  - frontend/src/routes/ProtectedRoute.tsx
  - frontend/src/pages/HomePage.tsx
  - frontend/src/pages/HistoryPage.tsx
  - frontend/src/components/admin/AdminUserTable.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/pages/RegisterPage.tsx
  - frontend/src/pages/ForgotPasswordPage.tsx
  - frontend/src/pages/VerifyEmailPage.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Toàn bộ toast lỗi chia sẻ màn hình và chuyển thiết bị (10 message riêng trong callActions.ts, 12 message tương ứng + 1 message riêng 'Someone else is already sharing' trong roomActions.ts) hiển thị hoàn toàn bằng tiếng Việt tự nhiên, khớp văn phong MEDIA_ERROR_COPY (media.ts)."
    - "Khi MediaRecorder bắn onerror giữa lúc đang ghi hình, user thấy toast lỗi tiếng Việt NGAY (trước đây recordingError được set trong store nhưng KHÔNG BAO GIỜ hiển thị ở đâu cả) — có test Vitest xác nhận toast xuất hiện đúng 1 lần với đúng message, rồi recordingError tự về null."
    - "RecordingPreviewModal hiển thị đúng độ phân giải thực tế (720p — lấy từ HEIGHT export của recording.ts, nguồn sự thật duy nhất) thay vì nhãn sai '1080p (HD)', và hiển thị đúng THỜI ĐIỂM DỪNG ghi hình thực tế (recordedAt chốt 1 lần trong stopRecording(), không phải new Date() gọi lúc render modal)."
    - "HUD pill 'Đang chia sẻ màn hình' / '{user} đang chia sẻ' / 'Đang ghi hình {elapsed}' / '{user} đang ghi hình' và tooltip nút Share khi trình duyệt không hỗ trợ, đều hiển thị tiếng Việt trên cả CallPage (1-1) và GroupCallPage (nhóm); heading GroupCallPage đổi từ 'Video Call' sang 'Cuộc gọi nhóm' (không đụng brand logo AppChrome/trang auth)."
    - "Toàn bộ label UI lẻ còn sót (nút 'Đang bắt đầu...', dropdown thiết bị mặc định, badge chia sẻ màn hình, màn hình Đang tải, kicker trang chủ/lịch sử, header bảng admin, label form đăng nhập/đăng ký/quên mật khẩu/xác minh email) đã là tiếng Việt — TRỪ các mục loại trừ có chủ đích (brand logo 'Video Call', chữ 'OTP', option value ADMIN/USER, aria-label không tiện sửa cùng dòng)."
    - "`cd frontend && npx vitest run`, `npx tsc -b --noEmit`, `npx eslint .` đều chạy sạch — không phát sinh lỗi/warning mới nào ngoài lỗi react-hooks/set-state-in-effect đã biết trước ở AppChrome.tsx (không thuộc phạm vi task này)."
  artifacts:
    - "frontend/src/realtime/callActions.ts, roomActions.ts — toàn bộ toast tiếng Việt + subscribe() mới hiện toast cho recordingError rồi tự clear"
    - "frontend/src/realtime/callActions.recordingError.test.ts, roomActions.recordingError.test.ts — test mới cho hành vi subscribe() trên"
    - "frontend/src/webrtc/recording.ts — default label 'Bạn'/'Người kia', message onError tiếng Việt, export WIDTH + HEIGHT"
    - "frontend/src/components/call/RecordingPreviewModal.tsx — prop recordedAt mới thay cho new Date(), formatResolutionLabel() dùng HEIGHT export thay '1080p' hardcode sai, cả 2 hàm được export để test"
    - "frontend/src/components/call/RecordingPreviewModal.logic.test.ts — test mới cho formatDate/formatResolutionLabel"
    - "frontend/src/pages/CallPage.tsx, GroupCallPage.tsx — toàn bộ i18n còn sót + wiring recordedAt (chốt 1 lần Date.now() dùng chung cho downloadName và recordedAt)"
    - "frontend/src/components/call/CallButtons.tsx, MorePanel.tsx, ParticipantTile.tsx, frontend/src/routes/ProtectedRoute.tsx, frontend/src/pages/HomePage.tsx, HistoryPage.tsx, frontend/src/components/admin/AdminUserTable.tsx — i18n label lẻ"
    - "frontend/src/pages/LoginPage.tsx, RegisterPage.tsx, ForgotPasswordPage.tsx, VerifyEmailPage.tsx — i18n label field form (trừ OTP, trừ brand logo)"
  key_links:
    - "RecordingController.onError (recording.ts) → CallPage/GroupCallPage's call.setRecordingError(msg)/room.setRecordingError(msg) → useCallStore.subscribe()/useRoomStore.subscribe() MỚI trong callActions.ts/roomActions.ts → useToastStore.show() → setRecordingError(null) — thiếu 1 khâu, hoặc thiếu guard `state.recordingError !== prevState.recordingError`, sẽ khiến toast im lặng như cũ HOẶC lặp vô hạn (set → notify → set → notify...)."
    - "CallPage/GroupCallPage.stopRecording(): CHỈ 1 lần `Date.now()` — dùng chung cho downloadName VÀ recordedAt state — rồi truyền xuống RecordingPreviewModal qua prop recordedAt → formatDate(new Date(recordedAt)). Nếu tính Date.now() 2 lần riêng biệt (1 cho downloadName, 1 cho recordedAt) thì không sai chức năng nhưng phá vỡ đúng yêu cầu bug report 'chốt lại thành 1 giá trị cố định'."
    - "RecordingPreviewModal.formatResolutionLabel() ← import HEIGHT từ recording.ts (không hardcode số). Nếu tương lai WIDTH/HEIGHT trong recording.ts đổi mà modal vẫn hardcode con số cũ, bug '1080p sai' sẽ tái diễn y hệt — export/import trực tiếp loại bỏ hoàn toàn nguồn lệch (drift) này."
    - "Working tree HIỆN ĐANG có thay đổi CHƯA COMMIT ở đúng 5 trong 20 file của plan này (CallPage.tsx, GroupCallPage.tsx, roomActions.ts, recording.ts, recording.test.ts) — từ 2 phiên debug khác (remote-video-black-on-connect, participant-bar-screen-share, cả 2 đang ở trạng thái awaiting_human_verify). Task này SỬA TIẾP trên đúng nội dung hiện tại của các file đó (đã đọc qua Read tool, phản ánh trong action bên dưới) — không phải xung đột, không được revert/stash."
---

<objective>
Đồng bộ hóa toàn bộ 34 chuỗi text tiếng Anh còn sót trong `frontend/src` sang tiếng Việt tự nhiên (đã audit đầy đủ qua Explore agent, khớp văn phong `MEDIA_ERROR_COPY` trong `media.ts`), đồng thời sửa 3 bug thật liên quan tính năng ghi hình cuộc gọi:

1. `RecordingPreviewModal.tsx` hiển thị sai nhãn độ phân giải "1080p (HD)" trong khi canvas ghi hình thực tế là 1280×720 (720p).
2. "Ngày ghi" trong modal đọc `new Date()` tại thời điểm RENDER modal, không phải thời điểm thực sự DỪNG ghi hình.
3. `recordingError` trong `callStore`/`roomStore` được set khi `MediaRecorder.onerror` bắn, nhưng chưa bao giờ được hiển thị cho user ở bất kỳ đâu.

Purpose: Ứng dụng đang trộn tiếng Việt và tiếng Anh không nhất quán ở các luồng lỗi/label UI phụ (không phải luồng core 1-1 P2P call) — gây trải nghiệm thiếu chuyên nghiệp; đồng thời modal xem lại bản ghi đưa thông tin sai (độ phân giải, ngày giờ) và một loại lỗi ghi hình runtime bị "nuốt" hoàn toàn không ai biết.

Output: Toàn bộ text tiếng Anh còn sót (trừ các mục loại trừ có chủ đích) đã thành tiếng Việt; RecordingPreviewModal hiển thị đúng độ phân giải + đúng thời điểm ghi; recordingError hiển thị toast rồi tự clear; test Vitest mới phủ đủ 3 hành vi; `vitest run` + `tsc -b --noEmit` + `eslint .` sạch.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@frontend/src/webrtc/media.ts
@frontend/src/webrtc/recording.ts
@frontend/src/store/callStore.ts
@frontend/src/store/roomStore.ts
@frontend/src/realtime/callActions.mediaError.test.ts
</context>

<constraints_critical>
**Working tree có nhiều thay đổi CHƯA COMMIT từ các phiên làm việc KHÁC** (đã kiểm tra qua `git status`/`git log` trước khi lập plan này):

- `.planning/ROADMAP.md`, `frontend/src/api/axios.ts`, `frontend/src/webrtc/PeerManager.ts` — KHÔNG liên quan tới task này, KHÔNG được chạm vào.
- `.planning/debug/*.md`, `.planning/phases/10-*/`, `.planning/quick/260702-lva-*/`, `.planning/quick/260702-nqb-*/`, `frontend/src/realtime/roomActions.mediaError.test.ts` — untracked, KHÔNG liên quan, KHÔNG được chạm vào.
- **5 file sau ĐÃ có thay đổi chưa commit (từ 2 phiên debug "remote-video-black-on-connect" và "participant-bar-screen-share", cả 2 đang `awaiting_human_verify`) VÀ CŨNG nằm trong `files_modified` của plan này: `frontend/src/pages/CallPage.tsx`, `frontend/src/pages/GroupCallPage.tsx`, `frontend/src/realtime/roomActions.ts`, `frontend/src/webrtc/recording.ts`, `frontend/src/webrtc/recording.test.ts`.** Mọi mô tả `<action>` bên dưới đã được viết dựa trên NỘI DUNG HIỆN TẠI của các file này (đọc trực tiếp qua Read tool, không phải bản đã commit gần nhất) — sửa tiếp trên nội dung hiện tại là ĐÚNG Ý, KHÔNG phải xung đột, TUYỆT ĐỐI KHÔNG revert/stash/checkout các file này để "làm sạch" trước khi sửa.
- Vì git không tách được hunk theo dòng khi stage (không dùng `-i`), commit của plan này SẼ gộp luôn nội dung debug chưa commit của 5 file trên — đây là đánh đổi được chấp nhận, không phải lỗi cần sửa.

**Khi commit:** stage ĐÍCH DANH từng file bằng `git add <path>` — KHÔNG dùng `git add -A` / `git add .`. Chỉ stage đúng 20 file trong `files_modified` ở frontmatter. Commit message dùng conventional commit mô tả rõ nội dung thật (vd `i18n(frontend): dong bo tieng Viet cho text con sot + fix 3 bug recording preview`) — KHÔNG dùng format `docs(quick-...)` mặc định của GSD, KHÔNG thêm dòng `Co-Authored-By: Claude` (quy ước riêng của repo này).
</constraints_critical>

<tasks>

<task type="auto">
  <name>Task 1: i18n toast NHÓM 1 (callActions.ts + roomActions.ts) + hiện toast cho recordingError</name>
  <files>frontend/src/realtime/callActions.ts, frontend/src/realtime/roomActions.ts, frontend/src/realtime/callActions.recordingError.test.ts, frontend/src/realtime/roomActions.recordingError.test.ts</files>
  <action>
    **frontend/src/realtime/callActions.ts** — dịch nguyên văn từng message trong `reportMediaControlError(...)` sang tiếng Việt tự nhiên (giữ đúng vị trí interpolation nếu có), KHÔNG đổi logic nhánh nào:
    - `'Screen sharing is unavailable in this browser.'` (dùng lại y hệt cho cả 2 nơi: `startScreenShare` guard và title tooltip ở Task 4/5) → `'Trình duyệt này không hỗ trợ chia sẻ màn hình.'`
    - `'Screen sharing is unavailable — call not connected.'` → `'Không thể chia sẻ màn hình — cuộc gọi chưa kết nối.'`
    - `'Screen sharing was not allowed. Try Share screen again and choose a window or screen.'` → `'Bạn chưa cho phép chia sẻ màn hình. Hãy bấm Chia sẻ màn hình lại và chọn một cửa sổ hoặc màn hình.'`
    - `'Could not start screen sharing. Try another window or screen.'` → `'Không thể bắt đầu chia sẻ màn hình. Hãy thử một cửa sổ hoặc màn hình khác.'`
    - `'Screen sharing failed.'` (xuất hiện 4 lần trong file — cùng 1 message, dùng `replace_all`) → `'Chia sẻ màn hình thất bại.'`
    - `'Could not restore camera after screen share stopped.'` → `'Không thể khôi phục camera sau khi dừng chia sẻ màn hình.'`
    - `'Selected device is unavailable. Your current device is still active.'` (2 lần, `replace_all`) → `'Thiết bị bạn chọn hiện không khả dụng. Thiết bị hiện tại vẫn đang hoạt động.'`
    - `'That device is busy. Your current device is still active.'` (2 lần, `replace_all`) → `'Thiết bị đó đang bận. Thiết bị hiện tại vẫn đang hoạt động.'`
    - `'Permission denied for the selected device.'` (2 lần, `replace_all`) → `'Quyền truy cập thiết bị bạn chọn đã bị từ chối.'`
    - `'Could not switch camera. Your current device is still active.'` (trong `switchCamera`) → `'Không thể chuyển camera. Camera hiện tại vẫn đang hoạt động.'`
    - `'Could not switch microphone. Your current device is still active.'` (trong `switchMicrophone`) → `'Không thể chuyển microphone. Microphone hiện tại vẫn đang hoạt động.'`

    Sau khi dịch xong, thêm subscription mới ở CUỐI file, ngay dưới dòng `setCallSignalHandler(handleServerSignal)`: gọi `useCallStore.subscribe((state, prevState) => {...})` — bên trong, nếu `state.recordingError` khác rỗng VÀ khác `prevState.recordingError` thì gọi `useToastStore.getState().show(state.recordingError, 'warning')` rồi ngay sau đó `useCallStore.getState().setRecordingError(null)` để tự clear (tránh hiện lại toast cũ khi state đổi vì lý do khác về sau). Thêm 1 dòng comment tiếng Việt ngắn phía trên giải thích đây là bugfix cho recordingError trước đây không bao giờ hiển thị. Không cần import gì thêm — `useCallStore` và `useToastStore` đã import sẵn ở đầu file.

    **frontend/src/realtime/roomActions.ts** — dịch giống hệt các message tương ứng trong `reportRoomMediaControlError(...)` (cùng nội dung tiếng Anh, dùng lại đúng bản dịch tiếng Việt ở trên cho từng message trùng), CỘNG THÊM message riêng của file này:
    - `'Someone else is already sharing their screen.'` (trong `startRoomScreenShare`, guard client-side pre-check) → `'Đã có người khác đang chia sẻ màn hình.'`

    Thêm subscription tương tự Task 1 nhưng cho `useRoomStore`, đặt ngay dưới dòng `setRoomSignalHandler(handleRoomSignal)` ở cuối file: cùng logic show-toast-rồi-clear, dùng `useRoomStore.subscribe(...)` + `useRoomStore.getState().setRecordingError(null)`.

    **frontend/src/realtime/callActions.recordingError.test.ts** (file mới, theo đúng style `callActions.mediaError.test.ts`): import `useCallStore`, `useToastStore`, và side-effect-import `'./callActions'` để đăng ký subscription. `beforeEach`: `useCallStore.getState().reset()` + `useToastStore.setState({ toasts: [] })`. 3 test: (1) gọi `setRecordingError('Đã dừng ghi hình do gặp lỗi.')` → `useToastStore.getState().toasts` có đúng 1 phần tử với đúng message đó, và `useCallStore.getState().recordingError` về lại `null` ngay sau đó; (2) gọi `setRecordingError(null)` khi đang null sẵn (no-op case) → không có toast nào được thêm; (3) sau khi test (1) chạy xong (recordingError đã về null), gọi lại `setRecordingError(...)` với CÙNG message lần nữa → toast THỨ HAI xuất hiện (chứng minh subscription không bị "kẹt" sau lần clear đầu).

    **frontend/src/realtime/roomActions.recordingError.test.ts** (file mới): cấu trúc y hệt file trên nhưng dùng `useRoomStore`, side-effect-import `'./roomActions'`. Lưu ý: import `'./roomActions'` sẽ chạy `setRoomSignalHandler(...)` ngay khi module load — không cần mock `wsClient` cho riêng test này vì không có action nào trong 3 test case gọi `sendSignal`, nhưng để an toàn khi import module (tránh lỗi runtime nếu `wsClient` có side-effect khác), tham khảo cách mock `./wsClient` đã có trong `roomActions.mediaError.test.ts` nếu cần.
  </action>
  <verify>
    <automated>cd frontend && npx vitest run src/realtime/callActions.recordingError.test.ts src/realtime/roomActions.recordingError.test.ts src/realtime/callActions.mediaError.test.ts src/realtime/roomActions.mediaError.test.ts && npx tsc -b --noEmit</automated>
  </verify>
  <done>Toàn bộ 10+12 message toast trong callActions.ts/roomActions.ts là tiếng Việt (không còn chuỗi tiếng Anh nào khớp danh sách trên); recordingError giờ hiện toast rồi tự clear, có test Vitest xanh xác nhận; test mediaError cũ vẫn xanh (không bị phá).</done>
</task>

<task type="auto">
  <name>Task 2: i18n + export hằng số trong recording.ts</name>
  <files>frontend/src/webrtc/recording.ts</files>
  <action>
    Trong `RecordingController` constructor: đổi default `this.localLabel = options.localLabel ?? 'You'` → `?? 'Bạn'`; đổi default `this.remoteLabel = options.remoteLabel ?? 'Remote'` → `?? 'Người kia'`.

    Trong `start(...)`, đổi fallback label khi có nhiều remote mà không truyền `remoteLabels`: `` `Remote ${i + 1}` `` → `` `Người kia ${i + 1}` ``.

    Trong `recorder.onerror` handler, đổi message truyền cho `this.onError?.(...)`: `'Recording stopped due to an error.'` → `'Đã dừng ghi hình do gặp lỗi.'`.

    Đổi 2 hằng số module-scope từ private sang export (không đổi giá trị, không đổi tên): `const WIDTH = 1280` → `export const WIDTH = 1280`; `const HEIGHT = 720` → `export const HEIGHT = 720`. Đây là nguồn sự thật duy nhất cho độ phân giải canvas ghi hình thực tế — `RecordingPreviewModal.tsx` (Task 3) sẽ import `HEIGHT` từ đây thay vì hardcode số sai.
  </action>
  <verify>
    <automated>cd frontend && npx vitest run src/webrtc/recording.test.ts && npx tsc -b --noEmit</automated>
  </verify>
  <done>Default label + message onError là tiếng Việt; WIDTH/HEIGHT được export; recording.test.ts hiện có (không assert vào các chuỗi vừa đổi) vẫn xanh nguyên vẹn.</done>
</task>

<task type="auto">
  <name>Task 3: RecordingPreviewModal.tsx — fix bug (a) nhãn độ phân giải sai + bug (b) recordedAt thật</name>
  <files>frontend/src/components/call/RecordingPreviewModal.tsx, frontend/src/components/call/RecordingPreviewModal.logic.test.ts</files>
  <action>
    Thêm import `HEIGHT` từ `'../../webrtc/recording'` (không import gì khác từ đó — không cần `WIDTH`).

    Thêm field mới `recordedAt: number` vào interface `RecordingPreviewModalProps`, đặt cạnh `durationMs` để giữ nhóm các field số liệu cùng nhau.

    Đổi `function formatDate(date: Date): string {...}` (hiện đang là hàm nội bộ không export) thành `export function formatDate(...)` — giữ nguyên toàn bộ logic bên trong, chỉ thêm từ khóa `export`.

    Thêm hàm mới `export function formatResolutionLabel(mimeType: string): string` đặt ngay sau `formatDate`, trả về đúng chuỗi hiện có nhưng dùng `HEIGHT` thay vì số hardcode: `` `${mimeType.includes("mp4") ? "MP4" : "WebM"} • ${HEIGHT}p (HD)` ``.

    Trong component, sửa 2 chỗ dùng sai:
    1. Card "Ngày ghi" hiện gọi `formatDate(new Date())` — đổi thành `formatDate(new Date(recordedAt))`, lấy `recordedAt` từ props (destructure thêm `recordedAt` trong tham số hàm component, cạnh `durationMs`).
    2. Card "Định dạng" hiện inline `` {mimeType.includes("mp4") ? "MP4" : "WebM"} • 1080p (HD)} `` (nhãn sai "1080p") — đổi thành gọi `{formatResolutionLabel(mimeType)}`.

    Không đổi `formatDuration` (không liên quan tới 2 bug này, giữ nguyên không export).

    **frontend/src/components/call/RecordingPreviewModal.logic.test.ts** (file mới, pure-logic test — theo đúng style `recording.test.ts`, KHÔNG dùng React Testing Library vì repo chưa có dependency đó, chỉ import các hàm thuần từ file component, không render JSX):
    - Import `formatDate`, `formatResolutionLabel` từ `'./RecordingPreviewModal'`, và `HEIGHT` từ `'../../webrtc/recording'` (để assert `HEIGHT === 720` làm rõ nguồn sự thật).
    - Test `formatDate`: dựng `new Date(2025, 0, 15, 14, 30)` (local time constructor — tránh phụ thuộc timezone của máy chạy test), assert kết quả đúng bằng `'15/01/2025 • 2:30 PM'` (khớp thuật toán hiện có: giờ 14 → PM, 14%12=2). Test riêng thứ 2 dùng giờ buổi sáng vd `new Date(2025, 5, 3, 9, 5)` → assert `'03/06/2025 • 9:05 AM'`, xác nhận hàm là pure function của tham số truyền vào (không phụ thuộc đồng hồ hệ thống tại thời điểm test chạy).
    - Test `formatResolutionLabel`: `formatResolutionLabel('video/webm;codecs=vp9,opus')` → `` `WebM • ${HEIGHT}p (HD)` `` (tức `'WebM • 720p (HD)'`); `formatResolutionLabel('video/mp4')` → `` `MP4 • ${HEIGHT}p (HD)` ``. Thêm 1 assertion phủ định rõ ràng: kết quả KHÔNG chứa chuỗi `'1080p'`.
  </action>
  <verify>
    <automated>cd frontend && npx vitest run src/components/call/RecordingPreviewModal.logic.test.ts && npx tsc -b --noEmit</automated>
  </verify>
  <done>formatDate nhận tham số Date thay vì tự gọi new Date(); formatResolutionLabel dùng HEIGHT export thay vì hardcode sai; cả 2 hàm export và có test Vitest xanh; component vẫn render đúng (không đổi cấu trúc JSX ngoài 2 chỗ nêu trên).</done>
</task>

<task type="auto">
  <name>Task 4: CallPage.tsx — i18n còn sót + wiring recordedAt</name>
  <files>frontend/src/pages/CallPage.tsx</files>
  <action>
    **i18n:**
    - `const remoteLabel = remoteUserId ?? "Remote"` → `remoteUserId ?? "Người kia"`.
    - `localLabel: "You"` (trong `new RecordingController({...})`) → `localLabel: "Bạn"`.
    - HUD pill share: `` isScreenSharing ? 'Sharing screen' : `${remoteUserId} is sharing` `` → `` 'Đang chia sẻ màn hình' : `${remoteUserId} đang chia sẻ` ``.
    - HUD pill recording: `` Recording {formatElapsed(recordingStartedAt || recordingNow)} `` → `` Đang ghi hình {formatElapsed(recordingStartedAt || recordingNow)} `` (chỉ đổi chữ "Recording", giữ nguyên biểu thức `{...}`).
    - HUD pill remote-recording: `` {remoteUserId} is recording `` → `` {remoteUserId} đang ghi hình ``.
    - Title tooltip nút Share: `title={!canScreenShare() ? 'Screen sharing is unavailable in this browser.' : undefined}` → dùng đúng bản dịch đã chốt ở Task 1: `'Trình duyệt này không hỗ trợ chia sẻ màn hình.'`.
    - Toast trong `startRecording()`: `'Recording is not ready yet.'` → `'Chưa sẵn sàng để ghi hình.'`.
    - Toast trong `stopRecording()` (nhánh `else`): `'No recording data was captured.'` → `'Không ghi được dữ liệu nào.'`.

    **Wiring bug (b) — recordedAt thật:**
    Thêm field `recordedAt: number` vào type của state `recordingPreview` (khai báo `useState<{ url: string; mimeType: string; durationMs: number; downloadName: string } | null>`, thêm `recordedAt: number` vào object type, đặt cạnh `durationMs`).

    Trong `stopRecording()`, nhánh `if (result)`: hiện đang tính `const downloadName = \`call-${remoteUserId ?? "recording"}-${Date.now()}.webm\``. Đổi thành 2 dòng: `const recordedAt = Date.now()` (đúng vị trí "chốt 1 lần" trong event handler, giữ nguyên comment tiếng Việt hiện có phía trên về react-hooks/purity) rồi `const downloadName = \`call-${remoteUserId ?? "recording"}-${recordedAt}.webm\`` (tái dùng biến `recordedAt` thay vì gọi `Date.now()` lần 2). Thêm `recordedAt` vào object truyền cho `setRecordingPreview({...})`.

    Trong JSX render `<RecordingPreviewModal ... />`, thêm prop `recordedAt={recordingPreview?.recordedAt ?? 0}` (theo đúng pattern fallback `?? 0` đã dùng cho `durationMs` ngay phía trên).
  </action>
  <verify>
    <automated>cd frontend && npx tsc -b --noEmit && npx eslint src/pages/CallPage.tsx</automated>
  </verify>
  <done>Không còn chuỗi tiếng Anh nào trong danh sách trên ở CallPage.tsx; recordingPreview state có recordedAt chốt cùng lúc với downloadName (1 lần Date.now() duy nhất); RecordingPreviewModal nhận đủ prop recordedAt; tsc + eslint sạch trên file này.</done>
</task>

<task type="auto">
  <name>Task 5: GroupCallPage.tsx — i18n còn sót + heading + wiring recordedAt</name>
  <files>frontend/src/pages/GroupCallPage.tsx</files>
  <action>
    **i18n:**
    - `localLabel: "You"` (trong `new RecordingController({...})`) → `localLabel: "Bạn"`.
    - `<h2>Video Call</h2>` (header top-left, KHÁC với brand logo AppChrome.tsx/trang auth — đây là tiêu đề trang gọi nhóm) → `<h2>Cuộc gọi nhóm</h2>` (đối xứng với CallPage.tsx's `<h2>Cuộc gọi 1-1</h2>`).
    - HUD pill share: `` activeSharer === selfId ? 'Sharing screen' : `${activeSharer} is sharing` `` → `` 'Đang chia sẻ màn hình' : `${activeSharer} đang chia sẻ` ``.
    - HUD pill recording: `` Recording {formatDuration(recordingStartedAt || recordingNow)} `` → `` Đang ghi hình {formatDuration(recordingStartedAt || recordingNow)} ``.
    - Title tooltip nút Share: `title={!canRoomScreenShare() ? 'Screen sharing is unavailable in this browser.' : undefined}` → `'Trình duyệt này không hỗ trợ chia sẻ màn hình.'` (khớp bản dịch Task 1).
    - Toast trong `startRecording()`: `'Recording is not ready yet.'` → `'Chưa sẵn sàng để ghi hình.'`.
    - Toast trong `stopRecording()` (nhánh `else`): `'No recording data was captured.'` → `'Không ghi được dữ liệu nào.'`.

    **Wiring bug (b) — recordedAt thật** (giống hệt pattern Task 4, áp dụng cho biến room-scope):
    Thêm field `recordedAt: number` vào type của state `recordingPreview`.

    Trong `stopRecording()`, nhánh `if (result)`: hiện tính `const downloadName = \`group-call-${roomId ?? "recording"}-${Date.now()}.webm\``. Đổi thành `const recordedAt = Date.now()` rồi `const downloadName = \`group-call-${roomId ?? "recording"}-${recordedAt}.webm\`` (tái dùng biến, giữ nguyên comment react-hooks/purity hiện có). Thêm `recordedAt` vào object truyền cho `setRecordingPreview({...})`.

    Trong JSX render `<RecordingPreviewModal ... />`, thêm prop `recordedAt={recordingPreview?.recordedAt ?? 0}`.
  </action>
  <verify>
    <automated>cd frontend && npx tsc -b --noEmit && npx eslint src/pages/GroupCallPage.tsx</automated>
  </verify>
  <done>Không còn chuỗi tiếng Anh nào trong danh sách trên ở GroupCallPage.tsx; heading đổi thành "Cuộc gọi nhóm"; recordingPreview state có recordedAt chốt cùng Date.now() với downloadName; RecordingPreviewModal nhận đủ prop recordedAt; tsc + eslint sạch trên file này.</done>
</task>

<task type="auto">
  <name>Task 6: Label UI lẻ còn sót — call controls + admin</name>
  <files>frontend/src/components/call/CallButtons.tsx, frontend/src/components/call/MorePanel.tsx, frontend/src/components/call/ParticipantTile.tsx, frontend/src/routes/ProtectedRoute.tsx, frontend/src/pages/HomePage.tsx, frontend/src/pages/HistoryPage.tsx, frontend/src/components/admin/AdminUserTable.tsx</files>
  <action>
    **CallButtons.tsx:** trong `LabeledShareButton` và `LabeledMoreButton`, đổi cả 2 chỗ `loading ? "Starting..." : ...` — phần `"Starting..."` → `"Đang bắt đầu..."` (giữ nguyên phần `: "Chia sẻ"` / `: "Thêm"` không đổi).

    **MorePanel.tsx:** đổi 3 option mặc định trong 3 thẻ `<select>`: `<option value="">Default camera</option>` → `<option value="">Camera mặc định</option>`; `<option value="">Default microphone</option>` → `<option value="">Microphone mặc định</option>`; `<option value="">Default speaker</option>` → `<option value="">Speaker mặc định</option>`. KHÔNG đổi tham số fallback thứ 2 trong các lệnh gọi `labelFor(device, "Camera", index)` / `labelFor(device, "Microphone", index)` / `labelFor(device, "Speaker", index)` — các danh từ "Camera"/"Microphone"/"Speaker" đã là từ mượn được dùng nhất quán xuyên suốt chính file này (các heading `<h3>` liền kề, ghi chú "Microphone sẽ giữ trạng thái tắt.") nên giữ nguyên, chỉ dịch phần "Default" (discretion — không có quyết định CONTEXT.md nào chi phối mục này).

    **ParticipantTile.tsx:** badge chia sẻ màn hình — đổi text hiển thị `<MonitorUp size={14} /> Screen` → `<MonitorUp size={14} /> Chia sẻ` (giữ icon). Cùng lúc (tiện tay sửa cùng dòng, theo đúng ngoại lệ cho aria-label) đổi `aria-label={\`${username} is sharing screen\`}` → `aria-label={\`${username} đang chia sẻ màn hình\`}`.

    **ProtectedRoute.tsx:** `if (isLoading) { return <div>Loading...</div> }` → `<div>Đang tải...</div>` (khớp pattern "Đang tải..." đã dùng ở HistoryPage.tsx).

    **HomePage.tsx:** kicker `<span className="app-kicker" ...>WELCOME</span>` → nội dung text đổi thành `Chào mừng` (giữ nguyên style `textTransform: 'uppercase'` inline — CSS tự viết hoa khi hiển thị, không cần gõ hoa sẵn trong source).

    **HistoryPage.tsx:** kicker `<span className="app-kicker" ...>Call records</span>` → `Lịch sử` (KHÔNG dùng lại đúng câu "Lịch sử cuộc gọi" của `<h1>` ngay bên dưới để tránh lặp lại y hệt 2 dòng liền nhau).

    **AdminUserTable.tsx:** trong `<thead>`, đổi `<th>Username</th>` → `<th>Tên đăng nhập</th>` và `<th>Role</th>` → `<th>Vai trò</th>`. GIỮ NGUYÊN `<th>Email</th>` (discretion — từ mượn đã chấp nhận, ngắn gọn phù hợp cột bảng, xem lý do đầy đủ ở Task 7) và GIỮ NGUYÊN `<th>ID</th>`, `<th>Trạng thái</th>`, `<th>Hành động</th>` (đã đúng/không cần đổi). KHÔNG đụng tới `<option value="USER">USER</option>` / `<option value="ADMIN">ADMIN</option>` trong cùng file (mã enum khớp backend, thuộc danh sách loại trừ).
  </action>
  <verify>
    <automated>cd frontend && npx tsc -b --noEmit && npx eslint src/components/call/CallButtons.tsx src/components/call/MorePanel.tsx src/components/call/ParticipantTile.tsx src/routes/ProtectedRoute.tsx src/pages/HomePage.tsx src/pages/HistoryPage.tsx src/components/admin/AdminUserTable.tsx</automated>
  </verify>
  <done>Không còn "Starting...", "Default camera/microphone/speaker" (phần Default), "Screen" badge text, "Loading...", "WELCOME", "Call records", "Username"/"Role" header tiếng Anh trong 7 file trên; option value ADMIN/USER và Email header giữ nguyên như đã ghi rõ; tsc + eslint sạch.</done>
</task>

<task type="auto">
  <name>Task 7: Label field form trang auth (Login/Register/ForgotPassword/VerifyEmail)</name>
  <files>frontend/src/pages/LoginPage.tsx, frontend/src/pages/RegisterPage.tsx, frontend/src/pages/ForgotPasswordPage.tsx, frontend/src/pages/VerifyEmailPage.tsx</files>
  <action>
    Dịch CHỈ phần label field (`<span>...</span>` ngay trong `<label className="auth-field">`) — KHÔNG đụng `placeholder`, KHÔNG đụng field "OTP" (loại trừ tường minh), KHÔNG đụng brand logo (`<Link className="auth-brand" ... aria-label="Video Call">...Video <strong>Call</strong>...</Link>` — giữ nguyên y hệt ở cả 4 file).

    Với "Email": dịch thành `"Địa chỉ email"` (thay vì để nguyên "Email" hoặc dịch nghĩa đen "Thư điện tử" — không tự nhiên trong UI hiện đại) — khác với quyết định ở Task 6 cho header BẢNG admin (ngữ cảnh khác: label FORM có đủ chỗ cho cụm từ dài hơn, còn header bảng cần ngắn gọn).

    - **LoginPage.tsx:** `<span>Username</span>` → `<span>Tên đăng nhập</span>`; `<span>Password</span>` → `<span>Mật khẩu</span>`.
    - **RegisterPage.tsx:** `<span>Username</span>` → `<span>Tên đăng nhập</span>`; `<span>Email</span>` → `<span>Địa chỉ email</span>`; `<span>Password</span>` → `<span>Mật khẩu</span>` (KHÔNG đụng `<span>Xác nhận mật khẩu</span>` — đã là tiếng Việt sẵn).
    - **ForgotPasswordPage.tsx:** `<span>Email</span>` → `<span>Địa chỉ email</span>`.
    - **VerifyEmailPage.tsx:** `<span>Email</span>` → `<span>Địa chỉ email</span>`. GIỮ NGUYÊN `<span>OTP</span>` (loại trừ tường minh theo audit).
  </action>
  <verify>
    <automated>cd frontend && npx tsc -b --noEmit && npx eslint src/pages/LoginPage.tsx src/pages/RegisterPage.tsx src/pages/ForgotPasswordPage.tsx src/pages/VerifyEmailPage.tsx</automated>
  </verify>
  <done>Field label "Username"/"Password"/"Email" đã là tiếng Việt ở đúng 4 file; "OTP" và brand logo "Video Call" giữ nguyên; placeholder không bị đụng; tsc + eslint sạch.</done>
</task>

<task type="auto">
  <name>Task 8: Full-suite gate + quét lại toàn bộ danh sách 34 chuỗi</name>
  <files></files>
  <action>
    Chạy đầy đủ 3 lệnh gate theo đúng yêu cầu constraint của task này: `cd frontend && npx vitest run`, `npx tsc -b --noEmit`, `npx eslint .`. Cả 3 phải sạch — KHÔNG có test fail, KHÔNG có type error, KHÔNG có lint error/warning MỚI. Lỗi lint pre-existing `set-state-in-effect` ở `frontend/src/components/AppChrome.tsx` được PHÉP còn nguyên (không thuộc phạm vi task này) — xác nhận qua `npx eslint . 2>&1` rằng tổng số lỗi/warning KHÔNG tăng so với trước khi bắt đầu task này (chỉ còn đúng lỗi AppChrome.tsx đã biết, nếu có).

    Quét lại toàn bộ 19 file nguồn đã sửa (không tính 3 file test mới) để xác nhận không còn sót chuỗi tiếng Anh nào trong danh sách gốc: grep các cụm khóa đại diện — `"Sharing screen"`, `"is sharing"`, `"is recording"`, `"Starting..."`, `"Default camera"`, `"Default microphone"`, `"Default speaker"`, `">Screen<"`, `"Loading..."`, `"WELCOME"`, `"Call records"`, `">Username<"`, `">Role<"`, `">Password<"`, `"1080p"` — trên toàn bộ `frontend/src` (loại trừ `node_modules`, `.git`). Mỗi cụm phải trả về ĐÚNG 0 kết quả (trừ khi cụm đó nằm trong 1 comment giải thích lịch sử bugfix, không phải trong JSX/string literal đang hiển thị cho user — kiểm tra thủ công nếu grep báo có kết quả).
  </action>
  <verify>
    <automated>cd frontend && npx vitest run && npx tsc -b --noEmit && npx eslint .</automated>
  </verify>
  <done>3 lệnh gate đều xanh/sạch; grep sweep toàn bộ danh sách 34 chuỗi trả về 0 kết quả ngoài phạm vi loại trừ đã ghi rõ trong plan.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Zustand store → toast subscriber (client-only, Task 1) | `useCallStore.subscribe()`/`useRoomStore.subscribe()` mới phản ứng với thay đổi state cục bộ, hoàn toàn phía client — không có input mạng hay input user nào băng qua ranh giới này. |
| Text tĩnh do developer viết | Toàn bộ chuỗi dịch là text tĩnh, không nội suy dữ liệu user ngoài các placeholder đã tồn tại từ trước (username, thời gian đã định dạng) — không có input mới được đưa vào chuỗi hiển thị. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-260702-rzq-01 | Denial of Service | `useCallStore.subscribe()` / `useRoomStore.subscribe()` (Task 1) — reactive toast handler có thể tự gọi lại `setState` bên trong listener | medium | mitigate | Guard `state.recordingError !== prevState.recordingError` trước khi gọi `setRecordingError(null)` chặn vòng lặp notify vô hạn (set → notify → set → notify...); test Vitest mới khẳng định đúng 1 toast/lần set, giá trị về `null` ngay sau đó, không treo. |
| T-quick-260702-rzq-02 | Information Disclosure | Toast lỗi ghi hình/chia sẻ màn hình đã dịch | low | accept | Chuỗi tiếng Việt truyền tải đúng lượng thông tin như bản tiếng Anh cũ (không thêm stack trace, device ID nội bộ, hay chi tiết kỹ thuật mới) — mức rủi ro không đổi so với trước task này. |
| T-quick-260702-rzq-03 | Tampering | Toàn bộ thay đổi trong plan này | low | accept | Không có endpoint mới, không có package mới cài đặt, không có đường input user mới nào được parse khác đi — phạm vi chỉ gồm dịch chuỗi tĩnh, thêm 1 prop số liệu (`recordedAt`), export 2 hằng số có sẵn, và 1 subscription store nội bộ. |
</threat_model>

<verification>
- `cd frontend && npx vitest run` — toàn bộ suite xanh, bao gồm 3 file test mới (`callActions.recordingError.test.ts`, `roomActions.recordingError.test.ts`, `RecordingPreviewModal.logic.test.ts`) và các file test cũ không bị phá.
- `cd frontend && npx tsc -b --noEmit` — sạch.
- `cd frontend && npx eslint .` — sạch, không tăng số lỗi/warning so với trước (chỉ còn lỗi `set-state-in-effect` pre-existing ở `AppChrome.tsx` nếu có, không thuộc phạm vi task này).
- Grep sweep (Task 8) trả về 0 kết quả cho toàn bộ 34 chuỗi gốc trong danh sách audit, ngoại trừ các mục loại trừ tường minh: brand logo "Video Call" (AppChrome.tsx + 5 trang auth), "OTP" (VerifyEmailPage.tsx), option value "ADMIN"/"USER" (AdminUserTable.tsx, AdminFilterBar.tsx), aria-label không tiện sửa, và "Email" ở header bảng AdminUserTable.tsx (discretion, xem Task 6/7).
- Smoke thủ công (khuyến nghị, không bắt buộc để hoàn tất task): mở 1 cuộc gọi 1-1, bấm Ghi hình → dừng → xem RecordingPreviewModal hiển thị "720p (HD)" và đúng giờ vừa dừng (không phải giờ mở modal); ngắt kết nối mạng đột ngột lúc đang ghi để trigger MediaRecorder lỗi (nếu tái hiện được) → thấy toast lỗi tiếng Việt xuất hiện.
- `git status` sau commit: các file KHÔNG thuộc `files_modified` (axios.ts, PeerManager.ts, ROADMAP.md, debug/*.md, phases/10-*/, quick/260702-lva-*/, quick/260702-nqb-*/, roomActions.mediaError.test.ts) vẫn ở nguyên trạng thái modified/untracked trước đó — không bị stage nhầm.
</verification>

<success_criteria>
- Toàn bộ 34 chuỗi tiếng Anh trong audit gốc đã chuyển sang tiếng Việt tự nhiên, khớp văn phong hiện có — trừ đúng các mục loại trừ có chủ đích đã liệt kê.
- RecordingPreviewModal hiển thị đúng độ phân giải thực (720p, lấy từ nguồn sự thật duy nhất là `HEIGHT` export trong recording.ts) và đúng thời điểm dừng ghi hình thực tế (không còn `new Date()` gọi lúc render).
- `recordingError` giờ luôn được hiển thị cho user dưới dạng toast, rồi tự clear — không còn bị "nuốt" âm thầm.
- Không giới thiệu abstraction/dependency mới (không cài React Testing Library, không tạo component mới ngoài phạm vi 3 bug đã nêu); mọi test mới theo đúng style pure-logic hiện có trong repo.
- `vitest run` + `tsc -b --noEmit` + `eslint .` sạch; không phát sinh lỗi mới ngoài lỗi pre-existing đã biết.
- Commit chỉ chứa đúng 20 file của plan này (dù 5 trong số đó đã mang sẵn nội dung debug chưa commit từ phiên khác — chấp nhận đánh đổi này, không phải lỗi).
</success_criteria>

<output>
Tạo `.planning/quick/260702-rzq-dong-bo-hoa-toan-bo-text-tieng-anh-con-s/260702-rzq-SUMMARY.md` khi hoàn tất.
</output>
