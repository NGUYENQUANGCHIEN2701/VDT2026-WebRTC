// frontend/src/realtime/wsClient.ts
import { useAuthStore } from '../store/authStore'
import { usePresenceStore } from '../store/presenceStore'
import type { CallServerSignal, ClientMessage, RoomServerSignal, ServerMessage } from './messages'

const HEARTBEAT_MS = 25_000
const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

let socket: WebSocket | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let backoff = INITIAL_BACKOFF_MS
let kicked = false

let callSignalHandler: ((msg: CallServerSignal) => void) | null = null
export function setCallSignalHandler(h: (msg: CallServerSignal) => void): void {
    callSignalHandler = h
}

let roomSignalHandler: ((msg: RoomServerSignal | CallServerSignal) => void) | null = null
export function setRoomSignalHandler(h: (msg: RoomServerSignal | CallServerSignal) => void): void {
    roomSignalHandler = h
}

export function sendSignal(msg: ClientMessage): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg))
    }
}

export function connectWs(): void {
    const token = useAuthStore.getState().token
    if (!token) return

    kicked = false
    usePresenceStore.getState().setKicked(false)
    usePresenceStore.getState().setConnState?.('connecting')

    const url = `${import.meta.env.VITE_WS_URL}?token=${encodeURIComponent(token)}`
    socket = new WebSocket(url)

    socket.onopen = () => {
        backoff = INITIAL_BACKOFF_MS
        usePresenceStore.getState().setConnState?.('open')
        startHeartbeat()
    }

    socket.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(e.data) as ServerMessage
        const presence = usePresenceStore.getState()
        switch (msg.type) {
            case 'presence':
                presence.setOnline(msg.users)
                break
            case 'session-superseded':
                kicked = true
                presence.setKicked(true)
                disconnectWs()
                break
            case 'pong':
                break
            case 'room-invite':
            case 'room-joined':
            case 'participant-joined':
            case 'participant-left':
            case 'room-invite-cancelled':
            case 'room-invite-declined':
            case 'room-full':
                roomSignalHandler?.(msg)
                break
            case 'media-state-relay':
            case 'sdp-received':
            case 'ice-candidate-received':
                callSignalHandler?.(msg)
                roomSignalHandler?.(msg)
                break
            case 'recording-state-relay':
                callSignalHandler?.(msg)
                break
            default:
                callSignalHandler?.(msg)
                break
        }
    }

    socket.onclose = () => {
        stopHeartbeat()
        usePresenceStore.getState().setConnState?.('closed')
        if (kicked) return
        scheduleReconnect()
    }
}

export function disconnectWs(): void {
    stopHeartbeat()
    if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
    }
    if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
    }
    backoff = INITIAL_BACKOFF_MS
    kicked = false
}

function scheduleReconnect(): void {
    const delay = Math.min(backoff, MAX_BACKOFF_MS) + Math.random() * 1_000
    reconnectTimer = setTimeout(() => {
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        connectWs()
    }, delay)
}

function startHeartbeat(): void {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }))
        }
    }, HEARTBEAT_MS)
}

function stopHeartbeat(): void {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
    }
}
