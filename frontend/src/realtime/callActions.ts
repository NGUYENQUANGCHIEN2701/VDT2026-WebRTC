import { acquireLocalMedia, MediaAcquisitionError } from '../webrtc/media'
import { PeerManager } from '../webrtc/PeerManager'
import { sendSignal, setCallSignalHandler } from './wsClient'
import { useCallStore } from '../store/callStore'
import { useAuthStore } from '../store/authStore'
import type { CallServerSignal, CallStateChanged } from './messages'
import { fetchIceConfig } from '../api/turn'
import { useToastStore } from '../store/toastStore'

// Object KHÔNG-serializable sống ở module scope (không vào Zustand)
let localStream: MediaStream | null = null
let peer: PeerManager | null = null

export function getLocalStream() { return localStream }
export function getRemoteStream() { return peer?.remoteStream ?? null }
export function getActivePeer(): PeerManager | null { return peer }

// Lấy camera/mic; true nếu OK, false nếu lỗi (đã set callStore.mediaError)
async function getMedia(): Promise<boolean> {
    if (localStream) return true   // đã có sẵn (vd glare: bên thua đã xin media lúc bấm Gọi)
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

function forceRelayEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('relay') === '1'
}

async function createPeer(remoteUserId: string, callId: string, polite: boolean) {
    const { iceServers, iceTransportPolicy } = await fetchIceConfig(forceRelayEnabled())
    peer = new PeerManager(iceServers, polite, (sig) => {
        if (sig.type === 'sdp') sendSignal({ type: 'sdp', to: remoteUserId, callId, sdp: sig.sdp })
        else sendSignal({ type: 'ice-candidate', to: remoteUserId, callId, candidate: sig.candidate })
    }, iceTransportPolicy)
    if (localStream) peer.addLocalStream(localStream)
}

// ── CALLER bấm Gọi → gửi INTENT; callId do server sinh, về qua 'ringing' ──
export async function startCall(remoteUsername: string) {
    useCallStore.getState().startOutgoing(remoteUsername, '')  // UI hiện ngay; callId điền khi ringing về
    if (!(await getMedia())) return
    sendSignal({ type: 'call-invite', to: remoteUsername })
}

// ── CALLEE bấm Nhận → gửi INTENT; peer tạo khi 'active' về (đối xứng 2 bên) ──
export async function acceptCall() {
    const { callId } = useCallStore.getState()
    if (!callId) return
    if (!(await getMedia())) return
    sendSignal({ type: 'call-accept', callId })
}

// ── Từ chối / Hủy / Cúp → gửi INTENT; teardown khi nhận 'ended' từ server ──
export function rejectCall() { sendIntent('call-reject') }
export function cancelCall() { sendIntent('call-cancel') }
export function hangUp() { sendIntent('hang-up') }

function sendIntent(type: 'call-reject' | 'call-cancel' | 'hang-up') {
    const { callId } = useCallStore.getState()
    if (callId) sendSignal({ type, callId })
}

// Dọn MEDIA (peer + stream). KHÔNG đụng store — để 'ended'/summary tự lo.
function teardownMedia() {
    peer?.close()
    peer = null
    localStream?.getTracks().forEach((t) => t.stop())  // tắt đèn camera
    localStream = null
}

// ── Nhận tín hiệu từ server ──
function handleServerSignal(msg: CallServerSignal) {
    switch (msg.type) {
        case 'call-state-changed':
            handleCallState(msg)
            break
        case 'sdp-received':
            peer?.handleSignalingMessage({ sdp: msg.sdp })
            break
        case 'ice-candidate-received':
            peer?.handleSignalingMessage({ candidate: msg.candidate })
            break
        case 'media-state-relay': {
            const call = useCallStore.getState()
            call.setRemoteMicMuted(msg.micMuted)
            call.setRemoteCamOff(msg.camOff)
            break
        }
    }
}

// ── TRÁI TIM: render trạng thái server-authoritative ──
function handleCallState(msg: CallStateChanged) {
    const call = useCallStore.getState()
    const me = useAuthStore.getState().user?.username
    const amCaller = msg.callerId === me
    const remote = amCaller ? msg.calleeId : msg.callerId

    switch (msg.state) {
        case 'ringing':
            if (amCaller) {
                call.startOutgoing(remote, msg.callId)   // điền callId thật
            } else {
                // GLARE (D-04): mình đang GỌI ĐI chính người này thì lại nhận 'ringing'
                // với vai callee → Redis CAS đã giữ 1 cuộc và lật mình thành người nhận.
                // Tự động Nhận để nối liền 1 cuộc, không bắt user bấm lại.
                const isGlare = call.callState === 'outgoing' && call.remoteUserId === remote
                call.startIncoming(remote, msg.callId)               // → IncomingCallCard
                if (isGlare) acceptCall()
            }
            break
        case 'active':
            // cả 2 tạo peer: caller=impolite, callee=polite (perfect negotiation)
            createPeer(remote, msg.callId, !amCaller).then(() => call.setCallState('connecting'))
            break
        case 'ended': {
            teardownMedia()
            const reason = msg.reason ?? 'completed'

            if (reason === 'busy') {
                // chỉ caller nhận busy → toast trên Home, không vào màn call (D-05)
                useToastStore.getState().show(`${remote} đang bận`, 'warning')
                call.reset()
            } else if (reason === 'missed' && !amCaller) {
                // callee bỏ lỡ → toast tạm thời (D-09), không hiện summary
                useToastStore.getState().show(`Bạn đã nhỡ cuộc gọi từ ${remote}`, 'info')
                call.reset()
            } else {
                // completed/rejected/cancelled/dropped + missed phía caller → màn summary 3s
                call.endCall(reason)
                setTimeout(() => {
                    if (useCallStore.getState().callState === 'ended') useCallStore.getState().reset()
                }, 3000)
            }
            break
        }

    }
}

// Đăng ký 1 lần khi module load
setCallSignalHandler(handleServerSignal)
