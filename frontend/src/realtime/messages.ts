export type PresenceStatus = 'ONLINE' | 'IN_CALL'
export interface OnlineUser {
    username: string;
    status: PresenceStatus;
}

// Server → client
export type ServerMessage =
    | { type: 'presence'; users: OnlineUser[] }
    | { type: 'session-superseded'; reason: string }
    | { type: 'pong' }

// Client → server
export type ClientMessage = { type: 'ping' }