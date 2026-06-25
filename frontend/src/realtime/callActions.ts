import { acquireLocalMedia, MediaAcquisitionError } from '../webrtc/media'
import { PeerManager } from '../webrtc/PeerManager'
import { sendSignal, setCallSignalHandler } from './wsClient'
import { useCallStore } from '../store/callStore'
import type { CallServerSignal } from './messages'
import { fetchIceConfig } from '../api/turn'

// Object KHÔNG-serializable sống ở module scope (không vào Zustand)
let localStream: MediaStream | null = null
let peer: PeerManager | null = null

export function getLocalStream() { return localStream }
export function getRemoteStream() { return peer?.remoteStream ?? null }
export function getActivePeer(): PeerManager | null { return peer }

// Lấy camera/mic; trả true nếu OK, false nếu lỗi (đã set callStore.mediaError)
async function getMedia(): Promise<boolean> {
    const call = useCallStore.getState()
    call.setMediaError(null)
    try {
        const media = await acquireLocalMedia()
        localStream = media.stream
        call.setMediaMode(media.mode)
        return true
    } catch (e) {
        call.setMediaError(e instanceof MediaAcquisitionError ? e.type : 'unknown')
        return false
    }
}

// Tạo PeerManager + nối sendSignal (tên trần) ra wsClient (thêm to + callId)
async function createPeer(remoteUserId: string, callId: string, polite: boolean) {
    const { iceServers } = await fetchIceConfig()
    peer = new PeerManager(iceServers, polite, (sig) => {
        if (sig.type === 'sdp') sendSignal({ type: 'sdp', to: remoteUserId, callId, sdp: sig.sdp })
        else sendSignal({ type: 'ice-candidate', to: remoteUserId, callId, candidate: sig.candidate })
    })
    if (localStream) peer.addLocalStream(localStream)
}

// ── CALLER bấm Gọi ──
export async function startCall(remoteUsername: string) {
    const callId = crypto.randomUUID()
    useCallStore.getState().startOutgoing(remoteUsername, callId)
    if (!(await getMedia())) return            // lỗi → SelfViewPreview hiện MediaErrorNotice
    sendSignal({ type: 'call-offer', to: remoteUsername, callId })
}

// ── CALLEE bấm Nhận ──
export async function acceptCall() {
    const { remoteUserId, callId } = useCallStore.getState()
    if (!remoteUserId || !callId) return
    if (!(await getMedia())) return
    sendSignal({ type: 'call-accept', to: remoteUserId, callId })
    await createPeer(remoteUserId, callId, true)   // callee = polite
    useCallStore.getState().setCallState('connecting')
}

// ── CALLEE Từ chối / CALLER Hủy / HangUp ──
export function rejectCall() { signalAndTeardown('call-reject') }
export function cancelCall() { signalAndTeardown('call-cancel') }
export function hangUp() { signalAndTeardown('hang-up') }

function signalAndTeardown(type: 'call-reject' | 'call-cancel' | 'hang-up') {
    const { remoteUserId, callId } = useCallStore.getState()
    if (remoteUserId && callId) sendSignal({ type, to: remoteUserId, callId })
    teardown()
}

// Dọn dẹp toàn bộ (dùng cả khi nhận reject/cancel/hangup từ xa)
function teardown() {
    peer?.close()
    peer = null
    localStream?.getTracks().forEach((t) => t.stop())   // tắt đèn camera
    localStream = null
    useCallStore.getState().reset()
}

// ── Não nhận tín hiệu cuộc gọi từ server (wsClient forward vào đây) ──
function handleServerSignal(msg: CallServerSignal) {
    const call = useCallStore.getState()
    switch (msg.type) {
        case 'call-offer-received':
            call.startIncoming(msg.from, msg.callId)        // → IncomingCallCard
            break
        case 'call-accept-received':                       // CALLER: đối phương đã Nhận
            createPeer(msg.from, msg.callId, false).then(() => call.setCallState('connecting'))
            break
        case 'call-reject-received':
        case 'call-cancel-received':
        case 'hang-up-received':
            teardown()
            break
        case 'sdp-received':
            peer?.handleSignalingMessage({ sdp: msg.sdp })
            break
        case 'ice-candidate-received':
            peer?.handleSignalingMessage({ candidate: msg.candidate })
            break
    }
}

// Đăng ký để wsClient forward message cuộc gọi vào đây (gọi 1 lần khi module load)
setCallSignalHandler(handleServerSignal)
