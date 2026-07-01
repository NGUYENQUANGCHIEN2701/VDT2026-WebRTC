# Deferred Items — quick 260702-677

## 1. `tsc -b` đỏ do recording.test.ts (việc khác, chưa commit)

- **Phát hiện khi:** chạy verify Task 2 (`npm run build`).
- **Triệu chứng:** 3 lỗi TS2339 `Property 'refreshRemoteStream' does not exist...` tại `frontend/src/webrtc/recording.test.ts` dòng 549/567/574.
- **Nguyên nhân:** recording.test.ts có 135 dòng thêm CHƯA COMMIT từ phiên làm việc khác (đang giữa chừng TDD — test tham chiếu API `refreshRemoteStream` chưa có trong mock type). Không liên quan tới task 260702-677 (task này không đụng recording.ts/recording.test.ts theo constraint).
- **Trạng thái:** KHÔNG sửa (ngoài scope, file thuộc việc đang dở của phiên khác). Vitest runtime vẫn xanh 61/61; `npx vite build` bundle sạch. Chỉ gate type-check `tsc -b` đỏ.
- **Việc cần làm:** phiên làm việc kia hoàn thành implement `refreshRemoteStream` (hoặc commit trạng thái GREEN) thì `npm run build` tự xanh lại.
