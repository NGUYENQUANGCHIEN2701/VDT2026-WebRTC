import { create } from 'zustand'
import type { MediaErrorType } from '../webrtc/media'
import type { EndReason } from '../realtime/messages'

// Vòng đời 1 cuộc gọi
export type CallState =
    | 'idle'         // không có cuộc gọi
    | 'outgoing'     // mình đang gọi đi, chờ bên kia
    | 'incoming'     // có người gọi tới, chờ mình Nhận/Từ chối
    | 'connecting'   // đã đồng ý, đang bắt tay WebRTC
    | 'connected'    // media đã thông
    | 'reconnecting' // rớt tạm, đang nối lại
    | 'failed'       // hỏng
    | 'ended'      // đã kết thúc (cả 2 bên đều rời)

export type MediaMode = 'video' | 'audio-only'   // khớp media.ts

interface CallStoreState {
    callState: CallState
    remoteUserId: string | null   // người mình đang gọi với (chỉ username — serializable)
    callId: string | null
    mediaMode: MediaMode | null
    mediaError: MediaErrorType | null
    endReason: EndReason | null

    setMediaError: (error: MediaErrorType | null) => void
    setCallState: (s: CallState) => void
    startOutgoing: (remoteUserId: string, callId: string) => void
    startIncoming: (remoteUserId: string, callId: string) => void
    setMediaMode: (m: MediaMode | null) => void
    endCall: (reason: EndReason) => void
    reset: () => void
}

export const useCallStore = create<CallStoreState>((set) => ({
    callState: 'idle',
    remoteUserId: null,
    callId: null,
    mediaMode: null,
    mediaError: null,
    endReason: null,

    setMediaError: (mediaError) => set({ mediaError }),
    setCallState: (callState) => set({ callState }),
    startOutgoing: (remoteUserId, callId) => set({ callState: 'outgoing', remoteUserId, callId }),
    startIncoming: (remoteUserId, callId) => set({ callState: 'incoming', remoteUserId, callId }),
    setMediaMode: (mediaMode) => set({ mediaMode }),
    endCall: (endReason) => set({ callState: 'ended', endReason }),
    reset: () => set({ callState: 'idle', remoteUserId: null, callId: null, mediaMode: null, mediaError: null, endReason: null }),
}))
