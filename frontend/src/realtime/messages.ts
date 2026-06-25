export type PresenceStatus = 'ONLINE' | 'IN_CALL'
export interface OnlineUser {
    username: string
    status: PresenceStatus
}

// ── Tín hiệu cuộc gọi: SERVER → client (tên *-received, khớp @JsonSubTypes của BE) ──
export type CallServerSignal =
    | { type: 'call-offer-received'; from: string; callId: string }
    | { type: 'call-accept-received'; from: string; callId: string }
    | { type: 'call-reject-received'; from: string; callId: string }
    | { type: 'call-cancel-received'; from: string; callId: string }
    | { type: 'hang-up-received'; from: string; callId: string }
    | { type: 'sdp-received'; from: string; callId: string; sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate-received'; from: string; callId: string; candidate: RTCIceCandidateInit }

// Server → client (gộp presence cũ + call)
export type ServerMessage =
    | { type: 'presence'; users: OnlineUser[] }
    | { type: 'session-superseded'; reason: string }
    | { type: 'pong' }
    | CallServerSignal

// ── Client → server (tên TRẦN) ──
export type ClientMessage =
    | { type: 'ping' }
    | { type: 'call-offer'; to: string; callId: string }
    | { type: 'call-accept'; to: string; callId: string }
    | { type: 'call-reject'; to: string; callId: string }
    | { type: 'call-cancel'; to: string; callId: string }
    | { type: 'hang-up'; to: string; callId: string }
    | { type: 'sdp'; to: string; callId: string; sdp: RTCSessionDescription | null }
    | { type: 'ice-candidate'; to: string; callId: string; candidate: RTCIceCandidateInit }
