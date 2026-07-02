// Regression test — debug session cancel-call-permission-denied (group-call flow).
// Trước khi fix: doCreateMesh() chỉ `return` trần khi ensureLocalMedia() hỏng — server
// đã coi client này là thành viên phòng ('room-joined' đã về) nhưng initRoom() (chỗ
// duy nhất clear incomingInvite/outgoingInvitees) không bao giờ chạy → GroupInviteModal /
// OutgoingGroupInviteCard treo tới khi timer 30s riêng của modal tự bắn, và server
// vẫn giữ client như "ghost member" suốt thời gian đó (không có leave-room nào được gửi).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomServerSignal } from './messages'

const sendSignalMock = vi.fn()
// vi.mock() bị hoist lên trên MỌI import (kể cả `import './roomActions'` bên dưới,
// thứ trigger setRoomSignalHandler() ngay lúc module-load) — phải dùng vi.hoisted()
// để biến giữ handler tồn tại TRƯỚC khi factory mock chạy, tránh TDZ ReferenceError.
const { roomHandlerRef } = vi.hoisted(() => ({
    roomHandlerRef: { current: null as ((msg: RoomServerSignal) => void) | null },
}))
vi.mock('./wsClient', () => ({
    sendSignal: (...args: unknown[]) => sendSignalMock(...args),
    setRoomSignalHandler: (h: (msg: RoomServerSignal) => void) => { roomHandlerRef.current = h },
}))

const acquireLocalMediaMock = vi.fn()
vi.mock('../webrtc/media', async () => {
    const actual = await vi.importActual<typeof import('../webrtc/media')>('../webrtc/media')
    return {
        ...actual,
        acquireLocalMedia: (...args: unknown[]) => acquireLocalMediaMock(...args),
    }
})

import { MediaAcquisitionError } from '../webrtc/media'
import { useAuthStore } from '../store/authStore'
import { useRoomStore } from '../store/roomStore'
import { useToastStore } from '../store/toastStore'
import './roomActions'

function flushMicrotasks() {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
    sendSignalMock.mockReset()
    acquireLocalMediaMock.mockReset()
    useRoomStore.getState().reset()
    useToastStore.setState({ toasts: [] })
    useAuthStore.getState().setAuth('token', { username: 'me', role: 'USER' })
})
afterEach(() => vi.unstubAllGlobals())

describe('room-joined → doCreateMesh — getUserMedia bị NotAllowedError (permission-denied)', () => {
    it('gửi leave-room cho server và dọn sạch UI room-invite ngay (không chờ timer 30s)', async () => {
        expect(roomHandlerRef.current).not.toBeNull()
        // Mô phỏng client vừa Accept 1 lời mời nhóm — incomingInvite đang hiện.
        useRoomStore.getState().setIncomingInvite({ roomId: 'room-1', from: 'alice', invitees: ['me', 'carol'] })
        acquireLocalMediaMock.mockRejectedValueOnce(new MediaAcquisitionError('permission-denied'))

        roomHandlerRef.current?.({ type: 'room-joined', roomId: 'room-1', members: ['alice', 'carol'] })
        await flushMicrotasks()
        await flushMicrotasks()

        // Server phải được báo rời phòng NGAY — không để lại ghost membership
        expect(sendSignalMock).toHaveBeenCalledWith({ type: 'leave-room', roomId: 'room-1' })
        // UI room-invite phải được dọn ngay, không chờ GroupInviteModal's 30s auto-reject timer
        expect(useRoomStore.getState().incomingInvite).toBeNull()
        expect(useRoomStore.getState().roomId).toBeNull()
        // Lỗi phải hiện rõ ràng cho user
        expect(useToastStore.getState().toasts.length).toBeGreaterThan(0)
    })
})
