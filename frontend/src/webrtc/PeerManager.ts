// Lõi WebRTC: bọc RTCPeerConnection theo "perfect negotiation" (MDN) + đệm ICE candidate.
// Đây là MODULE TS thường — RTCPeerConnection/MediaStream sống Ở ĐÂY, KHÔNG vào Zustand.
import { useCallStore, type CallState } from '../store/callStore'

// Tín hiệu gửi ra ngoài (wsClient sẽ bơm vào WS). Tên TRẦN: sdp / ice-candidate.
export type OutboundSignal =
    | { type: 'sdp'; sdp: RTCSessionDescription | null }
    | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }

// Tín hiệu nhận vào (wsClient lấy từ sdp-received / ice-candidate-received đưa vào đây)
export interface InboundSignal {
    sdp?: RTCSessionDescriptionInit
    candidate?: RTCIceCandidateInit
}

type PeerCallbacks = {
    onConnectionStateChange?: (state: CallState) => void
    canInitiateOffer?: boolean
}

export class PeerManager {
    private pc: RTCPeerConnection
    private readonly polite: boolean
    private readonly sendSignal: (s: OutboundSignal) => void
    private readonly callbacks?: PeerCallbacks

    // Cờ perfect negotiation (giải thích bên dưới)
    private makingOffer = false
    private ignoreOffer = false
    private isSettingRemoteAnswerPending = false

    // Đệm ICE candidate đến SỚM (trước khi có remoteDescription)
    private pendingCandidates: RTCIceCandidateInit[] = []
    private signalingQueue: Promise<void> = Promise.resolve()
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null
    private restartAttempts = 0

    // Stream của ĐỐI PHƯƠNG — giữ ở đây (không vào store); UI lấy qua onRemoteStream
    remoteStream: MediaStream | null = null
    onRemoteStream?: (stream: MediaStream) => void

    constructor(
        iceServers: RTCIceServer[],
        polite: boolean,
        sendSignal: (s: OutboundSignal) => void,
        iceTransportPolicy?: RTCIceTransportPolicy, // 'relay' → ép đi qua TURN (forced-relay)
        callbacks?: PeerCallbacks,
    ) {
        this.polite = polite
        this.sendSignal = sendSignal
        this.callbacks = callbacks
        this.pc = new RTCPeerConnection({ iceServers, iceTransportPolicy })
        this.setupHandlers()
    }

    /** Gắn camera/mic của mình vào kết nối → kích hoạt onnegotiationneeded. */
    addLocalStream(stream: MediaStream) {
        for (const track of stream.getTracks()) {
            this.pc.addTrack(track, stream)
        }
    }

    /** Xử lý tín hiệu nhận từ đối phương (sdp hoặc ice-candidate). */
    handleSignalingMessage(msg: InboundSignal): Promise<void> {
        const next = this.signalingQueue.then(() => this.processSignalingMessage(msg))
        this.signalingQueue = next.catch(() => { })
        return next
    }

    private async processSignalingMessage(msg: InboundSignal) {
        if (msg.sdp) {
            // Có sẵn sàng nhận offer không? (đang ở 'stable' hoặc đang chờ set answer)
            const readyForOffer =
                !this.makingOffer &&
                (this.pc.signalingState === 'stable' || this.isSettingRemoteAnswerPending)
            const offerCollision = msg.sdp.type === 'offer' && !readyForOffer

            // Va chạm + mình "impolite" → phớt lờ offer của đối phương
            this.ignoreOffer = !this.polite && offerCollision
            if (this.ignoreOffer) return

            this.isSettingRemoteAnswerPending = msg.sdp.type === 'answer'
            try {
                await this.pc.setRemoteDescription(msg.sdp) // polite + va chạm → tự rollback
            } finally {
                this.isSettingRemoteAnswerPending = false
            }

            // Đã có remoteDescription → xả hết candidate đã đệm
            for (const c of this.pendingCandidates) {
                await this.pc.addIceCandidate(c).catch(() => { })
            }
            this.pendingCandidates = []

            // Nếu vừa nhận offer → tạo answer và gửi lại
            if (msg.sdp.type === 'offer') {
                await this.pc.setLocalDescription()
                this.sendSignal({ type: 'sdp', sdp: this.pc.localDescription })
            }
        } else if (msg.candidate) {
            if (this.pc.remoteDescription) {
                // đã có remoteDescription → thêm ngay
                await this.pc.addIceCandidate(msg.candidate).catch((err) => {
                    if (!this.ignoreOffer) throw err
                })
            } else {
                // CHƯA có remoteDescription → ĐỆM lại (browser KHÔNG tự buffer)
                this.pendingCandidates.push(msg.candidate)
            }
        }
    }

    close() {
        // Gỡ handler TRƯỚC khi đóng: pc.close() bắn oniceconnectionstatechange
        // ('closed') bất đồng bộ — nếu còn handler, mapIceState sẽ set state về
        // 'idle' và ghi đè 'ended' → màn summary biến mất ngay.
        this.pc.oniceconnectionstatechange = null
        this.pc.onconnectionstatechange = null
        this.pc.onnegotiationneeded = null
        this.pc.onicecandidate = null
        this.pc.ontrack = null
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
        this.pc.close()
        this.remoteStream = null
    }

    /** Cho stats.ts poll chỉ số kết nối. */
    getStats(): Promise<RTCStatsReport> {
        return this.pc.getStats()
    }

    async setSendersMaxBitrate(maxBitrate: number | null): Promise<void> {
        const updates = this.pc.getSenders()
            .filter((sender) => sender.track?.kind === 'video')
            .map((sender) => {
                const params = sender.getParameters()
                if (!params.encodings || params.encodings.length === 0) {
                    params.encodings = [{}]
                }
                if (maxBitrate == null) {
                    delete params.encodings[0].maxBitrate
                } else {
                    params.encodings[0].maxBitrate = maxBitrate
                }
                return sender.setParameters(params).catch(() => { })
            })
        await Promise.all(updates)
    }

    private setupHandlers() {
        // Khi cần đàm phán (vd vừa addTrack) → tạo offer rồi gửi
        this.pc.onnegotiationneeded = () => this.handleNegotiationNeeded()

        // Browser tìm được 1 đường mạng (candidate) → gửi cho đối phương
        this.pc.onicecandidate = ({ candidate }) => {
            if (candidate) this.sendSignal({ type: 'ice-candidate', candidate: candidate.toJSON() })
        }

        // Đối phương gửi track media tới → lưu stream cho UI
        this.pc.ontrack = ({ streams }) => {
            this.remoteStream = streams[0] ?? null
            if (this.remoteStream) this.onRemoteStream?.(this.remoteStream)
        }

        // Trạng thái kết nối ICE đổi → cập nhật callStore (state dẫn xuất)
        this.pc.oniceconnectionstatechange = () => this.mapIceState()
        this.pc.onconnectionstatechange = () => this.mapConnectionState()
    }

    private async handleNegotiationNeeded() {
        if (this.callbacks?.canInitiateOffer === false) return
        try {
            this.makingOffer = true
            await this.pc.setLocalDescription() // tự tạo offer
            this.sendSignal({ type: 'sdp', sdp: this.pc.localDescription })
        } finally {
            this.makingOffer = false
        }
    }

    private mapIceState() {
        // FE-B (STAB-02): ICE chết hẳn → tự thử nối lại bằng ICE restart.
        // restartIce() chỉ ĐÁNH DẤU; nó kích onnegotiationneeded → gửi offer mới có
        // ufrag/pwd mới. Cả 2 bên cùng restart cũng không sao — perfect negotiation
        // hoá giải va chạm offer. Đây là "mạng chớp" KHÔNG reload trang.
        if (this.pc.iceConnectionState === 'failed') {
            this.pc.restartIce()
        }
        const map: Record<string, CallState> = {
            new: 'connecting',
            checking: 'connecting',
            connected: 'connected',
            completed: 'connected',
            disconnected: 'reconnecting',
            failed: 'reconnecting', // đang auto-restart → "đang kết nối lại" thay vì "thất bại"
            closed: 'idle',
        }
        const next = map[this.pc.iceConnectionState]
        if (!next) return
        this.scheduleRecoveryIfNeeded(next)
        if (this.callbacks?.onConnectionStateChange) {
            this.callbacks.onConnectionStateChange(next)
        } else {
            useCallStore.getState().setCallState(next)
        }
    }

    private mapConnectionState() {
        const map: Partial<Record<RTCPeerConnectionState, CallState>> = {
            new: 'connecting',
            connecting: 'connecting',
            connected: 'connected',
            disconnected: 'reconnecting',
            failed: 'reconnecting',
            closed: 'idle',
        }
        const next = map[this.pc.connectionState]
        if (!next) return
        this.scheduleRecoveryIfNeeded(next)
        if (this.callbacks?.onConnectionStateChange) {
            this.callbacks.onConnectionStateChange(next)
        } else {
            useCallStore.getState().setCallState(next)
        }
    }

    private scheduleRecoveryIfNeeded(state: CallState) {
        if (state === 'connected') {
            this.restartAttempts = 0
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer)
                this.reconnectTimer = null
            }
            return
        }
        if (state !== 'connecting' && state !== 'reconnecting') return
        if (this.reconnectTimer || this.restartAttempts >= 2) return

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            const stalled =
                this.pc.connectionState === 'connecting' ||
                this.pc.connectionState === 'disconnected' ||
                this.pc.connectionState === 'failed' ||
                this.pc.iceConnectionState === 'checking' ||
                this.pc.iceConnectionState === 'disconnected' ||
                this.pc.iceConnectionState === 'failed'
            if (!stalled) return
            this.restartAttempts += 1
            if (this.pc.localDescription) {
                this.sendSignal({ type: 'sdp', sdp: this.pc.localDescription })
            }
            this.pc.restartIce()
            if (this.pc.signalingState === 'stable') void this.handleNegotiationNeeded()
        }, 5_000)
    }
}
