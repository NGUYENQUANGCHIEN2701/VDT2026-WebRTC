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

export class PeerManager {
    private pc: RTCPeerConnection
    private readonly polite: boolean
    private readonly sendSignal: (s: OutboundSignal) => void

    // Cờ perfect negotiation (giải thích bên dưới)
    private makingOffer = false
    private ignoreOffer = false
    private isSettingRemoteAnswerPending = false

    // Đệm ICE candidate đến SỚM (trước khi có remoteDescription)
    private pendingCandidates: RTCIceCandidateInit[] = []

    // Stream của ĐỐI PHƯƠNG — giữ ở đây (không vào store); UI lấy qua onRemoteStream
    remoteStream: MediaStream | null = null
    onRemoteStream?: (stream: MediaStream) => void

    constructor(
        iceServers: RTCIceServer[],
        polite: boolean,
        sendSignal: (s: OutboundSignal) => void,
    ) {
        this.polite = polite
        this.sendSignal = sendSignal
        this.pc = new RTCPeerConnection({ iceServers })
        this.setupHandlers()
    }

    /** Gắn camera/mic của mình vào kết nối → kích hoạt onnegotiationneeded. */
    addLocalStream(stream: MediaStream) {
        for (const track of stream.getTracks()) {
            this.pc.addTrack(track, stream)
        }
    }

    /** Xử lý tín hiệu nhận từ đối phương (sdp hoặc ice-candidate). */
    async handleSignalingMessage(msg: InboundSignal) {
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
            await this.pc.setRemoteDescription(msg.sdp) // polite + va chạm → tự rollback
            this.isSettingRemoteAnswerPending = false

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
        this.pc.close()
        this.remoteStream = null
    }

    /** Cho stats.ts poll chỉ số kết nối. */
    getStats(): Promise<RTCStatsReport> {
        return this.pc.getStats()
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
    }

    private async handleNegotiationNeeded() {
        try {
            this.makingOffer = true
            await this.pc.setLocalDescription() // tự tạo offer
            this.sendSignal({ type: 'sdp', sdp: this.pc.localDescription })
        } finally {
            this.makingOffer = false
        }
    }

    private mapIceState() {
        const map: Record<string, CallState> = {
            new: 'connecting',
            checking: 'connecting',
            connected: 'connected',
            completed: 'connected',
            disconnected: 'reconnecting',
            failed: 'failed',
            closed: 'idle',
        }
        const next = map[this.pc.iceConnectionState]
        if (next) useCallStore.getState().setCallState(next)
    }
}
