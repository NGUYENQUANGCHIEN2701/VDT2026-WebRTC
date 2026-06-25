import { create } from 'zustand'

// Vòng đời 1 cuộc gọi
export type CallState =
    | 'idle'         // không có cuộc gọi
    | 'outgoing'     // mình đang gọi đi, chờ bên kia
    | 'incoming'     // có người gọi tới, chờ mình Nhận/Từ chối
    | 'connecting'   // đã đồng ý, đang bắt tay WebRTC
    | 'connected'    // media đã thông
    | 'reconnecting' // rớt tạm, đang nối lại
    | 'failed'       // hỏng

export type MediaMode = 'video' | 'audio-only'   // khớp media.ts

interface CallStoreState {
    callState: CallState
    remoteUserId: string | null   // người mình đang gọi với (chỉ username — serializable)
    callId: string | null
    mediaMode: MediaMode | null

    setCallState: (s: CallState) => void
    startOutgoing: (remoteUserId: string, callId: string) => void
    startIncoming: (remoteUserId: string, callId: string) => void
    setMediaMode: (m: MediaMode | null) => void
    reset: () => void
}

export const useCallStore = create<CallStoreState>((set) => ({
    callState: 'idle',
    remoteUserId: null,
    callId: null,
    mediaMode: null,

    setCallState: (callState) => set({ callState }),
    startOutgoing: (remoteUserId, callId) => set({ callState: 'outgoing', remoteUserId, callId }),
    startIncoming: (remoteUserId, callId) => set({ callState: 'incoming', remoteUserId, callId }),
    setMediaMode: (mediaMode) => set({ mediaMode }),
    reset: () => set({ callState: 'idle', remoteUserId: null, callId: null, mediaMode: null }),
}))
