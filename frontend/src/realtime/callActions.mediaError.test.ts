// Regression tests — debug session cancel-call-permission-denied + UX follow-up
// (retry / continue-audio-only / delayed callee reject).
// Trước bugfix: startCall()/acceptCall() chỉ set mediaError rồi `return` trần khi
// getUserMedia bị reject — không hủy UI, không báo phía kia, không hiện lỗi ở mọi
// nơi. Sau bugfix + UX follow-up: startCall() giữ nguyên overlay 'outgoing' (không
// tự reset) để user có thể Thử lại / Tiếp tục với âm thanh / Hủy; acceptCall() trì
// hoãn call-reject để callee kịp đọc lý do lỗi trước khi IncomingCallCard biến mất.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendSignalMock = vi.fn()
vi.mock('./wsClient', () => ({
    sendSignal: (...args: unknown[]) => sendSignalMock(...args),
    setCallSignalHandler: vi.fn(),
}))

const acquireLocalMediaMock = vi.fn()
const acquireAudioOnlyMediaMock = vi.fn()
vi.mock('../webrtc/media', async () => {
    const actual = await vi.importActual<typeof import('../webrtc/media')>('../webrtc/media')
    return {
        ...actual,
        acquireLocalMedia: (...args: unknown[]) => acquireLocalMediaMock(...args),
        acquireAudioOnlyMedia: (...args: unknown[]) => acquireAudioOnlyMediaMock(...args),
    }
})

import { MediaAcquisitionError } from '../webrtc/media'
import { useCallStore } from '../store/callStore'
import { useToastStore } from '../store/toastStore'
import { startCall, acceptCall, retryOutgoingMedia, continueOutgoingAudioOnly, teardownMedia } from './callActions'

const fakeStream = { id: 's', getTracks: () => [] } as unknown as MediaStream

beforeEach(() => {
    sendSignalMock.mockReset()
    acquireLocalMediaMock.mockReset()
    acquireAudioOnlyMediaMock.mockReset()
    useCallStore.getState().reset()
    useToastStore.setState({ toasts: [] })
})
afterEach(() => {
    vi.unstubAllGlobals()
    teardownMedia()   // dọn localStream module-scope — không dọn thì test SAU bị getMedia() short-circuit
})

describe('startCall — getUserMedia bị NotAllowedError (permission-denied)', () => {
    it('KHÔNG gửi call-invite, GIỮ NGUYÊN overlay outgoing (để user Thử lại), và hiện toast báo lỗi', async () => {
        acquireLocalMediaMock.mockRejectedValueOnce(new MediaAcquisitionError('permission-denied'))

        await startCall('bob')

        // Không còn tự reset về idle nữa — giữ overlay để nút Thử lại/Tiếp tục âm thanh còn tác dụng
        expect(useCallStore.getState().callState).toBe('outgoing')
        expect(useCallStore.getState().remoteUserId).toBe('bob')
        expect(useCallStore.getState().mediaError).toBe('permission-denied')
        // call-invite chưa từng gửi thì không có gì để gửi cancel — đúng, không gửi signal nào
        expect(sendSignalMock).not.toHaveBeenCalled()
        // báo lỗi rõ ràng cho user
        expect(useToastStore.getState().toasts).toHaveLength(1)
        expect(useToastStore.getState().toasts[0].message).toMatch(/quyền truy cập camera\/mic/i)
    })
})

describe('acceptCall — getUserMedia bị NotAllowedError (permission-denied)', () => {
    it('trì hoãn call-reject ~1.75s (toast hiện ngay, signal gửi sau) để callee kịp đọc lý do', async () => {
        vi.useFakeTimers()
        try {
            useCallStore.getState().startIncoming('alice', 'call-123')
            acquireLocalMediaMock.mockRejectedValueOnce(new MediaAcquisitionError('permission-denied'))

            await acceptCall()

            // KHÔNG gửi call-accept
            expect(sendSignalMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'call-accept' }))
            // Toast hiện NGAY
            expect(useToastStore.getState().toasts).toHaveLength(1)
            expect(useToastStore.getState().toasts[0].message).toMatch(/quyền truy cập camera\/mic/i)
            // Nhưng call-reject CHƯA được gửi — đang trong lúc trì hoãn
            expect(sendSignalMock).not.toHaveBeenCalled()

            await vi.advanceTimersByTimeAsync(1750)

            // Sau khi hết trì hoãn, call-reject mới được gửi
            expect(sendSignalMock).toHaveBeenCalledWith({ type: 'call-reject', callId: 'call-123' })
        } finally {
            vi.useRealTimers()
        }
    })

    it('không làm gì khi chưa có callId (chưa vào cuộc)', async () => {
        await acceptCall()
        expect(acquireLocalMediaMock).not.toHaveBeenCalled()
        expect(sendSignalMock).not.toHaveBeenCalled()
    })
})

describe('retryOutgoingMedia — user bấm "Thử lại" sau khi startCall() lỗi', () => {
    it('retry thành công → mediaError về null, gửi call-invite', async () => {
        acquireLocalMediaMock.mockRejectedValueOnce(new MediaAcquisitionError('permission-denied'))
        await startCall('bob')
        sendSignalMock.mockReset()

        acquireLocalMediaMock.mockResolvedValueOnce({ stream: fakeStream, mode: 'video' })
        await retryOutgoingMedia()

        expect(useCallStore.getState().mediaError).toBeNull()
        expect(sendSignalMock).toHaveBeenCalledWith({ type: 'call-invite', to: 'bob' })
    })

    it('retry vẫn lỗi → không gửi call-invite, mediaError vẫn còn, toast mới hiện', async () => {
        acquireLocalMediaMock.mockRejectedValueOnce(new MediaAcquisitionError('permission-denied'))
        await startCall('bob')

        acquireLocalMediaMock.mockRejectedValueOnce(new MediaAcquisitionError('permission-denied'))
        await retryOutgoingMedia()

        expect(sendSignalMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'call-invite' }))
        expect(useCallStore.getState().mediaError).toBe('permission-denied')
        expect(useToastStore.getState().toasts.length).toBeGreaterThanOrEqual(2)
    })

    it('no-op khi store đang ở idle (không có cuộc gọi nào đang chờ)', async () => {
        await retryOutgoingMedia()
        expect(acquireLocalMediaMock).not.toHaveBeenCalled()
    })
})

describe('continueOutgoingAudioOnly — user bấm "Tiếp tục với âm thanh"', () => {
    it('dùng acquireAudioOnlyMedia() (KHÔNG phải acquireLocalMedia) → gửi call-invite ở chế độ audio-only', async () => {
        acquireLocalMediaMock.mockRejectedValueOnce(new MediaAcquisitionError('no-device'))
        await startCall('bob')

        acquireAudioOnlyMediaMock.mockResolvedValueOnce({ stream: fakeStream, mode: 'audio-only' })
        await continueOutgoingAudioOnly()

        expect(acquireAudioOnlyMediaMock).toHaveBeenCalledTimes(1)
        expect(acquireLocalMediaMock).toHaveBeenCalledTimes(1)   // chỉ gọi ở startCall(), không gọi lại ở continue
        expect(useCallStore.getState().mediaMode).toBe('audio-only')
        expect(useCallStore.getState().mediaError).toBeNull()
        expect(sendSignalMock).toHaveBeenCalledWith({ type: 'call-invite', to: 'bob' })
    })
})
