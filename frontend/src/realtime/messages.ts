export type PresenceStatus = 'ONLINE' | 'IN_CALL'
export interface OnlineUser {
    username: string
    status: PresenceStatus
}

// trạng thái lifecycle do SERVER sở hữu (khác CallState client trong callStore)
export type ServerCallState = 'ringing' | 'active' | 'ended'
export type EndReason = 'completed' | 'rejected' | 'cancelled' | 'missed' | 'busy' | 'dropped'

// ── SERVER → client ──
export type CallStateChanged = {
    type: 'call-state-changed'
    callId: string
    state: ServerCallState
    reason: EndReason | null      // null khi chưa kết thúc
    callerId: string
    calleeId: string
}

export type CallServerSignal =
    | CallStateChanged
    | { type: 'sdp-received'; from: string; callId: string; sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate-received'; from: string; callId: string; candidate: RTCIceCandidateInit }
    | { type: 'media-state-relay'; from: string; micMuted: boolean; camOff: boolean }

export type ServerMessage =
    | { type: 'presence'; users: OnlineUser[] }
    | { type: 'session-superseded'; reason: string }
    | { type: 'pong' }
    | CallServerSignal

// ── client → server (INTENT — tên trần) ──
export type ClientMessage =
    | { type: 'ping' }
    | { type: 'call-invite'; to: string }          // server tự sinh callId
    | { type: 'call-accept'; callId: string }
    | { type: 'call-reject'; callId: string }
    | { type: 'call-cancel'; callId: string }
    | { type: 'hang-up'; callId: string }
    | { type: 'sdp'; to: string; callId: string; sdp: RTCSessionDescription | null }
    | { type: 'ice-candidate'; to: string; callId: string; candidate: RTCIceCandidateInit }
    | { type: 'media-state'; to: string; micMuted: boolean; camOff: boolean }