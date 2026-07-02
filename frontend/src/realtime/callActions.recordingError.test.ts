// Regression test — i18n sweep (quick task 260702-rzq).
// Trước bugfix: recordingError được set trong callStore khi MediaRecorder.onerror
// bắn (xem RecordingController.recorder.onerror trong webrtc/recording.ts) nhưng
// KHÔNG có nơi nào lắng nghe/hiển thị nó — user không biết vì sao ghi hình dừng.
// Sau bugfix: callActions.ts đăng ký useCallStore.subscribe() hiện toast rồi tự
// clear lại recordingError về null.
import { beforeEach, describe, expect, it } from 'vitest'
import { useCallStore } from '../store/callStore'
import { useToastStore } from '../store/toastStore'
import './callActions'   // side-effect import — đăng ký subscription

beforeEach(() => {
    useCallStore.getState().reset()
    useToastStore.setState({ toasts: [] })
})

describe('callActions — recordingError toast subscription', () => {
    it('hiện toast đúng 1 lần rồi tự clear recordingError về null', () => {
        useCallStore.getState().setRecordingError('Đã dừng ghi hình do gặp lỗi.')

        expect(useToastStore.getState().toasts).toHaveLength(1)
        expect(useToastStore.getState().toasts[0].message).toBe('Đã dừng ghi hình do gặp lỗi.')
        expect(useCallStore.getState().recordingError).toBeNull()
    })

    it('không làm gì khi setRecordingError(null) (đã null sẵn)', () => {
        useCallStore.getState().setRecordingError(null)
        expect(useToastStore.getState().toasts).toHaveLength(0)
    })

    it('lần lỗi SAU vẫn hiện toast mới (subscription không bị "kẹt" sau lần clear đầu)', () => {
        useCallStore.getState().setRecordingError('Đã dừng ghi hình do gặp lỗi.')
        expect(useToastStore.getState().toasts).toHaveLength(1)

        useCallStore.getState().setRecordingError('Đã dừng ghi hình do gặp lỗi.')
        expect(useToastStore.getState().toasts).toHaveLength(2)
        expect(useCallStore.getState().recordingError).toBeNull()
    })
})
