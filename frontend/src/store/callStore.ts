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
    connectedAt: number | null   // mốc media thông (ms) — bắt đầu đếm thời lượng
    durationMs: number | null    // chốt khi kết thúc, dùng cho CallSummaryScreen (mục 8)
    micMuted: boolean
    camOff: boolean
    setMicMuted: (b: boolean) => void
    setCamOff: (b: boolean) => void
    remoteMicMuted: boolean
    remoteCamOff: boolean
    setRemoteMicMuted: (b: boolean) => void
    setRemoteCamOff: (b: boolean) => void
    remoteStreamVersion: number   // bump mỗi khi remote track tới → CallPage gắn lại srcObject
    bumpRemoteStream: () => void
    isScreenSharing: boolean
    localStreamVersion: number
    selectedCameraDeviceId: string | null
    selectedMicrophoneDeviceId: string | null
    selectedSpeakerDeviceId: string | null
    isRecording: boolean
    recordingStartedAt: number | null
    remoteRecording: boolean
    recordingError: string | null
    hasRecordingPreview: boolean
    setIsScreenSharing: (v: boolean) => void
    bumpLocalStream: () => void
    setSelectedCameraDeviceId: (id: string | null) => void
    setSelectedMicrophoneDeviceId: (id: string | null) => void
    setSelectedSpeakerDeviceId: (id: string | null) => void
    setIsRecording: (v: boolean) => void
    setRecordingStartedAt: (ts: number | null) => void
    setRemoteRecording: (v: boolean) => void
    setRecordingError: (msg: string | null) => void
    setHasRecordingPreview: (v: boolean) => void

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
    connectedAt: null,
    durationMs: null,
    micMuted: false,
    camOff: false,
    setMicMuted: (micMuted) => set({ micMuted }),
    setCamOff: (camOff) => set({ camOff }),

    remoteMicMuted: false,
    remoteCamOff: false,
    setRemoteMicMuted: (remoteMicMuted) => set({ remoteMicMuted }),
    setRemoteCamOff: (remoteCamOff) => set({ remoteCamOff }),
    remoteStreamVersion: 0,
    bumpRemoteStream: () => set((s) => ({ remoteStreamVersion: s.remoteStreamVersion + 1 })),
    isScreenSharing: false,
    localStreamVersion: 0,
    selectedCameraDeviceId: null,
    selectedMicrophoneDeviceId: null,
    selectedSpeakerDeviceId: null,
    isRecording: false,
    recordingStartedAt: null,
    remoteRecording: false,
    recordingError: null,
    hasRecordingPreview: false,
    setIsScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
    bumpLocalStream: () => set((s) => ({ localStreamVersion: s.localStreamVersion + 1 })),
    setSelectedCameraDeviceId: (selectedCameraDeviceId) => set({ selectedCameraDeviceId }),
    setSelectedMicrophoneDeviceId: (selectedMicrophoneDeviceId) => set({ selectedMicrophoneDeviceId }),
    setSelectedSpeakerDeviceId: (selectedSpeakerDeviceId) => set({ selectedSpeakerDeviceId }),
    setIsRecording: (isRecording) => set({ isRecording }),
    setRecordingStartedAt: (recordingStartedAt) => set({ recordingStartedAt }),
    setRemoteRecording: (remoteRecording) => set({ remoteRecording }),
    setRecordingError: (recordingError) => set({ recordingError }),
    setHasRecordingPreview: (hasRecordingPreview) => set({ hasRecordingPreview }),
    setMediaError: (mediaError) => set({ mediaError }),
    // Lần ĐẦU vào 'connected' thì chốt mốc đếm giờ; lần sau (reconnecting→connected) giữ nguyên
    setCallState: (callState) =>
        set((s) =>
            callState === 'connected' && s.connectedAt == null
                ? { callState, connectedAt: Date.now() }
                : { callState }
        ),
    startOutgoing: (remoteUserId, callId) => set({ callState: 'outgoing', remoteUserId, callId }),
    startIncoming: (remoteUserId, callId) => set({ callState: 'incoming', remoteUserId, callId }),
    setMediaMode: (mediaMode) => set({ mediaMode }),
    // Kết thúc: chốt thời lượng (0 nếu chưa từng 'connected', vd missed/rejected)
    endCall: (endReason) =>
        set((s) => ({
            callState: 'ended',
            endReason,
            durationMs: s.connectedAt != null ? Date.now() - s.connectedAt : 0,
        })),

    reset: () => set({ callState: 'idle', remoteUserId: null, callId: null, mediaMode: null, mediaError: null, endReason: null, connectedAt: null, durationMs: null, micMuted: false, camOff: false, remoteMicMuted: false, remoteCamOff: false, remoteStreamVersion: 0, isScreenSharing: false, localStreamVersion: 0, selectedCameraDeviceId: null, selectedMicrophoneDeviceId: null, selectedSpeakerDeviceId: null, isRecording: false, recordingStartedAt: null, remoteRecording: false, recordingError: null, hasRecordingPreview: false }),
}))
