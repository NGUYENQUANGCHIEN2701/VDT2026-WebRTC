// frontend/src/realtime/wsClient.ts
import { useAuthStore } from '../store/authStore'
import { useCallStore } from '../store/callStore'
import { usePresenceStore } from '../store/presenceStore'
import type { PeerManager } from '../webrtc/PeerManager'
import type { ClientMessage, ServerMessage } from './messages'

const HEARTBEAT_MS = 25_000
const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

let socket: WebSocket | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let backoff = INITIAL_BACKOFF_MS
let kicked = false // bị đá (đăng nhập nơi khác) → cấm reconnect


let activePeer: PeerManager | null = null
export function setActivePeer(pm: PeerManager | null): void {
    activePeer = pm
}

// Gửi tín hiệu cuộc gọi qua WS (chỉ khi link mở) — PeerManager.sendSignal sẽ trỏ vào đây
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

    // VITE_WS_URL đã gồm /ws → chỉ gắn token
    const url = `${import.meta.env.VITE_WS_URL}?token=${encodeURIComponent(token)}`
    socket = new WebSocket(url)

    socket.onopen = () => {
        backoff = INITIAL_BACKOFF_MS // nối lại thành công → reset backoff
        usePresenceStore.getState().setConnState?.('open')
        startHeartbeat()
    }

    socket.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(e.data) as ServerMessage
        const presence = usePresenceStore.getState()
        const call = useCallStore.getState()

        switch (msg.type) {
            // ── presence (như cũ) ──
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

            // ── cuộc gọi: chỉ dispatch trên tên *-received ──
            case 'call-offer-received':
                call.startIncoming(msg.from, msg.callId) // hiện IncomingCallCard
                break
            case 'call-accept-received':
                call.setCallState('connecting') // đối phương đã Nhận → bắt tay WebRTC
                break
            case 'call-reject-received':
            case 'call-cancel-received':
            case 'hang-up-received':
                activePeer?.close()
                setActivePeer(null)
                call.reset() // về Home
                break
            case 'sdp-received':
                activePeer?.handleSignalingMessage({ sdp: msg.sdp }) // đưa vào PeerManager
                break
            case 'ice-candidate-received':
                activePeer?.handleSignalingMessage({ candidate: msg.candidate })
                break
        }
    }

    socket.onclose = () => {
        stopHeartbeat()
        usePresenceStore.getState().setConnState?.('closed')
        if (kicked) return // bị đá thì thôi
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
        socket.onclose = null // gỡ handler → close chủ động KHÔNG kích hoạt reconnect
        socket.close()
        socket = null
    }
    backoff = INITIAL_BACKOFF_MS
    kicked = false
}

function scheduleReconnect(): void {
    // jitter chống "reconnect storm" khi server restart làm cả ngàn client nhảy vào cùng lúc
    const delay = Math.min(backoff, MAX_BACKOFF_MS) + Math.random() * 1_000
    reconnectTimer = setTimeout(() => {
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS) // gấp đôi, chặn trần 30s
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
