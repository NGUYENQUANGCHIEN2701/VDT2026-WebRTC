export type PresenceStatus = 'ONLINE' | 'IN_CALL' | 'OFFLINE'
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
    | { type: 'media-state-relay'; from: string; micMuted: boolean; camOff: boolean; isScreenSharing: boolean }
    | { type: 'recording-state-relay'; from: string; callId: string; recording: boolean }

export type RoomServerSignal =
    | { type: 'room-invite'; roomId: string; from: string; invitees: string[] }
    | { type: 'room-invite-cancelled'; roomId: string }
    | { type: 'room-joined'; roomId: string; members: string[] }
    | { type: 'participant-joined'; roomId: string; username: string }
    | { type: 'participant-left'; roomId: string; username: string }
    | { type: 'room-invite-declined'; roomId: string; username: string }
    | { type: 'room-full'; roomId: string; reason: string }

export type ServerMessage =
    | { type: 'presence'; users: OnlineUser[] }
    | { type: 'session-superseded'; reason: string }
    | { type: 'pong' }
    | CallServerSignal
    | RoomServerSignal

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
    | { type: 'media-state'; to: string; micMuted: boolean; camOff: boolean; isScreenSharing: boolean }
    | { type: 'recording-state'; to: string; callId: string; recording: boolean }
    | { type: 'group-invite'; to: string[] }
    | { type: 'cancel-group-invite'; to: string[] }
    | { type: 'join-room'; roomId: string }
    | { type: 'leave-room'; roomId: string }
    | { type: 'decline-room-invite'; roomId: string }
